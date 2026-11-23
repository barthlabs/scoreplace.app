'use strict';

const MAX_DOCS_PER_ATTEMPT = 600;

function eventMicros(value) {
  if (typeof value !== 'string') return 0;
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!match) return 0;
  const millis = Date.parse(match[1] + match[3]);
  if (!Number.isFinite(millis)) return 0;
  const micros = Number(((match[2] || '') + '000000').slice(0, 6));
  return millis * 1000 + micros;
}

function withoutVersion(summary) {
  if (!summary) return null;
  const copy = Object.assign({}, summary);
  delete copy.sourceVersionMicros;
  delete copy.requiresFullRead;
  return copy;
}

function rehearsalBlocks(root, rehearsal, eventBefore, eventAfter) {
  if (rehearsal && rehearsal.locked(root)) return true;
  const marker = (eventAfter && eventAfter.rehearsal) || (eventBefore && eventBefore.rehearsal);
  return !!(marker && marker.state === 'active' &&
    (!root.rehearsal || root.rehearsal.state !== 'active' || root.rehearsal.epoch !== marker.epoch));
}

/** Reads one consistent projection without write locks on live match documents. */
async function buildProjectionReadOnly({ tx, db, tournamentId, split, summaryCore, helpers,
  rehearsal, eventBefore, eventAfter, maxDocs = MAX_DOCS_PER_ATTEMPT }) {
  const rootRef = db.collection('tournaments').doc(tournamentId);
  const rootSnap = await tx.get(rootRef);
  if (!rootSnap.exists) return { action: 'missing-root', tournamentId, reads: 1 };
  const root = rootSnap.data() || {};
  if (rehearsalBlocks(root, rehearsal, eventBefore, eventAfter)) {
    return { action: 'rehearsal-locked', tournamentId, reads: 1 };
  }
  if (root.testModeEnabled === true) return { action: 'test-excluded', tournamentId, reads: 1 };

  let reads = 1;
  const sourceDocuments = {};
  // montarDoBanco already translates logical parts (for example `participants`)
  // to their physical collection before invoking this callback.
  const readCollection = async (collectionName, part) => {
    const remaining = maxDocs - reads;
    const snap = await tx.get(rootRef.collection(collectionName).limit(Math.max(1, remaining + 1)));
    reads += snap.size;
    if (reads > maxDocs) {
      const error = new Error('summary document read budget exceeded');
      error.code = 'SUMMARY_READ_BUDGET';
      throw error;
    }
    sourceDocuments[collectionName] = snap.docs.map((doc) => ({
      id: doc.id,
      updateTime: doc.updateTime && doc.updateTime.toMillis ? doc.updateTime.toMillis() : null
    }));
    return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  };

  const complete = await split.montarDoBanco(JSON.parse(JSON.stringify(root)), readCollection);
  const migration = root.canonicalRegistrationMigration;
  let registrations = [];
  if (migration && migration.fingerprint) {
    const expected = Number(migration.registrationCount);
    if (!Number.isInteger(expected) || expected < 0) throw new Error('invalid canonical registration count');
    const remaining = maxDocs - reads;
    const snap = await tx.get(rootRef.collection('registrations').limit(Math.min(expected + 1, remaining + 1)));
    reads += snap.size;
    if (reads > maxDocs) {
      const error = new Error('summary document read budget exceeded');
      error.code = 'SUMMARY_READ_BUDGET';
      throw error;
    }
    if (snap.size !== expected) {
      const error = new Error(`canonical registration count mismatch: expected ${expected}, read ${snap.size}`);
      error.code = 'SUMMARY_REGISTRATION_COUNT_MISMATCH';
      throw error;
    }
    sourceDocuments.registrations = snap.docs.map((doc) => ({
      id: doc.id,
      updateTime: doc.updateTime && doc.updateTime.toMillis ? doc.updateTime.toMillis() : null
    }));
    registrations = snap.docs.map((doc) => doc.data());
  }
  const H = summaryCore.helpersComInscricoes(complete, helpers, registrations);
  const next = summaryCore.buildSummary(complete, tournamentId, H);
  if (!next) throw new Error('summary builder returned empty projection');
  return {
    action: 'projection-built', tournamentId, next, reads,
    sourceDocuments,
    rootUpdateTime: rootSnap.updateTime && rootSnap.updateTime.toMillis
      ? rootSnap.updateTime.toMillis() : null
  };
}

