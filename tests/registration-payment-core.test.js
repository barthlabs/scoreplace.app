'use strict';
const assert = require('assert');
const Payment = require('../functions/registration-payment-core');
const Mutations = require('../functions/registration-mutations-core');
const R = require('../functions/registration-core');

const id = 'tour_1790000000000_0123456789abcdef0123456789abcdef';
const category = 'cat-a';
const definitions = [{ id:category, label:'Feminino' }, { id:'cat-b', label:'Masculino' }];
const settings = { source:'scoreplace', pricing:{ mode:'category',
  centsByCategory:{ Feminino:18700, Masculino:0 } }, paymentMethods:{
    organizerPixKey:'pix@example.com', organizerPixName:'Fulano de Tal', organizerPixCity:'Brasilia' } };
assert.strictEqual(Payment.priceForCategory(settings, definitions, category), 18700);
assert.strictEqual(Payment.amountForCategory({ ...settings, passServiceFeeToParticipant:true }, definitions,
  category, { schema:1, currency:'BRL', feeCentsPerPerson:2000 }), 20700);
assert.strictEqual(Payment.amountForCategory({ ...settings, passServiceFeeToParticipant:true }, definitions,
  'cat-b', { schema:1, currency:'BRL', feeCentsPerPerson:2000 }), 2000);
assert.throws(() => Payment.amountForCategory({ ...settings, passServiceFeeToParticipant:true }, definitions,
  category, null), /Tarifa/);
assert.throws(() => Payment.amountForCategory({ ...settings, passServiceFeeToParticipant:true }, definitions,
  category, { schema:1, currency:'BRL', feeCentsPerPerson:100000000 }), /limite/);
assert.strictEqual(Payment.priceForCategory(settings, definitions, 'cat-b'), 0);
assert.strictEqual(Payment.priceForCategory({ source:'scoreplace', pricing:{ mode:'single', cents:1200 } }, [], category), 1200);
assert.throws(() => Payment.priceForCategory(settings, definitions, 'cat-c'), /Categoria sem valor/);
assert.throws(() => Payment.directMethods({ paymentMethods:{} }, 'pre_draw'), /Configure/);
assert.deepStrictEqual(Payment.directMethods(settings, 'pre_draw'), { organizerPixKey:'pix@example.com',
  organizerPixName:'Fulano de Tal', organizerPixCity:'Brasilia', organizerPaymentUrl:'' });
assert.throws(() => Payment.directMethods({ paymentMethods:{ organizerPixKey:'pix@example.com' } }, 'pre_draw'), /Nome e cidade/);
assert.throws(() => Payment.directMethods({ paymentMethods:{ organizerPaymentUrl:'javascript:alert(1)' } }, 'pre_draw'), /HTTPS/);
assert.throws(() => Payment.directMethods({ paymentMethods:{ organizerPaymentUrl:'https://user:pass@example.com/' } }, 'pre_draw'), /credenciais/);
assert.throws(() => Payment.directMethods(settings), /Contexto/);
assert.strictEqual(Payment.directMethods(settings, 'late'), null);
assert.strictEqual(Payment.directMethods(null, 'late'), null);
assert.strictEqual(Payment.paymentContext(null), 'late');
assert.strictEqual(Payment.paymentContext({ status:'finished' }), 'late');
assert.strictEqual(Payment.paymentContext({ _nPartes:{ phaseRounds:1 } }), 'late');
assert.strictEqual(Payment.paymentContext({ status:'draft' }), 'pre_draw');
assert.strictEqual(Payment.paidEnrollmentRequired(settings, false, false), true);
assert.throws(() => Payment.paidEnrollmentRequired(settings, true, true), /Inclusão manual em torneio pago/);
assert.throws(() => Payment.paidEnrollmentRequired(settings, true, false), /Inclusão manual em torneio pago/);
assert.strictEqual(Payment.paidEnrollmentRequired({ source:'scoreplace', pricing:{ mode:'single', cents:0 } }, true, true), false);
assert.strictEqual(Payment.paidEnrollmentRequired({ source:'scoreplace', pricing:{ mode:'single', cents:0 },
  passServiceFeeToParticipant:true }, false, false), true);
