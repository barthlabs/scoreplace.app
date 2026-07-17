/* LOGIN COM A CREDENCIAL DA CONTA ABSORVIDA (CF resolveLoginRedirect, v1.2.9).
 *
 * O BURACO: quando duas contas do MESMO tipo são fundidas (duas Google, p.ex.), a credencial
 * da absorvida NÃO migra — o Firebase não põe dois provedores do mesmo tipo numa conta, e a
 * conta dela é apagada no merge. A pessoa clica "Entrar com Google", escolhe aquele e-mail, o
 * Google autentica, o Firebase não acha ninguém e CRIA UMA CONTA NOVA E VAZIA. Duplicata —
 * pior que antes do merge. O resolveMergedLogin não cobre: ele exige logar na conta que tem o
 * tombstone, e essa não existe mais.
 * Caso real: Eduardo Mange (dudumange@gmail.com + eduardo@mange.adv.br, ambas google.com).
 *
 * Pedido do dono (jul/2026): "o mecanismo que resolve o login já vê que a conta se relaciona
 * com a outra e faz o login pela outra sem o usuário ter que se preocupar se entra com uma ou
 * com outra. as duas são aceitas, ou mesmo um telefone verificado é aceito".
 *
 * SEGURANÇA: o dono vem de `loginRedirects` (só o Admin SDK escreve — rules deny-all, ver
 * tests/rules-privileged-fields.test.js), NUNCA de linkedEmails/email do perfil, que o cliente
 * escreve e permitiriam reivindicar o e-mail de outro. O identificador vem do TOKEN verificado.
 *
 * O teste dirige a LÓGICA REAL extraída de functions/index.js (o index não é importável —
 * registra onCall/secrets no import). Os dois asserts que mais importam: o caso do Eduardo
 * funciona, e USUÁRIO NOVO nunca é apagado (o gancho do auth.js dispara pra ele também, já
 * que ele também não tem perfil ainda).
 *
 * node tests/login-redirect.test.js
 */
// Exercita a LÓGICA DE DECISÃO real da resolveLoginRedirect contra um Firestore falso,
// extraindo o corpo da CF do functions/index.js (não uma réplica).
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const i = src.indexOf('exports.resolveLoginRedirect = onCall(');
const j = src.indexOf('\n);', i);
let body = src.slice(i, j + 3);
// isola o handler async (request) => { ... }
const h = body.indexOf('async (request) => {');
const handlerSrc = body.slice(h, body.lastIndexOf('}')) + '}';

let deleted = [], tokens = [];
const DB = (docs) => ({ collection: (c) => ({ doc: (d) => ({ get: async () => {
  const v = docs[c + '/' + d];
  return { exists: !!v, data: () => v };
} }) }) });
const admin = { auth: () => ({
  getUser: async (u) => { if (u === 'MORTO') { const e = new Error('x'); e.code='auth/user-not-found'; throw e; } return { uid: u }; },
  createCustomToken: async (u) => { tokens.push(u); return 'TOKEN_' + u; },
  deleteUser: async (u) => { deleted.push(u); },
}), firestore: () => DB(global.__docs) };
class HttpsError extends Error { constructor(c, m) { super(m); this.code = c; } }

async function run(docs, auth) {
  global.__docs = docs; deleted = []; tokens = [];
  const fn = eval('(' + handlerSrc + ')');
  // injeta o db do cenário
  const _origFs = admin.firestore; admin.firestore = () => DB(docs);
  const r = await fn({ auth });
  admin.firestore = _origFs;
  return { r, deleted: deleted.slice(), tokens: tokens.slice() };
}
global.admin = admin; global.HttpsError = HttpsError; global.console = console;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

