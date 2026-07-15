/* test-drawround-authz.js — a AUTORIZAÇÃO da drawRound espelha as firestore.rules?
 *
 * PORQUÊ ISTO É CRÍTICO: a CF grava com o Admin SDK, que **bypassa as firestore.rules**.
 * Até aqui, quem protegia o sorteio era a rule `isTournamentAdmin` no write do cliente. Com a
 * drawRound o write sai do servidor → a rule NÃO é consultada, e a única coisa entre um
 * autenticado qualquer e o torneio dos outros é `_isTournamentAdmin` do index.js. Se ela
 * divergir da rule (a mais/a menos), ou vira sequestro de torneio ou vira organizador travado.
 * Mesma classe do [[project_privileged_fields_never_client_writable]].
 *
 * Este teste extrai a função do index.js sem subir o firebase-admin (o require do módulo
 * inteiro chamaria initializeApp) e roda a MATRIZ dos 4 caminhos da rule (firestore.rules:20)
 * + os casos de borda que a rule trata e que é fácil errar ao portar.
 *
 * node test-drawround-authz.js
 */
const fs = require('fs');
const vm = require('vm');

// Extrai só _isTournamentAdmin do index.js (sem executar o módulo: initializeApp exigiria creds).
const src = fs.readFileSync(require('path').join(__dirname, 'index.js'), 'utf8');
const i = src.indexOf('function _isTournamentAdmin(');
if (i === -1) { console.error('✗ _isTournamentAdmin não encontrada no index.js'); process.exit(1); }
const j = src.indexOf('\n}\n', i) + 3;
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(src.slice(i, j) + '\nglobalThis.__fn = _isTournamentAdmin;', ctx);
const isAdmin = ctx.__fn;

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ FALHOU: ' + m); } }

const UID = 'uid_dono_longo', MAIL = 'dono@x.com';

console.log('──── os 4 caminhos da rule AUTORIZAM ────');
ok(isAdmin({ creatorUid: UID }, UID, 'qualquer@x.com'),
   '(1) creatorUid == uid → autoriza (caminho imutável, independe de email)');
ok(isAdmin({ creatorUid: 'outro_uid_longo', adminUids: ['x_longo', UID] }, UID, ''),
   '(2) uid em adminUids → autoriza mesmo SEM email (co-host por telefone)');
ok(isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: ['a@x.com', MAIL] }, UID, MAIL),
   '(3) email em adminEmails → autoriza (backward compat)');
ok(isAdmin({ creatorUid: 'outro_uid_longo', organizerEmail: 'DONO@X.com' }, UID, MAIL),
   '(4) recovery: adminEmails ausente → organizerEmail (case-insensitive)');
ok(isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: [], organizerEmail: MAIL }, UID, MAIL),
   '(4) recovery vale com adminEmails VAZIO (bug v1.6.66 apagava o campo)');

console.log('──── quem NÃO é admin é RECUSADO ────');
ok(!isAdmin({ creatorUid: 'outro_uid_longo' }, UID, MAIL),
   'estranho autenticado → NEGA (a CF bypassa as rules; aqui é a única trava)');
// memberUids no fixture DE PROPÓSITO: é o campo que TODO torneio real tem, com todo mundo
// dentro. Confundir memberUids (quem participa) com adminUids (quem manda) é o erro de porte
// mais fácil de cometer e o mais caro — daria a qualquer inscrito o poder de re-sortear.
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminUids: ['a_longo'], adminEmails: ['b@x.com'],
              memberUids: ['a_longo', UID], participants: [{ uid: UID }] }, UID, MAIL),
   'participante comum (em memberUids, fora de adminUids/adminEmails) → NEGA');
ok(!isAdmin({ creatorUid: UID }, null, MAIL), 'sem uid (não autenticado) → NEGA');
ok(!isAdmin(null, UID, MAIL), 'doc inexistente → NEGA');

console.log('──── bordas que a rule trata e é fácil errar ao portar ────');
// A rule só cai no organizerEmail quando adminEmails NÃO é lista não-vazia. Com adminEmails
// preenchido e o email fora dela, o recovery NÃO pode salvar — senão um ex-organizador cujo
// email saiu de adminEmails continuaria mandando.
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: ['b@x.com'], organizerEmail: MAIL }, UID, MAIL),
   'adminEmails NÃO-vazio e email fora dela → recovery NÃO salva (ex-organizador não volta)');
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminUids: [] }, UID, ''),
   'adminUids vazio + sem email → NEGA (não vira passe livre)');
// authEmail() na rule é '' quando o token não tem email → nunca casa por email.
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: [''], organizerEmail: '' }, UID, ''),
   'conta por telefone (email vazio) NÃO casa com adminEmails [""] nem organizerEmail ""');
// A rule faz `authEmail() in data.adminEmails` — comparação EXATA; ela NÃO abaixa o array.
// Quem garante minúscula é _computeAdminEmails (persist-core) na ESCRITA. Então uma entrada
// maiúscula não casaria nem na rule nem aqui — o espelho tem de manter a mesma cegueira, senão
// a CF autorizaria alguém que o write direto do cliente recusaria.
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: ['DONO@X.COM'] }, UID, MAIL),
   'adminEmails em MAIÚSCULA não casa — igual à rule (o lower é do _computeAdminEmails, na escrita)');
// organizerEmail, esse SIM, a rule abaixa: `data.organizerEmail.lower() == authEmail()`.
ok(isAdmin({ creatorUid: 'outro_uid_longo', organizerEmail: 'DONO@X.COM' }, UID, MAIL),
   'organizerEmail em MAIÚSCULA casa — a rule usa .lower() nesse campo (assimetria REAL da rule)');

console.log('\n════════════════════════════════════════');
if (fail) { console.error(`❌ drawround-authz: ${pass} ok, ${fail} falharam`); process.exit(1); }
console.log(`✅ drawround-authz: ${pass} ok, 0 falharam`);
console.log('════════════════════════════════════════');
