/* Seed da Eliminatória (núcleo canônico genTierBracket) — node tests/elim-seed.test.js
 * Trava o comportamento CORRETO (dono 27-jun): a chave é semeada 1×N a partir da ORDEM
 * de seed da origem (S1 = melhor), honrada DESDE A R1 — nada de "cross-seed na R2".
 * É o alvo pro qual a Eliminatória da Fase 0 vai ser roteada (largando o R2-cross-seed).
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const pairKey = (m) => [m.p1, m.p2].sort().join(' vs ');
function r1Pairs(res) {
  return res.matches.filter((m) => m.round === 1).map(pairKey).sort();
}
function seeds(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ displayName: 'S' + i }); return a; }

// ── 8 seeds (pot-2): 1×N desde a R1 ──────────────────────────────────────────
(function () {
  const r = E.genTierBracket(seeds(8), 'main', 'e8', 'bye');
  const got = r1Pairs(r);
  const want = ['S1 vs S8', 'S2 vs S7', 'S3 vs S6', 'S4 vs S5'].sort();
  ok(JSON.stringify(got) === JSON.stringify(want), '8 seeds → R1 = 1×N (S1-S8, S2-S7, S3-S6, S4-S5) [veio ' + JSON.stringify(got) + ']');
  // top seed (S1) e seed 2 (S2) NÃO se encontram na R1 (lados opostos da chave)
  ok(got.indexOf('S1 vs S2') === -1, '8 seeds → S1 e S2 em lados opostos (não jogam na R1)');
})();

// ── 4 seeds: S1-S4, S2-S3 ────────────────────────────────────────────────────
(function () {
  const r = E.genTierBracket(seeds(4), 'main', 'e4', 'bye');
  const got = r1Pairs(r);
  ok(JSON.stringify(got) === JSON.stringify(['S1 vs S4', 'S2 vs S3'].sort()), '4 seeds → R1 = S1-S4, S2-S3 [veio ' + JSON.stringify(got) + ']');
})();

// ── 6 seeds + BYE: os MELHORES seeds folgam (BYE), seeds altos honrados ───────
(function () {
  const r = E.genTierBracket(seeds(6), 'main', 'e6', 'bye'); // pow2=8 → 2 BYEs
  const byeWinners = r.matches.filter((m) => m.round === 1 && m.isBye).map((m) => m.winner).sort();
  // slots[0],[1] (S1,S2) enfrentam slots[7],[6] = vazios → BYE → S1 e S2 folgam (cabeças)
  ok(byeWinners.indexOf('S1') !== -1 && byeWinners.indexOf('S2') !== -1, '6 seeds + BYE → os 2 melhores (S1,S2) folgam [byes ' + JSON.stringify(byeWinners) + ']');
  // conservação: todos os 6 aparecem na R1 (como jogador real ou vencedor de BYE)
  const real = {};
  r.matches.filter((m) => m.round === 1).forEach((m) => { [m.p1, m.p2].forEach((p) => { if (p && p !== 'BYE' && p !== 'TBD') real[p] = 1; }); });
  ok(Object.keys(real).length === 6, '6 seeds + BYE → todos os 6 na R1 (ninguém some)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' elim-seed: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
