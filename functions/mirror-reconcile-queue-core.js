/* Fila privada de reconciliação. O documento guarda só marcadores operacionais;
 * nenhum nome, UID, placar ou dado de jogo. A projeção e a remoção da pendência
 * devem ocorrer no mesmo commit transacional do mirror-transaction-core. */
'use strict';

const crypto = require('node:crypto');
const projection = require('./mirror-transaction-core');
const mirror = require('./match-result-mirror-core');
const pendingIds = require('./mirror-pending-id-core');
const roster = require('./match-roster');
const visibilityFence = require('./result-visibility-fence-core');
const { FieldValue } = require('firebase-admin/firestore');

const LEASE_MS = 180_000;
const TYPES = new Set(['match', 'root', 'orphan']);
const ERROR_CODES = new Set(['transaction', 'source', 'documents', 'bytes', 'writes', 'unknown']);

// Namespaces disjuntos: Firestore reserva IDs no formato __...__ e um ID de
// jogo jamais pode colidir com a pendência da raiz. O hash mantém o doc ID
// curto mesmo se a chave física do jogo for longa.
function pendingIdFor(type, sourceId) {
  validType(type);
  if (type === 'root') return 'root';
  if (type === 'match') return pendingIds.matchPendingId(sourceId);
  return pendingIds.orphanPendingId(sourceId);
}

function safeCode(error) {
  const raw = String(error && error.code || '');
  if (raw === 'mirror_projection_limit_documents') return 'documents';
  if (raw === 'mirror_projection_limit_bytes') return 'bytes';
  if (raw === 'mirror_projection_limit_writes') return 'writes';
  if (raw === 'source') return 'source';
  if (raw === 'ABORTED' || raw === 'DEADLINE_EXCEEDED' || raw === 'UNAVAILABLE') return 'transaction';
  return 'unknown';
}

function validType(type) {
  if (!TYPES.has(type)) throw new Error('mirror_pending_invalid_type');
  return type;
}

function rootVersion(snap) {
  const stamp = snap && snap.updateTime;
  if (!stamp || !Number.isSafeInteger(stamp.seconds) || !Number.isSafeInteger(stamp.nanoseconds)) {
    throw new Error('mirror_pending_missing_root_version');
  }
  return `${stamp.seconds}:${stamp.nanoseconds}`;
}

// O payload do evento só decide se é preciso invalidar: a projeção lê sempre
// o estado atual. Presença, timestamp e posição não participam do roster.
function inscritoMirrorSignature(raw) {
  if (raw == null) return 'absent';
  const item = raw && Object.prototype.hasOwnProperty.call(raw, 'item') ? raw.item : raw;
  if (!item || typeof item !== 'object') return roster.canonicalJson(item);
  const fields = ['uid', 'p1Uid', 'p2Uid', 'manualParticipantId', 'p1ManualId',
    'p2ManualId', 'name', 'displayName', 'p1Name', 'p2Name'];
  const relevant = {};
  for (const field of fields) if (item[field] !== undefined) relevant[field] = item[field];
  if (Array.isArray(item.participants)) relevant.participants = item.participants.map((member) => {
    if (!member || typeof member !== 'object') return member;
    const selected = {};
    for (const field of fields) if (member[field] !== undefined) selected[field] = member[field];
    return selected;
  });
  return roster.canonicalJson(relevant);
}

