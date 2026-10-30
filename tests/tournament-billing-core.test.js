'use strict';
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const core = require('../js/domain/tournament-billing-core.js');
const auto = require('../functions-autodraw/vendor/tournament-billing-core.js');
const main = require('../functions/vendor/tournament-billing-core.js');

const person = (registrationId, uid, extra = {}) => ({ registrationId,
  participantKind:'account', participantUid:uid, status:'confirmed', categoryId:'cat-a', ...extra });
const manual = (registrationId, manualParticipantId, extra = {}) => ({ registrationId,
  participantKind:'manual', manualParticipantId, status:'confirmed', categoryId:'cat-a', ...extra });
const registrations = [person('a', 'u1'), person('b', 'u2', { fixedPairId:'pair-1' }),
  person('c', 'u3', { fixedPairId:'pair-1' }), person('d', 'u1', { categoryId:'cat-b' }),
  manual('e', 'p1', { isPlaceholder:true }), manual('f', 'p2'),
  person('g', 'u4', { status:'withdrawn' }), person('h', 'u5', { status:'waitlisted' })];
const snap = core.rosterSnapshot(registrations, []);
assert.strictEqual(snap.participantCount, 4, 'duplas e duas categorias contam pessoas únicas');
assert.strictEqual(snap.unreviewedProofCount, 0);
assert.strictEqual(snap.unsettledPaymentCount, 0);
const underReview = core.rosterSnapshot([...registrations, person('i', 'u6',
  { status:'pending', paymentState:'proof_submitted' })], []);
assert.strictEqual(underReview.unreviewedProofCount, 1);
assert.strictEqual(underReview.unsettledPaymentCount, 1);
for (const paymentState of ['awaiting_payment', 'rejected']) {
  const pending = core.rosterSnapshot([...registrations, person('i', 'u6',
    { status:'pending', paymentState })], []);
  assert.strictEqual(pending.unsettledPaymentCount, 1);
}
assert.notStrictEqual(underReview.canonicalJson, core.rosterSnapshot([...registrations,
  person('i', 'u6', { status:'pending', paymentState:'awaiting_payment' })], []).canonicalJson,
  'um comprovante enviado invalida a proposta anterior');
assert.strictEqual(core.rosterSnapshot(registrations.slice().reverse(), []).canonicalJson, snap.canonicalJson);
assert.strictEqual(core.rosterSnapshot(registrations.map(item => ({ ...item, categoryId:'outra', fixedPairId:'nova-dupla' })), []).canonicalJson,
  snap.canonicalJson, 'mudar categoria ou dupla não altera a dívida por pessoa');
assert.strictEqual(core.quote(snap, 2000).totalCents, 8000);
assert.deepStrictEqual(core.quote(snap, 2000, 3000), {
  participantCount:4, feeCentsPerPerson:2000, subtotalCents:8000, discountCents:3000, totalCents:5000
});
assert.strictEqual(core.quote(snap, 2000, 10000).totalCents, 0);
assert.strictEqual(core.rosterSnapshot([manual('x', 'reserve')], [{ manualParticipantId:'reserve' }]).participantCount, 0);
assert.throws(() => core.rosterSnapshot([person('x', 'u1'), person('x', 'u2')], []));
assert.throws(() => core.rosterSnapshot([person('x', '')], []));
assert.throws(() => core.quote(snap, 1.5));

const fingerprint = crypto.createHash('sha256').update(snap.canonicalJson).digest('hex');
const paid = { billingContract:{ schema:1, quoteId:'q1' }, billingSettlement:{ state:'paid', quoteId:'q1', fingerprint }, matches:[] };
const changed = { ...paid, matches:[{ id:'m1' }] };
assert.strictEqual(core.structuralGeneration(paid, changed), true);
assert.doesNotThrow(() => core.assertCanDraw(paid, changed, fingerprint, 0, 0));
assert.throws(() => core.assertCanDraw({ ...paid, status:'open' }, changed, fingerprint, 0),
  /Feche as inscrições/, 'pagamento antigo não autoriza sorteio com inscrições reabertas');
assert.throws(() => core.assertCanDraw(paid, { ...changed, status:'open' }, fingerprint, 0),
  /Feche as inscrições/, 'a própria gravação não pode reabrir inscrições junto do sorteio');