assert.strictEqual(Payment.paidEnrollmentRequired({ source:'external' }, true, true), false);
assert.throws(() => Payment.paidEnrollmentRequired({ source:'external' }, false, false), /externas/);

function registration(uid) {
  const key = 'uid:' + uid;
  return { tournamentId:id, registrationId:R.registrationId(key, category),
    participantKind:'account', participantUid:uid, participantKey:key,
    categoryId:category, status:'confirmed', validationState:'approved', fixedPairId:null };
}
const first = Payment.awaitingPayment(registration('u1'), 18700);
const second = Payment.awaitingPayment(registration('u2'), 18700);
const sameOpenCharge = { ...first, registrationId:'destination', reclassifiedFromRegistrationId:first.registrationId };
assert.strictEqual(Payment.createsNewOpenCharge({ updates:[], creates:[sameOpenCharge] }, [first]), false,
  'transferir cobrança aberta do mesmo valor não cria nova cobrança');
assert.strictEqual(Payment.createsNewOpenCharge({ updates:[], creates:[{ ...sameOpenCharge, paymentDueCents:18800 }] }, [first]), true,
  'aumento de valor exige nova cobrança');
assert.strictEqual(Payment.createsNewOpenCharge({ updates:[], creates:[{ ...sameOpenCharge, reclassifiedFromRegistrationId:null }] }, [first]), true,
  'cobrança sem origem auditável é nova');
assert.strictEqual(first.status, 'pending');
assert.strictEqual(first.paymentState, 'awaiting_payment');
assert.strictEqual(first.paymentDueCents, 18700);
assert.strictEqual(Payment.canPair(first), false);
assert.throws(() => Mutations.pair(id, [first, second], [first.registrationId, second.registrationId]), /status elegível/);
assert.throws(() => Payment.awaitingPayment({ ...registration('u1'), status:'waitlisted' }, 18700), /Lista de espera/);
assert.throws(() => Payment.awaitingPayment(registration('u1'), 0), /inválida/);
const proofPath = `tournamentPaymentProofs/${id}/u1/0123456789abcdef`;
assert.throws(() => Payment.submittedProof(first, `tournamentPaymentProofs/${id}/u2/0123456789abcdef`, 'organizer_pix', 'pre_draw'), /pasta privada/);
assert.throws(() => Payment.submittedProof(first, proofPath, undefined, 'pre_draw'), /Selecione o meio/);
assert.throws(() => Payment.submittedProof(first, proofPath, 'organizer_pix'), /Contexto/);
assert.throws(() => Payment.submittedProof(first, proofPath, 'organizer_pix', 'late'), /após o sorteio/);
const proof = Payment.submittedProof(first, proofPath, 'organizer_pix', 'pre_draw');
assert.strictEqual(proof.paymentState, 'proof_submitted');
assert.strictEqual(proof.paymentMethod, 'organizer_pix');
assert.strictEqual(proof.status, 'pending');
assert.throws(() => Payment.confirmDirectPayment(first, 'organizer', 'Pix identificado'), /conferência/);
const paid = Payment.confirmDirectPayment(proof, 'organizer', 'Pix identificado');
assert.strictEqual(paid.status, 'confirmed');
assert.strictEqual(paid.paymentState, 'paid');
assert.strictEqual(Payment.canPair(paid), true);
assert.deepStrictEqual(Payment.FINANCIAL_FIELDS, ['paymentState', 'paymentDueCents', 'paymentCurrency',
  'proofPath', 'paymentMethod', 'paymentReviewedBy', 'paymentReviewEvidence']);
