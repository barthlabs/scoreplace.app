/* Gate canônico do TIE-BREAK no lançamento manual (dono, 18-jul): o ORGANIZADOR define nas
 * configurações quantos games tem o set (`gamesPerSet`); o tie-break acontece no empate
 * gamesPerSet×gamesPerSet → placar final (gamesPerSet+1, gamesPerSet). Um set foi decidido por
 * TB sse |g1-g2|===1 E o perdedor tem EXATAMENTE gamesPerSet games. Ex.: gp6 → só 7-6 (não 6-5,
 * não 8-7); gp5 → só 6-5. window._isTiebreakSetScore é a FONTE ÚNICA (revelar campos + salvar).
 *
 * FALHA que este teste reproduz: o modelo `>= gamesPerSet-1` (v1.3.12) abria o TB no 6-5 e no
 * 8-7 pra um set de 6 games — ignorava o gatilho configurado pelo dono (6-6). Com `=== gp`,
 * 6-5 e 8-7 voltam a ser vitória normal / placar impossível; só o 7-6 configurado abre o TB.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }), addEventListener() {}, body: {}, location: { hash: '' } };
sandbox.location = { hash: '' }; sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = sandbox.showAlertDialog = sandbox.showConfirmDialog = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };
sandbox.AppStore = { tournaments: [], currentUser: null, isOrganizer: () => false, isCreator: () => false, logAction() {}, mutate() { return Promise.resolve(true); } };
sandbox._findTournamentById = () => null;

vm.createContext(sandbox);
const ROOT = path.join(__dirname, '..');
['js/views/identity-core.js', 'js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/bracket-ui.js']
  .forEach((rel) => vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel }));
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const TB = (a, b, gp) => W._isTiebreakSetScore(a, b, gp);

console.log('──── tiebreak-set-score ────');
ok(typeof W._isTiebreakSetScore === 'function', '_isTiebreakSetScore existe');

// set de 6 games (config): TB no 6-6 → final 7-6 (RESPEITA o gatilho da config, não "qualquer empate")
ok(TB(7, 6, 6) === true, 'gp6: 7-6 (TB no 6-6) → true');
ok(TB(6, 7, 6) === true, 'gp6: 6-7 → true');
ok(TB(6, 5, 6) === false, 'gp6: 6-5 NÃO é TB (o jogo continua até 6-6) → false');
ok(TB(8, 7, 6) === false, 'gp6: 8-7 NÃO (o set fecha em 7-6) → false');
ok(TB(6, 4, 6) === false, 'gp6: 6-4 (vitória normal) → false');
ok(TB(7, 5, 6) === false, 'gp6: 7-5 → false');
ok(TB(6, 6, 6) === false, 'gp6: 6-6 (empate, ninguém venceu) → false');
ok(TB(5, 5, 6) === false, 'gp6: 5-5 (empate) → false');
// set de 5 games (config): TB no 5-5 → final 6-5
ok(TB(6, 5, 5) === true, 'gp5: 6-5 (TB no 5-5) → true');
ok(TB(5, 6, 5) === true, 'gp5: 5-6 → true');
ok(TB(7, 6, 5) === false, 'gp5: 7-6 NÃO (o set fecha em 6-5) → false');
ok(TB(5, 4, 5) === false, 'gp5: 5-4 (perdedor 4 ≠ 5) → false');
// set de 4 games: TB no 4-4 → final 5-4
ok(TB(5, 4, 4) === true, 'gp4: 5-4 (TB no 4-4) → true');
ok(TB(4, 3, 4) === false, 'gp4: 4-3 NÃO (fecha em 5-4) → false');
// guardas
ok(TB(NaN, 6, 6) === false, 'NaN → false');
ok(TB('', '', 6) === false, 'vazio → false');
ok(TB(7, 6, undefined) === true, 'gamesPerSet ausente → default 6 → 7-6 true');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ tiebreak-set-score FALHOU'); process.exit(1); }
console.log('✅ tiebreak-set-score: OK');
