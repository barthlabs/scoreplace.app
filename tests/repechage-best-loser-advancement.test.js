// REGRA DO DONO (jul/2026): na repescagem de 1 linha (fórmula mínima), o MELHOR derrotado pega a
// vaga que exige MENOS jogos até a final (avança mais) — repescar numa rodada mais baixa = mais
// jogos, então fica pros PIORES. Bug: o satout (rodada 0, mais jogos) pegava o rank 0 (melhor).
// Fix: _rankRepFillsByAdvancement reordena os ranks por altura da rodada de destino.
const H = require('./render-harness');
const W = H.sandbox, E = H.E;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
function mkPool(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ displayName: 'T' + i, name: 'T' + i, uid: 'u' + i, categories: ['C'] }); return a; }

function buildElim(n) {
  const cfg = { format: 'Eliminatórias Simples', formatCode: 'elim', teamSize: 1, bracketResolution: 'playin', source: { type: 'enrollment' }, categories: ['C'] };
  const t = { id: 'E' + n, format: 'Eliminatórias Simples', teamSize: 1, matches: [], currentPhaseIndex: 0 };
  const b = E.generatePhase(mkPool(n), cfg, { idPrefix: 'p' + n, ordered: true, t: t, isVip: function () { return false; }, catOf: function (e) { return (e.categories || [])[0]; } });
  E.storePhase(t, 0, b);
  return t;
}
function repFillRows(t) {
  const all = W._collectAllMatches(t);
  const rows = [];
  all.forEach(function (m) { if (Array.isArray(m.repFill)) m.repFill.forEach(function (rf) { if (rf.tagRep) rows.push({ round: m.round || 0, src: rf.srcRound, rank: rf.rank, sat: !!m.isPhaseRepGame }); }); });
  return rows;
}

console.log('── melhor derrotado → vaga com MENOS jogos (rank 0 na rodada MAIS ALTA) ──');
// N com 2+ repescados da MESMA rodada-fonte (o caso do dono).
[13, 21, 25].forEach(function (N) {
  const rows = repFillRows(buildElim(N));
  // agrupa por srcRound; onde há 2+, o rank 0 tem que estar na rodada MAIS ALTA de todas.
  const bySrc = {};
  rows.forEach(function (r) { (bySrc[r.src] = bySrc[r.src] || []).push(r); });
  let checkedMulti = false;
  Object.keys(bySrc).forEach(function (src) {
    const list = bySrc[src];
    if (list.length < 2) return;
    checkedMulti = true;
    const byRank = list.slice().sort(function (a, b) { return a.rank - b.rank; });
    // rank crescente ⇒ rodada NÃO-crescente (rank 0 = rodada mais alta = menos jogos)
    let mono = true;
    for (let i = 1; i < byRank.length; i++) { if (byRank[i].round > byRank[i - 1].round) mono = false; }
    ok(mono, 'N=' + N + ' srcRound=' + src + ': rank crescente → rodada decrescente (melhor=vaga mais alta) [' + byRank.map(function (r) { return 'r' + r.rank + '@round' + r.round; }).join(',') + ']');
    // o rank 0 NÃO pode ser o satout (rodada 0) quando existe vaga em rodada mais alta
    const rank0 = byRank[0];
    const maxRound = Math.max.apply(null, list.map(function (r) { return r.round; }));
    ok(rank0.round === maxRound, 'N=' + N + ' srcRound=' + src + ': rank 0 está na rodada MAIS ALTA (' + rank0.round + '===' + maxRound + '), não no satout');
  });
  ok(checkedMulti, 'N=' + N + ' :: tem 2+ repescados da mesma rodada (o caso testado)');
});

// caso 1 repescado só (N=11/15): rank 0 é o único — não quebra.
[11, 15].forEach(function (N) {
  const rows = repFillRows(buildElim(N));
  const bySrc = {};
  rows.forEach(function (r) { (bySrc[r.src] = bySrc[r.src] || []).push(r); });
  Object.keys(bySrc).forEach(function (src) { ok(bySrc[src].every(function (r) { return r.rank >= 0; }), 'N=' + N + ' srcRound=' + src + ': rank válido'); });
});

console.log('\n' + (fail === 0 ? '✅ repechage-best-loser-advancement: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach(function (f) { console.error('  ✗ ' + f); }); }
process.exit(fail > 0 ? 1 : 0);
