/* Projeção de results a partir de um único snapshot transacional.
 * Ligada aos gatilhos apenas no código local; a publicação continua bloqueada
 * até existir fallback focal e passar a prova de concorrência da 3.2.8. */
'use strict';

const split = require('./vendor/tournament-split-core');
const roster = require('./match-roster');
const mirror = require('./match-result-mirror-core');
const pendingIds = require('./mirror-pending-id-core');
const visibilityFence = require('./result-visibility-fence-core');
const { FieldValue } = require('firebase-admin/firestore');

const LIMITS = Object.freeze({ documents: 750, bytes: 5 * 1024 * 1024, writes: 400 });
const MIRROR_FOCAL_FALLBACK_READY = false;

class MirrorProjectionLimit extends Error {
  constructor(kind) {
    super(`mirror_projection_limit_${kind}`);
    this.name = 'MirrorProjectionLimit';
    this.code = `mirror_projection_limit_${kind}`;
    this.permanent = true;
  }
}

function sizeOf(value) {
  return Buffer.byteLength(JSON.stringify(value == null ? null : value), 'utf8');
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter((id) => id !== null && id !== undefined && String(id) !== '')
    .map(String))];
}

// A posição física é prova de qual jogo montar, mas não de quem participa dele.
// Um jogo sem UID estrutural usa esta montagem apenas junto do conjunto atual
// de `inscritos`, lido transacionalmente pelo worker da fila.
function positionedPhysicalTournament(config, physical, matchId, participants = []) {
  if (!physical || physical._chave !== matchId || !physical.jogo ||
      String(physical.jogo.id) !== matchId) return null;
  const loc = physical._loc;
  if (!loc || !Number.isSafeInteger(loc.mi) || loc.mi < 0) return null;
  let target;
  if (loc.tipo === 'matches') target = config.matches;
  else if (loc.tipo === 'rounds' && Number.isSafeInteger(loc.ri) && loc.ri >= 0)
    target = config.rounds && config.rounds[loc.ri] && config.rounds[loc.ri].matches;
  else if (loc.tipo === 'phaseRounds' && typeof loc.fase === 'string' &&
      Number.isSafeInteger(loc.ri) && loc.ri >= 0) {
    const phase = config.phaseRounds && config.phaseRounds[loc.fase];
    target = phase && phase.rounds && phase.rounds[loc.ri] && phase.rounds[loc.ri].matches;
  } else return null;
  if (!Array.isArray(target) || target[loc.mi] != null) return null;
  const mounted = split.remontar({ config, matches: [physical], participants });
  return mounted && roster.collectMatches(mounted).some((game) =>
    game && String(game.id) === matchId) ? mounted : null;
}

// Só um documento físico cuja chave é o ID do jogo e cujos lados trazem
// identidade estrutural pode dispensar a leitura de `inscritos`.
function focalTournament(config, physical, matchId) {
  const mounted = positionedPhysicalTournament(config, physical, matchId);
  if (!mounted) return null;
  for (const side of ['p1', 'p2']) {
    const name = physical.jogo[side];
    if (!name || name === 'TBD' || name === 'BYE') continue;
    if (typeof name !== 'string') return null;
    const rawTeamUids = side === 'p1' ? physical.jogo.team1Uids : physical.jogo.team2Uids;
    // slotUids filtra entradas vazias. Na via focal isso esconderia uma dupla
    // estruturalmente incompleta e publicaria um índice de só um participante.
    if (Array.isArray(rawTeamUids) && rawTeamUids.some((uid) =>
      typeof uid !== 'string' || !uid.trim())) return null;
    const uids = roster.slotUids(physical.jogo, side);
    if (!uids.length || uids.some((uid) => typeof uid !== 'string' || !uid.trim())) return null;
    if (name.includes('/') && uids.length < 2) return null;
  }
  const game = mirror.jogoPorId(mounted, matchId);
  return game && hasCompleteRosterProof(mounted, game) ? mounted : null;
}

function hasCompleteRosterProof(tournament, game) {
  const parts = Array.isArray(tournament.participants) ? tournament.participants :
    Object.values(tournament.participants || {});
  for (const side of ['p1', 'p2']) {
    const name = game && game[side];
    if (!name || name === 'TBD' || name === 'BYE') continue;
    if (typeof name !== 'string') return false;
    const rawTeam = side === 'p1' ? game.team1Uids : game.team2Uids;
    if (Array.isArray(rawTeam) && rawTeam.length && rawTeam.some((uid) =>
      typeof uid !== 'string' || !uid.trim())) return false;
    const structural = roster.slotUids(game, side);
    if (structural.length) {
      // Uma dupla pode ter só um integrante com UID após reivindicar a vaga
      // manual. matchRoster publica apenas esse UID estrutural, sem deduzir
      // a identidade do parceiro pelo nome mostrado no card.
      continue;
    }
    const exact = roster.uniqueParticipantByName(parts, name);
    const exactUids = exact ? roster.participantUids(exact) : [];
    if (exactUids.length) continue;
    const members = name.includes('/') ? name.split('/').map((entry) => entry.trim()) : [name];
    if (!members.every((entry) => {
      const person = roster.uniqueParticipantByName(parts, entry);
      return person && roster.participantUids(person).length === 1;
    })) return false;
  }
  return true;
}

