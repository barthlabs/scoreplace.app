'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createHash } = require('crypto');
const source = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const pendingRouteStart = source.indexOf('exports.resolvePendingDraw = onCall(');
const pendingRouteEnd = source.indexOf('exports.setPendingInitialSchedule', pendingRouteStart);
assert(pendingRouteStart > 0 && pendingRouteEnd > pendingRouteStart, 'rota da prévia encontrada');
const pendingRoute = source.slice(pendingRouteStart, pendingRouteEnd);
const txStart = pendingRoute.indexOf('return db.runTransaction(async tx=>{');
const pendingRead = pendingRoute.indexOf('const t=await _leTorneio(tx,ref,tId)', txStart);
const pendingGuard = pendingRoute.indexOf('_tournamentBilling.assertCanPublishPendingDraw(action, t)', pendingRead);
const pendingWrite = pendingRoute.indexOf('_gravaTorneio(tx,ref,t,antes,{agoraIso})', pendingGuard);
assert(txStart >= 0 && pendingRead > txStart && pendingGuard > pendingRead && pendingWrite > pendingGuard,
  'a porta checa a quitação na transação, após leitura e antes de qualquer gravação');
const start = source.indexOf('async function _leTorneio(tx, ref, tId) {');
const end = source.indexOf('// ⛔ Sandbox é um documento privado', start);
assert(start > 0 && end > start, 'leitor canônico encontrado');
const reader = { get() { throw new Error('use a leitura simulada'); } };
const snapshots = new WeakMap();
const context = {
  _TX_LEITURA:reader, _billingSnapshots:snapshots, createHash,
  _tSplit:{ montarDoBanco:async t => ({ ...t }), partesDe:() => [] },
  _tournamentBilling:require('../js/domain/tournament-billing-core.js'),
  _registrationRoster:{ rosterFromRegistrations:items => items.map(item => ({ ...item })) },
  _competitionAssignments:{ overlay:items => items },
  _appendPlaceholderReservations:items => items,
  Map, JSON
};
const read = vm.runInNewContext(source.slice(start, end) + '\n_leTorneio;', context);
const writeStart = source.indexOf('function _gravaTorneio(tx, ref, tDepois, tAntes, ctx) {');
const writeEnd = source.indexOf('/* Devolve ao estado do banco toda vaga de repescagem', writeStart);
assert(writeStart > 0 && writeEnd > writeStart, 'gravador único encontrado');
Object.assign(context, {
  drawWindow:null, FieldValue:{},
  _preservaRepescagemCarimbada:() => [],
  _preserveCanonicalRosterProjection:() => true,
  _planejaEscrita:() => ({ boundary:{ ok:true }, ops:[] }),
  _wp:{ applyPlan:() => {} }
});
context._tSplit.colecaoDaParte = name => name;
const write = vm.runInNewContext(source.slice(writeStart, writeEnd) + '\n_gravaTorneio;', context);
const ref = { path:'tournaments/test', collection:name => ({ path:'tournaments/test/' + name }) };
const registration = { registrationId:'r1', participantKind:'account', participantUid:'u1', status:'confirmed' };
let parent = { billingContract:{ schema:1 }, participants:[] };
let registrations = [registration];
function tx() {
  return { get:async target => target === ref
    ? { exists:true, data:() => ({ ...parent }) }
    : { docs:registrations.map(item => ({ data:() => ({ ...item }) })) } };
}
(async () => {
  await assert.rejects(read(tx(), ref, 'test'), /contrato ativo sem elenco canônico/);
  reader.get = tx().get;
  await assert.doesNotReject(read(reader, ref, 'test'));
  assert.strictEqual(snapshots.has(reader), false, 'leitura de apresentação não guarda snapshot');
  parent = { ...parent, canonicalRegistrationMigration:{ fingerprint:'native:test', registrationCount:1 } };
  const readTx = tx();
  await read(readTx, ref, 'test');
  const first = snapshots.get(readTx).get(ref.path).fingerprint;
  assert(first && typeof first === 'string');
  registrations = [{ ...registration, participantUid:'u2' }];
  await read(readTx, ref, 'test');
  const second = snapshots.get(readTx).get(ref.path).fingerprint;
  assert.notStrictEqual(second, first, 'segunda leitura prevalece');
  await read(reader, ref, 'test');
  assert.strictEqual(snapshots.has(reader), false);
  parent = { participants:[] };
  await assert.doesNotReject(read(tx(), ref, 'test'), 'legado sem contrato não muda');
  parent = { billingContract:{ schema:1 }, isSandbox:true, participants:[] };
  await assert.doesNotReject(read(tx(), ref, 'test'), 'sandbox não cobra');
  const paidBefore = { billingContract:{ schema:1, quoteId:'q1' },
    billingSettlement:{ state:'paid', quoteId:'q1', fingerprint:second }, status:'closed' };
  const writeTx = tx(), ctx = { agoraIso:'2026-10-29T12:00:00.000Z' };
  assert.throws(() => write(writeTx, ref, { ...paidBefore, matches:[{}] }, null, ctx),
    /gravação sem estado anterior/, 'sem estado anterior não contorna a guarda');
  assert.throws(() => write(writeTx, ref, { ...paidBefore, matches:[{}] }, paidBefore, ctx),
    /conferência dos pagamentos/, 'sem leitura transacional não libera sorteio');
  assert.throws(() => write(writeTx, { path:'tournaments/outro' }, { ...paidBefore, matches:[{}] }, paidBefore, ctx),
    /conferência dos pagamentos/, 'snapshot de outro torneio não libera sorteio');
  parent = { ...paidBefore, canonicalRegistrationMigration:{ fingerprint:'native:test', registrationCount:1 } };
  await read(writeTx, ref, 'test');
  for (const key of ['matches', 'rounds', 'groups', 'phaseRounds', 'phaseGroups']) {
    assert.doesNotThrow(() => write(writeTx, ref, { ...paidBefore, [key]:[{}] }, paidBefore, ctx),
      key + ' com quitação e snapshot fresco passa');
  }
  for (const key of ['drawSelectionDone', 'pendingDraw', 'tournamentStarted']) {
    assert.doesNotThrow(() => write(writeTx, ref, { ...paidBefore, [key]:true }, paidBefore, ctx),
      key + ' com quitação e snapshot fresco passa');
  }
  assert.doesNotThrow(() => write(writeTx, ref, { ...paidBefore, status:'in_progress' }, paidBefore, ctx));
  assert.throws(() => write(writeTx, ref, { ...paidBefore, matches:[{}] },
    { ...paidBefore, status:'open' }, ctx), /Feche as inscrições/,
    'reabrir inscrições depois de pagar não autoriza sorteio');
  registrations = [{ ...registration, participantUid:'u2', status:'pending',
    paymentState:'proof_submitted' }];
  await read(writeTx, ref, 'test');
  assert.throws(() => write(writeTx, ref, { ...paidBefore, matches:[{}] }, paidBefore, ctx),
    /Confira os comprovantes/, 'comprovante enviado não pode ser ignorado pelo sorteio');
  for (const paymentState of ['awaiting_payment', 'rejected']) {
    registrations = [{ ...registration, participantUid:'u2', status:'pending', paymentState }];
    await read(writeTx, ref, 'test');
    assert.throws(() => write(writeTx, ref, { ...paidBefore, matches:[{}] }, paidBefore, ctx),
      /Resolva as inscrições/, paymentState + ' não libera sorteio');
  }
  registrations = [{ ...registration, participantUid:'u2' }];
  await read(writeTx, ref, 'test');
  assert.throws(() => write(writeTx, ref, { ...paidBefore, matches:[{}] },
    { ...paidBefore, billingSettlement:{ ...paidBefore.billingSettlement, fingerprint:'stale' } }, ctx),
    /Taxa do torneio pendente/, 'quitação de elenco anterior não libera sorteio');
  registrations = [{ ...registration, participantUid:'u2' },
    { ...registration, registrationId:'late-r2', participantUid:'late-u3' }];
  parent = { ...paidBefore, canonicalRegistrationMigration:{ fingerprint:'native:test', registrationCount:2 } };
  await read(writeTx, ref, 'test');
  assert.throws(() => write(writeTx, ref, { ...paidBefore, matches:[{}] }, paidBefore, ctx),
    /Taxa do torneio pendente ou elenco alterado/,
    'inscrito tardio após quitação exige cobrança complementar antes de gerar jogos');
  console.log('Guarda transacional da cobrança: leitura, snapshot, nove sinais de sorteio e sandbox OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