async function enqueueRoot(db, tournamentRef, error, nowMs = Date.now(), options = {}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('mirror_pending_invalid_time');
  const eventId = options.inscritosEventId == null ? null : String(options.inscritosEventId);
  if (eventId === '') throw new Error('mirror_pending_invalid_event_id');
  const resultSignalId = options.resultSignalId == null ? null : String(options.resultSignalId);
  if (resultSignalId === '') throw new Error('mirror_pending_invalid_event_id');
  const code = safeCode(error);
  const ref = tournamentRef.collection('mirrorReconcilePending').doc('root');
  return db.runTransaction(async (tx) => {
    const rootSnap = await tx.get(tournamentRef);
    const pendingSnap = await tx.get(ref);
    if (!rootSnap.exists) return { code, permanent: false, action: 'missing-root' };
    const version = rootVersion(rootSnap);
    const old = pendingSnap.exists ? pendingSnap.data() || {} : null;
    const phase = (rootSnap.data() || {}).organizerOnly === true ? 'hidden-results' : 'matches';
    const supersedeVisibleBlock = options.supersedeVisibleBlock === true &&
      phase === 'hidden-results' && old && ['matches', 'verify-results'].includes(old.phase);
    if (old && old.permanent === true && old.status !== 'completed' &&
        old.status !== 'completed-with-orphans' && old.status !== 'missing-root' &&
        !supersedeVisibleBlock) {
      const patch = {};
      if (old.blockedSourceUpdatedAt !== version) patch.blockedSourceUpdatedAt = version;
      if (eventId && old.blockedInscritosEventId !== eventId) {
        patch.blockedInscritosEventId = eventId;
        patch.blockedInscritosSignalCount = (old.blockedInscritosSignalCount || 0) + 1;
      }
      if (Object.keys(patch).length) tx.update(ref, patch);
      return { code: old.lastErrorCode || code, permanent: true, action: 'blocked' };
    }
    const seenSignals = old && Array.isArray(old.recentResultSignalIds)
      ? old.recentResultSignalIds.filter((id) => typeof id === 'string') : [];
    if (resultSignalId && seenSignals.includes(resultSignalId) && !supersedeVisibleBlock)
      return { code, permanent: old && old.permanent === true, action: 'duplicate' };
    if (eventId && old && old.lastInscritosEventId === eventId && !supersedeVisibleBlock)
      return { code, permanent: false, action: 'duplicate' };
    if (eventId && old && old.type === 'root' && old.rootUpdateTime === version &&
        old.status === 'queued' && old.phaseCursor == null &&
        (old.leaseUntilMs || 0) <= nowMs &&
        old.phase === phase) {
      tx.update(ref, { lastInscritosEventId: eventId, updatedAtMs: nowMs });
      return { code, permanent: false, action: 'coalesced' };
    }
    const recentResultSignalIds = resultSignalId
      ? seenSignals.concat(resultSignalId).slice(-32) : seenSignals.slice(-32);
    if (resultSignalId && old && old.type === 'root' && old.rootUpdateTime === version &&
        old.phase === phase && old.permanent !== true) {
      const alreadyStarted = old.phaseCursor != null || old.phase === 'verify-results' ||
        (old.leaseUntilMs || 0) > nowMs;
      tx.update(ref, { recentResultSignalIds,
        rerunRequested: old.rerunRequested === true || alreadyStarted,
        updatedAtMs: nowMs });
      return { code, permanent: false, action: 'coalesced' };
    }
    if (!eventId && !resultSignalId && old && old.type === 'root' && old.rootUpdateTime === version &&
        !supersedeVisibleBlock) {
      return { code: old.lastErrorCode || code, permanent: old.permanent === true,
        action: 'unchanged' };
    }
    // A falha da projeção integral pode ser permanente para aquela transação
    // (teto de documentos/bytes), mas a raiz ainda pode convergir por páginas.
    // Só o worker, após avaliar a fonte/página, marca a raiz bloqueada.
    tx.set(ref, { type: 'root', generation: old ? (old.generation || 0) + 1 : 1,
      phase,
      phaseCursor: null, rootUpdateTime: version, status: 'queued',
      lastErrorCode: code, permanent: false, matchId: null,
      lastInscritosEventId: eventId || (old && old.lastInscritosEventId) || null,
      recentResultSignalIds, rerunRequested: false,
      previousBlock: supersedeVisibleBlock ? { generation: old.generation || 0,
        code: old.lastErrorCode || 'unknown', phase: old.phase,
        atMs: old.updatedAtMs || null } : (old && old.previousBlock) || null,
      blockHistory: supersedeVisibleBlock && old.previousBlock
        ? ((Array.isArray(old.blockHistory) ? old.blockHistory : [])
          .concat(old.previousBlock).slice(-8))
        : (old && Array.isArray(old.blockHistory) ? old.blockHistory.slice(-8) : []),
      blockedSourceUpdatedAt: (old && old.blockedSourceUpdatedAt) || null,
      blockedInscritosSignalCount: (old && old.blockedInscritosSignalCount) || 0,
      blockedInscritosEventId: (old && old.blockedInscritosEventId) || null,
      updatedAtMs: nowMs, leaseOwner: null, leaseUntilMs: 0 });
    return { code, permanent: false, action: 'queued' };
  }, { maxAttempts: 5 });
}