for (const settled of [proof, paid]) {
  assert.throws(() => Payment.prepareWithdrawal(settled), /acerto financeiro assistido/);
}
assert.throws(() => Payment.prepareWithdrawal({ ...first, paymentState:'unknown' }), /Estado financeiro desconhecido/);
assert.throws(() => Payment.prepareWithdrawal({ ...registration('u1'), paymentDueCents:18700 }), /dados financeiros sem estado/);
assert.doesNotThrow(() => Payment.prepareWithdrawal(registration('u1')));
for (const unpaid of [first, Payment.rejectDirectPayment(proof, 'organizer', 'Comprovante recusado')]) {
  const cancelled = Payment.prepareWithdrawal({ ...unpaid, status:'withdrawn' });
  assert(Payment.FINANCIAL_FIELDS.every(key => cancelled[key] === null),
    'retirada cancela somente cobrança não quitada');
  const reentered = Mutations.enroll(id, [cancelled], { uid:'u1' }, [category],
    { status:'confirmed', validationState:'approved' }).updates[0];
  assert.doesNotThrow(() => Payment.assertReactivationSafe(reentered));
  assert.strictEqual(Payment.awaitingPayment(reentered, 18700).paymentState, 'awaiting_payment');
}
for (const pendingOrPaid of [proof, paid]) {
  const withdrawn = Mutations.withdraw(id, [pendingOrPaid], { uid:'u1' }).updates[0];
  const reactivated = Mutations.enroll(id, [withdrawn], { uid:'u1' }, [category],
    { status:'confirmed', validationState:'approved' }).updates[0];
  assert(reactivated, 'a reativação precisa passar por update canônico');
  assert.throws(() => Payment.assertReactivationSafe(reactivated), /acerto financeiro assistido/);
  assert.throws(() => Payment.awaitingPayment(reactivated, 18700), /acerto financeiro assistido/);
}
const withdrawnAwaiting = Mutations.withdraw(id, [first], { uid:'u1' }).updates[0];
const reactivatedAwaiting = Mutations.enroll(id, [withdrawnAwaiting], { uid:'u1' }, [category],
  { status:'confirmed', validationState:'approved' }).updates[0];
assert.doesNotThrow(() => Payment.assertReactivationSafe(reactivatedAwaiting));
assert.strictEqual(Payment.awaitingPayment(reactivatedAwaiting, 18700).paymentState, 'awaiting_payment');
const paidReclassification = Mutations.reclassify(id, [paid], { uid:'u1' }, category, 'cat-b');
const equalSettings = { source:'scoreplace', pricing:{ mode:'single', cents:18700 } };
const pricedDefinitions = [{ id:category, label:'Feminino' }, { id:'cat-b', label:'Masculino' }];
const paidMove = Payment.planReclassificationPayment(paidReclassification, [paid], equalSettings, pricedDefinitions);
assert.strictEqual(paidMove.updates[0].paymentState, null);
assert.strictEqual(paidMove.updates[0].proofPath, null);
assert.strictEqual(paidMove.updates[0].paymentTransferredToRegistrationId, paidMove.creates[0].registrationId);
assert.strictEqual(paidMove.creates[0].paymentState, 'paid');
assert.strictEqual(paidMove.creates[0].proofPath, proofPath);
assert.strictEqual(paidMove.creates[0].paymentMethod, 'organizer_pix');
assert.strictEqual(paidMove.creates[0].reclassifiedFromRegistrationId, paid.registrationId);
assert.deepStrictEqual(Payment.reclassificationNotices(paidMove, [paid], definitions, {}), [],
  'pagamento já conferido transferido pelo mesmo valor não gera cobrança nova');
const foreignCurrency = { ...paid, paymentCurrency:'USD' };
assert.throws(() => Payment.planReclassificationPayment(Mutations.reclassify(id, [foreignCurrency],
  { uid:'u1' }, category, 'cat-b'), [foreignCurrency], equalSettings, pricedDefinitions), /Moeda/);
const secondPaid = Payment.confirmDirectPayment(Payment.submittedProof(second,
  `tournamentPaymentProofs/${id}/u2/0123456789abcdef`, 'organizer_pix', 'pre_draw'), 'organizer', 'Pix identificado');