/** Commits after validating the source subcollections and rejects stale events. */
async function commitProjection({ tx, db, projection, eventTime, rehearsal, eventBefore, eventAfter }) {
  const { tournamentId } = projection;
  const rootRef = db.collection('tournaments').doc(tournamentId);
  const summaryRef = db.collection('tournaments_summary').doc(tournamentId);
  const rootSnap = await tx.get(rootRef);
  const summarySnap = await tx.get(summaryRef);
  const current = summarySnap.exists ? summarySnap.data() : null;

  if (!rootSnap.exists) {
    if (summarySnap.exists) tx.delete(summaryRef);
    return { action: summarySnap.exists ? 'deleted' : 'missing-root', reads: 2 };
  }
  const root = rootSnap.data() || {};
  if (rehearsalBlocks(root, rehearsal, eventBefore, eventAfter)) return { action: 'rehearsal-locked', reads: 2 };
  if (root.testModeEnabled === true) {
    if (summarySnap.exists) tx.delete(summaryRef);
    return { action: summarySnap.exists ? 'test-excluded' : 'test-excluded', reads: 2 };
  }
  if (projection.action !== 'projection-built') return { action: projection.action, reads: 2 };

  const incomingVersion = eventMicros(eventTime) || Date.now() * 1000;
  const currentVersion = current && Number.isSafeInteger(current.sourceVersionMicros)
    ? current.sourceVersionMicros : -1;
  if (currentVersion > incomingVersion) return { action: 'stale-event', reads: 2 };

  // The root updateTime cannot detect writes in Firestore subcollections. Re-read
  // the exact collection snapshots in this transaction so concurrent source writes
  // conflict with the summary commit instead of allowing an older projection through.
  for (const [collectionName, observed] of Object.entries(projection.sourceDocuments || {})) {
    const currentSource = await tx.get(rootRef.collection(collectionName).limit(Math.max(1, observed.length + 1)));
    const currentDocuments = currentSource.docs.map((doc) => ({
      id: doc.id,
      updateTime: doc.updateTime && doc.updateTime.toMillis ? doc.updateTime.toMillis() : null
    }));
    if (JSON.stringify(currentDocuments) !== JSON.stringify(observed)) {
      return { action: 'projection-stale', reads: 2 + currentDocuments.length };
    }
  }

  // A root update during the projection read means this snapshot is obsolete;
  // abort so Firestore retries this small transaction and the caller can rebuild.
  const currentRootUpdateTime = rootSnap.updateTime && rootSnap.updateTime.toMillis
    ? rootSnap.updateTime.toMillis() : null;
  if (projection.rootUpdateTime != null && currentRootUpdateTime !== projection.rootUpdateTime) {
    return { action: 'projection-stale', reads: 2 };
  }
  if (JSON.stringify(withoutVersion(current)) === JSON.stringify(withoutVersion(projection.next)) &&
      !(current && current.requiresFullRead === true)) return { action: 'unchanged', reads: 2 };

  const next = Object.assign({}, projection.next, { sourceVersionMicros: incomingVersion });
  tx.set(summaryRef, next);
  return { action: 'written', reads: 2 };
}

