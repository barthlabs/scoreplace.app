/* Identidade por UID no DISPLAY (v4.5.61) — carrega o store.js REAL e dirige o
 * resolver canônico window._displayName / _nameForUid.
 *
 * Bug do dono ("Maira/Maira"): um inscrito de dupla tinha p2Uid do Paulo Oriente,
 * mas o p2Name GRAVADO estava podre = "Maira" (corrompido num write anterior, no
 * banco de staging). O render antigo lia o nome gravado → mostrava "Maira/Maira".
 * A regra: onde HÁ uid, o nome exibido resolve do perfil vivo (users/{uid}) e o
 * nome gravado NUNCA é lido — nem como fallback.
 *
 * FALHA no comportamento antigo (lê nome gravado → "Maira"); PASSA no novo
 * (resolve o uid → "Paulo Oriente"). node tests/uid-name-display.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.document = null;
sandbox.navigator = {};
sandbox.localStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
sandbox.addEventListener = function () {};
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;
sandbox.setInterval = function () {};
sandbox.clearInterval = function () {};
sandbox._t = function (k) { return k; };
sandbox._warn = function () {};
sandbox._log = function () {};
sandbox._error = function () {};
vm.createContext(sandbox);

// O resolver está no TOPO de store.js (logo após a versão), então mesmo que uma
// linha posterior lance no sandbox headless, os helpers já foram definidos.
try {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8'), sandbox, { filename: 'store.js' });
} catch (_e) { /* ignora erros de código posterior; o resolver já está definido no topo */ }

const W = sandbox;
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

ok(typeof W._displayName === 'function', '_displayName existe (store.js carregou o resolver)');
ok(typeof W._nameForUid === 'function', '_nameForUid existe');

const PAULO = 'uPauloOriente', MAIRA = 'uMaira';
// perfis vivos (o que estaria em users/{uid})
W._userProfileCache[PAULO] = { displayName: 'Paulo Oriente', email: 'paulo@x.com', phone: '', photoURL: '' };
W._userProfileCache[MAIRA] = { displayName: 'Maira', email: '', phone: '', photoURL: '' };

// Dupla real: Maira (uid MAIRA) + Paulo (uid PAULO), mas o p2Name GRAVADO está
// corrompido = "Maira" (o dado podre do staging).
eq(W._displayName(MAIRA, 'Maira'), 'Maira', 'membro 1 = Maira (uid dela)');
eq(W._displayName(PAULO, 'Maira'), 'Paulo Oriente', 'membro 2 resolve PAULO pelo uid — ignora o p2Name gravado "Maira"');
ok(W._displayName(PAULO, 'Maira') !== 'Maira', 'REGRESSÃO MORTA: nome gravado corrompido nunca vaza quando há uid');

// v4.5.63 (SEM fallback — perfis são pré-requisito do render): uid com perfil ainda
// NÃO carregado → VAZIO (a UI mostra "…" de loading e re-renderiza quando o perfil
// chega). NUNCA o nome gravado. Precisar de fallback = arquitetura errada.
eq(W._displayName('uNaoCarregado', 'Maira'), '', 'uid sem perfil carregado → vazio (loading), JAMAIS o nome gravado');
// ...quando o perfil carrega (o pré-requisito do render), resolve o nome vivo:
W._userProfileCache['uNaoCarregado'] = { displayName: 'Nome Vivo', email: '', phone: '', photoURL: '' };
eq(W._displayName('uNaoCarregado', 'Maira'), 'Nome Vivo', 'perfil carregado → nome vivo do uid');

// Guest (participante SEM conta, sem uid) — única exceção física: não há perfil
// de onde resolver, então o nome do guest é usado.
eq(W._displayName('', 'Convidado Sem Conta'), 'Convidado Sem Conta', 'guest sem uid usa o nome (única exceção)');

// e-mail/telefone também só do perfil vivo
eq(W._emailForUid(PAULO), 'paulo@x.com', '_emailForUid lê e-mail do perfil vivo');
eq(W._nameForUid(PAULO), 'Paulo Oriente', '_nameForUid lê nome do perfil vivo');

console.log((fail ? '✗ ' + fail + ' falha(s) · ' : '') + '✓ ' + pass + ' ok — uid-name-display');
process.exit(fail ? 1 : 0);
