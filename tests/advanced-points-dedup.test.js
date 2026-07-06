/* Pontos Avançados — dedup de jogos duplicados (v4.4.113). Bug do dono: numa rodada
 * Rei/Rainha de 3 jogos, a pessoa aparecia com 6 participações e games acima do máximo
 * físico (28 ganhos, 18 perdidos). Causa: re-geração/re-sorteio criava CÓPIAS do mesmo
 * jogo com IDs diferentes (id carrega Date.now()); a dedup por id não pegava.
 * node tests/advanced-points-dedup.test.js
 *
 * FALHA no código antigo (conta 6/dobrado), PASSA no novo (dedup lógico → conta 3).
 */
const { window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + b + ', veio ' + a + ')'); }

// 3 jogos de um grupo Rei/Rainha (A,B,C,D). A joga os 3 (parceiro rotativo).
// gi = índice do grupo: a re-geração da MESMA rodada põe os mesmos 4 num gi DIFERENTE
// (0 na 1ª geração, 1 na 2ª) — o dedup NÃO pode olhar o gi, só os times.
function games(idSuffix, gi) {
  gi = gi || 0;
  return [
    { id: 'g1-' + idSuffix, round: 1, monarchGroup: gi, isMonarch: true, team1: ['A', 'B'], team2: ['C', 'D'], p1: 'A / B', p2: 'C / D', winner: 'A / B', scoreP1: 6, scoreP2: 3 },
    { id: 'g2-' + idSuffix, round: 1, monarchGroup: gi, isMonarch: true, team1: ['A', 'C'], team2: ['B', 'D'], p1: 'A / C', p2: 'B / D', winner: 'A / C', scoreP1: 6, scoreP2: 2 },
    { id: 'g3-' + idSuffix, round: 1, monarchGroup: gi, isMonarch: true, team1: ['A', 'D'], team2: ['B', 'C'], p1: 'A / D', p2: 'B / C', winner: 'B / C', scoreP1: 4, scoreP2: 6 }
  ];
}

function mkT(matches) {
  return {
    format: 'Rei/Rainha',
    advancedScoring: {
      enabled: true, applyLiveScoring: false,
      categories: {
        participation: { enabled: true, value: 100 },
        match_won: { enabled: true, value: 50 },
        game_won: { enabled: true, value: 10 },
        game_lost: { enabled: true, value: -5 }
      }
    },
    rounds: [{ round: 1, format: 'rei_rainha', matches: matches }]
  };
}

function sumCount(result, key) {
  var c = 0;
  (result.breakdown || []).forEach(function (mb) { (mb.items || []).forEach(function (it) { if (it.key === key) c += it.count; }); });
  return c;
}

// ── 1. SEM duplicata: baseline correto (A: 3 participações, 16 ganhos, 11 perdidos) ──
(function () {
  var r = W._calcAdvancedPoints(mkT(games('a')), 'A', null);
  eq(sumCount(r, 'participation'), 3, 'baseline: 3 participações (3 jogos)');
  eq(sumCount(r, 'match_won'), 2, 'baseline: 2 vitórias (g1, g2)');
  eq(sumCount(r, 'game_won'), 16, 'baseline: 16 games ganhos (6+6+4)');
  eq(sumCount(r, 'game_lost'), 11, 'baseline: 11 games perdidos (3+2+6)');
})();

// ── 2. COM duplicata (mesmos jogos, IDs E grupo DIFERENTES): NÃO pode dobrar ──
// Reproduz o caso REAL: a re-geração põe a cópia no grupo 1 (o original é grupo 0).
(function () {
  var dup = games('a', 0).concat(games('b', 1)); // 3 reais (gi=0) + 3 cópias (gi=1, ids diferentes)
  var r = W._calcAdvancedPoints(mkT(dup), 'A', null);
  eq(sumCount(r, 'participation'), 3, 'DUP: participações continuam 3 (não 6) — dedup lógico');
  eq(sumCount(r, 'match_won'), 2, 'DUP: vitórias continuam 2 (não 4)');
  eq(sumCount(r, 'game_won'), 16, 'DUP: games ganhos continuam 16 (não 32)');
  eq(sumCount(r, 'game_lost'), 11, 'DUP: games perdidos continuam 11 (não 22)');
})();

// ── 3. _appendCanonicalColumn não re-appenda jogos já presentes (guarda na fonte) ──
(function () {
  var t = { rounds: [] };
  var g = games('x', 0);
  W._appendCanonicalColumn(t, { phase: 'monarch', round: 1, format: 'rei_rainha', matches: g.slice(), monarchGroups: [{ players: ['A', 'B', 'C', 'D'], matches: g.slice() }] });
  // 2ª chamada com os MESMOS jogos (re-sorteio) — ids E grupo (gi=1) diferentes, mesma identidade lógica.
  var g2 = games('y', 1);
  W._appendCanonicalColumn(t, { phase: 'monarch', round: 1, format: 'rei_rainha', matches: g2.slice(), monarchGroups: [{ players: ['A', 'B', 'C', 'D'], matches: g2.slice() }] });
  eq(t.rounds[0].matches.length, 3, 'append 2× a mesma rodada NÃO duplica jogos (3, não 6)');
  eq((t.rounds[0].monarchGroups || []).length, 1, 'append 2× NÃO duplica o grupo monarca (1, não 2)');
})();

console.log((fail === 0 ? '✅' : '❌') + ' advanced-points-dedup: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