async function enqueue(ref, type, error, nowMs = Date.now(), matchId = null, options = {}) {
  validType(type);
  if (type !== 'match') throw new Error('mirror_pending_match_only');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error('mirror_pending_invalid_time');
  const sourceMatchId = type === 'match' ? String(matchId == null ? ref.id : matchId) : null;
  if (type === 'match' && !sourceMatchId) throw new Error('mirror_pending_missing_match_id');
  const code = safeCode(error);
  if (!ERROR_CODES.has(code)) throw new Error('mirror_pending_invalid_code');
  const db = ref.firestore;
  if (!db || typeof db.runTransaction !== 'function') throw new Error('mirror_pending_missing_firestore');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const old = snap.exists ? snap.data() || {} : null;
    if (old && old.permanent === true) {
      return { code: old.lastErrorCode || 'unknown', permanent: true };
    }
    const permanent = Boolean(error && error.permanent);
    if (old && old.type === type && old.matchId === sourceMatchId &&
        old.lastErrorCode === code && !permanent) {
      return { code, permanent: false };
    }
    const generation = old ? (old.generation || 0) + 1 : 1;
    tx.set(ref, { type, lastErrorCode: code, permanent,
      status: permanent ? 'blocked' : 'queued', matchId: sourceMatchId,
      draftSource: options.draftSource === true,
      generation, updatedAtMs: nowMs, leaseUntilMs: 0, leaseOwner: null });
    return { code, permanent };
  }, { maxAttempts: 5 });
}

async function enqueueMatchFailures(tournamentRef, matchIds, error, nowMs = Date.now()) {
  const ids = projection.uniqueIds(matchIds);
  if (!ids.length) throw new Error('mirror_reconcile_missing_inline_ids');
  let allPermanent = true;
  for (const id of ids) {
    const ref = tournamentRef.collection('mirrorReconcilePending')
      .doc(pendingIdFor('match', id));
    const queued = await enqueue(ref, 'match', error, nowMs, id);
    if (!queued.permanent) allPermanent = false;
  }
  return { allPermanent, count: ids.length };
}

async function clearCorrectedSourcePending(db, physicalRef, logicalId) {
  const pendingRef = physicalRef.parent.parent.collection('mirrorReconcilePending')
    .doc(pendingIdFor('match', physicalRef.id));
  return db.runTransaction(async (tx) => {
    const physical = await tx.get(physicalRef);
    const pending = await tx.get(pendingRef);
    if (!physical.exists || !pending.exists) return false;
    const source = physical.data() || {};
    const old = pending.data() || {};
    if (String(source._chave) !== String(logicalId) || !source.jogo ||
        String(source.jogo.id) !== String(logicalId) ||
        old.type !== 'match' || old.matchId !== physicalRef.id ||
        old.lastErrorCode !== 'source' || old.permanent !== true ||
        old.draftSource !== true) return false;
    tx.delete(pendingRef);
    return true;
  }, { maxAttempts: 5 });
}

async function acquireLease(db, ref, nowMs = Date.now(), owner = crypto.randomUUID()) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || !owner) throw new Error('mirror_pending_invalid_lease');
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const pending = snap.data() || {};
    if (pending.permanent === true || (pending.leaseUntilMs || 0) > nowMs) return null;
    tx.update(ref, { leaseOwner: owner, leaseUntilMs: nowMs + LEASE_MS });
    const type = validType(pending.type);
    if (type === 'match' && !pending.matchId) throw new Error('mirror_pending_missing_match_id');
    return { ref, owner, type, matchId: pending.matchId || null,
      generation: pending.generation || 0,
      leaseUntilMs: nowMs + LEASE_MS };
  }, { maxAttempts: 5 });
}

async function markPermanent(db, lease, error, nowMs = Date.now()) {
  if (!lease || !lease.ref || !lease.owner) throw new Error('mirror_pending_invalid_lease');
  const code = safeCode(error);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(lease.ref);
    if (!snap.exists || (snap.data().generation || 0) !== (lease.generation || 0) ||
        snap.data().leaseOwner !== lease.owner ||
        !(snap.data().leaseUntilMs > nowMs)) return false;
    tx.update(lease.ref, { permanent: true, status: 'blocked', lastErrorCode: code,
      leaseOwner: null, leaseUntilMs: 0, updatedAtMs: nowMs });
    return true;
  }, { maxAttempts: 5 });
}

