'use strict';
const fs = require('fs');
const assert = require('assert');
const vm = require('vm');
let failed = 0;
function ok(condition, message) { if (condition) console.log('✓ ' + message); else { console.error('✗ ' + message); failed++; } }

const server = fs.readFileSync('functions/index.js', 'utf8');
const begin = server.indexOf('exports.deenrollParticipant = onCall');
const end = server.indexOf('// Sair da lista de espera', begin);
const callable = server.slice(begin, end);
ok(/manualParticipantId/.test(callable) && /\{ manualParticipantId: manualParticipantId \}/.test(callable),
  'desinscrição canônica aceita ID manual, sem converter para nome');
ok(/manualParticipantId && !isOrg/.test(callable),
  'vaga manual só pode ser removida pela organização');
ok(/_registrationMutations\.withdraw/.test(callable) && /_writeCanonicalRosterUpdates/.test(callable),
  'remoção canônica usa a mesma transição atômica que preserva dupla e recibo');
const withdrawAt = callable.indexOf('_registrationMutations.withdraw');
const guardAt = callable.indexOf('_registrationPayment.prepareWithdrawal', withdrawAt);
const writeAt = callable.indexOf('_writeCanonicalRosterUpdates', withdrawAt);
ok(withdrawAt >= 0 && guardAt > withdrawAt && writeAt > guardAt &&
  /prior\.status === 'withdrawn'/.test(callable.slice(withdrawAt, writeAt)) &&
  /item\.status !== 'withdrawn'/.test(callable.slice(withdrawAt, writeAt)),
  'guarda ocorre antes da gravação e não reavalia parceiro já retirado');
ok(/new HttpsError\('failed-precondition', error\.message\)/.test(callable.slice(withdrawAt, writeAt)),
  'erro financeiro da retirada chega ao cliente como pré-condição');

const helperStart = server.indexOf('function _writeCanonicalRosterUpdates(');
const helperEnd = server.indexOf('/* Criação, recibo e índice', helperStart);
const billing = require('../functions/registration-payment-core');
const writes = [];
const tx = { update:(ref, patch) => writes.push({ path:ref.path, patch }) };
const ref = { path:'tournaments/test', collection:name => ({
  doc:id => ({ path:'tournaments/test/' + name + '/' + id })
}) };
const ctx = { _canonicalMutationTournament:(_, tournament) => tournament,
  _canonicalRegistrationBoundary:{ applyUpdates:(_t, registrations, updates) => ({
    tournament:_t, registrations:registrations.map(item => updates.find(update => update.registrationId === item.registrationId) || item)
  }), memberUids:() => [] },
  _registrationPayment:billing, _FV:{ serverTimestamp:() => 'server-time' }, HttpsError:Error, Set, Object };
const writeUpdates = vm.runInNewContext(server.slice(helperStart, helperEnd) + '\n_writeCanonicalRosterUpdates;', ctx);
const leaving = { registrationId:'leaving', status:'withdrawn', fixedPairId:null,
  ...Object.fromEntries(billing.FINANCIAL_FIELDS.map(key => [key, null])) };
const partner = { registrationId:'partner', status:'confirmed', fixedPairId:null,
  paymentState:'paid', paymentDueCents:18700 };
writeUpdates(tx, ref, {}, [leaving, partner], [leaving, partner], 'test', new Set(['leaving']));
const leftPatch = writes.find(write => write.path.endsWith('/leaving')).patch;
const partnerPatch = writes.find(write => write.path.endsWith('/partner')).patch;
assert(billing.FINANCIAL_FIELDS.every(key => Object.prototype.hasOwnProperty.call(leftPatch, key)
  && leftPatch[key] === null), 'cobrança não quitada é limpa na mesma escrita');
assert.strictEqual(partnerPatch.fixedPairId, null);
assert(billing.FINANCIAL_FIELDS.every(key => !Object.prototype.hasOwnProperty.call(partnerPatch, key)),
  'parceiro não recebe escrita financeira');
writes.length = 0;
writeUpdates(tx, ref, {}, [leaving], [leaving], 'test');
assert(billing.FINANCIAL_FIELDS.every(key => !Object.prototype.hasOwnProperty.call(writes[0].patch, key)),
  'os demais chamadores não habilitam gravação financeira');
const changeStart = server.indexOf('function _writeCanonicalRosterChanges(');
const changeEnd = server.indexOf('// Comprovantes de recebimento DIRETO', changeStart);
const changeBlock = server.slice(changeStart, changeEnd);
ok(/reclassifiedFromRegistrationId/.test(changeBlock) && /paymentTransferredToRegistrationId/.test(changeBlock),
  'gravador de reclassificação preserva os nove campos, inclusive vínculos de transferência');

const client = fs.readFileSync('js/views/tournaments.js', 'utf8');
const a = client.indexOf('window.removeParticipantFunction = function');
const b = client.indexOf('window._applySplitParticipantFresh', a);
const ui = client.slice(a, b);
ok(/canonicalRegistrationMigration/.test(ui) && /deenrollParticipant/.test(ui),
  'ação administrativa não chama a remoção legada no torneio canônico');
ok(/manualParticipantId/.test(ui) && !/participantName:\s*String\(participantName/.test(ui.slice(0, ui.indexOf("removeTournamentParticipant"))),
  'ação canônica transmite identidade estrutural, nunca o rótulo');
const selfView = fs.readFileSync('js/views/tournaments-enrollment.js', 'utf8');
const selfStart = selfView.indexOf('window.deenrollCurrentUser = function');
const selfEnd = selfView.indexOf('window.addParticipantFunction = function', selfStart);
const selfBlock = selfView.slice(selfStart, selfEnd);
ok(/t\.participants = _savedParticipants/.test(selfBlock) &&
  /err\.code === 'functions\/failed-precondition'/.test(selfBlock) &&
  /err\.code === 'failed-precondition'/.test(selfBlock) &&
  /_financialBlocked && err\.message \? err\.message : _t\('enroll\.cancelError'\)/.test(selfBlock),
  'autodesinscrição reverte a tela e só mostra erro financeiro específico para pré-condição');
process.exitCode = failed ? 1 : 0;
