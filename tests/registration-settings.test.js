'use strict';
const assert = require('assert');
const { validate, isPaidRegistration, requiresClosedEnrollment, paidDirectReady } = require('../functions-autodraw/registration-settings-core');
const enroll = require('../functions/enroll-core');
const fs = require('fs');
const vm = require('vm');

assert.deepStrictEqual(validate({ source:'scoreplace', pricing:{ mode:'single', cents:0 } }, []),
  { source:'scoreplace', pricing:{ mode:'single', cents:0 } });
assert.deepStrictEqual(validate({ source:'scoreplace', pricing:{ mode:'single', cents:0 },
  passServiceFeeToParticipant:true }, []),
{ source:'scoreplace', pricing:{ mode:'single', cents:0 }, passServiceFeeToParticipant:true });
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'single', cents:0 },
  passServiceFeeToParticipant:'true' }, []), /repasse/);
assert.deepStrictEqual(validate({ source:'external', pricing:null }, []),
  { source:'external', pricing:null });
assert.deepStrictEqual(validate({ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ 'Fem Light':0, 'Masc Power':5000 } } }, ['Fem Light', 'Masc Power']).pricing.centsByCategory,
  { 'Fem Light':0, 'Masc Power':5000 });
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ 'Fem Light':5000 } } }, ['Fem Light', 'Masc Power']), /cada categoria/);
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'single', cents:-1 } }, []), /valor/i);
assert.deepStrictEqual(validate({ source:'scoreplace', pricing:{ mode:'single', cents:18700 }, paymentMethods:{
  organizerPixKey:' contato@example.com ', organizerPixName:'Fulano de Tal', organizerPixCity:'Brasília',
  organizerPaymentUrl:'https://pagamentos.example/checkout' } }, []).paymentMethods,
{ organizerPixKey:'contato@example.com', organizerPixName:'Fulano de Tal', organizerPixCity:'Brasilia',
  organizerPaymentUrl:'https://pagamentos.example/checkout' });
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'single', cents:18700 }, paymentMethods:{
  organizerPixKey:'contato@example.com' } }, []), /nome e cidade/i);
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'single', cents:18700 }, paymentMethods:{
  organizerPaymentUrl:'javascript:alert(1)' } }, []), /HTTPS/);
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'single', cents:18700 }, paymentMethods:{
  organizerPaymentUrl:'https://login:senha@pagamentos.example/' } }, []), /HTTPS/);
assert.strictEqual(requiresClosedEnrollment(validate({ source:'scoreplace', pricing:{ mode:'single', cents:18700 }, paymentMethods:{
  organizerPixKey:'contato@example.com', organizerPixName:'Fulano de Tal', organizerPixCity:'Brasilia' } }, [])), true, 'a tela não ativa cobrança antes da conciliação');
assert.strictEqual(requiresClosedEnrollment({ source:'external', pricing:null }), true);
assert.strictEqual(requiresClosedEnrollment({ source:'scoreplace', pricing:{ mode:'single', cents:100 } }), true);
assert.strictEqual(requiresClosedEnrollment({ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ A:0, B:100 } } }), true);
assert.strictEqual(requiresClosedEnrollment({ source:'scoreplace', pricing:{ mode:'single', cents:0 } }), false);
assert.strictEqual(requiresClosedEnrollment({ source:'scoreplace', pricing:{ mode:'single', cents:0 },
  passServiceFeeToParticipant:true }), true);
assert.strictEqual(isPaidRegistration({ pricing:{ mode:'single', cents:100 } }), true,
  'preço pago não perde o gate se a origem estiver incompleta');
assert.strictEqual(isPaidRegistration({ pricing:{ mode:'single', cents:0 } }), false);
assert.strictEqual(isPaidRegistration({ pricing:{ mode:'single', cents:0 }, passServiceFeeToParticipant:true }), true);

assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'scoreplace', pricing:{ mode:'single', cents:0 } } }).open, true);
assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'external', pricing:null } }).open, false);
assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'scoreplace', pricing:{ mode:'single', cents:2500 } } }).open, false);
assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ A:0, B:100 } } } }).open, false);
const paidReady = { status:'open', registrationSettings:{ source:'scoreplace', pricing:{ mode:'single', cents:18700 },
  paymentMethods:{ organizerPixKey:'pix@example.com', organizerPixName:'Fulano de Tal', organizerPixCity:'Brasilia' } }, billingContract:{ schema:1 },
  canonicalRegistrationMigration:{ fingerprint:'native:tour_1' }, billingTermsAcceptance:{ hash:'accepted' } };
assert.strictEqual(paidDirectReady(paidReady), true);
assert.strictEqual(enroll.enrollmentOpen(paidReady).open, true);
assert.strictEqual(paidDirectReady({ ...paidReady, billingTermsAcceptance:null }), false);
assert.strictEqual(paidDirectReady({ ...paidReady, registrationSettings:{ ...paidReady.registrationSettings,
  paymentMethods:{ organizerPixKey:'pix@example.com' } } }), false);
assert.strictEqual(enroll.enrollmentOpen({ ...paidReady, billingTermsAcceptance:null }).open, false);

const server = fs.readFileSync('functions/index.js', 'utf8');
assert(server.includes('_registrationPayment.paidEnrollmentRequired(registration, organizerManualRequested,'),
  'porta de inscrição valida origem e inclusão manual paga no servidor');
assert(server.includes('_registrationPayment.awaitingPayment(item, amount)'), 'inscrição paga não vira vaga confirmada antes da conferência');
const creator = fs.readFileSync('functions-autodraw/tournament-create.js', 'utf8');
assert(creator.includes("registration.source === 'external' || requiresCheckout"), 'evento externo ou pago nasce com inscrições fechadas');
const drawServer = fs.readFileSync('functions-autodraw/index.js', 'utf8');
assert(drawServer.includes("&& !require('./registration-settings-core').paidDirectReady(tDepois)"),
  'sem recebimento direto e aceite, toda gravação canônica mantém inscrição paga fechada');
assert(drawServer.includes("t.status === 'closed' && !require('./registration-settings-core').requiresClosedEnrollment(t.registrationSettings) && Number.isFinite(openingAt)"),
  'abertura futura não promove inscrição externa ou paga');
assert(drawServer.includes('if (billingSettingsChanged && t.billingContract && t.billingContract.schema === 1 && !t.isSandbox)'),
  'alterar preço ou meio de recebimento invalida o aceite financeiro anterior');
assert(drawServer.includes(".where('paymentDueCents', '>', 0).limit(1)"),
  'alterar preço ou meio de recebimento é recusado após a primeira cobrança');
const editor = fs.readFileSync('js/views/create-tournament.js', 'utf8');
assert(editor.includes('id="tourn-registration-source" value="scoreplace"'), 'origem padrão é pelo app');
assert(editor.includes("input.placeholder = '0,00'"), 'valor padrão é gratuito');
assert(editor.includes('if (!editId || window._registrationSettingsTouched'), 'torneios antigos não são convertidos ao editar outro campo');
assert(editor.includes('id="tourn-organizer-pix-name"') && editor.includes('id="tourn-organizer-pix-city"'),
  'Pix próprio exige nome e cidade reais do titular');
assert(editor.includes('class="registration-financial-terms-entry"')
  && editor.includes('window._openTournamentFeeTermsFromEditor = function()')
  && editor.includes('window._openTournamentFeeModal(tournamentId)'),
  'edição oferece condições financeiras do contrato nas inscrições internas ou externas');
const detail = fs.readFileSync('js/views/tournaments.js', 'utf8');
assert(detail.includes('💳 Pagamento da inscrição') && detail.includes('t.memberUids.includes'),
  'pagamento permanece acessível na ficha após fechar inscrições, inclusive com elenco leve');
assert(detail.includes('_registration.passServiceFeeToParticipant === true'),
  'organizador vê a fila de comprovantes quando só a taxa de serviço torna a inscrição paga');
