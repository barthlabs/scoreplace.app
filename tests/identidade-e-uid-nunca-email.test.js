/* IDENTIDADE É UID — NUNCA E-MAIL, NUNCA NOME (2.0.107)
 * node tests/identidade-e-uid-nunca-email.test.js
 *
 * Cânone do dono (26/ago), depois de eu apontar 51 e-mails ainda expostos no doc público:
 *   _"nada por nome ou email, sempre por uid a menos que seja digitado por organizador e
 *     nao tenha uid. organizador sempre por uid."_
 *
 * ⛔ POR QUE ISSO É SEGURANÇA E NÃO ESTILO: e-mail é uma STRING que a pessoa apresenta.
 * Quem tivesse `organizerEmail` igual ganhava as ferramentas do ORGANIZADOR — e e-mail
 * muda, se repete, e quem perde o acesso a ele não perde a conta (nem o contrário).
 * As `firestore.rules` já eram uid puro desde jul/2026. As CFs e o cliente é que ficaram
 * para trás — e nas CFs é PIOR, porque elas rodam com admin SDK e não passam por regra.
 *
 * ⭐ MEDIDO ANTES DE TIRAR (scripts/conferir-admin-por-uid.js): 39 e-mails de admin na base
 * inteira, **39 cobertos por uid**, **0** torneios sem `creatorUid`. Os caminhos por e-mail
 * não salvavam ninguém — só abriam porta.
 *
 * ⭐ A EXCEÇÃO É REAL E FICA: inscrito digitado pelo organizador não tem uid, e é só pelo
 * nome que ele existe. O teste distingue as duas coisas.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const leia = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// tira comentários de linha e de bloco: o cânone é sobre CÓDIGO, e as notas que EXPLICAM
// a mudança citam os campos velhos de propósito.
const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ALVOS = ['functions/index.js', 'functions-autodraw/index.js', 'firestore.rules',
  'js/store.js', 'js/trophies.js', 'js/views/bracket-ui.js', 'js/views/arbitros.js',
  'js/views/dashboard.js', 'js/views/explore.js', 'js/views/tournaments-organizer.js'];

// ── ① nenhum ponto DECIDE por e-mail ────────────────────────────────────────
const PROIBIDO = [
  [/organizerEmail\s*===/, 'compara organizerEmail'],
  [/creatorEmail\s*===/, 'compara creatorEmail'],
  [/===\s*t\.organizerEmail/, 'compara com organizerEmail'],
  [/adminEmails[^\n]*indexOf\([^\n]*[Ee]mail/, 'procura o e-mail em adminEmails'],
  [/adminEmails[^\n]*includes\([^\n]*[Ee]mail/, 'procura o e-mail em adminEmails'],
];
for (const arq of ALVOS) {
  const src = semComentario(leia(arq));
  for (const [rx, oque] of PROIBIDO) {
    ok(!rx.test(src), '⛔ ' + arq + ' ainda ' + oque);
  }
}

// ── ② as portas ÚNICAS são uid puro ─────────────────────────────────────────
const cfA = leia('functions-autodraw/index.js');
const iA = cfA.indexOf('function _isTournamentAdmin(');
const admA = semComentario(cfA.slice(iA, cfA.indexOf('\n}', iA)));
ok(/_isTournamentAdmin\(t, uid\)/.test(cfA.slice(iA, iA + 80)),
  '⭐ _isTournamentAdmin nem RECEBE e-mail — assinatura não deixa reintroduzir por engano');
ok(/creatorUid/.test(admA) && /adminUids/.test(admA), 'ela decide por creatorUid + adminUids');
ok(!/[Ee]mail/.test(admA), '⛔ e não menciona e-mail em lugar nenhum do corpo');

const iP = cfA.indexOf('function _isTournamentParticipant(');
const parA = semComentario(cfA.slice(iP, cfA.indexOf('\n}', iP)));
ok(/memberUids/.test(parA) && !/memberEmails/.test(parA),
  '⭐ participante idem: memberUids, sem queda pra memberEmails');

const cfP = leia('functions/index.js');
const iO = cfP.indexOf('function _isTournamentOrgCaller(');
const orgP = semComentario(cfP.slice(iO, cfP.indexOf('\n}', iO)));
ok(/creatorUid/.test(orgP) && /adminUids/.test(orgP) && !/[Ee]mail/.test(orgP),
  '⭐ _isTournamentOrgCaller (CF principal) é uid puro');
ok((cfP.match(/_isTournamentOrgCaller\(t, callerUid\)/g) || []).length >= 7,
  '⭐ e os blocos soltos apontam pra ELA (' +
  ((cfP.match(/_isTournamentOrgCaller\(t, callerUid\)/g) || []).length) +
  ') — 8 cópias divergem, uma porta não');

// ── ③ a regra continua uid puro (era o único lugar que já estava certo) ────
const rules = semComentario(leia('firestore.rules'));
ok(!/adminEmails/.test(rules) && !/organizerEmail/.test(rules) && !/creatorEmail/.test(rules),
  '⭐ firestore.rules segue sem e-mail nenhum decidindo acesso');

// ── ④ A EXCEÇÃO DO DONO CONTINUA VALENDO ────────────────────────────────────
const tro = leia('js/trophies.js');
ok(/!uid && t\.winner === \(cu\.displayName/.test(tro),
  '⭐ nome AINDA vale pra quem NÃO tem uid — é a exceção que o dono abriu (inscrito fictício)');
ok(!/t\.winner === cu\.email/.test(semComentario(tro)),
  '⛔ mas o caminho por e-mail saiu');

console.log((fail ? '✗' : '✓') + ' identidade-e-uid-nunca-email: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
