'use strict';
const assert = require('node:assert/strict');
const split = require('../functions/vendor/tournament-split-core');
const core = require('../functions/mirror-transaction-core');
const queue = require('../functions/mirror-reconcile-queue-core');
const roster = require('../functions/match-roster');

function harness(tournament) {
  const divided = split.dividir(tournament);
  const rows = { root: divided.config, matches: divided.matches,
    inscritos: divided.participants, opponentHistory: divided.opponentHistory,
    results: [], pending: undefined, orphans: {}, fence: undefined };
  const trace = [];
  const snap = (item, itemRef) => ({ exists: item !== undefined, data: () => item, ref: itemRef });
  const ref = { id: 'fixture', kind: 'root',
    collection(name) { return { kind: 'query', name,
      limit(n) { return { ...this, maxDocs: n }; },
      doc(id) { return { kind: 'doc', name, id,
        get firestore() { return db; },
        async get() { return snap(id.startsWith('orphan-') ? rows.orphans[id] : rows.pending, this); },
        async set(data) { trace.push('direct-set:' + name);
          if (id.startsWith('orphan-')) rows.orphans[id] = data; else rows.pending = data; } }; } }; } };
  const db = { async runTransaction(fn, options) {
    assert.equal(options.maxAttempts, 5);
    const tx = {
      async get(target) {
        trace.push('read:' + (target.name || 'root'));
        if (target.kind === 'root') return snap(rows.root, target);
        if (target.kind === 'query') {
          assert.equal(target.maxDocs, core.LIMITS.documents + 1,
            'leitura da coleção é limitada antes do get');
          return { docs: (rows[target.name] || [])
          .slice(0, target.maxDocs).map((item, i) =>
          snap(item, target.doc(String(target.name === 'results' ? item.matchId : i)))) };
        }
        if (target.name === 'mirrorReconcilePending')
          return snap(target.id.startsWith('orphan-') ? rows.orphans[target.id] : rows.pending, target);
        if (target.name === 'resultVisibilityFence') return snap(rows.fence, target);
        const item = (rows[target.name] || []).find((entry) =>
          String(target.name === 'matches' ? entry._chave : entry.matchId) === target.id);
        return snap(item, target);
      },
      set(target, data) { trace.push('set:' + target.name);
        if (target.name === 'resultVisibilityFence') rows.fence = { revision: (rows.fence?.revision || 0) + 1 };
        else if (target.name === 'mirrorReconcilePending') {
          if (target.id.startsWith('orphan-')) rows.orphans[target.id] = data;
          else rows.pending = data;
        }
        else { rows.results = rows.results.filter((item) => String(item.matchId) !== target.id); rows.results.push(data); } },
      update(target, patch) { trace.push('update:' + target.name); const item = target.name === 'mirrorReconcilePending'
        ? rows.pending : rows.results.find((entry) => String(entry.matchId) === target.id); Object.assign(item, patch); },
      delete(target) { trace.push('delete:' + target.name); if (target.name === 'mirrorReconcilePending') {
        if (target.id.startsWith('orphan-')) delete rows.orphans[target.id]; else rows.pending = undefined;
      }
        else rows.results = rows.results.filter((item) => String(item.matchId) !== target.id); },
    };
    return fn(tx);
  } };
  return { db, ref, rows, trace };
}