const enrollmentClient = fs.readFileSync('js/views/tournaments-enrollment.js', 'utf8');
const helperStart = enrollmentClient.indexOf('window._tournamentRequiresPayment = function (t) {');
assert(helperStart >= 0, 'classificação de inscrição paga existe no cliente');
const helperEnd = enrollmentClient.indexOf('\n};', helperStart);
const paidWindow = {};
vm.runInNewContext(enrollmentClient.slice(helperStart, helperEnd + 3), { window:paidWindow });
const paidCases = [
  [{ source:'scoreplace', pricing:{ mode:'single', cents:100 } }, true],
  [{ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ A:0, B:100 } } }, true],
  [{ source:'scoreplace', pricing:{ mode:'single', cents:0 }, passServiceFeeToParticipant:true }, true],
  [{ source:'scoreplace', pricing:{ mode:'single', cents:0 } }, false],
  [{ source:'external', pricing:{ mode:'single', cents:100 } }, false]
];
for (const [settings, expected] of paidCases) {
  assert.strictEqual(paidWindow._tournamentRequiresPayment({ registrationSettings:settings }), expected);
  if (settings.source === 'scoreplace') {
    assert.strictEqual(require('../functions/registration-payment-core').paidEnrollmentRequired(settings, false, false), expected,
      'servidor e cliente concordam sobre inscrição paga');
  }
}
assert(enrollmentClient.includes('if (window._paidManualEnrollmentBlocked(t)) return;'),
  'overlay e core recusam inclusão manual paga antes da chamada');
assert(enrollmentClient.includes('if (window._tournamentRequiresPayment(t)\n'),
  'já inscrito com pagamento abre o painel sem depender da presença de paymentMethods');
const readerStart = enrollmentClient.indexOf('window._applyEnrollResult = function (t, tId, res, ctx) {');
const readerEnd = enrollmentClient.indexOf('\n};', readerStart);
assert(readerStart >= 0 && readerEnd > readerStart, 'leitor canônico do retorno localizado');
const paymentViews = [];
const notices = [];
const resultWindow = {
  _tournamentRequiresPayment:paidWindow._tournamentRequiresPayment,
  _openTournamentRegistrationPayment:tId => paymentViews.push(tId)
};
const resultContext = { window:resultWindow, showNotification:(...args) => notices.push(args), _t:key => key };
vm.runInNewContext(enrollmentClient.slice(readerStart, readerEnd + 3), resultContext);
const paidTournament = { registrationSettings:{ source:'scoreplace', pricing:{ mode:'single', cents:100 } }, participants:[{ uid:'other' }] };
assert.strictEqual(resultWindow._applyEnrollResult(paidTournament, 'tour_test', { alreadyEnrolled:true },
  { self:true, optimistic:{ uid:'new' }, refresh:false }), 'already');
assert.deepStrictEqual(paymentViews, ['tour_test'], 'já inscrito pago abre painel mesmo sem paymentMethods');
assert.strictEqual(paidTournament.participants.length, 1, 'rollback por filter não remove outro participante');
const pendingTournament = { ...paidTournament, participants:[{ uid:'other' }] };
assert.strictEqual(resultWindow._applyEnrollResult(pendingTournament, 'tour_test',
  { paymentDue:[{ amountCents:100 }], participants:[{ uid:'other' }] },
  { self:true, successToast:true, refresh:false }), 'enrolled');
assert(notices.some(([title]) => title === 'Inscrição pendente'),
  'inscrição paga não recebe mensagem de vaga confirmada');
const orgTools = fs.readFileSync('js/views/tournaments-org-tools.js', 'utf8');
assert(orgTools.includes('paidEnrollment ? paidNotice : nameBox')
  && orgTools.includes('window._paidManualEnrollmentBlocked(tournament)'),
  'painel e página de organização não oferecem inclusão manual paga');
assert(fs.readFileSync('js/views/tournament-registration-payment.js', 'utf8').includes('if (!options.length)'),
  'painel não oferece envio de comprovante sem meio de pagamento');
assert(fs.readFileSync('js/firebase-db.js', 'utf8').includes('async sendFriendRequest(fromUid, toUid, fromData)'),
  'reconfirmação de amizade tem método de cliente');
console.log('Inscrição gratuita padrão; origem externa fechada e pagamento direto pendente após aceite.');