// Uma invocação processa uma página e devolve o lease. O varredor retoma a
// próxima; cursor e espelhos são confirmados juntos, nunca em dois commits.
async function recoverRootPage(db, tournamentRef, lease, nowMs, pageLimit = 50) {
  const nowIso = new Date(nowMs).toISOString();
  return db.runTransaction(async (tx) => {
    const rootSnap = await tx.get(tournamentRef);
    const pendingSnap = await tx.get(lease.ref);
    const pending = pendingSnap.exists ? pendingSnap.data() || {} : null;
    if (!pending || pending.type !== 'root' ||
        (pending.generation || 0) !== lease.generation ||
        pending.leaseOwner !== lease.owner || !(pending.leaseUntilMs > nowMs)) {
      return { action: 'lease-lost' };
    }
    if (!rootSnap.exists) {
      tx.update(lease.ref, { status: 'missing-root', permanent: true,
        leaseOwner: null, leaseUntilMs: 0, updatedAtMs: nowMs });
      return { action: 'missing-root' };
    }
    const fenceSnap = await visibilityFence.read(tx, tournamentRef);
    const version = rootVersion(rootSnap);
    const config = rootSnap.data() || {};
    const hiddenUnchanged = pending.phase === 'hidden-results' &&
      config.organizerOnly === true;
    // A limpeza oculta só esvazia índices de `results`: mudar outros campos
    // da raiz não invalida o cursor. Reiniciar a cada edição poderia impedir
    // para sempre uma varredura maior que a janela de 1 minuto do worker.
    if (version !== pending.rootUpdateTime && !hiddenUnchanged) {
      tx.update(lease.ref, { generation: lease.generation + 1, rootUpdateTime: version,
        phase: config.organizerOnly === true ? 'hidden-results' : 'matches',
        phaseCursor: null, orphanCount: 0, blockedMatchCount: 0,
        status: 'queued', permanent: false,
        leaseOwner: null, leaseUntilMs: 0, updatedAtMs: nowMs });
      return { action: 'root-changed' };
    }
    const phase = pending.phase || 'matches';
    if (!['matches', 'verify-results', 'hidden-results'].includes(phase))
      throw new Error('mirror_pending_invalid_phase');
    if (phase === 'hidden-results' && config.organizerOnly !== true)
      return { action: 'root-changed' };
    if (phase !== 'hidden-results' && config.organizerOnly === true)
      return { action: 'root-changed' };
    const collection = phase === 'matches' ? 'matches' : 'results';
    let query = tournamentRef.collection(collection).orderBy('__name__');
    if (pending.phaseCursor != null) query = query.startAfter(pending.phaseCursor);
    const page = await tx.get(query.limit(pageLimit));
    const docs = page.docs || [];
    // Um documento pode conter jogos inline antigos, até junto com alguns
    // jogos físicos. Não declare o restante órfão nem publique por uma fonte
    // mista: a migração administrativa deve consolidar primeiro o formato.
    if (phase === 'matches' && roster.collectMatches(config).length) {
      tx.update(lease.ref, { permanent: true, status: 'blocked',
        lastErrorCode: 'source', leaseOwner: null, leaseUntilMs: 0,
        updatedAtMs: nowMs });
      return { action: 'blocked-inline-source', writes: 0 };
    }
    let documents = 2 + docs.length + (fenceSnap.exists ? 1 : 0);
    let bytes = Buffer.byteLength(JSON.stringify(config), 'utf8') +
      Buffer.byteLength(JSON.stringify(pending), 'utf8') +
      (fenceSnap.exists ? Buffer.byteLength(JSON.stringify(fenceSnap.data()), 'utf8') : 0);
    const plans = [];
    let newOrphans = 0;
    let newBlockedMatches = 0;
    let participantParts = null;
    const readParticipantParts = async () => {
      if (participantParts) return participantParts;
      const snapshot = await tx.get(tournamentRef.collection('inscritos')
        .limit(projection.LIMITS.documents + 1));
      if (snapshot.docs.length > projection.LIMITS.documents)
        throw new projection.MirrorProjectionLimit('documents');
      participantParts = snapshot.docs.map((doc) => doc.data());
      documents += participantParts.length;
      for (const data of participantParts)
        bytes += Buffer.byteLength(JSON.stringify(data), 'utf8');
      return participantParts;
    };
    const targetFor = async (physical, id) => {
      if (!physical || !id) return null;
      const structural = projection.focalTournament(config, physical, String(id));
      if (structural) return { tournament: structural, complete: true };
      if (!projection.positionedPhysicalTournament(config, physical, String(id))) return null;
      const participants = await readParticipantParts();
      const tournament = projection.positionedPhysicalTournament(config, physical,
        String(id), participants);
      const game = tournament && mirror.jogoPorId(tournament, id);
      return game ? { tournament,
        complete: projection.hasCompleteRosterProof(tournament, game) } : null;
    };
    const blockMatch = async (sourceId) => {
      const ref = tournamentRef.collection('mirrorReconcilePending')
        .doc(pendingIds.matchPendingId(sourceId));
      const snap = await tx.get(ref);
      documents++;
      if (!snap.exists) {
        const data = { type: 'match', matchId: sourceId, generation: 1,
          permanent: true, status: 'blocked', lastErrorCode: 'source', updatedAtMs: nowMs,
          leaseOwner: null, leaseUntilMs: 0 };
        bytes += Buffer.byteLength(JSON.stringify(data), 'utf8');
        plans.push({ type: 'set', ref, doc: data });
      }
      if (phase === 'matches') newBlockedMatches++;
    };
    if (phase === 'hidden-results') {
      for (const doc of docs) {
        const data = doc.data();
        bytes += Buffer.byteLength(JSON.stringify(data), 'utf8');
        if (Array.isArray(data.playerUids) && data.playerUids.length)
          plans.push({ type: 'clear', ref: doc.ref });
      }
    } else if (phase === 'matches') {
      for (const doc of docs) {
        const physical = doc.data();
        bytes += Buffer.byteLength(JSON.stringify(physical), 'utf8');
        const id = physical && physical._chave;
        const target = await targetFor(physical, id);
        if (!target) {
          // Sem identidade estrutural não se publica UID por nome. A pendência
          // do jogo permanece visível à auditoria, mas não trava os demais.
          // O gatilho de `matches` recebe o ID físico do documento, não `_chave`.
          // Usar o mesmo ID permite que uma correção posterior alcance a pendência.
          await blockMatch(doc.id);
          continue;
        }
        const resultRef = tournamentRef.collection('results').doc(String(id));
        const resultSnap = await tx.get(resultRef);
        documents++;
        const old = resultSnap.exists ? resultSnap.data() : null;
        bytes += Buffer.byteLength(JSON.stringify(old), 'utf8');
        const plan = mirror.planoDoEspelho(target.tournament, id, old,
          tournamentRef.id, nowIso, { playerUids: projection.provenPlayerUids(target.tournament,
            mirror.jogoPorId(target.tournament, id)) });
        if (plan.acao === 'set') {
          bytes += Buffer.byteLength(JSON.stringify(plan.doc), 'utf8');
          plans.push({ type: 'set', ref: resultRef, doc: plan.doc });
        }
        if (!target.complete) await blockMatch(doc.id);
      }
    } else {
      for (const doc of docs) {
        const old = doc.data();
        bytes += Buffer.byteLength(JSON.stringify(old), 'utf8');
        const id = doc.id;
        const sources = await tx.get(tournamentRef.collection('matches')
          .where('_chave', '==', id).limit(2));
        documents += sources.docs.length;
        const physical = sources.size === 1 ? sources.docs[0].data() : null;
        if (physical) bytes += Buffer.byteLength(JSON.stringify(physical), 'utf8');
        const target = physical && await targetFor(physical, id);
        if (!target) {
          const orphanRef = tournamentRef.collection('mirrorReconcilePending')
            .doc(pendingIds.orphanPendingId(id));
          const orphanSnap = await tx.get(orphanRef);
          documents++;
          if (!orphanSnap.exists) {
            const data = { type: 'orphan', matchId: id, permanent: true,
              lastErrorCode: pendingIds.ORPHAN_SOURCE_CODE, updatedAtMs: nowMs,
              leaseOwner: null, leaseUntilMs: 0 };
            bytes += Buffer.byteLength(JSON.stringify(data), 'utf8');
            plans.push({ type: 'set', ref: orphanRef, doc: data });
          }
          newOrphans++;
          continue;
        }
        const plan = mirror.planoDoEspelho(target.tournament, id, old,
          tournamentRef.id, nowIso, { playerUids: projection.provenPlayerUids(target.tournament,
            mirror.jogoPorId(target.tournament, id)) });
        if (plan.acao === 'set') {
          bytes += Buffer.byteLength(JSON.stringify(plan.doc), 'utf8');
          plans.push({ type: 'set', ref: doc.ref, doc: plan.doc });
        }
        if (!target.complete) await blockMatch(sources.docs[0].id);
      }
    }
    if (documents > projection.LIMITS.documents)
      throw new projection.MirrorProjectionLimit('documents');
    if (bytes > projection.LIMITS.bytes) throw new projection.MirrorProjectionLimit('bytes');
    const resultPlans = plans.filter((plan) => plan.ref.parent.id === 'results');
    if (plans.length + 1 + (resultPlans.length ? 1 : 0) > projection.LIMITS.writes)
      throw new projection.MirrorProjectionLimit('writes');
    if (resultPlans.length) visibilityFence.write(tx, tournamentRef, FieldValue);
    for (const plan of plans) {
      if (plan.type === 'clear') tx.update(plan.ref, { playerUids: [] });
      else tx.set(plan.ref, plan.doc);
    }
    const atEnd = docs.length < pageLimit;
    const rerun = atEnd && pending.rerunRequested === true;
    const nextPhase = rerun ? (config.organizerOnly === true ? 'hidden-results' : 'matches')
      : atEnd && phase === 'matches' ? 'verify-results' : phase;
    const completed = atEnd && phase !== 'matches' && !rerun;
    const orphanCount = (pending.orphanCount || 0) + newOrphans;
    const blockedMatchCount = (pending.blockedMatchCount || 0) + newBlockedMatches;
    tx.update(lease.ref, {
      rootUpdateTime: version,
      phase: nextPhase,
      phaseCursor: atEnd ? null : docs[docs.length - 1].id,
      rerunRequested: rerun ? false : pending.rerunRequested === true,
      orphanCount: rerun ? 0 : orphanCount,
      blockedMatchCount: rerun ? 0 : blockedMatchCount, status: completed
        ? (orphanCount ? 'completed-with-orphans' : 'completed') : 'queued',
      permanent: completed, leaseOwner: null, leaseUntilMs: 0,
      updatedAtMs: nowMs,
    });
    return { action: completed ? 'completed' : 'page', phase,
      scanned: docs.length, writes: plans.length, orphanCount, blockedMatchCount };
  }, { maxAttempts: 5 });
}