/** Marks an existing summary for canonical fallback without changing its values/version. */
async function markRequiresFullRead({ tx, db, tournamentId, rehearsal, eventBefore, eventAfter,
  summaryCore, helpers }) {
  // Keep this fallback safe for older callers that don't inject the projection
  // module. The marker still uses the same canonical index calculation.
  summaryCore = summaryCore || require('./tournament-summary-core');
  const rootRef = db.collection('tournaments').doc(tournamentId);
  const summaryRef = db.collection('tournaments_summary').doc(tournamentId);
  const rootSnap = await tx.get(rootRef);
  const summarySnap = await tx.get(summaryRef);
  if (!rootSnap.exists) return { action: 'missing-root' };
  const root = rootSnap.data() || {};
  if (rehearsalBlocks(root, rehearsal, eventBefore, eventAfter)) return { action: 'rehearsal-locked' };
  if (root.testModeEnabled === true) return { action: 'test-excluded' };
  if (!summarySnap.exists) {
    // This is a query-only marker, not a card projection: consumers must hydrate
    // `requiresFullRead` from the canonical document/subcollections before rendering.
    // Do not attach guessed progress fields (a split root can truthfully contain none).
    // This document is only an index marker. A split tournament's root may
    // intentionally omit matches and participants, so deriving a projection
    // here would publish plausible but false zero counts. The client sees the
    // marker and reads the canonical tournament from the server.
    const index = summaryCore.summaryIndexFields(root, tournamentId);
    tx.set(summaryRef, {
      id: index.id,
      name: String(root.name || ''),
      creatorUid: index.creatorUid,
      adminUids: index.adminUids,
      memberUids: index.memberUids,
      refereeUids: index.refereeUids,
      isPublic: index.isPublic,
      organizerOnly: index.organizerOnly,
      membersOnly: index.membersOnly,
      isSandbox: index.isSandbox,
      nameLower: index.nameLower,
      tokens: index.tokens,
      requiresFullRead: true,
      sourceVersionMicros: 0
    });
    return { action: 'created-full-read-fallback' };
  }
  const current = summarySnap.data() || {};
  const index = summaryCore.summaryIndexFields(root, tournamentId);
  const indexChanged = ['creatorUid', 'adminUids', 'memberUids', 'refereeUids', 'isPublic',
    'organizerOnly', 'membersOnly', 'isSandbox', 'nameLower', 'tokens'].some((field) =>
    JSON.stringify(current[field] == null ? null : current[field]) !== JSON.stringify(index[field]));
  const markerChanged = current.requiresFullRead !== true;
  if (!indexChanged && !markerChanged) return { action: 'already-marked' };
  tx.update(summaryRef, Object.assign({}, index, { requiresFullRead: true }));
  return { action: markerChanged ? 'requires-full-read' : 'index-refreshed' };
}

async function reconcile({ db, tournamentId, split, summaryCore, helpers, eventTime, rehearsal,
  eventBefore, eventAfter, maxDocs = MAX_DOCS_PER_ATTEMPT }) {
  // Firestore's read-only transaction provides a consistent readTime without
  // holding write locks on hundreds of matches while points are being entered.
  for (let attempt = 0; attempt < 3; attempt++) {
    const projection = await db.runTransaction((tx) => buildProjectionReadOnly({
      tx, db, tournamentId, split, summaryCore, helpers, rehearsal, eventBefore, eventAfter, maxDocs
    }), { readOnly: true });
    const result = await db.runTransaction((tx) => commitProjection({
      tx, db, projection, eventTime, rehearsal, eventBefore, eventAfter
    }), { maxAttempts: 5 });
    if (result.action !== 'projection-stale') return result;
  }
  const error = new Error('tournament kept changing during summary projection');
  error.code = 'aborted';
  throw error;
}

function completed(match) {
  // Keep the same completion signal as _getTournamentProgress in the UI.
  return !!(match && (match.winner || match.result ||
    (match.score1 !== undefined && match.score2 !== undefined &&
      match.score1 !== null && match.score2 !== null)));
}

function countsTowardProgress(match) {
  if (!match || match.isBye || match.isSitOut) return false;
  const p1 = match.p1 || match.player1 || '';
  const p2 = match.p2 || match.player2 || '';
  if (!p1 || !p2 || String(p1).indexOf('BYE') === 0 || String(p2).indexOf('BYE') === 0) return false;
  return true;
}

function matchAffectsSummary(before, after) {
  return countsTowardProgress(before) !== countsTowardProgress(after) || completed(before) !== completed(after);
}

module.exports = { MAX_DOCS_PER_ATTEMPT, eventMicros, buildProjectionReadOnly, commitProjection,
  markRequiresFullRead,
  reconcile, matchAffectsSummary };
