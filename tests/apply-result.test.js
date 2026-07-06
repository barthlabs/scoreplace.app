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

// ── 7. GSM multi-set (gsmFinal): best-of-3 aplica os sets pré-computados ──────
// Trava a extensão que permite _saveSetResult (GSM) persistir via commitResultTx
// (transação, re-aplicável no fresco) em vez de syncImmediate (doc inteiro).
(function () {
  const t = { format: 'Eliminatórias Simples', matches: [
    { id: 'g3', round: 1, p1: 'A', p2: 'B', nextMatchId: 'F', nextSlot: 'p1' },
    { id: 'F', round: 2, p1: 'TBD', p2: 'TBD' },
  ] };
  const sets = [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 3, gamesP2: 6 }, { gamesP1: 7, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 5 } }];
  const m = W._applyResultToTournament(t, 'g3', { gsmFinal: true, sets: sets, setsWonP1: 2, setsWonP2: 1, isFixedSet: false });
  eq(m.winner, 'A', 'gsmFinal: 2×1 sets → vencedor A');
  eq(m.setsWonP1, 2, 'gsmFinal: setsWonP1');
  ok(Array.isArray(m.sets) && m.sets.length === 3, 'gsmFinal: 3 sets gravados');
  eq(m.totalGamesP1, 16, 'gsmFinal: totalGamesP1 = 6+3+7');
  eq(m.totalGamesP2, 16, 'gsmFinal: totalGamesP2 = 4+6+6');
  eq(m.scoreP1, 2, 'gsmFinal: scoreP1 = sets ganhos (não-fixo)');
  eq(W._findMatch(t, 'F').p1, 'A', 'gsmFinal: vencedor avança pra final');
})();

// ── 8. NO-LOST-UPDATE: re-aplicar um jogo NÃO clobbera o resultado de OUTRO ──
// Essência da blindagem: commitResultTx re-aplica só a mutação do PRÓPRIO match
// sobre o doc FRESCO (que já tem o resultado do outro jogo). Antes, syncImmediate
// gravava o doc inteiro da `t` local (estale) e o 2º lançamento apagava o 1º.
// Aqui provamos que a mutação de m2 preserva m1 (o oposto do lost-update).
(function () {
  const t = { format: 'Eliminatórias Simples', matches: [
    { id: 'm1', round: 1, p1: 'A', p2: 'B', nextMatchId: 'F', nextSlot: 'p1' },
    { id: 'm2', round: 1, p1: 'C', p2: 'D', nextMatchId: 'F', nextSlot: 'p2' },
    { id: 'F', round: 2, p1: 'TBD', p2: 'TBD' },
  ] };
  // Jogador 1 lançou m1 (já persistido no doc "fresco").
  W._applyResultToTournament(t, 'm1', { s1: 6, s2: 1 });
  // Jogador 2 lança m2 GSM: a transação re-aplica m2 sobre o MESMO doc fresco.
  W._applyResultToTournament(t, 'm2', { gsmFinal: true, sets: [{ gamesP1: 6, gamesP2: 0 }, { gamesP1: 6, gamesP2: 2 }], setsWonP1: 2, setsWonP2: 0, isFixedSet: false });
  eq(W._findMatch(t, 'm1').winner, 'A', 'no-lost-update: resultado de m1 PRESERVADO após lançar m2');
  eq(W._findMatch(t, 'm2').winner, 'C', 'no-lost-update: m2 gravado');
  eq(W._findMatch(t, 'F').p1, 'A', 'no-lost-update: m1 avançou pra final (slot p1)');
  eq(W._findMatch(t, 'F').p2, 'C', 'no-lost-update: m2 avançou pra final (slot p2)');
})();

console.log((fail === 0 ? '✅' : '❌') + ' apply-result: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
