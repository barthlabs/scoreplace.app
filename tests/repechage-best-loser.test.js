// REPESCADO = MELHOR DERROTADO. node tests/repechage-best-loser.test.js
//
// REGRA (dono, 27/jul/2026, Confra SB): "os repescados devem ser os melhores. tem 3
// equipes derrotadas de 6-4 na r1 ouro. os 2 primeiros na ordem dos jogos deveriam ter
// sido os repescados, considerando os critérios de desempate escolhidos pelo
// organizador, SEMPRE."
//
// A normalização da R2 escolhe as fontes por POSIÇÃO — no sorteio ninguém jogou, não
// existe "melhor". Quando a rodada-fonte FECHA, `_reassignBestLosersToRepechage` troca o
// ocupante pelos melhores derrotados via `_rankByTiebreakers`. Empate → ordem dos jogos.
//
// A troca é um SWAP SIMÉTRICO: o melhor sobe e quem sai vai EXATAMENTE para o lugar de
// onde o outro veio. A 1ª tentativa trocou só o lado de cima e reintroduziu o
// auto-confronto (self@lower) — quem saía ficava sem destino e quem subia seguia vivo na
// inferior. Ver [[project_repechage_selfmatch_systemic]].
const H = require('./render-harness');
const W = H.sandbox;
const A = W._chavesAdapter;

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'E' + (i + 1), uid: 'u' + (i + 1) }));
const r1De = (t) => t.matches.filter((m) => m.round === 1 && !m.isBye)
  .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
const repOcup = (t) => {
  const out = [];
  t.matches.forEach((m) => ['p1', 'p2'].forEach((s) => { if (m[s + 'FromRepechage'] && m[s] && m[s] !== 'TBD') out.push(m[s]); }));
  return out;
};
function mk(n, id) {
  const p = parts(n);
  const t = { id: id, format: 'Eliminatórias Simples', matches: A.build(n, 'simples', { participantes: p, ns: 'p0' }).matches, participants: p };
  W.AppStore.tournaments = [t];
  W._lastActiveTournamentId = t.id;
  return t;
}

console.log('── o MELHOR derrotado sobe, não o do primeiro jogo ──');
(function () {
  const t = mk(10, 'x');                       // R1 = 5 jogos → 5 sobem + 3 repescados = 8
  const r1 = r1De(t);
  const placar = [[6, 5], [6, 0], [6, 4], [6, 1], [6, 3]];
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = placar[i][0]; m.scoreP2 = placar[i][1]; m.resultAt = i + 1; W._advanceWinner(t, m); });
  const oc = repOcup(t);
  const rank = r1.map((m, i) => ({ n: m.p2, pts: placar[i][1] })).sort((a, b) => b.pts - a.pts);
  rank.slice(0, 3).forEach((x) => ok(oc.indexOf(x.n) !== -1, 'melhor derrotado ' + x.n + ' (' + x.pts + ' pts) foi repescado [' + oc.join(',') + ']'));
  ok(oc.indexOf(rank[rank.length - 1].n) === -1, 'o PIOR derrotado (' + rank[rank.length - 1].n + ') NÃO foi repescado');
})();

console.log('── empate total → ordem dos jogos (o caso do dono: todos 6-4) ──');
(function () {
  const t = mk(6, 'y');                        // R1 = 3 jogos → 3 sobem + 1 repescado = 4
  const r1 = r1De(t);
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 4; m.resultAt = i + 1; W._advanceWinner(t, m); });
  const oc = repOcup(t);
  ok(oc.length === 1, '1 slot de repescagem (got ' + oc.length + ')');
  ok(oc[0] === r1[0].p2, 'empate → sobe o derrotado do PRIMEIRO jogo (' + r1[0].p2 + '), got ' + oc[0]);
})();

console.log('── com a rodada EM CURSO ninguém é eleito (o nome não dança na tela) ──');
(function () {
  const t = mk(10, 'z');
  const r1 = r1De(t);
  [0, 1].forEach((i) => { const m = r1[i]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = i; m.resultAt = i + 1; W._advanceWinner(t, m); });
  ok(repOcup(t).length <= 2, 'rodada em curso: no máximo o que a aresta trouxe (got ' + repOcup(t).length + ')');
  r1.forEach((m, i) => { if (m.winner) return; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 5; m.resultAt = 10 + i; W._advanceWinner(t, m); });
  ok(repOcup(t).length === 3, 'fechada a rodada, os 3 slots preenchem (got ' + repOcup(t).length + ')');
})();

console.log('── UMA vida extra só, e sem double-book ──');
(function () {
  const t = mk(9, 'w');                        // N ímpar: sobra na R1 + repescados da R2
  const r1 = r1De(t);
  r1.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = i % 5; m.resultAt = i + 1; W._advanceWinner(t, m); });
  const oc = repOcup(t);
  ok(new Set(oc).size === oc.length, 'ninguém ocupa DOIS slots de repescagem [' + oc.join(',') + ']');
  const vivos = {}; let dup = null;
  t.matches.filter((m) => !m.winner).forEach((m) => ['p1', 'p2'].forEach((s) => {
    const v = m[s];
    if (!v || v === 'TBD' || /BYE/.test(String(v))) return;
    if (vivos[v]) dup = v; vivos[v] = 1;
  }));
  ok(!dup, 'nenhum double-book após a reatribuição (' + (dup || 'nenhum') + ')');
  const antes = repOcup(t).join(',');
  W._reassignBestLosersToRepechage(t); W._reassignBestLosersToRepechage(t);
  ok(repOcup(t).join(',') === antes, 'idempotente (' + antes + ' → ' + repOcup(t).join(',') + ')');
})();

console.log('\n' + (fail === 0 ? '✅ repechage-best-loser: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
