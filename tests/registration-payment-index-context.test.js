'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const enroll = source.slice(source.indexOf('exports.enrollParticipant = onCall('),
  source.indexOf('exports.deenrollParticipant = onCall('));
const reclassify = source.slice(source.indexOf('exports.reclassifyCanonicalRegistration = onCall('),
  source.indexOf('exports.', source.indexOf('exports.reclassifyCanonicalRegistration = onCall(') + 1));

assert(enroll.includes('paymentContext(_dados)'), 'inscrição calcula o contexto do torneio hidratado');
assert(enroll.includes("_registrationPayment.directMethods(registration, 'pre_draw')"),
  'meios diretos são validados apenas antes do sorteio');
assert(enroll.includes("if (paymentDue.length && _registrationPayment.paymentContext(_dados) === 'late')"),
  'somente a cobrança nova é recusada após a decisão de inscrição');
assert(enroll.indexOf("if (paymentDue.length && _registrationPayment.paymentContext(_dados) === 'late')")
  < enroll.indexOf('let next = checked;'), 'a recusa de cobrança ocorre antes de gravar o elenco');
assert(enroll.includes('_registrationPayment.directMethods(registration, _registrationPayment.paymentContext(_dados))'),
  'resposta da inscrição usa o mesmo contexto da transação');
assert(reclassify.includes('paymentContext(tournament)'), 'reclassificação calcula contexto do torneio');
assert(reclassify.includes("context === 'late' && _registrationPayment.createsNewOpenCharge(changes, checked.registrations)"),
  'reclassificação compara destinos com cobranças anteriores e recusa somente cobrança nova');
assert(reclassify.includes("context === 'pre_draw') _registrationPayment.directMethods"),
  'meios da organização são validados apenas antes do sorteio');
const allCalls = source.match(/_registrationPayment\.directMethods\([^;]+/g) || [];
assert.strictEqual(allCalls.length, 3, 'todas as três portas do index estão cobertas');
console.log('Portas de inscrição e reclassificação: contexto pós-sorteio explícito OK.');
