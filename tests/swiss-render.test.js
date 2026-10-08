/* Classificatória por rodadas — saída OBSERVÁVEL. Diferente da classificatória rotativa
 * (duplas aleatórias), entradas fixas se enfrentam 1v1 por pontuação, evitando
 * reencontros até esgotar os pares possíveis do cluster. Não existe um terceiro
 * tipo de fase chamado “suíço”: a fixture usa somente `kind:'classification'`.
 * Rounds-based (_generateNextRound REAL) + classificação (_computeStandings) + renderStandings REAL.
 */
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== Classificatória por rodadas — saída observável ==');

function mkSwiss(n, extra) {
  var parts = []; for (var i = 0; i < n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i, uid: 'u' + i });
  return Object.assign({
    id: 'S', name: 'Classificatória E2E', format: 'Eliminatórias Simples', teamSize: 1,
    participants: parts, rounds: [], matches: [], currentPhaseIndex: 0, status: 'active',
    phases: [{
      kind: 'classification', name: 'Classificatória', rounds: 3,
      classification: {
        structure: 'round_robin',
        pairing: { strategy: 'ranking_clusters', entryMode: 'fixed', clusterSize: 4, rematchPolicy: 'exhaust_cluster_before_repeat' }
      }
    }]
  }, extra || {});
}
function isFolga(s) { return !s || /FOLGA|BYE/i.test(String(s)); }
function realGames(r) { return (r.matches || []).filter(function (m) { return !isFolga(m.p1) && !isFolga(m.p2); }); }
function playRound(t, seed) {
  W._generateNextRound(t);
  var r = t.rounds[t.rounds.length - 1];
  realGames(r).forEach(function (m, i) { if (!m.winner) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i + seed) % 4; } });
  return r;
}
function key(m) { return [m.p1, m.p2].sort().join('|'); }

// ---------- 1. PAREAMENTO 1v1: floor(n/2) jogos, individuais (não duplas) ----------
(function () {
  const t = mkSwiss(8);
  const r0 = playRound(t, 0);
  ok(realGames(r0).length === 4, '8 jogadores → 4 jogos 1v1 na rodada (got ' + realGames(r0).length + ')');
  ok(realGames(r0).every(function (m) { return !/\s\/\s/.test(m.p1) && !/\s\/\s/.test(m.p2); }), 'classificatória de entradas fixas é 1v1 (não duplas)');
})();

// ---------- 2. SEM REMATCH: rodadas seguintes não repetem confronto ----------
(function () {
  const t = mkSwiss(8);
  const r0 = playRound(t, 0);
  const r1 = playRound(t, 1);
  ok(t.rounds.length === 2, 'gerou a 2ª rodada');
  const seen = {}; realGames(r0).forEach(function (m) { seen[key(m)] = 1; });
  const rematch = realGames(r1).some(function (m) { return seen[key(m)]; });
  ok(!rematch, 'classificatória NÃO repete confronto entre rodadas');
})();

// ---------- 3. CLUSTERS DINÂMICOS: a próxima rodada lê a classificação atual ----------
(function () {
  const t = mkSwiss(8);
  const r0 = playRound(t, 0);
  const before = W._computeStandings(t);
  const r1 = playRound(t, 1);
  const rank = {};
  before.forEach(function (entry, index) { rank[entry.name] = index; });
  const sameCurrentCluster = realGames(r1).every(function (m) {
    return Math.floor(rank[m.p1] / 4) === Math.floor(rank[m.p2] / 4);
  });
  ok(sameCurrentCluster, 'rodada seguinte respeita os clusters da classificação acumulada, não grupos fixos da inscrição');
})();

// ---------- 4. CONJUNTO FIXO: os mesmos N jogadores em todas as rodadas ----------
(function () {
  const t = mkSwiss(8);
  playRound(t, 0); playRound(t, 1);
  const players = function (r) { var s = {}; (r.matches || []).forEach(function (m) { [m.p1, m.p2].forEach(function (p) { if (!isFolga(p)) s[p] = 1; }); }); return Object.keys(s).sort().join(','); };
  ok(players(t.rounds[0]) === players(t.rounds[1]), 'mesmo conjunto de jogadores nas rodadas (conjunto FIXO)');
})();

// ---------- 5. RENDER: classificação com o líder ----------
(function () {
  const t = mkSwiss(8);
  playRound(t, 0); playRound(t, 1);
  const html = W.renderStandings(t, false, false, '', '') || '';
  ok(/<table|<td/.test(html), 'renderStandings tem tabela');
  const st = W._computeStandings(t);
  ok(st.length === 8, 'classificação lista os 8 (got ' + st.length + ')');
  ok(html.indexOf(st[0].name) !== -1, 'render mostra o líder (' + st[0].name + ')');
})();

// ---------- 6. VARREDURA 6/8/10: floor(n/2) jogos 1v1, sem rematch ----------
(function () {
  let sweepFail = 0;
  [6, 8, 10].forEach(function (n) {
    const t = mkSwiss(n);
    const r0 = playRound(t, 0), r1 = playRound(t, 1);
    if (realGames(r0).length !== Math.floor(n / 2)) { sweepFail++; console.log('    n=' + n + ' r0 jogos=' + realGames(r0).length + ' (esperado ' + Math.floor(n / 2) + ')'); }
    const seen = {}; realGames(r0).forEach(function (m) { seen[key(m)] = 1; });
    if (realGames(r1).some(function (m) { return seen[key(m)]; })) { sweepFail++; console.log('    n=' + n + ' rematch na r1'); }
  });
  ok(sweepFail === 0, 'varredura 6/8/10: floor(n/2) jogos 1v1, sem rematch');
})();

console.log(pass + ' ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
