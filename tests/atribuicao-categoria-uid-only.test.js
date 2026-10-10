/* Atribuição de categoria identifica conta pelo UID.
 *
 * A categoria é uma escrita no torneio. E-mail não pode viajar no pedido nem servir
 * para localizar uma pessoa autenticada: se há UID, ele é a única identidade; se não
 * há UID, `manualParticipantId` é a identidade estável do importado. Nome só mantém
 * compatibilidade com torneios legados que ainda não carregam identificador manual.
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
  ok(/Object\.assign\(identity,/.test(call), 'ação ' + (index + 1) + ' recebe identidade estrutural única');
  ok(!/\bname\s*:/.test(call), 'ação ' + (index + 1) + ' não envia nome como chave de mutação');
});
const identityStart = client.indexOf('function _assignmentParticipantIdentity');
const identityEnd = client.indexOf('function _assignParticipantCategory', identityStart);
const identityHelper = identityStart >= 0 && identityEnd > identityStart ? client.slice(identityStart, identityEnd) : '';
ok(!!identityHelper, 'resolvedor cliente da identidade estrutural foi encontrado');
ok(/if \(uid && !manualParticipantId\) return \{ uid: uid \}/.test(identityHelper) && /if \(manualParticipantId && !uid\) return \{ manualParticipantId: manualParticipantId \}/.test(identityHelper), 'cliente escolhe UID ou ID manual, nunca ambos');
ok(/legacyName/.test(identityHelper) && !/\bname\s*:/.test(identityHelper), 'nome só sobrevive como legado explicitamente nomeado');
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
const resolverStart = server.indexOf('function _findEnrollmentAssignmentTarget');
const resolverEnd = server.indexOf('exports.applyEnrollmentAssignments = onCall', resolverStart);
const resolver = resolverStart >= 0 && resolverEnd > resolverStart ? server.slice(resolverStart, resolverEnd) : '';
ok(/e\.uid\?u\.includes\(e\.uid\):e\.manualParticipantId\?manual\.includes\(e\.manualParticipantId\):\(e\.legacyName/.test(resolver),
  'handler casa UID primeiro, depois ID manual estável e só então nome legado');
ok(/hits\.length===1/.test(resolver) && /ambiguous:hits\.length>1/.test(resolver), 'nome legado ambíguo não escolhe a primeira pessoa');
ok(/\(!x\.uid&&!x\.manualParticipantId&&!x\.legacyName\)/.test(handler), 'pedido sem UID aceita ID manual estável ou, só no legado, nome');

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