assert.throws(() => core.assertCanDraw(paid, changed, fingerprint), /conferência dos pagamentos/);
assert.throws(() => core.assertCanDraw(paid, changed, fingerprint, 1), /Confira os comprovantes/);
assert.throws(() => core.assertCanDraw(paid, changed, fingerprint, 0), /situação dos pagamentos/);
assert.throws(() => core.assertCanDraw(paid, changed, fingerprint, 0, 1), /Resolva as inscrições/);
assert.throws(() => core.assertCanDraw(paid, changed, 'stale', 0, 0), /Taxa do torneio pendente/);
assert.throws(() => core.assertCanDraw(paid, changed, null, 0, 0), /Taxa do torneio pendente/);
assert.doesNotThrow(() => core.assertCanDraw({}, { matches:[{ id:'m1' }] }, null), 'torneio legado continua livre');
assert.doesNotThrow(() => core.assertCanDraw({ ...paid, isSandbox:true }, changed, null), 'sandbox não cobra');
assert.doesNotThrow(() => core.assertCanDraw(paid, { ...paid, matches:[] }, null), 'placar não exige nova cobrança');
for (const key of ['matches', 'rounds', 'groups', 'phaseRounds', 'phaseGroups']) {
  const generated = { ...paid, [key]:[{ id:'new' }] };
  assert.strictEqual(core.structuralGeneration(paid, generated), true, key + ' é estrutural');
  assert.throws(() => core.assertCanDraw(paid, generated, null, 0, 0), /Taxa do torneio pendente/, key + ' exige snapshot');
  assert.doesNotThrow(() => core.assertCanDraw(paid, generated, fingerprint, 0, 0), key + ' aceita quitação fresca');
}
for (const key of ['drawSelectionDone', 'pendingDraw', 'tournamentStarted']) {
  const generated = { ...paid, [key]:true };
  assert.strictEqual(core.structuralGeneration(paid, generated), true, key + ' é estrutural');
  assert.throws(() => core.assertCanDraw(paid, generated, null, 0, 0), /Taxa do torneio pendente/, key + ' exige snapshot');
  assert.doesNotThrow(() => core.assertCanDraw(paid, generated, fingerprint, 0, 0), key + ' aceita quitação fresca');
}
const started = { ...paid, status:'in_progress' };
assert.strictEqual(core.structuralGeneration(paid, started), true, 'início é estrutural');
assert.throws(() => core.assertCanDraw(paid, started, null, 0, 0), /Taxa do torneio pendente/);
assert.doesNotThrow(() => core.assertCanDraw(paid, started, fingerprint, 0, 0));

const laterRoundPreview = { ...paid, status:'in_progress', rounds:[{ id:'r1' }],
  pendingDraw:{ kind:'round', rounds:[{ id:'r1-updated' }] } };
assert.strictEqual(core.structuralGeneration(laterRoundPreview,
  { ...laterRoundPreview, rounds:[{ id:'r1-updated' }], pendingDraw:null }), false,
  'publicação posterior pode conservar a quantidade de rodadas');
assert.doesNotThrow(() => core.assertCanPublishPendingDraw('publish', laterRoundPreview));
assert.throws(() => core.assertCanPublishPendingDraw('publish', {
  ...laterRoundPreview, billingSettlement:{ ...paid.billingSettlement, state:'reversed' }
}), /quitação da taxa/, 'estorno entre prévia e publicação impede publicar');
assert.throws(() => core.assertCanPublishPendingDraw('publish', {
  ...laterRoundPreview, billingSettlement:{ ...paid.billingSettlement, state:'pending' }
}), /quitação da taxa/);
assert.throws(() => core.assertCanPublishPendingDraw('publish', {
  ...laterRoundPreview, billingSettlement:null
}), /quitação da taxa/, 'contrato sem quitação falha fechado');
assert.throws(() => core.assertCanPublishPendingDraw('publish', {
  ...laterRoundPreview, billingContract:{ schema:1, quoteId:'q2' }
}), /quitação da taxa/, 'quitação de outra proposta não libera publicação');
assert.doesNotThrow(() => core.assertCanPublishPendingDraw('annul', {
  ...laterRoundPreview, billingSettlement:{ state:'reversed' }
}), 'anulação continua possível após estorno');
assert.doesNotThrow(() => core.assertCanPublishPendingDraw('publish', {
  ...laterRoundPreview, registrations:[{ paymentState:'proof_submitted' }]
}), 'esta guarda não reinterpreta inscrição tardia como quitação inválida');
assert.doesNotThrow(() => core.assertCanPublishPendingDraw('publish',
  { ...laterRoundPreview, billingContract:undefined, billingSettlement:undefined }),
  'torneio anterior à cobrança mantém publicação');
assert.doesNotThrow(() => core.assertCanPublishPendingDraw('publish',
  { ...laterRoundPreview, isSandbox:true, billingSettlement:undefined }),
  'sandbox mantém publicação simulada');

for (const file of ['functions-autodraw/vendor/tournament-billing-core.js', 'functions/vendor/tournament-billing-core.js']) {
  assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'),
    fs.readFileSync(path.join(__dirname, '..', 'js/domain/tournament-billing-core.js'), 'utf8'));
}
assert.deepStrictEqual(auto.rosterSnapshot(registrations, []), snap);
assert.deepStrictEqual(main.rosterSnapshot(registrations, []), snap);
console.log('Cobrança de torneio: contagem, descontos, fingerprint e guarda canônicos OK.');