async function recoverRoot(db, tournamentRef, lease, nowMs) {
  const pending = await lease.ref.get();
  const configuredLimit = pending.exists && Number.isSafeInteger(pending.data().pageLimit)
    ? Math.max(1, Math.min(50, pending.data().pageLimit)) : 50;
  for (let limit = configuredLimit; limit >= 1; limit = Math.floor(limit / 2)) {
    try { return await recoverRootPage(db, tournamentRef, lease, nowMs, limit); }
    catch (error) {
      if (error && ['mirror_projection_limit_bytes', 'mirror_projection_limit_documents'].includes(error.code) && limit > 1) continue;
      throw error;
    }
  }
  throw new projection.MirrorProjectionLimit('bytes');
}

// Porta administrativa: nenhuma chamada automática a usa. O alvo e a geração
// esperada são obrigatórios; um bloqueio não é destravado por evento comum.
async function resumeBlocked(db, tournamentRef, pendingRef, expectedGeneration,
  nowMs = Date.now()) {
  if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0)
    throw new Error('mirror_pending_invalid_expected_generation');
  return db.runTransaction(async (tx) => {
    const root = await tx.get(tournamentRef);
    const snap = await tx.get(pendingRef);
    if (!snap.exists) return { action: 'missing-pending' };
    const old = snap.data() || {};
    if ((old.generation || 0) !== expectedGeneration)
      return { action: 'generation-changed' };
    // Pendências de jogo anteriores ao campo status também são retomáveis
    // por CAS explícito; o evento comum nunca remove permanent=true.
    if (old.permanent !== true || !['root', 'match'].includes(old.type) ||
        (old.status !== 'blocked' && !(old.type === 'match' && old.status == null)))
      return { action: 'not-blocked' };
    const sameRoot = old.type === 'root' && root.exists &&
      old.rootUpdateTime === rootVersion(root);
    const patch = { generation: expectedGeneration + 1, permanent: false,
      status: 'queued', leaseOwner: null, leaseUntilMs: 0, updatedAtMs: nowMs,
      previousBlock: { generation: expectedGeneration,
        code: old.lastErrorCode || 'unknown', atMs: old.updatedAtMs || null } };
    if (old.type === 'root') {
      if (!root.exists) return { action: 'missing-root' };
      patch.rootUpdateTime = rootVersion(root);
      patch.phase = sameRoot ? old.phase :
        ((root.data() || {}).organizerOnly === true ? 'hidden-results' : 'matches');
      patch.phaseCursor = sameRoot ? old.phaseCursor || null : null;
      patch.orphanCount = sameRoot ? old.orphanCount || 0 : 0;
      patch.blockedMatchCount = sameRoot ? old.blockedMatchCount || 0 : 0;
      patch.pageLimit = ['bytes', 'documents'].includes(old.lastErrorCode)
        ? Math.max(1, Math.floor((old.pageLimit || 50) / 2)) : (old.pageLimit || 50);
    }
    tx.update(pendingRef, patch);
    return { action: 'resumed', generation: patch.generation };
  }, { maxAttempts: 5 });
}

