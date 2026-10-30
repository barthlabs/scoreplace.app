'use strict';
const assert = require('assert');
const { validate, requiresClosedEnrollment, paidDirectReady } = require('../functions-autodraw/registration-settings-core');
const enroll = require('../functions/enroll-core');
const fs = require('fs');

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
assert(enrollmentClient.includes('t.registrationSettings.passServiceFeeToParticipant === true'),
  'cliente não anuncia inscrição gratuita antes da resposta do servidor quando a taxa é repassada');
console.log('Inscrição gratuita padrão; origem externa fechada e pagamento direto pendente após aceite.');
