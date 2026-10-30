'use strict';
const assert = require('assert');
const fs = require('fs');
const { makeService, grossUp } = require('../functions-autodraw/tournament-billing-service.js');
const BillingCore = require('../js/domain/tournament-billing-core.js');
const BillingTerms = require('../functions/billing-terms-core.js');
const PixBRCode = require('../js/domain/pix-brcode.js');

class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const DELETED = Symbol('deleted');
const FieldValue = { serverTimestamp:() => 'server-time', delete:() => DELETED };
const docs = new Map();
const tId = 'tour_1790000000000_0123456789abcdef0123456789abcdef';
const parent = 'tournaments/' + tId;
docs.set(parent, { creatorUid:'owner', status:'closed', name:'Futuro',
  canonicalRegistrationMigration:{ fingerprint:'native:' + tId, registrationCount:2 },
  billingContract:{ schema:1, currency:'BRL', feeCentsPerPerson:2000, quoteId:'' },
  registrationSettings:{ source:'scoreplace', pricing:{ mode:'single', cents:18700 },
    paymentMethods:{ organizerPixKey:'pix@example.com', organizerPaymentUrl:'' } },
  placeholderReservations:[] });
docs.set(parent + '/registrations/r1', { registrationId:'r1', participantKind:'account', participantUid:'u1', categoryId:'a', status:'confirmed' });
docs.set(parent + '/registrations/r2', { registrationId:'r2', participantKind:'account', participantUid:'u2', categoryId:'a', status:'confirmed' });
docs.set('billingAdminConfig/active', { developerUid:'dev', scoreplacePixKey:'12345678901', cardEnabled:true,
  cardFeeBps:399, cardFixedCents:39, cardFeeVerifiedAt:'2026-10-29',
  organizerTerms:{ version:'2026-10-29-a', payoutWithinDays:7,
    refundPolicy:'Reembolsos e contestações exigem acerto financeiro' } });
const ref = (path, collection = false) => ({ path, id:path.split('/').pop(), collection(name) { return ref(path + '/' + name, true); },
  doc(name) { return ref(path + '/' + name); },
  where(field, op, expected) { assert.strictEqual(path, 'tournaments'); assert.strictEqual(op, '==');
    return { limit(max) { return { get:async () => {
      const found = [...docs.entries()].filter(([key, value]) => key.startsWith('tournaments/')
        && key.split('/').length === 2 && field.split('.').reduce((item, part) => item && item[part], value) === expected)
        .slice(0, max).map(([key, value]) => ({ id:key.split('/').pop(), ref:ref(key), data:() => structuredClone(value) }));
      return { docs:found, size:found.length };
    } }; } }; },
  async get() { return read(this); } });