async function auditPending(db, nowMs = Date.now()) {
  const counts = { queuedRoot: 0, blockedRoot: 0, completedRoot: 0,
    queuedMatch: 0, blockedMatch: 0, orphan: 0, other: 0 };
  let oldestQueuedAgeMs = 0;
  let cursor = null;
  for (;;) {
    let query = db.collectionGroup('mirrorReconcilePending').orderBy('__name__').limit(200);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const doc of page.docs) {
      const data = doc.data() || {};
      if (data.type === 'orphan') counts.orphan++;
      else if (data.type === 'root' && data.status === 'blocked') counts.blockedRoot++;
      else if (data.type === 'root' && data.permanent === true) counts.completedRoot++;
      else if (data.type === 'root') counts.queuedRoot++;
      else if (data.type === 'match' && data.permanent === true) counts.blockedMatch++;
      else if (data.type === 'match') counts.queuedMatch++;
      else counts.other++;
      if (data.permanent !== true && Number.isSafeInteger(data.updatedAtMs))
        oldestQueuedAgeMs = Math.max(oldestQueuedAgeMs, nowMs - data.updatedAtMs);
    }
    if (page.empty || page.size < 200) break;
    cursor = page.docs[page.docs.length - 1];
  }
  return { counts, oldestQueuedAgeMs: Math.max(0, oldestQueuedAgeMs) };
}