const pairedPaid = Mutations.pair(id, [paid, secondPaid], [paid.registrationId, secondPaid.registrationId]);
const pairedPaymentMove = Payment.planReclassificationPayment(Mutations.reclassify(id, pairedPaid.updates,
  { uid:'u1' }, category, 'cat-b'), pairedPaid.updates, equalSettings, pricedDefinitions);
assert.strictEqual(pairedPaymentMove.creates.length, 2);
assert(pairedPaymentMove.creates.every(item => item.paymentState === 'paid'
  && item.paymentDueCents === 18700 && item.fixedPairId === pairedPaymentMove.fixedPairId));
assert(pairedPaymentMove.updates.every(item => item.paymentState === null && item.paymentTransferredToRegistrationId));
const differentSettings = { source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ Feminino:18700, Masculino:21000 } } };
assert.throws(() => Payment.planReclassificationPayment(paidReclassification, [paid], differentSettings, pricedDefinitions), /Nenhuma cobrança ou devolução foi feita/);
const pendingMove = Payment.planReclassificationPayment(
  Mutations.reclassify(id, [first], { uid:'u1' }, category, 'cat-b'), [first], differentSettings, pricedDefinitions);
assert.strictEqual(pendingMove.creates[0].paymentDueCents, 21000);
assert.strictEqual(pendingMove.creates[0].paymentState, 'awaiting_payment');
assert.strictEqual(pendingMove.creates[0].status, 'pending');
function applyMove(roster, move) {
  const updates = new Map(move.updates.map(item => [item.registrationId, item]));
  return roster.map(item => updates.get(item.registrationId) || item).concat(move.creates);
}
const pairedCycleRoster = applyMove(pairedPaid.updates, pairedPaymentMove);
const pairedBack = Payment.planReclassificationPayment(
  Mutations.reclassify(id, pairedCycleRoster, { uid:'u1' }, 'cat-b', category),
  pairedCycleRoster, equalSettings, pricedDefinitions);
const pairedReturned = pairedBack.updates.filter(item => item.categoryId === category && item.status !== 'withdrawn');
assert.strictEqual(pairedReturned.length, 2);
assert(pairedReturned.every(item => item.paymentState === 'paid'
  && item.fixedPairId === pairedBack.fixedPairId && item.paymentTransferredToRegistrationId === null));
let cyclingRoster = applyMove([first], pendingMove);
for (const [from, to, expected] of [
  ['cat-b', category, 18700], [category, 'cat-b', 21000]
]) {
  const cycle = Payment.planReclassificationPayment(
    Mutations.reclassify(id, cyclingRoster, { uid:'u1' }, from, to),
    cyclingRoster, differentSettings, pricedDefinitions);
  const active = cycle.creates.concat(cycle.updates).find(item => item.categoryId === to && item.status !== 'withdrawn');
  assert.strictEqual(active.paymentDueCents, expected);
  assert.strictEqual(active.paymentState, 'awaiting_payment');
  assert.strictEqual(active.paymentTransferredToRegistrationId, null);
  assert.strictEqual(active.withdrawnReason, null);
  cyclingRoster = applyMove(cyclingRoster, cycle);
}
assert.strictEqual(cyclingRoster.filter(item => item.status !== 'withdrawn').length, 1);
const pendingNotice = Payment.reclassificationNotices(pendingMove, [first], pricedDefinitions, {});
assert.strictEqual(pendingNotice.length, 1);
assert.deepStrictEqual(pendingNotice[0].recipients, ['u1']);
assert.strictEqual(pendingNotice[0].level, 'important');
assert.strictEqual(pendingNotice[0].type, 'registration_payment_pending');
assert.match(pendingNotice[0].message, /R\$\s*210,00/);
assert.match(pendingNotice[0].message, /substitui a anterior de R\$\s*187,00/);
assert.strictEqual(Payment.reclassificationNotices(pendingMove, [first], pricedDefinitions,
  { notificationsMuted:true }).length, 0);
