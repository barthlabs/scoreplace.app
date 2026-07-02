/* Teste headless de window._applyResultToTournament (js/views/bracket-ui.js) —
 * a mutação PURA que a blindagem de concorrência extraiu de _saveResultInline.
 * Trava a correção FUNCIONAL no npm test (o teste de CORRIDA em si roda no
 * emulador via `npm run test:concurrency`, que precisa de Java).
 *
 * Loader próprio (não o headless.js compartilhado) porque precisa carregar
 * bracket-ui.js + stubs de DOM/idMap. É PURA lógica (sem Firestore), então vm
 * serve — o problema cross-realm só afeta objetos que vão pro SDK Firebase.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.document = {
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  addEventListener() {}, body: {},
};
sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.firebase = { functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }), firestore: () => ({}) };
sandbox.AppStore = { tournaments: [], currentUser: null };
// _idMap* por nome (suficiente pra checar o auto-check-in por nome)
sandbox._idMapKey = (t, who) => ({ uid: (who && who.uid) || '', name: typeof who === 'string' ? who : ((who && (who.displayName || who.name)) || '') });
sandbox._idMapGet = (t, map, who) => { const k = sandbox._idMapKey(t, who); return (k.name && map) ? map[k.name] : undefined; };
sandbox._idMapHas = (t, map, who) => !!sandbox._idMapGet(t, map, who);
sandbox._idMapSet = (t, map, who, v) => { const k = sandbox._idMapKey(t, who); if (k.name && map) map[k.name] = v; };
sandbox._idMapDel = (t, map, who) => { const k = sandbox._idMapKey(t, who); if (k.name && map) delete map[k.name]; };
sandbox._memberUidByName = () => '';
vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..');
['js/views/sport-rules.js', 'js/views/tournaments-utils.js', 'js/views/tournaments-categories.js',
 'js/views/bracket-model.js', 'js/views/bracket-logic.js', 'js/views/bracket-ui.js'].forEach((rel) => {
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), sandbox, { filename: rel });
});
const W = sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

ok(typeof W._applyResultToTournament === 'function', '_applyResultToTournament carregou');

// ── 1. Eliminatória: vencedor definido + advance pra final ───────────────────
(function () {
  const t = {
    format: 'Eliminatórias Simples',
    matches: [
      { id: 'sf1', round: 1, p1: 'A', p2: 'B', nextMatchId: 'fin', nextSlot: 'p1' },
      { id: 'sf2', round: 1, p1: 'C', p2: 'D', nextMatchId: 'fin', nextSlot: 'p2' },
      { id: 'fin', round: 2, p1: 'TBD', p2: 'TBD' },
    ],
  };
  const m = W._applyResultToTournament(t, 'sf1', { s1: 6, s2: 3 });
  eq(m.winner, 'A', 'elim: 6×3 → vencedor A');
  eq(m.draw, false, 'elim: não é empate');
  eq(m.scoreP1, 6, 'elim: scoreP1 gravado');
  eq(W._findMatch(t, 'fin').p1, 'A', 'elim: vencedor avança pro slot p1 da final');
})();

// ── 2. Empate permitido em grupo ─────────────────────────────────────────────
(function () {
  const t = {
    format: 'Fase de Grupos + Eliminatórias',
    groups: [{ matches: [{ id: 'g1', group: 0, p1: 'A', p2: 'B' }] }],
    matches: [{ id: 'g1', group: 0, p1: 'A', p2: 'B' }],
  };
  const m = W._applyResultToTournament(t, 'g1', { s1: 5, s2: 5 });
  eq(m.winner, 'draw', 'grupo: 5×5 → empate');
  eq(m.draw, true, 'grupo: draw=true');
})();

// ── 3. Empate permitido em rodada (Liga/Suíço) ───────────────────────────────
(function () {
  const t = {
    format: 'Liga',
    rounds: [{ matches: [{ id: 'r1', p1: 'A', p2: 'B' }] }],
  };
  const m = W._applyResultToTournament(t, 'r1', { s1: 3, s2: 3 });
  eq(m.winner, 'draw', 'rodada: 3×3 → empate');
})();

// ── 4. Eliminatória NÃO permite empate → define vencedor por placar ──────────
(function () {
  const t = { format: 'Eliminatórias Simples', matches: [{ id: 'e', round: 1, p1: 'A', p2: 'B' }] };
  const m = W._applyResultToTournament(t, 'e', { s1: 7, s2: 5 });
  eq(m.winner, 'A', 'elim: sempre há vencedor');
  eq(m.draw, false, 'elim: draw=false');
})();

// ── 5. GSM: sets/tiebreak gravados ───────────────────────────────────────────
(function () {
  const t = { format: 'Eliminatórias Simples', matches: [{ id: 'tb', round: 1, p1: 'A', p2: 'B' }] };
  const m = W._applyResultToTournament(t, 'tb', { s1: 7, s2: 6, useSets: true, isTiebreakEntry: true, tbP1: 7, tbP2: 5 });
  ok(Array.isArray(m.sets) && m.sets.length === 1, 'sets: um set gravado');
  eq(m.sets[0].gamesP1, 7, 'sets: gamesP1');
  ok(m.sets[0].tiebreak && m.sets[0].tiebreak.pointsP1 === 7, 'sets: tiebreak pointsP1 gravado');
  eq(m.setsWonP1, 1, 'sets: setsWonP1');
  eq(m.totalGamesP1, 7, 'sets: totalGamesP1 espelha games');
})();

// ── 6. Lançar resultado MARCA presença dos jogadores do match ────────────────
// Regra do dono (1-jul): quem JOGOU (resultado lançado) está presente. (O que NÃO
// pode é o SORTEIO marcar presença — isso é testado à parte no fluxo do sorteio.)
(function () {
  const t = { format: 'Eliminatórias Simples', matches: [{ id: 'c', round: 1, p1: 'A', p2: 'B' }] };
  W._applyResultToTournament(t, 'c', { s1: 6, s2: 2 });
  ok(t.checkedIn && t.checkedIn.A != null && t.checkedIn.B != null, 'checkin: lançar resultado marca ambos presentes');
})();

console.log((fail === 0 ? '✅' : '❌') + ' apply-result: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
