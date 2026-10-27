'use strict';
const assert = require('assert');
const { validate, requiresClosedEnrollment } = require('../functions-autodraw/registration-settings-core');
const enroll = require('../functions/enroll-core');
const fs = require('fs');

assert.deepStrictEqual(validate({ source:'scoreplace', pricing:{ mode:'single', cents:0 } }, []),
  { source:'scoreplace', pricing:{ mode:'single', cents:0 } });
assert.deepStrictEqual(validate({ source:'external', pricing:null }, []),
  { source:'external', pricing:null });
assert.deepStrictEqual(validate({ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ 'Fem Light':0, 'Masc Power':5000 } } }, ['Fem Light', 'Masc Power']).pricing.centsByCategory,
  { 'Fem Light':0, 'Masc Power':5000 });
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ 'Fem Light':5000 } } }, ['Fem Light', 'Masc Power']), /cada categoria/);
assert.throws(() => validate({ source:'scoreplace', pricing:{ mode:'single', cents:-1 } }, []), /valor/i);
assert.strictEqual(requiresClosedEnrollment({ source:'external', pricing:null }), true);
assert.strictEqual(requiresClosedEnrollment({ source:'scoreplace', pricing:{ mode:'single', cents:100 } }), true);
assert.strictEqual(requiresClosedEnrollment({ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ A:0, B:100 } } }), true);
assert.strictEqual(requiresClosedEnrollment({ source:'scoreplace', pricing:{ mode:'single', cents:0 } }), false);

assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'scoreplace', pricing:{ mode:'single', cents:0 } } }).open, true);
assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'external', pricing:null } }).open, false);
assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'scoreplace', pricing:{ mode:'single', cents:2500 } } }).open, false);
assert.strictEqual(enroll.enrollmentOpen({ status:'open', registrationSettings:{ source:'scoreplace', pricing:{ mode:'category', centsByCategory:{ A:0, B:100 } } } }).open, false);

const server = fs.readFileSync('functions/index.js', 'utf8');
assert(server.includes("registration.source === 'external'"), 'porta de inscrição valida origem no servidor');
assert(server.includes('A inscrição paga requer pagamento confirmado'), 'cliente antigo não pode entrar sem pagamento');
const creator = fs.readFileSync('functions-autodraw/tournament-create.js', 'utf8');
assert(creator.includes("registration.source === 'external' || requiresCheckout"), 'evento externo ou pago nasce com inscrições fechadas');
const drawServer = fs.readFileSync('functions-autodraw/index.js', 'utf8');
assert(drawServer.includes("tDepois.status === 'open' && require('./registration-settings-core').requiresClosedEnrollment(tDepois.registrationSettings)"),
  'toda gravação canônica mantém externa/paga fechada, inclusive rotas de enquete e reabertura');
assert(drawServer.includes("t.status === 'closed' && !require('./registration-settings-core').requiresClosedEnrollment(t.registrationSettings) && Number.isFinite(openingAt)"),
  'abertura futura não promove inscrição externa ou paga');
const editor = fs.readFileSync('js/views/create-tournament.js', 'utf8');
assert(editor.includes('id="tourn-registration-source" value="scoreplace"'), 'origem padrão é pelo app');
assert(editor.includes("input.placeholder = '0,00'"), 'valor padrão é gratuito');
assert(editor.includes('if (!editId || window._registrationSettingsTouched'), 'torneios antigos não são convertidos ao editar outro campo');
console.log('Inscrição gratuita padrão; origem externa e cobrança sem checkout bloqueadas.');