function provenPlayerUids(tournament, game) {
  if (hasCompleteRosterProof(tournament, game)) return roster.matchRoster(tournament, game);
  // Uma vaga manual ainda sem conta não invalida o UID estrutural do parceiro.
  // Sem prova para todos os lados, nenhum UID é inferido pelo nome.
  return uniqueIds(['p1', 'p2'].flatMap((side) => {
    const name = game && game[side];
    if (!name || name === 'TBD' || name === 'BYE') return [];
    const rawTeam = side === 'p1' ? game.team1Uids : game.team2Uids;
    if (Array.isArray(rawTeam) && rawTeam.length && rawTeam.some((uid) =>
      typeof uid !== 'string' || !uid.trim())) return [];
    return roster.slotUids(game, side);
  }));
}

async function mountCanonical(tournamentRef, config, tx = null, account = () => {}) {
  return split.montarDoBanco(config, async (collection) => {
    const query = tournamentRef.collection(collection).limit(LIMITS.documents + 1);
    const snap = tx ? await tx.get(query) : await query.get();
    const docs = snap.docs || [];
    if (docs.length > LIMITS.documents) throw new MirrorProjectionLimit('documents');
    for (const doc of docs) account(doc.data());
    return docs.map((doc) => doc.data());
  });
}

// Núcleo de UMA página da limpeza do índice oculto. Ainda não é agendador:
// o cursor durável/fencing entre páginas deve existir antes de ligá-lo ao
// gatilho. A raiz é relida dentro de CADA transação; um evento atrasado não
// pode tratar como oculto um torneio que voltou a ser visível.
async function clearHiddenIndexPage(db, tournamentRef, options = {}) {
  const limit = options.limit == null ? 200 : options.limit;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 ||
      !options.documentIdFieldPath) throw new Error('mirror_hidden_page_invalid_options');
  const afterId = options.afterId == null ? null : String(options.afterId);
  if (afterId === '') throw new Error('mirror_hidden_page_invalid_cursor');
  return db.runTransaction(async (tx) => {
    const rootSnap = await tx.get(tournamentRef);
    if (!rootSnap.exists) return { action: 'missing-root', writes: 0, nextCursor: null };
    if ((rootSnap.data() || {}).organizerOnly !== true) {
      return { action: 'not-hidden', writes: 0, nextCursor: afterId };
    }
    await visibilityFence.read(tx, tournamentRef);
    let query = tournamentRef.collection('results').orderBy(options.documentIdFieldPath);
    if (afterId !== null) query = query.startAfter(afterId);
    const snap = await tx.get(query.limit(limit));
    const docs = snap.docs || [];
    let bytes = sizeOf(rootSnap.data());
    const toClear = [];
    for (const doc of docs) {
      const data = doc.data();
      bytes += sizeOf(data);
      if (Array.isArray(data.playerUids) && data.playerUids.length) toClear.push(doc.ref);
    }
    if (bytes > LIMITS.bytes) throw new MirrorProjectionLimit('bytes');
    if (toClear.length + 1 > LIMITS.writes) throw new MirrorProjectionLimit('writes');
    if (toClear.length) visibilityFence.write(tx, tournamentRef, FieldValue);
    for (const ref of toClear) tx.update(ref, { playerUids: [] });
    return { action: 'hidden-page', writes: toClear.length,
      nextCursor: docs.length === limit ? docs[docs.length - 1].id : null,
      scanned: docs.length };
  }, { maxAttempts: 5 });
}

