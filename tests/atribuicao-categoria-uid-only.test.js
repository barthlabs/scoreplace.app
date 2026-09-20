/* Atribuição de categoria identifica conta pelo UID.
 *
 * A categoria é uma escrita no torneio. E-mail não pode viajar no pedido nem servir
 * para localizar uma pessoa autenticada: se há UID, ele é a única identidade; se não
 * há UID, trata-se de participante manual e o nome pertence apenas àquele torneio.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/tournaments-categories.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');

let pass = 0, fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else { fail++; console.error('  ✗', message); }
}

const clientCalls = client.match(/_callFn\('applyEnrollmentAssignments',[\s\S]*?\}\)\s*\.?then/g) || [];
ok(clientCalls.length === 3, 'as três ações de categoria chamam a Function canônica');
clientCalls.forEach((call, index) => {
  ok(!/\bemail\s*:/.test(call), 'ação ' + (index + 1) + ' não envia e-mail como identidade');
  ok(/\buid\s*:/.test(call), 'ação ' + (index + 1) + ' envia uid');
  ok(/\bname\s*:/.test(call), 'ação ' + (index + 1) + ' mantém nome somente para participante manual');
});
const assignStart = client.indexOf('function _assignParticipantCategory');
const assignEnd = client.indexOf('// Category assignment notification', assignStart);
const assignHandler = assignStart >= 0 && assignEnd > assignStart ? client.slice(assignStart, assignEnd) : '';
ok(!!assignHandler, 'ação de atribuição manual foi encontrada');
ok(!/p\.email/.test(assignHandler), 'ação manual não transforma e-mail em chave de nome');

const begin = server.indexOf('exports.applyEnrollmentAssignments = onCall');
const end = server.indexOf('exports.applyCategoryCommunicationMarkers = onCall', begin);
const handler = begin >= 0 && end > begin ? server.slice(begin, end) : '';
ok(!!handler, 'handler canônico de atribuição foi encontrado');
ok(!/\bemail\b/.test(handler), 'handler não aceita nem consulta e-mail');
ok(/e\.uid\?u\.includes\(e\.uid\):\(!u\.length&&e\.name/.test(handler),
  'handler casa uid primeiro e só usa nome quando a entrada não tem uid');
ok(/\(!x\.uid&&!x\.name\)/.test(handler), 'pedido sem uid exige nome de participante manual');

const commStart = client.indexOf('function _categoryCommIdentity');
const commEnd = client.indexOf('// Persist only communication markers', commStart);
const commClient = commStart >= 0 && commEnd > commStart ? client.slice(commStart, commEnd) : '';
const commServerStart = server.indexOf('exports.applyCategoryCommunicationMarkers = onCall');
const commServerEnd = server.indexOf('function _queueProfileCategoryNotice', commServerStart);
const commServer = commServerStart >= 0 && commServerEnd > commServerStart ? server.slice(commServerStart, commServerEnd) : '';
ok(!!commClient && !!commServer, 'cliente e Function de marcadores foram encontrados');
ok(!/\.email/.test(commClient), 'cliente não usa e-mail para identificar marcador de categoria');
ok(!/\.email/.test(commServer), 'Function não usa e-mail para identificar marcador de categoria');
ok(/p\.uid \|\| p\.p1Uid \|\| p\.displayName \|\| p\.name/.test(commClient),
  'cliente usa uid e reserva nome para participante manual');

if (fail) {
  console.error('\n❌ atribuição de categoria uid-only: ' + pass + ' ok, ' + fail + ' falharam');
  process.exit(1);
}
console.log('✅ atribuição de categoria uid-only: ' + pass + ' ok, 0 falharam');