function read(target) {
  if (target.path.endsWith('/registrations')) {
    return { docs:[...docs.entries()].filter(([key]) => key.startsWith(target.path + '/'))
      .map(([,value]) => ({ data:() => structuredClone(value) })) };
  }
  const value = docs.get(target.path);
  return { exists:value !== undefined, data:() => structuredClone(value), ref:target };
}
const db = { collection(name) { return ref(name, true); }, async runTransaction(callback) {
  const pending = [];
  const tx = { get:async target => read(target), update(target, patch) { pending.push(() => {
    const value = structuredClone(docs.get(target.path));
    for (const [key, replacement] of Object.entries(patch)) {
      if (key.includes('.')) {
        const [top, sub] = key.split('.'); value[top] = value[top] || {};
        if (replacement === DELETED) delete value[top][sub]; else value[top][sub] = replacement;
      } else if (replacement === DELETED) delete value[key]; else value[key] = replacement;
    }
    docs.set(target.path, value);
  }); }, create(target, value) { pending.push(() => {
    if (docs.has(target.path)) throw new Error('already exists'); docs.set(target.path, structuredClone(value));
  }); } };
  const result = await callback(tx); pending.forEach(write => write()); return result;
} };
let checkoutCalls = 0;
const checkoutKeys = [];
const checkoutSessions = new Map();
const checkoutById = new Map();
let retrieveCalls = 0;
let expireCalls = 0;
let expireFailure = false;
let expireRace = false;
let retrieveRace = false;
let recoveryIntent = null;
let recoveryCharge = null;
let stripeRecoveryUnavailable = false;
let clockMs = Date.parse('2026-10-29T12:00:00Z');
const service = makeService({ db, HttpsError, FieldValue, now:() => clockMs, stripe:() => ({
  checkout:{ sessions:{ create:async (_params, options) => {
    assert.strictEqual(_params.payment_intent_data.metadata.kind, 'tournament-fee');
    checkoutCalls++; assert.ok(options.idempotencyKey.startsWith('tournament-fee-'));
    checkoutKeys.push(options.idempotencyKey);
    if (!checkoutSessions.has(options.idempotencyKey)) {
      const ordinal = checkoutSessions.size + 1;
      const session = { id:'cs_test_' + ordinal, url:'https://checkout.stripe.com/test' + ordinal,
        status:'open', payment_status:'unpaid', mode:'payment', currency:'brl',
        amount_total:_params.line_items[0].price_data.unit_amount, metadata:_params.metadata };
      checkoutSessions.set(options.idempotencyKey, session);
      checkoutById.set(session.id, session);
    }
    return checkoutSessions.get(options.idempotencyKey);
  }, retrieve:async id => { retrieveCalls++;
    if (retrieveRace) docs.set(parent, { ...docs.get(parent), billingSettlement:{ state:'paid' } });
    return { ...checkoutById.get(id) };
  },
  expire:async id => { expireCalls++; if (expireFailure) throw new Error('Stripe indisponível');
    const session = checkoutById.get(id);
    if (session.status !== 'open') throw new Error('not expirable');
    session.status = 'expired'; session.url = null;
    if (expireRace) docs.set(parent, { ...docs.get(parent), billingSettlement:{ state:'paid' } });
    return { ...session };
  } } },
  paymentIntents:{ retrieve:async id => {
    if (stripeRecoveryUnavailable) throw new Error('Stripe indisponível');
    return recoveryIntent || { id, metadata:{ kind:'tournament-fee',
      tournamentId:tId, quoteId:docs.get(parent).billingQuote.quoteId } };
  } },
  charges:{ retrieve:async () => recoveryCharge || { payment_intent:'pi_test1' } }
}) });
(async () => {
  const estimateInput = { currency:'BRL', passFinancialFee:false, passServiceFee:true,
    rows:[{ label:'Retinal', registrationCents:18700, participantCount:16 }] };
  await assert.rejects(service.estimate({ data:estimateInput }), error => error.code === 'unauthenticated');
  const newEstimate = await service.estimate({ auth:{ uid:'owner' }, data:estimateInput });
  assert.strictEqual(newEstimate.serviceFeeCents, 2000);
  assert.strictEqual(newEstimate.rows[0].totalCents, 20700);
  assert.strictEqual(newEstimate.totals.serviceFeeCents, 32000);
  assert.strictEqual(newEstimate.totals.organizerCents, 299200);
  const ignoredClientFee = await service.estimate({ auth:{ uid:'owner' },
    data:{ ...estimateInput, serviceFeeCents:0, feeCentsPerPerson:0 } });
  assert.strictEqual(ignoredClientFee.serviceFeeCents, 2000);
  await assert.rejects(service.estimate({ auth:{ uid:'owner' }, data:{ ...estimateInput, currency:'USD' } }),
    error => error.code === 'invalid-argument');
  await assert.rejects(service.estimate({ auth:{ uid:'stranger' }, data:{ ...estimateInput, tournamentId:tId } }),
    error => error.code === 'permission-denied');
  await assert.rejects(service.estimate({ auth:{ uid:'owner' }, data:{ ...estimateInput,
    rows:[{ ...estimateInput.rows[0], serviceFeeCents:0, participantCount:-1 }] } }),
  error => error.code === 'invalid-argument');
  assert.strictEqual(grossUp(4000, 399, 39), 4207);
  await assert.rejects(service.financeAdminStatus({ data:{} }), error => error.code === 'unauthenticated');
  assert.deepStrictEqual(await service.financeAdminStatus({ auth:{ uid:'owner' }, data:{} }), { financeAdmin:false });
  assert.deepStrictEqual(await service.financeAdminStatus({ auth:{ uid:'dev' }, data:{} }), { financeAdmin:true });
  await assert.rejects(service.prepare({ auth:{ uid:'stranger' }, data:{ tournamentId:tId } }), error => error.code === 'permission-denied');
  await assert.rejects(service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /Aceite/.test(error.message));
  const terms = (await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).terms;
  assert(terms.hash && terms.version === '2026-10-29-a');
  assert.strictEqual(terms.registrationPricing.cents, 18700);
  assert.strictEqual(terms.paymentMethods.organizerPixKey, 'pix@example.com');
  assert.match(terms.payoutDeadline, /recebidos diretamente pela organização/);
  await assert.rejects(service.acceptTerms({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    agree:true, termsVersion:terms.version, termsHash:'outro' } }), error => error.code === 'failed-precondition');
  assert.deepStrictEqual(await service.acceptTerms({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    agree:true, termsVersion:terms.version, termsHash:terms.hash } }), { accepted:true, changed:true });
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).termsAccepted, true);
  const beforePricingEdit = docs.get(parent);
  docs.set(parent, { ...beforePricingEdit, registrationSettings:{ ...beforePricingEdit.registrationSettings,
    pricing:{ mode:'single', cents:18800 } } });
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).termsAccepted, false);
  docs.set(parent, beforePricingEdit);
  const beforePassThroughEdit = docs.get(parent);
  docs.set(parent, { ...beforePassThroughEdit, registrationSettings:{ ...beforePassThroughEdit.registrationSettings,
    passServiceFeeToParticipant:true } });
  const changedTerms = (await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }));
  assert.strictEqual(changedTerms.termsAccepted, false);
  assert.strictEqual(changedTerms.terms.passServiceFeeToParticipant, true);
  docs.set(parent, beforePassThroughEdit);
  const beforeMethodEdit = docs.get(parent);
  docs.set(parent, { ...beforeMethodEdit, registrationSettings:{ ...beforeMethodEdit.registrationSettings,
    paymentMethods:{ organizerPixKey:'other@example.com', organizerPaymentUrl:'' } } });
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).termsAccepted, false);
  docs.set(parent, beforeMethodEdit);
  const pendingProofRegistration = docs.get(parent + '/registrations/r2');
  docs.set(parent + '/registrations/r2', { ...pendingProofRegistration,
    status:'pending', paymentState:'proof_submitted' });
  await assert.rejects(service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /comprovantes/.test(error.message));
  docs.set(parent + '/registrations/r2', pendingProofRegistration);
  for (const paymentState of ['awaiting_payment', 'rejected']) {
    docs.set(parent + '/registrations/r2', { ...pendingProofRegistration,
      status:'pending', paymentState });
    await assert.rejects(service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
      error => error.code === 'failed-precondition' && /aguardando pagamento/.test(error.message));
  }
  docs.set(parent + '/registrations/r2', pendingProofRegistration);
  const quote = await service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(quote.quote.participantCount, 2);
  assert.strictEqual(quote.quote.totalCents, 4000);
  assert.strictEqual(quote.settlement.state, 'pending');
  docs.set(parent + '/registrations/r2', { ...pendingProofRegistration,
    status:'pending', paymentState:'proof_submitted' });
  const proofAfterQuote = await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(proofAfterQuote.unreviewedProofCount, 1);
  assert.strictEqual(proofAfterQuote.unsettledPaymentCount, 1);
  assert.strictEqual(proofAfterQuote.stale, true);
  docs.set(parent + '/registrations/r2', pendingProofRegistration);
  const withoutReceiver = await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(withoutReceiver.pixReceiverName, null);
  const receiverConfig = docs.get('billingAdminConfig/active');
  docs.set('billingAdminConfig/active', { ...receiverConfig,
    scoreplacePixName:'Scoreplace', scoreplacePixCity:'Sao Paulo' });
  const withReceiver = await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(withReceiver.pixReceiverName, 'Scoreplace');
  assert.strictEqual(withReceiver.pixReceiverCity, 'Sao Paulo');
  const payload = PixBRCode.build(withReceiver.pixKey, withReceiver.quote.totalCents,
    withReceiver.pixReceiverName, withReceiver.pixReceiverCity);
  assert(payload.includes('540540.00') && payload.includes('5910Scoreplace'));
  docs.set('billingAdminConfig/active', receiverConfig);
  const beforeSandbox = docs.get(parent);
  docs.set(parent, { ...beforeSandbox, isSandbox:true });
  assert.deepStrictEqual(await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    { sandbox:true, financeAdmin:false });
  await assert.rejects(service.confirmPix({ auth:{ uid:'dev' }, data:{ tournamentId:tId,
    evidence:'Extrato bancário conferido' } }), error => error.code === 'failed-precondition');
  assert.strictEqual(docs.get(parent).billingSettlement.state, 'pending');
  docs.set(parent, beforeSandbox);
  const priorConfig = docs.get('billingAdminConfig/active');
  const directTournament = docs.get(parent);
  const directTerms = BillingTerms.termsCatalog({ organizerTerms:{
    version:priorConfig.organizerTerms.version,
    refundPolicy:priorConfig.organizerTerms.refundPolicy
  } }, directTournament);
  assert(directTerms && /Não se aplica/.test(directTerms.payoutDeadline),
    'Pix recebido pelo organizador não exige prazo de repasse pela plataforma');
  assert.strictEqual(directTerms.hash,
    BillingTerms.termsCatalog(priorConfig, directTournament).hash);
  assert.strictEqual(BillingTerms.termsCatalog({ organizerTerms:{
    version:priorConfig.organizerTerms.version,
    refundPolicy:priorConfig.organizerTerms.refundPolicy
  } }, { ...directTournament, registrationSettings:{ ...directTournament.registrationSettings,
    paymentMethods:{ scoreplacePix:true } } }), null,
  'recebimento pela plataforma continua exigindo prazo de repasse válido');
  docs.set('billingAdminConfig/active', { ...priorConfig,
    organizerTerms:{ ...priorConfig.organizerTerms, payoutWithinDays:8 } });
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).termsAccepted, true,
    'prazo de repasse do Scoreplace não se aplica a recebimento direto');
  docs.set('billingAdminConfig/active', { ...priorConfig,
    organizerTerms:{ ...priorConfig.organizerTerms,
      refundPolicy:'Reembolsos e contestações seguem nova política de acerto financeiro' } });
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).termsAccepted, false);
  await assert.rejects(service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /mudaram/.test(error.message));
  docs.set('billingAdminConfig/active', priorConfig);
  await assert.rejects(service.reportPix({ auth:{ uid:'stranger' }, data:{ tournamentId:tId,
    reference:'comprovante 123456' } }), error => error.code === 'permission-denied');
  await assert.rejects(service.reportPix({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    reference:'curta' } }), error => error.code === 'invalid-argument');
  assert.deepStrictEqual(await service.reportPix({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    reference:'comprovante 123456' } }), { reported:true, changed:true });
  assert.strictEqual(docs.get(parent).billingPixReport.reference, undefined,
    'a referência bancária não pode aparecer no documento público do torneio');
  assert.strictEqual(docs.get(parent).billingPixReport.referenceHash, undefined,
    'nem o hash de uma referência curta deve aparecer no documento público');
  assert.strictEqual(docs.get(parent + '/billingPixReports/' + quote.quote.quoteId).reference, 'comprovante 123456');
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).pixReport.state, 'reported');
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).pixReport.reference, 'comprovante 123456');
  await assert.rejects(service.listPixReports({ auth:{ uid:'owner' }, data:{} }),
    error => error.code === 'permission-denied');
  const queue = await service.listPixReports({ auth:{ uid:'dev' }, data:{} });
  assert.strictEqual(queue.reports.length, 1);
  assert.strictEqual(queue.reports[0].reference, 'comprovante 123456');
  assert.strictEqual(queue.reports[0].current, true);
  assert.deepStrictEqual(await service.reportPix({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    reference:'comprovante 123456' } }), { reported:true, changed:false });
  await assert.rejects(service.reportPix({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    reference:'comprovante 999999' } }), error => error.code === 'failed-precondition');
  await assert.rejects(service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /pagamento duplo/.test(error.message));
  const reportedRegistration = docs.get(parent + '/registrations/r2');
  docs.set(parent + '/registrations/r2', { ...reportedRegistration, participantUid:'u3' });
  await assert.rejects(service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /Pix informado/.test(error.message));
  docs.set(parent + '/registrations/r2', reportedRegistration);
  await assert.rejects(service.rejectPixReport({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    evidence:'Não localizado no extrato' } }), error => error.code === 'permission-denied');
  assert.deepStrictEqual(await service.rejectPixReport({ auth:{ uid:'dev' }, data:{ tournamentId:tId,
    evidence:'Não localizado no extrato bancário' } }), { rejected:true });
  assert.strictEqual((await service.listPixReports({ auth:{ uid:'dev' }, data:{} })).reports.length, 0);
  assert.strictEqual((await service.status({ auth:{ uid:'owner' }, data:{ tournamentId:tId } })).pixReport.state, 'rejected');
  const checkout = await service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(checkout.url, 'https://checkout.stripe.com/test1');
  assert.strictEqual(checkoutCalls, 1);
  const firstAttempt = docs.get(parent).billingQuote.cardAttemptId;
  const firstSession = docs.get(parent).billingQuote.cardSessionId;
  assert.strictEqual(firstSession, 'cs_test_1');
  await service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(docs.get(parent).billingQuote.cardAttemptId, firstAttempt);
  assert.strictEqual(checkoutCalls, 1, 'retomar usa retrieve, nunca cria outra sessão');
  assert.strictEqual(retrieveCalls, 1);
  const beforeLostSession = docs.get(parent);
  docs.set(parent, { ...beforeLostSession, billingQuote:{ ...beforeLostSession.billingQuote, cardSessionId:null } });
  const recovered = await service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(recovered.sessionId, firstSession, 'idempotência recupera a sessão ainda não persistida');
  assert.strictEqual(docs.get(parent).billingQuote.cardSessionId, firstSession);
  assert.strictEqual(checkoutKeys[1], checkoutKeys[0]);
  retrieveRace = true;
  await assert.rejects(service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /retomada/.test(error.message));
  retrieveRace = false;
  docs.set(parent, { ...docs.get(parent), billingSettlement:{ state:'pending',
    quoteId:quote.quote.quoteId, fingerprint:quote.quote.fingerprint } });
  clockMs += 25 * 3600000;
  await service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(checkoutCalls, 2, 'depois de 24 horas a sessão persistida não é recriada');
  clockMs -= 25 * 3600000;
  const beforeUntracked = docs.get(parent);
  docs.set(parent, { ...beforeUntracked, billingQuote:{ ...beforeUntracked.billingQuote,
    cardSessionId:null, cardAttemptAt:new Date(clockMs - 25 * 3600000).toISOString() } });
  await assert.rejects(service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /idempotência/.test(error.message));
  assert.strictEqual(checkoutCalls, 2, 'tentativa sem sessão após 24 horas não abre outra');
  docs.set(parent, beforeUntracked);
  docs.set('billingAdminConfig/active', { ...priorConfig, cardFeeBps:499 });
  await assert.rejects(service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /taxas mudaram/.test(error.message));
  assert.strictEqual(docs.get(parent).billingQuote.cardAttemptId, firstAttempt);
  assert.strictEqual(checkoutCalls, 2);
  docs.set('billingAdminConfig/active', priorConfig);
  const originalRegistration = docs.get(parent + '/registrations/r2');
  docs.set(parent + '/registrations/r2', { ...originalRegistration, participantUid:'u3' });
  await assert.rejects(service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /tentativa de cartão/.test(error.message));
  docs.set(parent + '/registrations/r2', originalRegistration);
  await assert.rejects(service.confirmPix({ auth:{ uid:'dev' }, data:{ tournamentId:tId,
    evidence:'Pix enviado em 29/10/2026, transação 123' } }),
    error => error.code === 'failed-precondition' && /tentativa de cartão/.test(error.message));
  await assert.rejects(service.cancelCardAttempt({ auth:{ uid:'stranger' }, data:{ tournamentId:tId } }),
    error => error.code === 'permission-denied');
  const beforeMissingSession = docs.get(parent);
  docs.set(parent, { ...beforeMissingSession, billingQuote:{ ...beforeMissingSession.billingQuote, cardSessionId:null } });
  await assert.rejects(service.cancelCardAttempt({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition');
  docs.set(parent, beforeMissingSession);
  const sessionOne = checkoutById.get(firstSession);
  const originalMetadata = sessionOne.metadata;
  sessionOne.metadata = { ...originalMetadata, quoteId:'outra' };
  await assert.rejects(service.cancelCardAttempt({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /divergente/.test(error.message));
  sessionOne.metadata = originalMetadata;
  expireFailure = true;
  await assert.rejects(service.cancelCardAttempt({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /expirar/.test(error.message));
  expireFailure = false;
  assert.strictEqual(docs.get(parent).billingQuote.cardSessionId, firstSession);
  sessionOne.status = 'complete'; sessionOne.payment_status = 'paid';
  await assert.rejects(service.cancelCardAttempt({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /pagamento iniciado/.test(error.message));
  sessionOne.status = 'open'; sessionOne.payment_status = 'unpaid';
  expireRace = true;
  await assert.rejects(service.cancelCardAttempt({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /cobrança mudou/.test(error.message));
  expireRace = false;
  assert.strictEqual(docs.get(parent).billingQuote.cardSessionId, firstSession);
  docs.set(parent, { ...docs.get(parent), billingSettlement:{ state:'pending',
    quoteId:quote.quote.quoteId, fingerprint:quote.quote.fingerprint } });
  assert.deepStrictEqual(await service.cancelCardAttempt({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    { canceled:true });
  assert.strictEqual(docs.get(parent).billingQuote.cardAttemptId, undefined);
  assert.strictEqual(docs.get(parent).billingQuote.cardCents, undefined);
  assert.strictEqual(docs.get(parent).billingQuote.cardSessionId, undefined);
  assert.strictEqual(docs.get(parent + '/billingCardAttempts/' + firstAttempt).status, 'expired');
  await assert.rejects(service.cancelCardAttempt({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition');
  const canceledEvent = { id:'evt_canceled1', type:'checkout.session.completed', data:{ object:{
    ...sessionOne, status:'complete', payment_status:'paid', payment_intent:'pi_canceled1'
  } } };
  assert.deepStrictEqual(await service.webhookEvent(canceledEvent), { reviewRequired:true });
  assert.strictEqual(docs.get(parent).billingSettlement.state, 'pending');
  const resumed = await service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.strictEqual(resumed.sessionId, 'cs_test_2');
  assert.strictEqual(checkoutCalls, 3);
  const current = docs.get(parent), attemptId = current.billingQuote.cardAttemptId;
  const event = { id:'evt_123', type:'checkout.session.completed', data:{ object:{
    id:'cs_test_2', mode:'payment', payment_intent:'pi_test1', payment_status:'paid', amount_total:current.billingQuote.cardCents,
    currency:'brl', metadata:{ kind:'tournament-fee', tournamentId:tId, quoteId:current.billingQuote.quoteId,
      fingerprint:current.billingQuote.fingerprint, attemptId }
  } } };
  docs.set(parent, { ...current, isSandbox:true });
  assert.deepStrictEqual(await service.webhookEvent({ ...event, id:'evt_sandbox1' }), { reviewRequired:true });
  assert.strictEqual(docs.get(parent).billingSettlement.state, 'pending');
  docs.set(parent, current);
  assert.deepStrictEqual(await service.webhookEvent(event), { paid:true });
  assert.strictEqual(docs.get(parent).billingSettlement.state, 'paid');
  assert.deepStrictEqual(await service.webhookEvent(event), { duplicate:true });
  await assert.rejects(service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition');
  const refund = { id:'evt_refund1', type:'charge.refunded', data:{ object:{
    id:'ch_test1', payment_intent:'pi_test1', amount:current.billingQuote.cardCents,
    amount_refunded:100, currency:'brl' } } };
  assert.deepStrictEqual(await service.webhookEvent(refund), { reversed:true, reviewRequired:false });
  assert.strictEqual(docs.get(parent).billingSettlement.state, 'reversed');
  assert.strictEqual(docs.get('billingReversals/pi_test1').amountRefundedCents, 100);
  assert.deepStrictEqual(await service.webhookEvent(refund), { duplicate:true });
  await assert.rejects(service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /estornado/.test(error.message));
  await assert.rejects(service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition' && /estornado/.test(error.message));
  await assert.rejects(service.confirmPix({ auth:{ uid:'dev' }, data:{ tournamentId:tId,
    evidence:'Pix enviado em 29/10/2026, transação 123' } }),
    error => error.code === 'failed-precondition' && /estorno/.test(error.message));
  const originalQuote = docs.get(parent).billingQuote;
  const originalReceiptPath = parent + '/billingReceipts/' + originalQuote.quoteId;
  const originalReceipt = structuredClone(docs.get(originalReceiptPath));
  const recoveryInput = { tournamentId:tId, reference:'E2E-REGULARIZACAO-001',
    evidence:'Crédito de Pix conferido no extrato Scoreplace em 30/10',
    receivedCents:originalQuote.totalCents };
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'owner' }, data:recoveryInput }),
    error => error.code === 'permission-denied');
  recoveryIntent = { id:'pi_test1', latest_charge:'ch_test1', metadata:{ kind:'tournament-fee',
    tournamentId:tId, quoteId:originalQuote.quoteId } };
  recoveryCharge = { id:'ch_test1', payment_intent:'pi_test1', currency:'brl',
    amount:originalReceipt.chargedCents, amount_refunded:100, refunded:false, disputed:false };
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    error => error.code === 'failed-precondition');
  const fullRefund = { ...refund, id:'evt_refundfull', data:{ object:{ ...refund.data.object,
    amount_refunded:originalReceipt.chargedCents } } };
  assert.deepStrictEqual(await service.webhookEvent(fullRefund), { reversed:false, reviewRequired:true });
  assert.strictEqual(docs.get('billingReversals/pi_test1').amountRefundedCents, originalReceipt.chargedCents);
  recoveryCharge.refunded = true;
  recoveryCharge.amount_refunded = originalReceipt.chargedCents;
  recoveryCharge.disputed = true;
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    error => error.code === 'failed-precondition');
  recoveryCharge.disputed = false;
  stripeRecoveryUnavailable = true;
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    error => error.code === 'unavailable');
  stripeRecoveryUnavailable = false;
  recoveryIntent.metadata.tournamentId = 'tour_1790000000000_ffffffffffffffffffffffffffffffff';
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    error => error.code === 'failed-precondition');
  recoveryIntent.metadata.tournamentId = tId;
  recoveryCharge.amount--;
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    error => error.code === 'failed-precondition');
  recoveryCharge.amount++;
  const reversalMarker = structuredClone(docs.get('billingReversals/pi_test1'));
  docs.set('billingReversals/pi_test1', { ...reversalMarker, tournamentId:'tour_1790000000000_ffffffffffffffffffffffffffffffff' });
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    error => error.code === 'failed-precondition');
  docs.set('billingReversals/pi_test1', reversalMarker);
  docs.set(parent + '/registrations/r2', { ...docs.get(parent + '/registrations/r2'), paymentState:'proof_submitted' });
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    error => error.code === 'failed-precondition');
  docs.set(parent + '/registrations/r2', { ...docs.get(parent + '/registrations/r2'), paymentState:undefined });
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:{
    ...recoveryInput, receivedCents:recoveryInput.receivedCents - 1 } }),
    error => error.code === 'failed-precondition');
  docs.set(parent + '/registrations/r2', { ...docs.get(parent + '/registrations/r2'), participantUid:'u4' });
  docs.set(parent, { ...docs.get(parent), status:'in_progress', matches:[{ id:'j1' }] });
  assert.deepStrictEqual(await service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    { paid:true, changed:true });
  assert.notStrictEqual(docs.get(parent).billingQuote.fingerprint, originalQuote.fingerprint);
  assert.doesNotThrow(() => BillingCore.assertCanPublishPendingDraw('publish', docs.get(parent)));
  assert.strictEqual(docs.get(parent).billingSettlement.method, 'pix_manual_recovery');
  assert.strictEqual(docs.get(parent).billingSettlement.recoveryOf, originalQuote.quoteId);
  assert.strictEqual(docs.get(parent).billingContract.quoteId, docs.get(parent).billingQuote.quoteId);
  assert.deepStrictEqual(docs.get(originalReceiptPath), originalReceipt);
  assert.strictEqual(docs.get(parent + '/billingReceipts/' + docs.get(parent).billingQuote.quoteId).reference,
    recoveryInput.reference);
  assert.deepStrictEqual(await service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:recoveryInput }),
    { paid:true, changed:false });
  await assert.rejects(service.reconcileReversedTournamentFee({ auth:{ uid:'dev' }, data:{
    ...recoveryInput, reference:'E2E-REGULARIZACAO-002' } }), error => error.code === 'failed-precondition');
  assert.strictEqual(docs.get(parent).billingSettlement.evidence, undefined);
  const dispute = { id:'evt_dispute2', type:'charge.dispute.created', data:{ object:{
    id:'dp_test2', charge:'ch_test2', payment_intent:'pi_test2' } } };
  assert.deepStrictEqual(await service.webhookEvent(dispute), { reversed:false, reviewRequired:true });
  const lateSuccess = { id:'evt_late2', type:'checkout.session.completed', data:{ object:{
    ...event.data.object, id:'cs_test_2', payment_intent:'pi_test2' } } };
  assert.deepStrictEqual(await service.webhookEvent(lateSuccess), { reviewRequired:true });
  assert.strictEqual(docs.get(parent).billingSettlement.state, 'paid');
  const feeUi = fs.readFileSync(require.resolve('../js/views/tournament-billing.js'), 'utf8');
  assert(feeUi.includes('if (reversed) return;'), 'a tela não oferece novo pagamento após estorno');
  assert(feeUi.includes('Pagamento estornado ou contestado.'), 'a tela explica o bloqueio financeiro');
  assert(feeUi.includes('cancelTournamentFeeCardAttempt'), 'a tela oferece cancelamento da tentativa registrada');
  assert(feeUi.includes('ScoreplacePixBRCode.build(data.pixKey, quote.totalCents'),
    'o Pix copia e cola da taxa deve usar o valor da cobrança do servidor');
  await assert.rejects(service.confirmPix({ auth:{ uid:'owner' }, data:{ tournamentId:tId, evidence:'comprovante123' } }),
    error => error.code === 'permission-denied');
  // Simula apenas no fixture a resolução assistida da tentativa anterior.
  docs.set(parent, { ...docs.get(parent), status:'closed', matches:[],
    billingSettlement:{ state:'pending' },
    billingQuote:{ ...originalQuote, cardAttemptId:null, cardCents:null },
    billingContract:{ ...docs.get(parent).billingContract, quoteId:originalQuote.quoteId } });
  docs.set(parent + '/registrations/r2', { ...docs.get(parent + '/registrations/r2'), participantUid:'u3' });
  await assert.rejects(service.checkout({ auth:{ uid:'owner' }, data:{ tournamentId:tId } }),
    error => error.code === 'failed-precondition');
  const revised = await service.prepare({ auth:{ uid:'owner' }, data:{ tournamentId:tId } });
  assert.notStrictEqual(revised.quote.fingerprint, quote.quote.fingerprint);
  assert.strictEqual(revised.settlement.state, 'pending');
  await service.reportPix({ auth:{ uid:'owner' }, data:{ tournamentId:tId,
    reference:'transferência revisada 789' } });
  assert.strictEqual((await service.listPixReports({ auth:{ uid:'dev' }, data:{} })).reports.length, 1);
  assert.deepStrictEqual(await service.confirmPix({ auth:{ uid:'dev' }, data:{ tournamentId:tId, evidence:'Pix enviado em 29/10/2026, transação 123' } }),
    { paid:true, changed:true });
  assert.strictEqual((await service.listPixReports({ auth:{ uid:'dev' }, data:{} })).reports.length, 0);
  assert.strictEqual(docs.get(parent).billingPixReport.state, 'confirmed');
  assert.strictEqual(docs.get(parent).billingSettlement.method, 'pix_manual');
  assert.strictEqual(docs.get(parent).billingSettlement.evidence, undefined);
  assert.match(docs.get(parent + '/billingReceipts/' + revised.quote.quoteId).evidence, /transação 123/);
  console.log('Cobrança: proposta, cartão, webhook idempotente, elenco alterado e Pix autorizado OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
