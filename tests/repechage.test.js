/* REPESCAGEM da Fase 0 (playin → _resolveRepechage) — node tests/repechage.test.js
 *
 * O phase-lifecycle já travou a CONSERVAÇÃO de entrantes nos modos bye/exclusion/standby/playin.
 * Aqui congela a MECÂNICA da repescagem 'playin': materializa a chave (round 0 = repescagem),
 * JOGA a R1 e verifica que `window._resolveRepechage` (phases-engine.js REAL) preenche os slots
 * da chave de T com o(s) MELHOR(es) PERDEDOR(es) (ordenado por saldo→score→seed):
 *   • n=6 → 3 jogos R1 + 1 vaga DIRETA (repDirect): melhor perdedor entra direto na chave de 4.
 *   • n=7 → 3 jogos R1 + 1 jogo de REPESCAGEM (repGame): satout × melhor perdedor.
 * Cobre também o gate "R1 não fechou" (não resolve antes) e idempotência (não re-resolve).
 */
const { E, window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = (g) => (g.players || []).map((p) => ({ name: p.name }));
function grpN(n) {
  const names = []; for (let i = 1; i <= n; i++) names.push('P' + i);
  return { players: names.map((x) => ({ name: x })), matches: [{ p1: names[0], p2: names[1], winner: names[0] }] };
}
function materialize(n) {
  const t = {
    id: 'rep' + n, currentPhaseIndex: 0, matches: [], groups: [grpN(n)],
    phases: [
      { name: 'G', formatCode: 'grupos_mata', source: { type: 'enrollment' } },
      { name: 'E', formatCode: 'elim_simples', fixedPairs: false, bracketResolution: 'playin', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } },
    ],
  };
  E.materializeNextPhase(t, cs, 'rep');
  return t;
}
const phaseMs = (t) => t.matches.filter((m) => (m.phaseIndex || 0) === 1);
const repR1 = (t) => phaseMs(t).filter((m) => m.isPhaseRepR1);
function findRep(t, a, b) {
  return repR1(t).find((m) => (m.p1 === a && m.p2 === b) || (m.p1 === b && m.p2 === a));
}
// joga um jogo da repescagem: 'a' vence 'b' por scoreA×scoreB (saldo do perdedor 'b' = scoreB-scoreA)
function playRep(t, a, b, scoreA, scoreB) {
  const m = findRep(t, a, b);
  m.winner = a;
  if (m.p1 === a) { m.scoreP1 = scoreA; m.scoreP2 = scoreB; } else { m.scoreP1 = scoreB; m.scoreP2 = scoreA; }
}

// ── n=6: melhor perdedor entra DIRETO (repDirect) ──────────────────────────
(function () {
  const t = materialize(6);
  ok(repR1(t).length === 3, '[n=6] 3 jogos de R1 de repescagem');
  // resolve ANTES de fechar a R1 → false (joga só 2 dos 3)
  playRep(t, 'P1', 'P6', 6, 0); // perdedor P6 saldo -6
  playRep(t, 'P2', 'P5', 6, 5); // perdedor P5 saldo -1 (MELHOR perdedor)
  ok(W._resolveRepechage(t, 'main') === false, '[n=6] não resolve com R1 incompleta (gate)');
  playRep(t, 'P3', 'P4', 6, 2); // perdedor P4 saldo -4
  ok(W._resolveRepechage(t, 'main') === true, '[n=6] resolve quando R1 fecha');
  // melhor perdedor = P5 → ocupa o slot direto (round 1 da chave de T), com tag FromRepechage
  const filled = phaseMs(t).filter((m) => m.round === 1 && (m.p1 === 'P5' || m.p2 === 'P5'));
  ok(filled.length === 1, '[n=6] melhor perdedor (P5) entrou na chave de T');
  ok(filled[0].p1FromRepechage || filled[0].p2FromRepechage, '[n=6] slot marcado FromRepechage');
  ok(!phaseMs(t).some((m) => m.repDirectP1 != null || m.repDirectP2 != null), '[n=6] sem slot repDirect pendente');
  ok(W._resolveRepechage(t, 'main') === false, '[n=6] idempotente (não re-resolve)');
})();

// ── n=7: satout × melhor perdedor no jogo de repescagem (repGame) ──────────
(function () {
  const t = materialize(7);
  const rg = phaseMs(t).filter((m) => m.isPhaseRepGame)[0];
  ok(!!rg && rg.p1 === 'P7', '[n=7] jogo de repescagem tem o satout (P7) como p1');
  ok(rg.p2 === 'TBD' || rg.p2 == null, '[n=7] adversário do satout ainda indefinido antes da R1');
  playRep(t, 'P1', 'P6', 6, 1); // P6 saldo -5
  playRep(t, 'P2', 'P5', 6, 5); // P5 saldo -1 (melhor)
  playRep(t, 'P3', 'P4', 6, 3); // P4 saldo -3
  ok(W._resolveRepechage(t, 'main') === true, '[n=7] resolve quando R1 fecha');
  ok(rg.p2 === 'P5', '[n=7] satout enfrenta o MELHOR perdedor (P5) no jogo de repescagem');
  ok(rg.repLoserRank == null, '[n=7] repLoserRank consumido (resolvido)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' repechage: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