async function recoverPending(db, tournamentRef, pendingRef, nowMs = Date.now()) {
  const initial = await pendingRef.get();
  if (initial.exists && (initial.data() || {}).type === 'orphan') {
    return { action: 'not-acquired' };
  }
  const lease = await acquireLease(db, pendingRef, nowMs);
  if (!lease) return { action: 'not-acquired' };
  try {
    if (lease.type === 'root') return await recoverRoot(db, tournamentRef, lease, nowMs);
    const result = await projection.projectCurrent(db, tournamentRef, {
      mode: lease.type === 'match' ? 'ids' : 'all',
      matchIds: lease.type === 'match' ? [lease.matchId] : [],
      allowDelete: false, pendingLease: lease, nowMs,
    });
    return result;
  } catch (error) {
    if (error && error.permanent === true) {
      const marked = await markPermanent(db, lease, error, nowMs);
      if (!marked) return { action: 'lease-lost' };
      return { action: 'permanent', code: safeCode(error) };
    }
    throw error;
  }
}

module.exports = { LEASE_MS, pendingIdFor, enqueue, enqueueMatchFailures,
  clearCorrectedSourcePending, enqueueRoot, inscritoMirrorSignature,
  acquireLease, markPermanent,
  recoverPending, recoverRootPage, resumeBlocked, auditPending, safeCode, rootVersion };