assert.strictEqual(Payment.reclassificationNotices(pendingMove, [first], pricedDefinitions,
  { organizerOnly:true }).length, 0);
assert.strictEqual(Payment.reclassificationNotices(pendingMove, [first], pricedDefinitions,
  { isSandbox:true }).length, 0);
const freeToPaid = { source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ Feminino:0, Masculino:21000 } } };
const unpaidReclassification = Mutations.reclassify(id, [registration('u1')], { uid:'u1' }, category, 'cat-b');
const freeMove = Payment.planReclassificationPayment(unpaidReclassification, [registration('u1')], freeToPaid, pricedDefinitions);
assert.strictEqual(freeMove.creates[0].paymentState, 'awaiting_payment');
assert.strictEqual(freeMove.creates[0].paymentDueCents, 21000);
const pendingToFree = Payment.planReclassificationPayment(
  Mutations.reclassify(id, [first], { uid:'u1' }, category, 'cat-b'), [first], settings, pricedDefinitions);
assert.strictEqual(pendingToFree.creates[0].paymentState, null);
assert.strictEqual(pendingToFree.creates[0].status, 'confirmed');
const cancelledNotice = Payment.reclassificationNotices(pendingToFree, [first], pricedDefinitions, {});
assert.strictEqual(cancelledNotice.length, 1);
assert.deepStrictEqual(cancelledNotice[0].recipients, ['u1']);
assert.strictEqual(cancelledNotice[0].type, 'category-change-result');
assert.match(cancelledNotice[0].message, /cobrança anterior foi cancelada/);
assert.strictEqual(Payment.reclassificationNotices(pendingToFree, [{ ...first, participantUid:null }],
  pricedDefinitions, {}).length, 0);
const proofMove = Payment.planReclassificationPayment(
  Mutations.reclassify(id, [proof], { uid:'u1' }, category, 'cat-b'), [proof], equalSettings, pricedDefinitions);
assert.strictEqual(proofMove.creates[0].paymentState, 'proof_submitted');
assert.strictEqual(proofMove.creates[0].proofPath, proofPath);
assert.strictEqual(proofMove.updates[0].paymentState, null);
assert.throws(() => Payment.planReclassificationPayment(
  Mutations.reclassify(id, [proof], { uid:'u1' }, category, 'cat-b'), [proof], differentSettings, pricedDefinitions), /Nenhuma cobrança ou devolução foi feita/);
assert.throws(() => Payment.planReclassificationPayment(
  Mutations.reclassify(id, [proof], { uid:'u1' }, category, 'cat-b'), [proof], settings, pricedDefinitions), /Categoria não alterada/);
assert.doesNotThrow(() => Payment.planReclassificationPayment(unpaidReclassification, [registration('u1')], null, pricedDefinitions));
const targetHistory = { ...registration('u1'), registrationId:Mutations.reclassify(id, [registration('u1')], { uid:'u1' }, category, 'cat-b').creates[0].registrationId,
  categoryId:'cat-b', status:'withdrawn', paymentState:'paid', paymentDueCents:18700 };
const historyMove = Mutations.reclassify(id, [paid, targetHistory], { uid:'u1' }, category, 'cat-b');
assert.throws(() => Payment.planReclassificationPayment(historyMove, [paid, targetHistory], equalSettings, pricedDefinitions), /dados financeiros ativos/);
const residualHistory = { ...targetHistory, paymentState:null };
assert.throws(() => Payment.planReclassificationPayment(
  Mutations.reclassify(id, [paid, residualHistory], { uid:'u1' }, category, 'cat-b'),
  [paid, residualHistory], equalSettings, pricedDefinitions), /dados financeiros ativos/);
let paidRoster = applyMove([paid], paidMove);
const paidBack = Payment.planReclassificationPayment(
  Mutations.reclassify(id, paidRoster, { uid:'u1' }, 'cat-b', category),
  paidRoster, equalSettings, pricedDefinitions);
