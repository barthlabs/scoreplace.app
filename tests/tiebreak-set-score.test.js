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
/* ⛔ A PORTA DA PERGUNTA "sou organizador?" MORA NO `store.js`, que este harness não
 * carrega — então ela é fornecida aqui, delegando no mock. Sem isto o arquivo migrado
 * chamaria `undefined` e o teste falharia por falta de infraestrutura, não por defeito.
 * A trava de `porta-unica-do-papel` reprova harness que mocke a regra e esqueça a porta. */
sandbox._souOrganizador = function (t) { return !!(sandbox.AppStore && typeof sandbox.AppStore.isOrganizer === 'function' && sandbox.AppStore.isOrganizer(t)); };

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

// Regressão E30: no jogo real, o 1º set era 6×5 (TB 7×5) e o 2º campo
// continha 65×1 em vez de 6×1. O jogo válido deve entrar; a digitação
// inválida deve identificar o set e os números lidos, sem gravar nada.
const scoring = { type: 'sets', setsToWin: 2, gamesPerSet: 6,
  tiebreakEnabled: true, tiebreakAt: 'g-1', superTiebreak: true };
ok(W._validateNormalSetScore(scoring, 'Beach Tennis', 6, 5).ok === true,
  'Beach Tennis configurado em 5×5 aceita 6×5');
ok(W._validateNormalSetScore(scoring, 'Beach Tennis', 6, 1).ok === true,
  '2º set 6×1 é válido');
ok(W._validateNormalSetScore(scoring, 'Beach Tennis', 65, 1).ok === false,
  '65×1 é rejeitado');
ok(W._normalSetGameInputCap(scoring, 'Beach Tennis') === 6,
  'set de 6 games com tie-break em 5×5 limita o campo a 6');
ok(W._normalSetGameInputCap({ type: 'sets', gamesPerSet: 11, tiebreakEnabled: false, countingType: 'numeric' }, 'Pickleball') === null,
  'pontuação numérica até 11 continua aceitando dois dígitos');
ok(W._normalSetGameInputCap({ type: 'sets', gamesPerSet: 6, tiebreakEnabled: false }, 'Tênis') === null,
  'set configurado para prorrogação sem tie-break continua aceitando 10×8');
const gameInput = { value: '6', dataset: {} };
W._limitNormalSetGameInput(gameInput, 6);
gameInput.value = '65';
W._limitNormalSetGameInput(gameInput, 6);
ok(gameInput.value === '6', 'segundo dígito é recusado imediatamente no campo de games');

const mid = 'jogo-e30';
const match = { id: mid, p1: 'Ana', p2: 'Bia' };
const tour = { id: 'torneio-e30', sport: 'Beach Tennis', scoring, matches: [match] };
W.AppStore.tournaments = [tour];
W._findTournamentById = () => tour;
W._findMatch = (_t, id) => id === mid ? match : null;
W._collectAllMatches = (t) => t.matches;
W._effectiveScoring = (t) => t.scoring;
let intermediate = 0, committed = null, alert = '';
W._saveSetsEmAndamento = (_tid, _id, sets, p1, p2) => {
  intermediate++;
  match.sets = sets;
  match.setsWonP1 = p1;
  match.setsWonP2 = p2;
  return Promise.resolve(true);
};
W._commitSetsResult = (_tid, _id, sets, p1, p2) => {
  committed = { sets, p1, p2 };
  return true;
};
W.showAlertDialog = (_title, detail) => { alert = detail; };
const firstPlan = W._matchSetPlan(scoring, match);
ok(firstPlan.live && firstPlan.live.i === 0 && firstPlan.columns.length === 1,
  'melhor de 3 vazio oferece apenas o primeiro set');
const first = W._confirmSetFromCard(tour.id, mid, {
  s1: 6, s2: 5, tbP1: 7, tbP2: 5, isTiebreakEntry: true,
  plan: firstPlan, scoring
});
Promise.resolve(first).then(() => {
  ok(intermediate === 1 && !committed && !match.winner && match.sets.length === 1,
    'primeiro set com tie-break grava e deixa a partida aberta');
  const reloaded = JSON.parse(JSON.stringify(match));
  const reloadedPlan = W._matchSetPlan(scoring, reloaded);
  ok(reloadedPlan.played.length === 1 && reloadedPlan.live && reloadedPlan.live.i === 1,
    'placar parcial serializado reabre no segundo set após recarga');
  const secondPlan = W._matchSetPlan(scoring, match);
  ok(secondPlan.live && secondPlan.live.i === 1 && secondPlan.columns.length === 2,
    'segundo set aparece após confirmar o primeiro');
  W._confirmSetFromCard(tour.id, mid, { s1: 6, s2: 1, plan: secondPlan, scoring });
  ok(committed && committed.p1 === 2 && committed.p2 === 0 && committed.sets.length === 2 &&
    committed.sets[0].tiebreak.pointsP1 === 7 &&
    committed.sets[1].gamesP1 === 6 && committed.sets[1].gamesP2 === 1,
    'segundo set fecha 2×0 sem perder o tie-break do primeiro');
  const invalid = W._validateNormalSetScore(scoring, tour.sport, 65, 1);
  ok(!invalid.ok && invalid.detail.includes('65'), '65×1 continua inválido no segundo set');
  const attrs = {};
  const field = (value) => ({ value, getAttribute(key) { return attrs[key] || null; },
    setAttribute(key, next) { attrs[key] = next; } });
  const liveFields = { ['s1-' + mid]: field('65'), ['s2-' + mid]: field('1') };
  W.document.getElementById = id => liveFields[id] || null;
  alert = '';
  W._warnGrossSetScore(mid);
  ok(alert.includes('65×1'), 'aviso ao sair do campo vivo identifica o placar inválido');
  console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
  if (fail > 0) { console.error('❌ tiebreak-set-score FALHOU'); process.exitCode = 1; }
  else console.log('✅ tiebreak-set-score: OK');
}).catch(e => { console.error(e); process.exitCode = 1; });