(async () => {
  const AUTH = (uid, email, ver, phone) => ({ uid, token: { email, email_verified: ver, phone_number: phone } });

  // 1. CASO EDUARDO: loga com o gmail (conta absorvida) → conta vazia nova
  let t = await run({
    'loginRedirects/dudumange@gmail.com': { ownerUid: 'uid_MANGE' },
    'users/uid_MANGE': { displayName: 'Eduardo Mange' },
  }, AUTH('uid_NOVO_VAZIO', 'dudumange@gmail.com', true));
  ok(t.r.redirected === true, 'Eduardo: redireciona pra conta certa (got ' + JSON.stringify(t.r.reason || t.r.redirected) + ')');
  ok(t.r.survivorUid === 'uid_MANGE', '  → survivorUid = a conta que sobreviveu ao merge');
  ok(t.tokens[0] === 'uid_MANGE', '  → custom token é da conta CERTA');
  ok(t.deleted[0] === 'uid_NOVO_VAZIO', '  → a conta vazia recém-criada é apagada');

  // 2. USUÁRIO NOVO de verdade: não pode ser tocado (o gancho dispara pra ele também!)
  t = await run({}, AUTH('uid_PESSOA_NOVA', 'alguem.novo@gmail.com', true));
  ok(t.r.redirected === false && t.r.reason === 'no_redirect', 'usuário NOVO: não redireciona (got ' + t.r.reason + ')');
  ok(t.deleted.length === 0, '  → 🔒 e NÃO apaga a conta dele (seria destruir cadastro novo)');

  // 3. Quem já tem perfil é dono de si
  t = await run({
    'users/uid_TEM': { displayName: 'Fulano' },
    'loginRedirects/f@x.com': { ownerUid: 'uid_OUTRO' },
  }, AUTH('uid_TEM', 'f@x.com', true));
  ok(t.r.reason === 'has_profile', 'conta COM perfil: nunca redireciona (got ' + t.r.reason + ')');
  ok(t.deleted.length === 0, '  → e não é apagada');

  // 4. E-MAIL NÃO VERIFICADO não vale como identidade
  t = await run({
    'loginRedirects/spoof@x.com': { ownerUid: 'uid_VITIMA' },
    'users/uid_VITIMA': { displayName: 'Vítima' },
  }, AUTH('uid_A', 'spoof@x.com', false));
  ok(t.r.reason === 'no_verified_identifier',
    '🔒 e-mail NÃO verificado → sem redirect (senão bastaria um provedor que não verifica) (got ' + t.r.reason + ')');
  ok(t.tokens.length === 0, '  → nenhum token emitido');

  // 5. Cadeia: o dono também foi mesclado depois
  t = await run({
    'loginRedirects/a@x.com': { ownerUid: 'uid_B' },
    'users/uid_B': { mergedInto: 'uid_C' },
    'users/uid_C': { displayName: 'Final' },
  }, AUTH('uid_A', 'a@x.com', true));
  ok(t.r.survivorUid === 'uid_C', 'cadeia: segue mergedInto até o fim (got ' + t.r.survivorUid + ')');

  // 6. Dono sumiu do Auth → não emite token nem apaga nada
  t = await run({
    'loginRedirects/a@x.com': { ownerUid: 'MORTO' },
    'users/MORTO': { displayName: 'Sumiu' },
  }, AUTH('uid_A', 'a@x.com', true));
  ok(t.r.reason === 'owner_auth_gone', 'dono morto no Auth → sem redirect (got ' + t.r.reason + ')');
  ok(t.deleted.length === 0, '  → 🔒 e a conta atual NÃO é apagada (senão a pessoa perde as duas)');

  // 7. Telefone também resolve
  t = await run({
    'loginRedirects/+5511999998888': { ownerUid: 'uid_P' },
    'users/uid_P': { displayName: 'Phone' },
  }, AUTH('uid_NOVO', null, false, '+5511999998888'));
  ok(t.r.redirected === true && t.r.survivorUid === 'uid_P', 'telefone: também redireciona (got ' + t.r.survivorUid + ')');

  // 8. Auto-referência não vira loop
  t = await run({ 'loginRedirects/a@x.com': { ownerUid: 'uid_A' } }, AUTH('uid_A', 'a@x.com', true));
  ok(t.r.redirected === false, 'redirect apontando pra si mesmo → no-op (got ' + JSON.stringify(t.r) + ')');
  ok(t.deleted.length === 0, '  → e não se apaga');

  console.log(fail === 0 ? '\n✅ resolveLoginRedirect: ' + pass + ' ok, 0 falharam'
                         : '\n❌ resolveLoginRedirect: ' + fail + ' falharam, ' + pass + ' ok');
  process.exit(fail === 0 ? 0 : 1);
})();
