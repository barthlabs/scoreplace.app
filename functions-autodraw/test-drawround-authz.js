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
/* ⛔ OS CAMINHOS (3) E (4) MORRERAM — e as asserções deles viraram RECUSAS.
 * Este arquivo travava os "4 caminhos da rule": creatorUid, adminUids, adminEmails e o
 * recovery por organizerEmail. Em 26/ago/2026 (362fc0f2, "identidade é uid: e-mail e nome
 * saíram de toda decisão") sobraram DOIS: `_isTournamentAdmin`
 * (functions-autodraw/index.js:321-328) só olha `creatorUid` e `adminUids`.
 * As `firestore.rules` fizeram o mesmo movimento (linhas 12-23: "os caminhos por E-MAIL
 * FORAM REMOVIDOS … a pessoa troca o e-mail e perde/ganha admin sem nada ter mudado no
 * torneio"), com backfill de `adminUids` medido antes (8/8 torneios convergidos).
 * ⚠️ A COBERTURA NÃO ENCOLHEU: onde havia 3 asserções de permissão por e-mail agora há 4
 * de recusa — e o espelho continua tendo de bater com a rule, que é o motivo deste arquivo. */
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: ['a@x.com', MAIL] }, UID, MAIL),
   '⛔ (3) e-mail em adminEmails NÃO autoriza mais — só uid (362fc0f2)');
ok(!isAdmin({ creatorUid: 'outro_uid_longo', organizerEmail: 'DONO@X.com' }, UID, MAIL),
   '⛔ (4) recovery por organizerEmail NÃO autoriza mais, nem case-insensitive');
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: [], organizerEmail: MAIL }, UID, MAIL),
   '⛔ (4) nem com adminEmails VAZIO — o campo deixou de decidir');
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: [MAIL], organizerEmail: MAIL,
              memberUids: [UID] }, UID, MAIL),
   '⛔ e-mail em TODOS os campos de uma vez ainda NÃO entra sem uid');
ok(isAdmin({ creatorUid: 'outro_uid_longo', adminUids: [UID], adminEmails: [] }, UID, ''),
   '⭐ o MESMO co-host, agora por adminUids, autoriza sem e-mail nenhum');

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
// ⚠️ Esta continua valendo — e agora por um motivo MAIS FORTE: não é "o recovery só age
// quando adminEmails está vazia", é que e-mail não decide mais nada.
ok(!isAdmin({ creatorUid: 'outro_uid_longo', adminEmails: ['b@x.com'], organizerEmail: MAIL }, UID, MAIL),
   'ex-organizador por e-mail não volta — e-mail não decide (antes: só quando adminEmails vazia)');
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
/* ⛔ A ASSIMETRIA DE CAIXA SUMIU JUNTO COM O CAMPO. A rule tinha
 * `data.organizerEmail.lower() == authEmail()` de um lado e `authEmail() in adminEmails`
 * (exato) do outro — e este arquivo travava a diferença. Sem caminho por e-mail, não há
 * assimetria: MAIÚSCULA e minúscula são recusadas igualmente. */
ok(!isAdmin({ creatorUid: 'outro_uid_longo', organizerEmail: 'DONO@X.COM' }, UID, MAIL),
   '⛔ organizerEmail em MAIÚSCULA também não casa — não há mais caminho por e-mail');
ok(!isAdmin({ creatorUid: 'outro_uid_longo', organizerEmail: MAIL }, UID, MAIL),
   '⛔ nem em minúscula: a caixa deixou de importar porque o campo deixou de decidir');

console.log('\n════════════════════════════════════════');
if (fail) { console.error(`❌ drawround-authz: ${pass} ok, ${fail} falharam`); process.exit(1); }
console.log(`✅ drawround-authz: ${pass} ok, 0 falharam`);
console.log('════════════════════════════════════════');
