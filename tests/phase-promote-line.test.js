/* Promover linha (v4.4.111) — dirige o MOTOR REAL (buildPhaseBrackets). Quando o
 * organizador escolhe "Promover linha" (cfg._promoteLines=N), os N MELHORES da linha de
 * baixo sobem pra de cima (rebalanceia: cima +N, baixo −N). O promovido é o melhor de
 * baixo → entra como pior semente de cima. node tests/phase-promote-line.test.js
 */
var E = require('../js/views/phases-engine.js');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// cs por SCORE global (nome → wins). Escopo GERAL (1 grupo) → _globalStandings ranqueia.
function csScore(SCORE) {
  return function (g) {
    return (g.players || []).map(function (p) {
      var n = (typeof p === 'string') ? p : (p.name || p.displayName);
      return { name: n, displayName: n, wins: SCORE[n] || 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0 };
    }).sort(function (a, b) { return (b.wins || 0) - (a.wins || 0); });
  };
}
function cfgOverall(extra) {
  return Object.assign({
    name: 'Eliminatória', fixedPairs: false, pairingStrategy: 'top', bracketSeeding: 'seed', grandFinal: true, thirdPlace: false,
    source: { scope: 'overall', rankingBasis: 'individual', mapping: [{ dest: 'upper', label: 'Ouro' }, { dest: 'lower', label: 'Prata' }] }
  }, extra || {});
}
function entrantsInLine(res, lineLabel) {
  var names = {};
  (res.matches || []).forEach(function (m) {
    if (m.tierLabel !== lineLabel) return;
    [m.p1, m.p2].forEach(function (nm) { if (nm && nm !== 'TBD' && nm !== 'BYE') names[nm] = 1; });
  });
  return Object.keys(names);
}

// 8 competidores → Ouro 4 (A,B,C,D) / Prata 4 (E,F,G,H).
// NOTA: uma linha com 1 só entrante não gera jogos (genTierBracket → sole winner), então
// mantemos as linhas com ≥2 pra medir via matches; o guard (não-esvaziar) é medido pelo Ouro.
var SCORE = { A: 8, B: 7, C: 6, D: 5, E: 4, F: 3, G: 2, H: 1 };
function groups() { return [{ name: 'Geral', groupIdx: 0, players: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(function (n) { return { name: n, displayName: n }; }) }]; }

// ── 1. SEM promover: Ouro=4, Prata=4 ──
(function () {
  var res = E.buildPhaseBrackets(groups(), cfgOverall(), csScore(SCORE), 'np');
  var ouro = entrantsInLine(res, 'Ouro'), prata = entrantsInLine(res, 'Prata');
  ok(ouro.length === 4, 'sem promover: Ouro=4 [' + ouro.join(',') + ']');
  ok(prata.length === 4, 'sem promover: Prata=4 [' + prata.join(',') + ']');
})();

// ── 2. Promover 1: Ouro=5, Prata=3 — o MELHOR de baixo (E) sobe pra Ouro ──
(function () {
  var res = E.buildPhaseBrackets(groups(), cfgOverall({ _promoteLines: 1 }), csScore(SCORE), 'p1');
  var ouro = entrantsInLine(res, 'Ouro'), prata = entrantsInLine(res, 'Prata');
  ok(ouro.length === 5, 'promover 1: Ouro cresce pra 5 [' + ouro.join(',') + ']');
  ok(prata.length === 3, 'promover 1: Prata cai pra 3 [' + prata.join(',') + ']');
  ok(ouro.indexOf('E') !== -1, 'promover 1: o MELHOR de baixo (E) subiu pra Ouro');
  ok(prata.indexOf('E') === -1, 'promover 1: E não está mais na Prata');
  ok(prata.indexOf('F') !== -1 && prata.indexOf('G') !== -1 && prata.indexOf('H') !== -1, 'promover 1: F,G,H seguem na Prata');
})();

// ── 3. Promover 2 (acumulado): Ouro=6, Prata=2 — E e F sobem; G,H ficam ──
(function () {
  var res = E.buildPhaseBrackets(groups(), cfgOverall({ _promoteLines: 2 }), csScore(SCORE), 'p2');
  var ouro = entrantsInLine(res, 'Ouro'), prata = entrantsInLine(res, 'Prata');
  ok(ouro.indexOf('E') !== -1 && ouro.indexOf('F') !== -1, 'promover 2: E e F subiram pra Ouro');
  ok(prata.length === 2 && prata.indexOf('G') !== -1 && prata.indexOf('H') !== -1, 'promover 2: G e H (piores) seguem na Prata');
})();

// ── 4. Guard: promover além do possível NÃO esvazia a linha de baixo (para em 1) ──
(function () {
  // Prata começa com 4 → sobe no máx 3 (E,F,G), sobra H. Ouro = 4+3 = 7.
  var res = E.buildPhaseBrackets(groups(), cfgOverall({ _promoteLines: 9 }), csScore(SCORE), 'pmax');
  var ouro = entrantsInLine(res, 'Ouro');
  ok(ouro.length === 7, 'promover 9 (cap): Ouro=7, guard parou com 1 na Prata (não esvaziou) [' + ouro.length + ']');
})();

console.log((fail === 0 ? '✅' : '❌') + ' phase-promote-line: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
