'use strict';

const { createHash, randomUUID } = require('crypto');

const OWNER_UID = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const MAX_BASELINE_BYTES = 512 * 1024;
const MAX_TREE_DOCUMENTS = 5000;

function canonical(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return { $type: 'bytes', value: Buffer.from(value).toString('base64') };
  if (value instanceof Date) return { $type: 'date', value: value.toISOString() };
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object') return value;
  if (typeof value.toDate === 'function' && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return { $type: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (typeof value.path === 'string' && value.firestore && typeof value.get === 'function') {
    return { $type: 'reference', path: value.path };
  }
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number') {
    return { $type: 'geopoint', latitude: value.latitude, longitude: value.longitude };
  }
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = canonical(value[key]);
  return result;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value)) ?? 'undefined').digest('hex');
}

function projectedSize(value) {
  // Factor two plus field overhead keeps this pre-draw cap well under Firestore's
  // 1 MiB document limit. The Admin SDK still performs the final size validation.
  const json = JSON.stringify(canonical(value));
  const fields = (json.match(/"[^"\\]*(?:\\.[^"\\]*)*"\s*:/g) || []).length;
  return Buffer.byteLength(json, 'utf8') * 2 + fields * 32 + 4096;
}

function marker(t) { return t && t.rehearsal && t.rehearsal.state; }
function locked(t) { return marker(t) === 'capturing' || marker(t) === 'resetting'; }
function enrollmentFrozen(t) { return Boolean(marker(t)); }

function makeService({ db, HttpsError }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const rootRef = id => db.collection('tournaments').doc(id);
  const baseRef = id => db.collection('tournamentRehearsalBaselines').doc(id);

  function authority(uid, id, t) {
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    if (!/^tour_[A-Za-z0-9_-]+$/.test(id)) fail('invalid-argument', 'Torneio real inválido.');
    if (uid !== OWNER_UID || !t || String(t.creatorUid || '') !== uid) {
      fail('permission-denied', 'O ensaio está reservado ao criador desenvolvedor deste torneio.');
    }
  }

  function preflight(t, registrations) {
    if (!t || t.isSandbox === true || t.isPublic !== false || t.organizerOnly !== true ||
        !['open', 'closed'].includes(t.status)) {
      fail('failed-precondition', 'O torneio precisa estar privado, apenas para a organização e antes do sorteio.');
    }
    if (t.drawFirstDate || t.nextDrawAt || t.pendingDraw || t.drawCompleted ||
        (Array.isArray(t.matches) && t.matches.length) || (Array.isArray(t.rounds) && t.rounds.length) ||
        (Array.isArray(t.groups) && t.groups.length) || (Array.isArray(t.woLog) && t.woLog.length)) {
      fail('failed-precondition', 'Há sorteio ou resultado anterior; não é seguro iniciar este ensaio.');
    }
    const receipt = t.canonicalRegistrationMigration || {};
    const expected = Number(receipt.registrationCount);
    if (!receipt.fingerprint || !Number.isSafeInteger(expected) || expected < 1 || expected !== registrations.length) {
      fail('failed-precondition', 'O recibo canônico de inscrições não confere com o banco.');
    }
    const ids = new Set();
    for (const entry of registrations) {
      const reg = entry.data || {};
      if (ids.has(entry.path) || reg.participantKind !== 'manual' || reg.participantUid || !reg.categoryId ||
          !Number.isSafeInteger(Number(reg.enrollSeq)) || Number(reg.enrollSeq) < 1) {
        fail('failed-precondition', 'Há inscrição duplicada, vinculada a conta ou sem número/categoria.');
      }
      ids.add(entry.path);
    }
  }

  async function readTree(ref) {
    const tree = [];
    async function visit(parent) {
      const collections = (await parent.listCollections()).sort((a, b) => a.id.localeCompare(b.id));
      for (const collection of collections) {
        const docs = (await collection.get()).docs.sort((a, b) => a.id.localeCompare(b.id));
        for (const doc of docs) {
          tree.push({ path: doc.ref.path.slice(ref.path.length + 1), data: doc.data() });
          if (tree.length > MAX_TREE_DOCUMENTS) fail('failed-precondition', 'Árvore grande demais para o ensaio.');
          await visit(doc.ref);
        }
      }
    }
    await visit(ref);
    return tree.sort((a, b) => a.path.localeCompare(b.path));
  }

  async function readExternal(id) {
    const [summary, feed] = await Promise.all([
      db.collection('tournaments_summary').doc(id).get(),
      db.collection('discoveryFeed').doc(id).get()
    ]);
    return { summary: summary.exists ? summary.data() : null, feedExists: feed.exists };
  }

  async function activate(request) {
    const uid = request.auth && request.auth.uid;
    const id = String(request.data && request.data.tournamentId || '').trim();
    const ref = rootRef(id), baseline = baseRef(id);
    let epoch = randomUUID();
    await db.runTransaction(async tx => {
      const [root, oldBase] = await Promise.all([tx.get(ref), tx.get(baseline)]);
      const t = root.exists ? root.data() : null;
      authority(uid, id, t);
      const previous = oldBase.exists ? oldBase.data() : null;
      // A failed final verification must preserve the original photograph.
      // Resuming capture here would overwrite it with rehearsal data.
      if (previous && previous.state === 'capturing' && previous.step !== 'verification-failed' &&
          marker(t) === 'capturing' && t.rehearsal?.step !== 'verification-failed' &&
          previous.epoch === t.rehearsal.epoch && previous.root) {
        epoch = previous.epoch;
        return; // Resume an interrupted capture; original root is already safe.
      }
      if (marker(t) || (previous && previous.state !== 'restored')) {
        fail('failed-precondition', 'Já existe um ensaio ou fotografia deste torneio.');
      }
      // This query participates in the transaction; a concurrent registration
      // update conflicts with the lock, instead of silently changing the roster.
      const regs = await tx.get(ref.collection('registrations'));
      preflight(t, regs.docs.map(doc => ({ path: doc.ref.path.slice(ref.path.length + 1), data: doc.data() })));
      const starting = { state: 'capturing', step: 'locked', epoch, root: t, createdAt: new Date().toISOString() };
      if (oldBase.exists) tx.set(baseline, starting);
      else tx.create(baseline, starting);
      tx.update(ref, { rehearsal: { state: 'capturing', epoch, hash: '' }, notificationsMuted: true });
    });

    try {
      const baseSnap = await baseline.get();
      const base = baseSnap.data() || {};
      if (base.epoch !== epoch || base.state !== 'capturing') fail('aborted', 'Captura foi alterada.');
      const tree = await readTree(ref);
      const registrations = tree.filter(item => item.path.startsWith('registrations/') && item.path.split('/').length === 2);
      preflight(base.root, registrations);
      const external = await readExternal(id);
      if (external.feedExists) fail('failed-precondition', 'Há um feed público deste torneio; não iniciar ensaio.');
      const secondTree = await readTree(ref);
      const secondExternal = await readExternal(id);
      const payload = { root: base.root, tree, summary: external.summary };
      const hash = fingerprint(payload);
      if (hash !== fingerprint({ root: base.root, tree: secondTree, summary: secondExternal.summary }) || secondExternal.feedExists) {
        fail('aborted', 'Dados mudaram durante a fotografia; tente novamente.');
      }
      if (projectedSize(payload) > MAX_BASELINE_BYTES) fail('failed-precondition', 'Fotografia excede o limite seguro do ensaio.');

      await db.runTransaction(async tx => {
        const [live, saved] = await Promise.all([tx.get(ref), tx.get(baseline)]);
        if (!live.exists || !saved.exists || saved.data().epoch !== epoch || marker(live.data()) !== 'capturing') {
          fail('aborted', 'Trava de captura mudou.');
        }
        // Query every discovered collection in this same transaction. Unknown
        // collections are checked again by the recursive scan after commit.
        const collectionPaths = [...new Set(tree.map(item => item.path.split('/').slice(0, -1).join('/')))];
        const actual = [];
        for (const path of collectionPaths) {
          const docs = await tx.get(ref.collection(path));
          for (const doc of docs.docs) actual.push({ path: doc.ref.path.slice(ref.path.length + 1), data: doc.data() });
        }
        const summarySnap = await tx.get(db.collection('tournaments_summary').doc(id));
        const feedSnap = await tx.get(db.collection('discoveryFeed').doc(id));
        if (feedSnap.exists || fingerprint({ root: base.root, tree: actual.sort((a,b) => a.path.localeCompare(b.path)), summary: summarySnap.exists ? summarySnap.data() : null }) !== hash) {
          fail('aborted', 'Fotografia divergiu antes da ativação.');
        }
        tx.update(baseline, { state: 'active', step: 'captured', hash, tree, summary: external.summary });
        tx.update(ref, { rehearsal: { state: 'active', epoch, hash } });
      });
      const after = await readTree(ref);
      if (fingerprint(after) !== fingerprint(tree)) {
        await db.runTransaction(async tx => {
          const [live, saved] = await Promise.all([tx.get(ref), tx.get(baseline)]);
          if (live.exists && saved.exists && live.data().rehearsal?.epoch === epoch && saved.data().epoch === epoch) {
            tx.update(ref, { rehearsal: { state: 'capturing', step: 'verification-failed', epoch, hash } });
            tx.update(baseline, { state: 'capturing', step: 'verification-failed' });
          }
        });
        fail('aborted', 'Dados mudaram após a ativação; ensaio travado para conferência.');
      }
      return { ok: true, state: 'active', count: registrations.length, hash, epoch };
    } catch (error) {
      // The UI can retry an interrupted capture or restore a fully captured
      // baseline whose final activation check failed.
      throw error;
    }
  }

  async function deleteTree(ref, keepPaths) {
    const tree = await readTree(ref);
    const paths = tree.map(item => item.path).filter(path => !keepPaths.has(path))
      .sort((a, b) => b.split('/').length - a.split('/').length);
    for (let i = 0; i < paths.length; i += 400) {
      const batch = db.batch();
      paths.slice(i, i + 400).forEach(path => batch.delete(db.doc(`${ref.path}/${path}`)));
      await batch.commit();
    }
  }

  async function writeTree(ref, tree) {
    // Parents must exist before children. If a process stops between batches,
    // the next recursive scan can still discover everything already written.
    const ordered = [...tree].sort((a, b) =>
      a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
    for (let i = 0; i < ordered.length; i += 400) {
      const batch = db.batch();
      ordered.slice(i, i + 400).forEach(item => batch.set(db.doc(`${ref.path}/${item.path}`), item.data));
      await batch.commit();
    }
  }

  async function restore(request) {
    const uid = request.auth && request.auth.uid;
    const id = String(request.data && request.data.tournamentId || '').trim();
    const ref = rootRef(id), baseline = baseRef(id);
    await db.runTransaction(async tx => {
      const [live, saved] = await Promise.all([tx.get(ref), tx.get(baseline)]);
      const t = live.exists ? live.data() : null, b = saved.exists ? saved.data() : null;
      authority(uid, id, t);
      const recoverableCapture = b && b.state === 'capturing' && b.step === 'verification-failed' &&
        t.rehearsal?.state === 'capturing' && t.rehearsal?.step === 'verification-failed';
      if (!b || (!['active', 'resetting'].includes(b.state) && !recoverableCapture) || !b.hash || !Array.isArray(b.tree) ||
          !t.rehearsal || t.rehearsal.epoch !== b.epoch || t.rehearsal.hash !== b.hash) {
        fail('failed-precondition', 'Não há fotografia íntegra deste ensaio.');
      }
      tx.update(ref, { rehearsal: { state: 'resetting', epoch: b.epoch, hash: b.hash } });
      tx.update(baseline, { state: 'resetting', step: 'deleting' });
    });
    const base = (await baseline.get()).data();
    const expected = { root: base.root, tree: base.tree, summary: base.summary || null };
    if (fingerprint(expected) !== base.hash) fail('data-loss', 'Fotografia não confere; reset interrompido sem excluir dados.');
    // Restore the photograph before deleting rehearsal-only documents. An
    // interruption cannot leave the tournament without its original roster.
    // Both phases are repeatable while the root stays locked in `resetting`.
    await baseline.update({ step: 'restoring' });
    await writeTree(ref, base.tree);
    await baseline.update({ step: 'deleting-extras' });
    await deleteTree(ref, new Set(base.tree.map(item => item.path)));
    const summaryRef = db.collection('tournaments_summary').doc(id);
    if (base.summary == null) await summaryRef.delete();
    else await summaryRef.set(base.summary);
    const feedRef = db.collection('discoveryFeed').doc(id);
    await feedRef.delete();

    const check = async () => {
      const [tree, external] = await Promise.all([readTree(ref), readExternal(id)]);
      return !external.feedExists && fingerprint({ tree, summary: external.summary }) ===
        fingerprint({ tree: base.tree, summary: base.summary || null });
    };
    if (!(await check())) fail('data-loss', 'Dados extras ou ausentes após restauração; reset travado para repetição.');
    await db.runTransaction(async tx => {
      const [live, saved] = await Promise.all([tx.get(ref), tx.get(baseline)]);
      if (!live.exists || !saved.exists || marker(live.data()) !== 'resetting' || saved.data().hash !== base.hash) {
        fail('aborted', 'Estado do reset mudou.');
      }
      tx.set(ref, base.root); // Last tournament write; old snapshot has no rehearsal marker.
      tx.update(baseline, { state: 'restored', step: 'verified', restoredAt: new Date().toISOString() });
    });
    const [finalRoot, finalTree, external] = await Promise.all([ref.get(), readTree(ref), readExternal(id)]);
    if (!finalRoot.exists || external.feedExists || fingerprint({ root: finalRoot.data(), tree: finalTree, summary: external.summary }) !== base.hash) {
      await ref.update({ rehearsal: { state: 'resetting', epoch: base.epoch, hash: base.hash } });
      await baseline.update({ state: 'resetting', step: 'verify-failed' });
      fail('data-loss', 'Verificação final falhou; reset travado para repetição.');
    }
    return { ok: true, state: 'restored', count: base.tree.filter(item => item.path.startsWith('registrations/') && item.path.split('/').length === 2).length, hash: base.hash, tournament: base.root };
  }

  return { activate, restore };
}

module.exports = { makeService, canonical, fingerprint, projectedSize, marker, locked, enrollmentFrozen, OWNER_UID };