async function projectCurrent(db, tournamentRef, options = {}) {
  const requested = uniqueIds(options.matchIds);
  const mode = options.mode || 'ids';
  if (mode !== 'ids' && mode !== 'all') throw new Error('mirror_projection_invalid_mode');
  if (options.allowDelete === true && mode !== 'ids') throw new Error('mirror_projection_invalid_delete');
  const nowIso = options.nowIso || new Date().toISOString();
  return db.runTransaction(async (tx) => {
    const nowMs = options.nowMs ?? Date.now();
    let documents = 0;
    let bytes = 0;
    const account = (data) => { documents++; bytes += sizeOf(data); };
    const rootSnap = await tx.get(tournamentRef);
    account(rootSnap.exists ? rootSnap.data() : null);
    let pendingRef = null;
    if (options.pendingLease) {
      pendingRef = options.pendingLease.ref;
      const pendingSnap = await tx.get(pendingRef);
      account(pendingSnap.exists ? pendingSnap.data() : null);
      const pending = pendingSnap.exists ? pendingSnap.data() : null;
      if (!pending || (pending.generation || 0) !== (options.pendingLease.generation || 0) ||
          pending.leaseOwner !== options.pendingLease.owner ||
          !(pending.leaseUntilMs > nowMs)) {
        return { action: 'lease-lost', writes: 0, documents };
      }
      // pendingRef integra o read-set desta mesma transação. Se outra transação
      // mudar a geração antes do commit (inclusive quando o plano é skip), o
      // Firestore aborta/reexecuta o callback; a verificação acima roda de novo.
    }
    if (!rootSnap.exists) {
      if (pendingRef) tx.delete(pendingRef);
      return { action: 'missing-root', writes: pendingRef ? 1 : 0, documents };
    }
    const fenceSnap = await visibilityFence.read(tx, tournamentRef);
    if (fenceSnap.exists) account(fenceSnap.data());
    const config = rootSnap.data() || {};
    const resultCol = tournamentRef.collection('results');
    // Em modo restrito, a única escrita possível é remover o índice público.
    // A decisão vem da raiz lida nesta transação, não do evento atrasado.
    if (config.organizerOnly === true) {
      const snap = await tx.get(resultCol.limit(LIMITS.documents + 1));
      if ((snap.docs || []).length > LIMITS.documents)
        throw new MirrorProjectionLimit('documents');
      const toClear = [];
      for (const doc of snap.docs || []) {
        const data = doc.data();
        account(data);
        if (Array.isArray(data.playerUids) && data.playerUids.length) toClear.push(doc.ref);
      }
      if (documents > LIMITS.documents) throw new MirrorProjectionLimit('documents');
      if (bytes > LIMITS.bytes) throw new MirrorProjectionLimit('bytes');
      if (toClear.length + (toClear.length ? 1 : 0) + (pendingRef ? 1 : 0) > LIMITS.writes) throw new MirrorProjectionLimit('writes');
      if (toClear.length) visibilityFence.write(tx, tournamentRef, FieldValue);
      for (const ref of toClear) tx.update(ref, { playerUids: [] });
      if (pendingRef) tx.delete(pendingRef);
      return { action: 'hidden', writes: toClear.length + (pendingRef ? 1 : 0), documents };
    }

    // Uma projeção direta pode limpar somente pendência NÃO bloqueada de jogo.
    // O bloqueio permanente exige retomada administrativa CAS, mesmo que um
    // evento comum consiga projetar o jogo depois; não o apague silenciosamente.
    let directMatchPendingRef = null;
    let directMatchPending = null;
    if (mode === 'ids' && requested.length === 1 && !pendingRef) {
      directMatchPendingRef = tournamentRef.collection('mirrorReconcilePending')
        .doc(pendingIds.matchPendingId(requested[0]));
      const snap = await tx.get(directMatchPendingRef);
      directMatchPending = snap.exists ? snap.data() || {} : null;
      account(directMatchPending);
    }
    const clearDirectMatchPending = (id, sourceExists) => Boolean(sourceExists &&
      directMatchPending && directMatchPending.type === 'match' &&
      directMatchPending.matchId === id &&
      directMatchPending.permanent !== true &&
      (directMatchPending.leaseUntilMs || 0) <= nowMs);

    if (mode === 'ids' && requested.length === 1) {
      const id = requested[0];
      const physicalSnap = await tx.get(tournamentRef.collection('matches').doc(id));
      account(physicalSnap.exists ? physicalSnap.data() : null);
      const candidate = physicalSnap.exists ? focalTournament(config, physicalSnap.data(), id) : null;
      const focal = candidate && mirror.jogoPorId(candidate, id) ? candidate : null;
      if (focal) {
        const resultSnap = await tx.get(resultCol.doc(id));
        account(resultSnap.exists ? resultSnap.data() : null);
        const orphanRef = tournamentRef.collection('mirrorReconcilePending')
          .doc(pendingIds.orphanPendingId(id));
        const orphanSnap = await tx.get(orphanRef);
        account(orphanSnap.exists ? orphanSnap.data() : null);
        const plan = mirror.planoDoEspelho(focal, id,
          resultSnap.exists ? resultSnap.data() : null, tournamentRef.id, nowIso);
        if (plan.acao === 'set') bytes += sizeOf(plan.doc);
        const clearPending = clearDirectMatchPending(id, true);
        const writes = (plan.acao === 'skip' ? 0 : 1) + (orphanSnap.exists ? 1 : 0) +
          (pendingRef ? 1 : 0) + (clearPending ? 1 : 0);
        if (documents > LIMITS.documents) throw new MirrorProjectionLimit('documents');
        if (bytes > LIMITS.bytes) throw new MirrorProjectionLimit('bytes');
        if (writes + (plan.acao === 'set' ? 1 : 0) > LIMITS.writes) throw new MirrorProjectionLimit('writes');
        if (plan.acao === 'set') {
          visibilityFence.write(tx, tournamentRef, FieldValue);
          tx.set(resultCol.doc(id), plan.doc);
        }
        if (orphanSnap.exists) tx.delete(orphanRef);
        if (clearPending) tx.delete(directMatchPendingRef);
        if (pendingRef) tx.delete(pendingRef);
        return { action: 'projected', path: 'focal', writes, documents };
      }
    }

    const mounted = await mountCanonical(tournamentRef, config, tx, account);

    const ids = mode === 'all'
      ? uniqueIds(roster.collectMatches(mounted).map((game) => game && game.id))
      : requested;
    const resultSnaps = await Promise.all(ids.map((id) => tx.get(resultCol.doc(id))));
    const orphanRefs = mode === 'ids' ? ids.map((id) =>
      tournamentRef.collection('mirrorReconcilePending').doc(pendingIds.orphanPendingId(id))) : [];
    const orphanSnaps = await Promise.all(orphanRefs.map((ref) => tx.get(ref)));
    for (const snap of orphanSnaps) account(snap.exists ? snap.data() : null);
    const orphanOps = [];
    const plans = ids.map((id, i) => {
      const snap = resultSnaps[i];
      account(snap.exists ? snap.data() : null);
      const game = mirror.jogoPorId(mounted, id);
      if (mode === 'ids') {
        const sourceExists = Boolean(game);
        const orphanSnap = orphanSnaps[i];
        if (!sourceExists) {
          if (options.allowDelete === true) {
            return mirror.planoDoEspelho(mounted, id, snap.exists ? snap.data() : null,
              tournamentRef.id, nowIso, { allowDelete: true });
          }
          if (snap.exists && !orphanSnap.exists) {
            const doc = { type: 'orphan', matchId: id, permanent: true,
              lastErrorCode: pendingIds.ORPHAN_SOURCE_CODE,
              updatedAtMs: nowMs, leaseUntilMs: 0, leaseOwner: null };
            orphanOps.push({ action: 'set', ref: orphanRefs[i], doc });
          }
          return { acao: 'skip', matchId: id };
        }
        if (orphanSnap.exists) orphanOps.push({ action: 'delete', ref: orphanRefs[i] });
      }
      return mirror.planoDoEspelho(mounted, id, snap.exists ? snap.data() : null,
        tournamentRef.id, nowIso, { allowDelete: options.allowDelete === true,
          playerUids: provenPlayerUids(mounted, game) });
    });
    const writes = plans.filter((plan) => plan.acao !== 'skip');
    const clearPending = requested.length === 1 && mode === 'ids' &&
      clearDirectMatchPending(requested[0], Boolean(mirror.jogoPorId(mounted, requested[0])));
    for (const plan of writes) if (plan.acao === 'set') bytes += sizeOf(plan.doc);
    for (const operation of orphanOps) if (operation.action === 'set') bytes += sizeOf(operation.doc);
    if (documents > LIMITS.documents) throw new MirrorProjectionLimit('documents');
    if (bytes > LIMITS.bytes) throw new MirrorProjectionLimit('bytes');
    if (writes.length + (writes.length ? 1 : 0) + orphanOps.length + (pendingRef ? 1 : 0) + (clearPending ? 1 : 0) > LIMITS.writes)
      throw new MirrorProjectionLimit('writes');
    if (writes.length) visibilityFence.write(tx, tournamentRef, FieldValue);
    for (const plan of writes) {
      const ref = resultCol.doc(plan.matchId);
      if (plan.acao === 'set') tx.set(ref, plan.doc);
      else if (plan.acao === 'delete') tx.delete(ref);
    }
    for (const operation of orphanOps) {
      if (operation.action === 'set') tx.set(operation.ref, operation.doc);
      else tx.delete(operation.ref);
    }
    if (clearPending) tx.delete(directMatchPendingRef);
    if (pendingRef) tx.delete(pendingRef);
    return { action: 'projected', writes: writes.length + orphanOps.length +
      (pendingRef ? 1 : 0) + (clearPending ? 1 : 0), documents };
  }, { maxAttempts: 5 });
}

module.exports = { LIMITS, MIRROR_FOCAL_FALLBACK_READY,
  MirrorProjectionLimit, focalTournament, positionedPhysicalTournament,
  hasCompleteRosterProof, provenPlayerUids, mountCanonical, clearHiddenIndexPage,
  projectCurrent, uniqueIds };
