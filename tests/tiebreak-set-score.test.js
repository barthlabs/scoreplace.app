/* Gate canônico do TIE-BREAK no lançamento manual (dono, 18-jul): um set foi decidido por
 * tie-break sse o placar de GAMES difere por EXATAMENTE 1 e o perdedor tem >= (gamesPerSet-1).
 * Cobre TB em QUALQUER empate ≥ (gamesPerSet-1): 5-5→6-5, 6-6→7-6, 7-7→8-7 (Beach Tennis decide
 * em quadra). window._isTiebreakSetScore é a FONTE ÚNICA (revelar campos + salvar).
 *
 * FALHA no código antigo: o gate era `(s1===gamesPerSet-1+1 && s2===gamesPerSet-1)` = só 6-5 →
 * 7-6/8-7 NÃO abriam os campos de TB (bug do torneio real que foi a 6-6).
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

// set de 6 games — TB em qualquer empate ≥ 5-5
ok(TB(6, 5, 6) === true, '6-5 (TB no 5-5) → true');
ok(TB(5, 6, 6) === true, '5-6 → true');
ok(TB(7, 6, 6) === true, '7-6 (TB no 6-6, o que o antigo NÃO abria) → true');
ok(TB(6, 7, 6) === true, '6-7 → true');
ok(TB(8, 7, 6) === true, '8-7 (TB no 7-7) → true');
// NÃO é TB
ok(TB(6, 4, 6) === false, '6-4 (vitória normal, 2 games) → false');
ok(TB(7, 5, 6) === false, '7-5 (2 games) → false');
ok(TB(6, 0, 6) === false, '6-0 → false');
ok(TB(6, 6, 6) === false, '6-6 (empate, ninguém venceu) → false');
ok(TB(5, 5, 6) === false, '5-5 (empate) → false');
ok(TB(4, 3, 6) === false, '4-3 (perdedor 3 < 5) → false');
// set curto de 4 games — TB no 3-3 → 4-3
ok(TB(4, 3, 4) === true, 'set de 4: 4-3 (TB no 3-3) → true');
ok(TB(5, 4, 4) === true, 'set de 4: 5-4 (TB no 4-4) → true');
ok(TB(4, 2, 4) === false, 'set de 4: 4-2 → false');
// guardas
ok(TB(NaN, 5, 6) === false, 'NaN → false');
ok(TB('', '', 6) === false, 'vazio → false');
ok(TB(6, 5, undefined) === true, 'gamesPerSet ausente → default 6 → 6-5 true');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ tiebreak-set-score FALHOU'); process.exit(1); }
console.log('✅ tiebreak-set-score: OK');
