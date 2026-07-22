/* test-closeround-authz.js — a AUTORIZAÇÃO da closeRound espelha as firestore.rules?
 *
 * PORQUÊ ISTO É CRÍTICO: a CF grava com o Admin SDK, que **bypassa as firestore.rules**. A
 * closeRound autoriza PARTICIPANTE ou admin (o fecho de rodada é disparado por quem salva o
 * último placar — num resultEntry='players' é um participante). O erro caro a evitar: confundir
 * "quem pode fechar" com a régua de admin (participante ficaria travado) OU deixar um estranho
 * autenticado fechar (email como backdoor quando há memberUids). Mesma classe de
 * [[project_privileged_fields_never_client_writable]] / [[project_uid_primary_identity]].
 *
 * Extrai _isTournamentAdmin + _isTournamentParticipant do index.js sem subir o firebase-admin.
 * node test-closeround-authz.js
 */
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, 'index.js'), 'utf8');
function extract(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) { console.error('✗ ' + name + ' não encontrada no index.js'); process.exit(1); }
  const j = src.indexOf('\n}\n', i) + 3;
  return src.slice(i, j);
}
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  extract('_isTournamentAdmin') + '\n' + extract('_isTournamentParticipant') +
  '\nglobalThis.__canClose = function (t, uid, email) {' +
  '  return _isTournamentParticipant(t, uid, email) || _isTournamentAdmin(t, uid, email); };',
  ctx);
const canClose = ctx.__canClose;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ FALHOU: ' + m); } }

const ORG = 'uid_org_longo', P = 'uid_part_longo', A = 'uid_cohost_longo', X = 'uid_estranho_longo', MAIL = 'part@x.com';

console.log('──── AUTORIZA (participante OU admin) ────');
ok(canClose({ creatorUid: ORG, memberUids: [ORG, P] }, ORG, ''),
   'organizador (creatorUid) fecha, mesmo sem email');
ok(canClose({ creatorUid: ORG, memberUids: [ORG, P] }, P, ''),
   'PARTICIPANTE (em memberUids, fora de admin) FECHA — diferença-chave vs drawRound (admin-only)');
ok(canClose({ creatorUid: ORG, adminUids: [A], memberUids: [ORG, A, P] }, A, ''),
   'co-host (adminUids) fecha');
ok(canClose({ creatorUid: ORG, memberUids: [], memberEmails: ['part@x.com'] }, P, MAIL),
   'fallback memberEmails só quando memberUids VAZIO (doc legado)');

console.log('──── NEGA ────');
ok(!canClose({ creatorUid: ORG, memberUids: [ORG, P] }, X, MAIL),
   'estranho autenticado (fora de memberUids) → NEGA (a CF bypassa as rules)');
// memberUids não-vazio: o email NÃO é backdoor — só o uid conta (memberEmails é fallback só quando
// memberUids vazio). Senão alguém com email num campo legado entraria num torneio já migrado pra uid.
ok(!canClose({ creatorUid: ORG, memberUids: [ORG, P], memberEmails: ['estranho@x.com'] }, X, 'estranho@x.com'),
   'memberUids não-vazio + uid fora → NEGA (email não é fallback quando há memberUids)');
ok(!canClose({ creatorUid: ORG, memberUids: [ORG, P] }, null, MAIL), 'sem uid (não autenticado) → NEGA');
ok(!canClose(null, P, MAIL), 'doc inexistente → NEGA');
ok(!canClose({ creatorUid: ORG }, P, MAIL),
   'sem memberUids nem memberEmails → participante não comprovável → NEGA (só admin passaria)');

console.log('\n════════════════════════════════════════');
if (fail) { console.error(`❌ closeround-authz: ${pass} ok, ${fail} falharam`); process.exit(1); }
console.log(`✅ closeround-authz: ${pass} ok, 0 falharam`);
console.log('════════════════════════════════════════');