(async () => {
  const fixture = { name: 'Teste', participants: [
    { uid: 'u1', displayName: 'Um' }, { uid: 'u2', displayName: 'Dois' }],
  rounds: [{ matches: [{ id: 'm1', p1: 'Um', p2: 'Dois', p1Uid: 'u1', p2Uid: 'u2',
    scoreP1: 6, scoreP2: 3, winner: 'Um' }] }] };
  assert.equal(queue.pendingIdFor('root', '__root__'), 'root');
  assert.throws(() => queue.pendingIdFor('hidden', '__root__'), /mirror_pending_invalid_type/);
  assert.match(queue.pendingIdFor('match', '__root__'), /^match-[a-f0-9]{64}$/);
  assert.match(queue.pendingIdFor('orphan', '__root__'), /^orphan-[a-f0-9]{64}$/);
  assert.notEqual(queue.pendingIdFor('orphan', 'm1'), queue.pendingIdFor('match', 'm1'));
  assert.notEqual(queue.pendingIdFor('orphan', 'm1'), 'root');
  assert.notEqual(queue.pendingIdFor('match', 'root'), queue.pendingIdFor('root', 'root'),
    'ID de jogo não colide com a pendência da raiz');
  assert.equal(queue.pendingIdFor('match', 'm1'), queue.pendingIdFor('match', 'm1'),
    'retentativas do mesmo jogo usam o mesmo documento');
  assert.equal(queue.inscritoMirrorSignature({ _idx: 0,
    item: { uid: 'u1', displayName: 'Um' } }),
  queue.inscritoMirrorSignature({ _idx: 5, presenceAt: 123,
    item: { displayName: 'Um', uid: 'u1', checkedInAt: 456 } }),
  'posição, presença e timestamps não invalidam o índice do jogo');
  assert.notEqual(queue.inscritoMirrorSignature({ item: { uid: 'u1', displayName: 'Um' } }),
    queue.inscritoMirrorSignature(null), 'remover a inscrição invalida o índice');
  assert.notEqual(queue.inscritoMirrorSignature({ item: { uid: 'u1', displayName: 'Um' } }),
    queue.inscritoMirrorSignature({ item: { uid: 'u2', displayName: 'Um' } }),
  'troca de UID com nome constante invalida o índice');
  const focalParts = split.dividir(fixture);
  const focal = core.focalTournament(focalParts.config, focalParts.matches[0], 'm1');
  assert(focal, 'slot estrutural com UID admite visão focal');
  assert.deepEqual(roster.buildSeedDoc(focal, roster.collectMatches(focal)[0]),
    roster.buildSeedDoc(fixture, fixture.rounds[0].matches[0]),
    'visão focal tem exatamente o seed integral quando o jogo traz identidade estrutural');
  assert.deepEqual(roster.buildMirrorDoc(focal, roster.collectMatches(focal)[0], 'fixture',
    '2026-10-31T00:00:00Z', { replay: { points: [1, 2] } }),
  roster.buildMirrorDoc(fixture, fixture.rounds[0].matches[0], 'fixture',
    '2026-10-31T00:00:00Z', { replay: { points: [1, 2] } }),
  'o documento completo, incluindo replay, é idêntico nas vias focal e integral');
  assert.equal(core.focalTournament(focalParts.config,
    { ...focalParts.matches[0], _chave: 'outra' }, 'm1'), null);
  assert.equal(core.focalTournament(focalParts.config,
    { ...focalParts.matches[0], jogo: { ...focalParts.matches[0].jogo, p1Uid: null } }, 'm1'), null,
  'nome único não é prova de identidade no caminho focal');
  assert.equal(core.focalTournament(focalParts.config, null, 'm1'), null,
    'ausência física não autoriza exclusão focal');
  const noUidParts = split.dividir({ name: 'Nome', participants: [
    { uid: 'u1', displayName: 'Um' }], rounds: [{ matches: [
      { id: 'by-name', p1: 'Um', p2: 'TBD', scoreP1: 6 }] }] });
  const byName = core.positionedPhysicalTournament(noUidParts.config,
    noUidParts.matches[0], 'by-name', noUidParts.participants);
  assert(byName, 'jogo sem UID estrutural conserva a identidade física e posição');
  assert(core.hasCompleteRosterProof(byName, roster.collectMatches(byName)[0]));
  const duplicateName = core.positionedPhysicalTournament(noUidParts.config,
    noUidParts.matches[0], 'by-name', noUidParts.participants.concat([
      { _idx: 1, item: { uid: 'u2', displayName: 'Um' } }]));
  assert.equal(core.hasCompleteRosterProof(duplicateName,
    roster.collectMatches(duplicateName)[0]), false,
  'homônimo não comprova qual UID pode entrar no índice');
  assert.equal(core.hasCompleteRosterProof({ participants: [] }, {
    p1: 'Ana / Bia', p2: 'TBD', team1Obj: { p1Uid: 'ana', p2ManualId: 'bia' },
  }), true, 'UID estrutural parcial de dupla pode entrar no índice sem inferir a vaga manual');
  assert.deepEqual(core.provenPlayerUids({ participants: [] }, {
    p1: 'Ana / Bia', p2: 'Cris / Dani', team1Obj: { p1Uid: 'ana', p2ManualId: 'bia' },
    team2Obj: { p1ManualId: 'cris', p2ManualId: 'dani' },
  }), ['ana'], 'vaga manual no outro lado não apaga o UID estrutural comprovado');
  assert.deepEqual(core.provenPlayerUids(duplicateName, roster.collectMatches(duplicateName)[0]), [],
    'homônimos sem identidade estrutural não recebem autorização por nome');
  assert.deepEqual(core.provenPlayerUids({ participants: [] }, {
    p1: 'Ana / Bia', p2: 'TBD', team1Uids: ['ana', null],
  }), [], 'array estrutural inválido não autoriza índice parcial');
  const clearPlan = require('../functions/match-result-mirror-core').planoDoEspelho(
    byName, 'by-name', { matchId: 'by-name', playerUids: ['old'], scoreP1: 6 },
    'fixture', '2026-10-31T00:00:00Z', { clearPlayerUids: true });
  assert.deepEqual(clearPlan.doc.playerUids, []);
  assert.equal(clearPlan.doc.scoreP1, 6);
  const doubles = { name: 'Duplas', rounds: [{ matches: [{ id: 'd1', p1: 'A / B', p2: 'C / D',
    team1Uids: ['a', 'b'], team2Uids: ['c', 'd'], sets: [6, 4] }] }] };
  const doubleParts = split.dividir(doubles);
  const focalDouble = core.focalTournament(doubleParts.config, doubleParts.matches[0], 'd1');
  assert.deepEqual(roster.buildSeedDoc(focalDouble, roster.collectMatches(focalDouble)[0]),
    roster.buildSeedDoc(doubles, doubles.rounds[0].matches[0]));
  assert.equal(core.focalTournament(doubleParts.config, { ...doubleParts.matches[0],
    jogo: { ...doubleParts.matches[0].jogo, team1Uids: ['a'] } }, 'd1'), null,
  'dupla incompleta não vira roster de um só atleta');
  assert.equal(core.focalTournament(focalParts.config, { ...focalParts.matches[0],
    jogo: { ...focalParts.matches[0].jogo, team1Uids: ['u1', null] } }, 'm1'), null,
  'array estrutural com UID vazio não pode ser filtrado e virar roster parcial');
  for (const game of [
    { id: 'w1', p1: 'Um', p2: 'Dois', p1Uid: 'u1', p2Uid: 'u2', wo: true, winner: 'Um' },
    { id: 'p1', p1: 'Um', p2: 'TBD', p1Uid: 'u1', pendingResult: { scoreP1: 3 } },
  ]) {
    const whole = { name: 'Casos', participants: fixture.participants,
      opponentHistory: [{ old: true }], rounds: [{ matches: [game] }] };
    const parts = split.dividir(whole);
    const single = core.focalTournament(parts.config, parts.matches[0], game.id);
    assert(single, 'W.O. e placeholder com identidade conhecida admitem via focal');
    assert.equal(roster.subdocSignature(roster.buildSeedDoc(single,
      roster.collectMatches(single)[0])), roster.subdocSignature(roster.buildSeedDoc(whole, game)));
    const withOtherParts = { ...whole, participants: [{ uid: 'other', displayName: 'Um' }],
      opponentHistory: [{ changed: true }], groups: [{ name: 'Grupo A' }] };
    assert.equal(roster.subdocSignature(roster.buildSeedDoc(withOtherParts, game)),
      roster.subdocSignature(roster.buildSeedDoc(whole, game)),
      'inscritos, grupos e histórico não alteram o seed com UIDs estruturais completos');
    assert.deepEqual(roster.buildMirrorDoc(single, roster.collectMatches(single)[0], 'fixture',
      '2026-10-31T00:00:00Z', { replay: { points: [1, 2] } }),
    roster.buildMirrorDoc(withOtherParts, game, 'fixture',
      '2026-10-31T00:00:00Z', { replay: { points: [1, 2] } }),
    'inscritos, grupos e histórico também não alteram o espelho completo com UID estrutural');
  }
  const unkeyedGame = { id: 'legacy-name', p1: 'Um', p2: 'TBD' };
  const beforeEnrollment = { name: 'Teste', participants: [{ uid: 'u1', displayName: 'Um' }],
    rounds: [{ matches: [unkeyedGame] }], opponentHistory: [{ old: true }] };
  const afterEnrollment = { ...beforeEnrollment,
    participants: [{ uid: 'u2', displayName: 'Um' }] };
  assert.deepEqual(roster.buildSeedDoc(beforeEnrollment, unkeyedGame).playerUids, ['u1']);
  assert.deepEqual(roster.buildSeedDoc(afterEnrollment, unkeyedGame).playerUids, ['u2'],
    'inscritos mudam o espelho de jogo sem UID estrutural; exigem invalidação');
  assert.equal(roster.subdocSignature(roster.buildSeedDoc(beforeEnrollment, unkeyedGame)),
    roster.subdocSignature(roster.buildSeedDoc({ ...beforeEnrollment,
      opponentHistory: [{ changed: true }] }, unkeyedGame)),
  'opponentHistory isolado não participa do seed nem exige gatilho de espelho');
  const groupMatch = { id: 'group-game', p1: 'Um', p2: 'Dois', p1Uid: 'u1', p2Uid: 'u2', scoreP1: 6 };
  const grouped = { name: 'Teste', groups: [{ name: 'A', matches: [groupMatch] }] };
  const groupedParts = split.dividir(grouped);
  assert.equal(groupedParts.config.groups[0].matches[0].id, 'group-game',
    'grupos permanecem na raiz; mudança de jogo no grupo aciona o gatilho da raiz');
  assert.equal(groupedParts.matches.length, 0);
  const h = harness(fixture);
  const first = await core.projectCurrent(h.db, h.ref, { matchIds: ['m1', 'm1'], nowIso: '2026-10-31T00:00:00Z' });
  assert.equal(first.writes, 1);
  assert.equal(h.rows.results[0].scoreP1, 6);
  assert(h.trace.slice(0, h.trace.findIndex((x) => x.startsWith('set:'))).every((x) => x.startsWith('read:')));
  const second = await core.projectCurrent(h.db, h.ref, { matchIds: ['m1'], nowIso: '2026-11-01T00:00:00Z' });
  assert.equal(second.writes, 0, 'timestamp diferente não reescreve espelho');
  h.rows.results[0].replay = { points: [1, 2] };
  h.rows.results[0].scoreP1 = 1;
  const repaired = await core.projectCurrent(h.db, h.ref, { matchIds: ['m1'] });
  assert.equal(repaired.writes, 1);
  assert.deepEqual(h.rows.results[0].replay, { points: [1, 2] });

  const hidden = harness({ ...fixture, organizerOnly: true });
  hidden.rows.results.push({ matchId: 'm1', playerUids: ['u1'], scoreP1: 6 });
  const cleared = await core.projectCurrent(hidden.db, hidden.ref, { matchIds: ['m1'] });
  assert.equal(cleared.action, 'hidden');
  assert.deepEqual(hidden.rows.results[0].playerUids, []);
  assert.equal(hidden.trace.filter((x) => x === 'set:results').length, 0);
  assert.equal(hidden.rows.fence.revision, 1, 'limpeza oculta também disputa o fence');
  assert(!hidden.trace.some((x) => ['read:matches', 'read:inscritos', 'read:opponentHistory'].includes(x)),
    'ocultação limpa o índice mesmo quando partes físicas não puderem ser montadas');

  const orphan = harness({ participants: fixture.participants, rounds: [{ matches: [] }] });
  orphan.rows.results.push({ matchId: 'gone', scoreP1: 6 });
  assert.equal((await core.projectCurrent(orphan.db, orphan.ref, { matchIds: ['gone'] })).writes, 1);
  assert.equal(orphan.rows.results.length, 1);
  const orphanId = queue.pendingIdFor('orphan', 'gone');
  assert.equal(orphan.rows.orphans[orphanId].permanent, true);
  assert.equal((await core.projectCurrent(orphan.db, orphan.ref, { matchIds: ['gone'] })).writes, 0);
  const orphanBeforeRecovery = structuredClone(orphan.rows.orphans[orphanId]);
  assert.equal((await queue.recoverPending(orphan.db, orphan.ref,
    orphan.ref.collection('mirrorReconcilePending').doc(orphanId))).action, 'not-acquired');
  assert.deepEqual(orphan.rows.orphans[orphanId], orphanBeforeRecovery,
    'reentrega do órfão permanente não altera a pendência');
  assert.equal((await core.projectCurrent(orphan.db, orphan.ref,
    { matchIds: ['gone'], allowDelete: true })).writes, 1);
  assert.equal(orphan.rows.results.length, 0);

  const noResult = harness({ rounds: [{ matches: [] }] });
  assert.equal((await core.projectCurrent(noResult.db, noResult.ref,
    { matchIds: ['draft'] })).writes, 0);
  assert.deepEqual(noResult.rows.orphans, {}, 'rascunho sem results não gera órfão');

  const focalReturn = harness(fixture);
  const restoredOrphanId = queue.pendingIdFor('orphan', 'm1');
  await core.projectCurrent(focalReturn.db, focalReturn.ref, { matchIds: ['m1'] });
  focalReturn.rows.orphans[restoredOrphanId] = { type: 'orphan', matchId: 'm1', permanent: true };
  const focalReturnResult = await core.projectCurrent(focalReturn.db, focalReturn.ref,
    { matchIds: ['m1'] });
  assert.equal(focalReturnResult.path, 'focal');
  assert.equal(focalReturnResult.writes, 1, 'órfão sai mesmo quando espelho já é igual');
  assert.equal(focalReturn.rows.orphans[restoredOrphanId], undefined);
  assert(focalReturn.trace.slice(focalReturn.trace.lastIndexOf('delete:mirrorReconcilePending') - 1)
    .some((event) => event.startsWith('read:')));

  const integralReturn = harness(fixture);
  await core.projectCurrent(integralReturn.db, integralReturn.ref, { matchIds: ['m1'] });
  integralReturn.rows.orphans[restoredOrphanId] = { type: 'orphan', matchId: 'm1', permanent: true };
  integralReturn.rows.matches[0]._chave = 'other-key';
  const integralReturnResult = await core.projectCurrent(integralReturn.db, integralReturn.ref,
    { matchIds: ['m1'] });
  assert.equal(integralReturnResult.path, undefined, 'chave física divergente força montagem integral');
  assert.equal(integralReturnResult.writes, 1);
  assert.equal(integralReturn.rows.orphans[restoredOrphanId], undefined);

  const boundary = harness(fixture);
  await assert.rejects(core.projectCurrent(boundary.db, boundary.ref,
    { matchIds: Array.from({ length: 375 }, (_, i) => 'n' + i) }),
  (error) => error instanceof core.MirrorProjectionLimit &&
    error.code === 'mirror_projection_limit_documents');
  assert(!boundary.trace.some((event) => /^(set|delete|update):/.test(event)),
    'teto inclui leituras de órfãos e recusa antes da primeira escrita');

  const absent = harness(fixture);
  absent.rows.root = undefined;
  assert.equal((await core.projectCurrent(absent.db, absent.ref, { matchIds: ['m1'] })).action, 'missing-root');
  assert.equal(absent.trace.filter((x) => !x.startsWith('read:')).length, 0);
  assert.deepEqual(core.uniqueIds(['1', 1, null, '', '2']), ['1', '2']);

  const tooMany = harness({ ...fixture, organizerOnly: true });
  tooMany.rows.results = Array.from({ length: 751 }, (_, i) =>
    ({ matchId: String(i), playerUids: ['u1'] }));
  await assert.rejects(core.projectCurrent(tooMany.db, tooMany.ref, { matchIds: ['m1'] }),
    (error) => error instanceof core.MirrorProjectionLimit && error.code === 'mirror_projection_limit_documents');
  assert.equal(tooMany.trace.filter((x) => x.startsWith('update:')).length, 0,
    'teto documental recusa antes de qualquer escrita');

  const tooLarge = harness({ ...fixture, organizerOnly: true });
  tooLarge.rows.results = [{ matchId: 'm1', playerUids: ['u1'], large: 'x'.repeat(core.LIMITS.bytes) }];
  await assert.rejects(core.projectCurrent(tooLarge.db, tooLarge.ref, { matchIds: ['m1'] }),
    (error) => error instanceof core.MirrorProjectionLimit && error.code === 'mirror_projection_limit_bytes');
  assert.equal(tooLarge.trace.filter((x) => x.startsWith('update:')).length, 0,
    'teto de bytes recusa antes de qualquer escrita');

  const queued = harness(fixture);
  const pendingRef = queued.ref.collection('mirrorReconcilePending').doc('m1');
  const pending = await queue.enqueue(pendingRef, 'match', { code: 'ABORTED' }, 1000);
  assert.deepEqual(pending, { code: 'transaction', permanent: false });
  assert(!Object.values(queued.rows.pending).some((value) => String(value).includes('u1')),
    'fila não guarda identidade');
  const lease = await queue.acquireLease(queued.db, pendingRef, 1001, 'worker-a');
  assert.equal(lease.owner, 'worker-a');
  assert.equal(await queue.acquireLease(queued.db, pendingRef, 1002, 'worker-b'), null,
    'segundo worker não toma lease vigente');
  assert.equal((await core.projectCurrent(queued.db, queued.ref,
    { matchIds: ['m1'], pendingLease: { ref: pendingRef, owner: 'worker-b' }, nowMs: 1002 })).action,
  'lease-lost');
  assert.equal(queued.rows.results.length, 0, 'worker sem lease não escreve espelho');
  const recovered = await core.projectCurrent(queued.db, queued.ref,
    { matchIds: ['m1'], pendingLease: lease, nowMs: 1002 });
  assert.equal(recovered.writes, 2, 'espelho e pendência saem no mesmo commit lógico');
  assert.equal(queued.rows.pending, undefined);
  assert.equal(queued.rows.results.length, 1);

  const deleted = harness(fixture);
  deleted.rows.root = undefined;
  const deletedRef = deleted.ref.collection('mirrorReconcilePending').doc('m1');
  await queue.enqueue(deletedRef, 'match', { code: 'ABORTED' }, 1000);
  const deletedLease = await queue.acquireLease(deleted.db, deletedRef, 1001, 'worker-c');
  assert.equal((await core.projectCurrent(deleted.db, deleted.ref,
    { matchIds: ['m1'], pendingLease: deletedLease, nowMs: 1002 })).action, 'missing-root');
  assert.equal(deleted.rows.pending, undefined, 'pendência de torneio excluído é removida');

  const permanent = harness(fixture);
  const permanentRef = permanent.ref.collection('mirrorReconcilePending').doc('m1');
  await queue.enqueue(permanentRef, 'match', new core.MirrorProjectionLimit('documents'), 1000);
  assert.equal(permanent.rows.pending.permanent, true);
  assert.equal(await queue.acquireLease(permanent.db, permanentRef, 1001, 'worker-d'), null);
  assert.deepEqual(await queue.enqueue(permanentRef, 'match', { code: 'ABORTED' }, 2000),
    { code: 'documents', permanent: true }, 'erro comum não reabre bloqueio permanente');
  assert.equal(permanent.rows.pending.generation, 1);
  assert.equal((await core.projectCurrent(permanent.db, permanent.ref,
    { matchIds: ['m1'], nowMs: 2001 })).writes, 1,
  'projeção direta atualiza espelho sem desbloquear pendência permanente');
  assert.equal(permanent.rows.pending.permanent, true);
  assert.deepEqual(await queue.resumeBlocked(permanent.db, permanent.ref,
    permanentRef, 1, 2002), { action: 'resumed', generation: 2 });
  const resumedLease = await queue.acquireLease(permanent.db, permanentRef, 2003, 'worker-resumed');
  assert.equal((await core.projectCurrent(permanent.db, permanent.ref,
    { matchIds: ['m1'], pendingLease: resumedLease, nowMs: 2004 })).writes, 1);
  assert.equal(permanent.rows.pending, undefined,
    'só a retomada administrativa CAS permite consumir a pendência bloqueada');
  await queue.enqueue(permanentRef, 'match', { code: 'ABORTED' }, 2005);
  assert.equal(permanent.rows.pending.permanent, false);
  const permanentLease = await queue.acquireLease(permanent.db, permanentRef, 2006, 'worker-d');
  assert.equal(await queue.markPermanent(permanent.db, permanentLease,
    new core.MirrorProjectionLimit('bytes'), 2007), true);
  assert.equal(permanent.rows.pending.lastErrorCode, 'bytes');
  assert.equal(permanent.rows.pending.permanent, true);

  const equalPending = harness(fixture);
  const equalRef = equalPending.ref.collection('mirrorReconcilePending').doc(queue.pendingIdFor('match', 'm1'));
  await core.projectCurrent(equalPending.db, equalPending.ref, { matchIds: ['m1'] });
  await queue.enqueue(equalRef, 'match', new core.MirrorProjectionLimit('documents'), 1000, 'm1');
  assert.equal((await core.projectCurrent(equalPending.db, equalPending.ref,
    { matchIds: ['m1'], nowMs: 1001 })).writes, 0,
  'skip por igualdade no ramo focal não desbloqueia pendência permanente');
  assert.equal(equalPending.rows.pending.permanent, true);

  const integralPending = harness(fixture);
  const integralRef = integralPending.ref.collection('mirrorReconcilePending').doc(queue.pendingIdFor('match', 'm1'));
  await core.projectCurrent(integralPending.db, integralPending.ref, { matchIds: ['m1'] });
  integralPending.rows.matches[0]._chave = 'other-key';
  await queue.enqueue(integralRef, 'match', new core.MirrorProjectionLimit('documents'), 1000, 'm1');
  assert.equal((await core.projectCurrent(integralPending.db, integralPending.ref,
    { matchIds: ['m1'], nowMs: 1001 })).writes, 0,
  'ramo integral também preserva pendência permanente');
  assert.equal(integralPending.rows.pending.permanent, true);

  const duplicate = harness(fixture);
  const duplicateRef = duplicate.ref.collection('mirrorReconcilePending').doc('m1');
  await queue.enqueue(duplicateRef, 'match', { code: 'UNAVAILABLE' }, 1000);
  const duplicateWrites = duplicate.trace.filter((event) => event.startsWith('set:')).length;
  await queue.enqueue(duplicateRef, 'match', { code: 'ABORTED' }, 2000);
  assert.equal(duplicate.trace.filter((event) => event.startsWith('set:')).length, duplicateWrites,
    'mesmo erro normalizado não reinicia geração nem lease');
  assert.equal(duplicate.rows.pending.generation, 1);
  await queue.enqueue(duplicateRef, 'match', new core.MirrorProjectionLimit('bytes'), 3000);
  assert.equal(duplicate.rows.pending.generation, 2);
  assert.equal(duplicate.rows.pending.permanent, true);
  assert.equal((await queue.enqueue(duplicateRef, 'match', { code: 'ABORTED' }, 4000)).permanent, true);
  assert.equal(duplicate.rows.pending.generation, 2);

  const legacyPending = harness(fixture);
  const legacyRef = legacyPending.ref.collection('mirrorReconcilePending').doc('m1');
  legacyPending.rows.pending = { type: 'match', matchId: 'm1', lastErrorCode: 'unknown',
    permanent: false, leaseOwner: null, leaseUntilMs: 0 };
  const legacyLease = await queue.acquireLease(legacyPending.db, legacyRef, 1000, 'old');
  assert.equal(legacyLease.generation, 0);
  assert.equal((await core.projectCurrent(legacyPending.db, legacyPending.ref,
    { matchIds: ['m1'], pendingLease: legacyLease, nowMs: 1001 })).action, 'projected',
  'documento sem geração usa zero no lease e na projeção');
  legacyPending.rows.pending = { type: 'match', matchId: 'm1', lastErrorCode: 'unknown',
    permanent: false, leaseOwner: null, leaseUntilMs: 0 };
  await queue.enqueue(legacyRef, 'match', { code: 'ABORTED' }, 1002);
  assert.equal(legacyPending.rows.pending.generation, 1,
    'primeira mudança material migra geração ausente de zero para um');

  const absentPending = harness({ rounds: [{ matches: [] }] });
  const absentRef = absentPending.ref.collection('mirrorReconcilePending').doc(queue.pendingIdFor('match', 'gone'));
  absentPending.rows.results.push({ matchId: 'gone', scoreP1: 6 });
  absentPending.rows.pending = { type: 'match', matchId: 'gone', lastErrorCode: 'documents',
    permanent: true, generation: 1, leaseUntilMs: 0 };
  await core.projectCurrent(absentPending.db, absentPending.ref, { matchIds: ['gone'] });
  assert.equal(absentPending.rows.pending.permanent, true,
    'skip de fonte ausente não limpa pendência permanente');
  assert.equal(absentPending.rows.results[0].scoreP1, 6);

  const leasedDirect = harness(fixture);
  const leasedRef = leasedDirect.ref.collection('mirrorReconcilePending').doc(queue.pendingIdFor('match', 'm1'));
  leasedDirect.rows.pending = { type: 'match', matchId: 'm1', lastErrorCode: 'transaction',
    permanent: false, generation: 3, leaseOwner: 'other', leaseUntilMs: 2000 };
  await core.projectCurrent(leasedDirect.db, leasedDirect.ref,
    { matchIds: ['m1'], nowMs: 1000 });
  assert.equal(leasedDirect.rows.pending.generation, 3,
    'projeção direta não apaga pendência sob lease válido');
  assert.equal((await core.projectCurrent(leasedDirect.db, leasedDirect.ref,
    { matchIds: ['m1'], pendingLease: { ref: leasedRef, owner: 'other', generation: 2 },
      nowMs: 1000 })).writes, 0,
  'mesmo owner com geração antiga não pode commitar resultado');

  const lostMark = harness(fixture);
  const lostRef = lostMark.ref.collection('mirrorReconcilePending').doc(queue.pendingIdFor('match', 'm1'));
  await queue.enqueue(lostRef, 'match', { code: 'ABORTED' }, 1000, 'm1');
  const realProjection = core.projectCurrent;
  core.projectCurrent = async () => {
    lostMark.rows.pending.generation += 1;
    throw new core.MirrorProjectionLimit('bytes');
  };
  try {
    assert.equal((await queue.recoverPending(lostMark.db, lostMark.ref, lostRef, 1001)).action,
      'lease-lost', 'CAS perdido não reporta bloqueio permanente falso');
  } finally {
    core.projectCurrent = realProjection;
  }
  assert.equal(lostMark.rows.pending.permanent, false);

  const superseded = harness(fixture);
  const supersededRef = superseded.ref.collection('mirrorReconcilePending').doc('m1');
  await queue.enqueue(supersededRef, 'match', { code: 'OTHER' }, 1000);
  const oldLease = await queue.acquireLease(superseded.db, supersededRef, 1001, 'old-worker');
  await queue.enqueue(supersededRef, 'match', { code: 'ABORTED' }, 2000);
  assert.equal((await core.projectCurrent(superseded.db, superseded.ref,
    { matchIds: ['m1'], pendingLease: oldLease, nowMs: 2001 })).action, 'lease-lost');
  assert.equal(await queue.markPermanent(superseded.db, oldLease,
    new core.MirrorProjectionLimit('writes'), 2001), false);
  assert.equal(superseded.rows.pending.permanent, false, 'lease antigo não marca pendência nova');
  const newLease = await queue.acquireLease(superseded.db, supersededRef, 2002, 'new-worker');
  assert.equal(newLease.owner, 'new-worker');
  assert.equal(await queue.acquireLease(superseded.db, supersededRef,
    2002 + queue.LEASE_MS, 'expired-worker').then((value) => value.owner), 'expired-worker');

  const recoveredByWorker = harness(fixture);
  const workerRef = recoveredByWorker.ref.collection('mirrorReconcilePending').doc('m1');
  await queue.enqueue(workerRef, 'match', { code: 'ABORTED' }, 1000);
  assert.equal((await queue.recoverPending(recoveredByWorker.db,
    recoveredByWorker.ref, workerRef, 1001)).action, 'projected');
  assert.equal(recoveredByWorker.rows.pending, undefined);
  assert.equal(recoveredByWorker.rows.results.length, 1);
  assert.equal((await queue.recoverPending(recoveredByWorker.db,
    recoveredByWorker.ref, workerRef, 1002)).action, 'not-acquired');
  const namespaced = harness(fixture);
  const namespacedRef = namespaced.ref.collection('mirrorReconcilePending')
    .doc(queue.pendingIdFor('match', 'm1'));
  await queue.enqueue(namespacedRef, 'match', { code: 'ABORTED' }, 1000, 'm1');
  assert.equal((await queue.recoverPending(namespaced.db, namespaced.ref,
    namespacedRef, 1001)).action, 'projected',
  'retentativa usa o matchId guardado, não o ID codificado da pendência');
  assert.equal(namespaced.rows.results[0].matchId, 'm1');
  console.log('mirror-transaction-core: snapshot, ordem, privacidade, replay e exclusão OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
