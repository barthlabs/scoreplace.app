/* A PRIMEIRA rodada é SEMPRE R1 — nunca R0 (dono, 18/jul). No modelo a repescagem/play-in
 * usa m.round=0 (o bracket 'upper' começa em round 0 = "R1 upper"); os rótulos-satélite
 * (dashboard) mostravam o número CRU → "Rodada 0"/"R0". window._matchRoundDisplayNum(t,m)
 * devolve a POSIÇÃO 1-based da rodada no bracket do jogo (igual ao roundLabel do bracket),
 * então round 0 vira R1, oitavas (round 1) vira R2, etc. Formatos 1-based não mudam.
 *
 * FALHA no código antigo: os sites de exibição usavam m.round cru → 0 para a repescagem.
 */
const { window: W } = require('./headless'); // carrega tournaments-utils.js + bracket-model.js

let pass = 0, fail = 0;
const eq = (a, b, m) => { if (a === b) pass++; else { fail++; console.error('  ✗', m, '(esperado', JSON.stringify(b), 'veio', JSON.stringify(a) + ')'); } };
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── round-display-no-r0 ────');
ok(typeof W._matchRoundDisplayNum === 'function', '_matchRoundDisplayNum existe');

// PLAY-IN / REPESCAGEM: upper com rounds 0 (play-in), 1 (oitavas), 2 (quartas)...
(function () {
  const t = {
    id: 'pi', format: 'Eliminatórias Simples',
    matches: [
      { id: 'u0a', bracket: 'upper', round: 0, p1: 'A', p2: 'B', isPhaseRepR1: true },
      { id: 'u0b', bracket: 'upper', round: 0, p1: 'C', p2: 'D', isPhaseRepR1: true },
      { id: 'u1a', bracket: 'upper', round: 1, p1: 'W1', p2: 'W2' },
      { id: 'u2a', bracket: 'upper', round: 2, p1: 'X', p2: 'Y' },
    ],
  };
  const rep = t.matches[0];
  eq(rep.round, 0, 'pré-condição: a repescagem tem round=0 (valor cru que dava R0)');
  eq(W._matchRoundDisplayNum(t, rep), 1, 'repescagem (round 0) EXIBE como R1 (nunca R0)');
  eq(W._matchRoundDisplayNum(t, t.matches[2]), 2, 'oitavas (round 1) exibe como R2');
  eq(W._matchRoundDisplayNum(t, t.matches[3]), 3, 'round 2 exibe como R3');
})();

// LOWER (chave inferior) é 1-based: round 1 → R1
(function () {
  const t = {
    id: 'lo', format: 'Dupla Eliminatória',
    matches: [
      { id: 'l1', bracket: 'lower', round: 1, p1: 'A', p2: 'B' },
      { id: 'l2', bracket: 'lower', round: 2, p1: 'C', p2: 'D' },
    ],
  };
  eq(W._matchRoundDisplayNum(t, t.matches[0]), 1, 'lower round 1 → R1');
  eq(W._matchRoundDisplayNum(t, t.matches[1]), 2, 'lower round 2 → R2');
})();

// ELIMINATÓRIA NORMAL (sem play-in) — 1-based: nada muda
(function () {
  const t = {
    id: 'nm', format: 'Eliminatórias Simples',
    matches: [
      { id: 'n1', round: 1, p1: 'A', p2: 'B' },
      { id: 'n2', round: 1, p1: 'C', p2: 'D' },
      { id: 'n3', round: 2, p1: 'W', p2: 'X' },
      { id: 'nf', round: 3, p1: 'TBD', p2: 'TBD' },
    ],
  };
  eq(W._matchRoundDisplayNum(t, t.matches[0]), 1, 'normal round 1 → R1');
  eq(W._matchRoundDisplayNum(t, t.matches[2]), 2, 'normal round 2 → R2');
  eq(W._matchRoundDisplayNum(t, t.matches[3]), 3, 'normal round 3 → R3');
})();

// roundIndex (Liga/rounds) 0-based → +1
(function () {
  eq(W._matchRoundDisplayNum({ id: 'x', matches: [] }, { roundIndex: 0 }), 1, 'roundIndex 0 → R1');
  eq(W._matchRoundDisplayNum({ id: 'x', matches: [] }, { roundIndex: 4 }), 5, 'roundIndex 4 → R5');
})();

// sem round → 1 (nunca 0/vazio)
(function () {
  eq(W._matchRoundDisplayNum({ id: 'x', matches: [] }, {}), 1, 'sem round → R1');
  eq(W._matchRoundDisplayNum({ id: 'x', matches: [] }, { round: null }), 1, 'round null → R1');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ round-display-no-r0 FALHOU'); process.exit(1); }
console.log('✅ round-display-no-r0: OK');
