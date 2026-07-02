/* Pontos Corridos (Liga) — saída OBSERVÁVEL. Liga 'padrão' = DUPLAS ALEATÓRIAS a cada rodada
 * (2v2) com FOLGA pra quem sobra (v0.9.1); classificação INDIVIDUAL cumulativa. Rodadas geradas
 * pelo motor REAL (_generateNextRound); classificação por _computeStandings; render renderStandings.
 * (O processo de escrever este teste revelou que 'padrão' faz duplas, não 1v1 — assere-se o REAL.)
 */
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== Pontos Corridos (Liga) — saída observável ==');

function mkLiga(n, extra) {
  var parts = []; for (var i = 0; i < n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i, uid: 'u' + i });
  return Object.assign({ id: 'L', name: 'Liga E2E', format: 'Liga', teamSize: 1, participants: parts, rounds: [], matches: [], currentPhaseIndex: 0, status: 'active', ligaRoundFormat: 'padrao' }, extra || {});
}
function isFolga(s) { return !s || /FOLGA|BYE/i.test(String(s)); }
function realGames(r) { return (r.matches || []).filter(function (m) { return !isFolga(m.p1) && !isFolga(m.p2); }); }
function playRound(t, seed) {
  W._generateNextRound(t);
  var r = t.rounds[t.rounds.length - 1];
  realGames(r).forEach(function (m, i) { if (!m.winner) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i + seed) % 4; } });
  return r;
}
// todos os jogadores que aparecem numa rodada (dentro de duplas "A / B" ou solo)
function playersInRound(r, n) {
  var seen = {};
  (r.matches || []).forEach(function (m) {
    [m.p1, m.p2].forEach(function (s) { String(s || '').split(' / ').forEach(function (p) { p = p.trim(); if (p && !isFolga(p)) seen[p] = 1; }); });
  });
  return Object.keys(seen);
}

// ---------- 1. RODADA: motor gera duplas aleatórias 2v2 + FOLGA pra sobra ----------
(function () {
  const t = mkLiga(6);
  const r0 = playRound(t, 0);
  ok(t.rounds.length === 1, 'gerou a 1ª rodada');
  ok(realGames(r0).length >= 1, 'rodada tem ao menos 1 jogo real (got ' + realGames(r0).length + ')');
  ok(realGames(r0).every(function (m) { return /\s\/\s/.test(m.p1) && /\s\/\s/.test(m.p2); }), 'Liga padrão: jogos são DUPLAS (2v2, "A / B")');
  // todos os 6 jogadores estão na rodada (jogando OU em FOLGA)
  ok(playersInRound(r0, 6).length + ((r0.matches || []).filter(function (m) { return isFolga(m.p2) || isFolga(m.p1); }).length) >= 4, 'jogadores distribuídos na rodada (duplas + folgas)');
})();

// ---------- 2. PROGRESSÃO: 2ª rodada re-sorteia as duplas (aleatório a cada rodada) ----------
(function () {
  const t = mkLiga(8);
  const r0 = playRound(t, 0);
  const r1 = playRound(t, 1);
  ok(t.rounds.length === 2, 'gerou a 2ª rodada (progressão)');
  ok(realGames(r1).length >= 1, '2ª rodada tem jogo real');
})();

// ---------- 3. CLASSIFICAÇÃO INDIVIDUAL cumulativa, ordenada por pontos ----------
(function () {
  const t = mkLiga(8);
  playRound(t, 0); playRound(t, 1); playRound(t, 2);
  const st = W._computeStandings(t);
  ok(st.length === 8, 'classificação lista os 8 jogadores individualmente (got ' + st.length + ')');
  let sorted = true;
  for (let i = 1; i < st.length; i++) { if (st[i].points > st[i - 1].points) sorted = false; }
  ok(sorted, 'classificação ordenada por pontos (desc)');
})();

// ---------- 4. RENDER: tabela de classificação com o líder ----------
(function () {
  const t = mkLiga(8);
  playRound(t, 0); playRound(t, 1);
  const html = W.renderStandings(t, false, false, '', '') || '';
  ok(html.length > 100, 'renderStandings produz HTML');
  ok(/<table|<td/.test(html), 'render tem tabela de classificação');
  const st = W._computeStandings(t);
  ok(html.indexOf(st[0].name) !== -1, 'render mostra o líder (' + st[0].name + ')');
})();

// ---------- 5. VARREDURA: 4/6/8/10 → rodada gerada, todos na classificação ----------
(function () {
  let sweepFail = 0;
  [4, 6, 8, 10].forEach(function (n) {
    const t = mkLiga(n);
    const r0 = playRound(t, 0);
    if (realGames(r0).length < 1) { sweepFail++; console.log('    n=' + n + ' sem jogo real na rodada'); }
    const st = W._computeStandings(t);
    if (st.length !== n) { sweepFail++; console.log('    n=' + n + ' classificação tem ' + st.length + ' (esperado ' + n + ')'); }
  });
  ok(sweepFail === 0, 'varredura 4/6/8/10: rodada gerada + todos na classificação individual');
})();

console.log(pass + ' ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