const returnedPaid = paidBack.updates.find(item => item.categoryId === category && item.status !== 'withdrawn');
assert.strictEqual(returnedPaid.paymentState, 'paid');
assert.strictEqual(returnedPaid.proofPath, proofPath);
assert.strictEqual(returnedPaid.paymentTransferredToRegistrationId, null);
assert.strictEqual(returnedPaid.withdrawnReason, null);
assert.strictEqual(returnedPaid.validationState, paid.validationState);
paidRoster = applyMove(paidRoster, paidBack);
assert.throws(() => Payment.planReclassificationPayment(
  Mutations.reclassify(id, paidRoster, { uid:'u1' }, category, 'cat-b'),
  paidRoster, differentSettings, pricedDefinitions), /Nenhuma cobrança ou devolução foi feita/);
const uncategorized = R.UNCATEGORIZED_CATEGORY_ID;
const manual = Mutations.enroll(id, [], { manualParticipantId:'vaga-1' }, [uncategorized],
  { manualDisplayName:'Vaga 1' }).creates[0];
const freeSettings = { source:'scoreplace', pricing:{ mode:'single', cents:0 } };
const manualMove = Payment.planReclassificationPayment(Mutations.reclassify(id, [manual],
  { manualParticipantId:'vaga-1' }, uncategorized, category), [manual], freeSettings, pricedDefinitions);
assert.strictEqual(manualMove.creates[0].categoryId, category);
assert.strictEqual(manualMove.creates[0].paymentState, null);
const legacyAccepted = { ...registration('u1'), validationState:'accepted' };
const freeAcceptedMove = Payment.planReclassificationPayment(Mutations.reclassify(id, [legacyAccepted],
  { uid:'u1' }, category, 'cat-b'), [legacyAccepted], freeSettings, pricedDefinitions);
assert.strictEqual(freeAcceptedMove.creates[0].status, 'confirmed', 'troca gratuita mantém status confirmado');
assert.throws(() => Payment.planReclassificationPayment(Mutations.reclassify(id, [manual],
  { manualParticipantId:'vaga-1' }, uncategorized, category), [manual], equalSettings, pricedDefinitions), /conta identificada/);
const rejected = Payment.rejectDirectPayment(proof, 'organizer', 'Valor não recebido');
const rejectedMove = Payment.planReclassificationPayment(
  Mutations.reclassify(id, [rejected], { uid:'u1' }, category, 'cat-b'), [rejected], differentSettings, pricedDefinitions);
assert.strictEqual(rejectedMove.creates[0].paymentState, 'awaiting_payment');
assert.strictEqual(rejectedMove.creates[0].proofPath, null);
assert.strictEqual(rejectedMove.creates[0].paymentReviewedBy, null);
const rejectedFree = Payment.planReclassificationPayment(
  Mutations.reclassify(id, [rejected], { uid:'u1' }, category, 'cat-b'), [rejected], settings, pricedDefinitions);
assert.strictEqual(Payment.reclassificationNotices(rejectedFree, [rejected], pricedDefinitions, {})[0].type,
  'category-change-result');
assert.strictEqual(rejected.status, 'pending');
assert.strictEqual(rejected.paymentState, 'rejected');
assert.strictEqual(Payment.canPair(rejected), false);
assert.throws(() => Payment.submittedProof(rejected, proofPath, 'organizer_pix', 'pre_draw'), /novo comprovante/);
assert.strictEqual(Payment.submittedProof(rejected, `tournamentPaymentProofs/${id}/u1/abcdef0123456789`, 'organizer_pix', 'pre_draw').paymentState, 'proof_submitted');
const reviewedButUnqualified = Payment.confirmDirectPayment({ ...proof, validationState:'pending_review' }, 'organizer', 'Pix identificado');
assert.strictEqual(reviewedButUnqualified.status, 'pending');
assert.strictEqual(Payment.canPair(reviewedButUnqualified), false);
console.log('Pagamento da inscrição: valor por categoria, pendência, comprovante e dupla protegida OK.');
