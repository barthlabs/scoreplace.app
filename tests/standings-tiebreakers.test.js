/* CLASSIFICAÇÃO + TIEBREAKERS + GSM + CATEGORIA — node tests/standings-tiebreakers.test.js
 *
 * Congela a VARIÁVEL "critérios de desempate" (t.tiebreakers[]) e a "pontuação GSM"
 * (t.scoring.type==='sets') sobre o motor REAL de classificação `window._computeStandings`
 * (js/views/bracket-logic.js) via tests/headless.js. Cada critério é isolado num cenário
 * onde ELE é o decisivo (pares empatados nos pontos, separados só pelo critério em teste):
 *   pontos 3/0 · confronto_direto · saldo_pontos · saldo_sets · saldo_games (GSM) ·
 *   buchholz · sonneborn_berger · antiguidade · juventude · fallback de lista vazia ·
 *   filtro por categoria · acumulação numérica de sets/games (_accumulateGSM).
 *
 * Regra de produto respeitada: SEM EMPATE EM JOGO (todo jogo tem vencedor). Os empates aqui
 * são de CLASSIFICAÇÃO (mesmos pontos), que é o que os tiebreakers existem pra resolver.
 * (Por isso 'vitorias' não é testado isolado: sem empate-em-jogo, vitórias = pontos/3, colinear
 * com o critério primário — nunca difere. 'sorteio' é aleatório → sem assert determinístico.)
 */
const { window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const idx = (s, name) => s.findIndex((r) => r.name === name);
const row = (s, name) => s.find((r) => r.name === name);
function liga(parts, matches, extra) {
  return Object.assign({ participants: parts, rounds: [{ matches }] }, extra || {});
}

// ── 1. Pontos simples 3/0 + ordenação (sem empate) ─────────────────────────
(function () {
  const t = liga(['A', 'B', 'C'], [
    { p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 2 },
    { p1: 'A', p2: 'C', winner: 'A', scoreP1: 6, scoreP2: 1 },
    { p1: 'B', p2: 'C', winner: 'B', scoreP1: 6, scoreP2: 4 },
  ]);
  const s = W._computeStandings(t);
  ok(s.length === 3, '[pontos] 3 linhas');
  ok(row(s, 'A').points === 6 && row(s, 'A').wins === 2, '[pontos] A = 2V/6pts');
  ok(row(s, 'B').points === 3 && row(s, 'B').wins === 1, '[pontos] B = 1V/3pts');
  ok(row(s, 'C').points === 0 && row(s, 'C').losses === 2, '[pontos] C = 0/2D');
  ok(s[0].name === 'A' && s[1].name === 'B' && s[2].name === 'C', '[pontos] ordem A>B>C');
})();

// ── 2. confronto_direto resolve empate de pontos ───────────────────────────
(function () {
  // A,B empatam em 3 (1V2D); C,D em 6 (2V1D). A venceu B; C venceu D.
  const t = liga(['A', 'B', 'C', 'D'], [
    { p1: 'A', p2: 'B', winner: 'A' },
    { p1: 'A', p2: 'C', winner: 'C' },
    { p1: 'A', p2: 'D', winner: 'D' },
    { p1: 'B', p2: 'C', winner: 'B' },
    { p1: 'B', p2: 'D', winner: 'D' },
    { p1: 'C', p2: 'D', winner: 'C' },
  ], { tiebreakers: ['confronto_direto'] });
  const s = W._computeStandings(t);
  ok(row(s, 'A').points === 3 && row(s, 'B').points === 3, '[confronto] A,B empatados em 3');
  ok(idx(s, 'A') < idx(s, 'B'), '[confronto] A (venceu B) acima de B');
  ok(idx(s, 'C') < idx(s, 'D'), '[confronto] C (venceu D) acima de D');
  ok(idx(s, 'A') >= 2 && idx(s, 'B') >= 2, '[confronto] A,B abaixo do par de 6pts');
})();

// ── 3. saldo_pontos resolve empate ─────────────────────────────────────────
(function () {
  const t = liga(['A', 'B', 'C', 'D'], [
    { p1: 'A', p2: 'C', winner: 'A', scoreP1: 6, scoreP2: 0 }, // A diff +6
    { p1: 'B', p2: 'D', winner: 'B', scoreP1: 6, scoreP2: 4 }, // B diff +2
  ], { tiebreakers: ['saldo_pontos'] });
  const s = W._computeStandings(t);
  ok(row(s, 'A').points === 3 && row(s, 'B').points === 3, '[saldo_pontos] A,B empatados em 3');
  ok(row(s, 'A').pointsDiff === 6 && row(s, 'B').pointsDiff === 2, '[saldo_pontos] diffs +6/+2');
  ok(idx(s, 'A') < idx(s, 'B'), '[saldo_pontos] A (+6) acima de B (+2)');
})();

// ── 4. GSM: acumulação de sets/games + saldo_sets como desempate ───────────
(function () {
  const t = liga(['A', 'B', 'C', 'D'], [
    { p1: 'A', p2: 'C', winner: 'A', sets: [
      { gamesP1: 6, gamesP2: 4 }, { gamesP1: 6, gamesP2: 3 } ] },             // A 2-0, games 12-7
    { p1: 'B', p2: 'D', winner: 'B', sets: [
      { gamesP1: 6, gamesP2: 4 }, { gamesP1: 4, gamesP2: 6 }, { gamesP1: 6, gamesP2: 2 } ] }, // B 2-1, games 16-12
  ], { scoring: { type: 'sets' } });
  const s = W._computeStandings(t);
  const A = row(s, 'A'), B = row(s, 'B');
  ok(A.setsWon === 2 && A.setsLost === 0, '[GSM] A sets 2-0');
  ok(A.gamesWon === 12 && A.gamesLost === 7, '[GSM] A games 12-7');
  ok(B.setsWon === 2 && B.setsLost === 1, '[GSM] B sets 2-1');
  ok(B.gamesWon === 16 && B.gamesLost === 12, '[GSM] B games 16-12');
  ok(A.points === 3 && B.points === 3, '[GSM] A,B empatados em 3pts');
  ok(idx(s, 'A') < idx(s, 'B'), '[GSM] saldo_sets (default GSM): A (+2) acima de B (+1)');
})();

// ── 4b. GSM: saldo_games desempata quando saldo_sets empata ────────────────
(function () {
  const t = liga(['A', 'B', 'C', 'D'], [
    { p1: 'A', p2: 'C', winner: 'A', sets: [
      { gamesP1: 6, gamesP2: 4 }, { gamesP1: 4, gamesP2: 6 }, { gamesP1: 6, gamesP2: 0 } ] }, // 2-1, games 16-10 (+6)
    { p1: 'B', p2: 'D', winner: 'B', sets: [
      { gamesP1: 6, gamesP2: 4 }, { gamesP1: 3, gamesP2: 6 }, { gamesP1: 6, gamesP2: 4 } ] }, // 2-1, games 15-14 (+1)
  ], { scoring: { type: 'sets' } });
  const s = W._computeStandings(t);
  ok(row(s, 'A').setsWon - row(s, 'A').setsLost === row(s, 'B').setsWon - row(s, 'B').setsLost,
    '[GSM] saldo_sets empatado (+1 / +1)');
  ok(idx(s, 'A') < idx(s, 'B'), '[GSM] saldo_games desempata: A (+6) acima de B (+1)');
})();

// ── 5. buchholz resolve empate (força dos adversários) ─────────────────────
(function () {
  // A,B empatam em 3 (1V). A venceu C (forte, 6pts); B venceu D (fraco, 0pts).
  const t = liga(['A', 'B', 'C', 'D', 'E'], [
    { p1: 'A', p2: 'C', winner: 'A' },
    { p1: 'B', p2: 'D', winner: 'B' },
    { p1: 'C', p2: 'D', winner: 'C' },
    { p1: 'C', p2: 'E', winner: 'C' },
  ], { tiebreakers: ['buchholz'] });
  const s = W._computeStandings(t);
  ok(row(s, 'C').points === 6, '[buchholz] C = 6pts (topo)');
  ok(row(s, 'A').buchholz === 6 && row(s, 'B').buchholz === 0, '[buchholz] Buchholz A=6 / B=0');
  ok(idx(s, 'A') < idx(s, 'B'), '[buchholz] A (adversário forte) acima de B');
})();

// ── 5b. sonneborn_berger (mesma família, critério próprio) ─────────────────
(function () {
  const t = liga(['A', 'B', 'C', 'D', 'E'], [
    { p1: 'A', p2: 'C', winner: 'A' },
    { p1: 'B', p2: 'D', winner: 'B' },
    { p1: 'C', p2: 'D', winner: 'C' },
    { p1: 'C', p2: 'E', winner: 'C' },
  ], { tiebreakers: ['sonneborn_berger'] });
  const s = W._computeStandings(t);
  ok(row(s, 'A').sonnebornBerger === 6 && row(s, 'B').sonnebornBerger === 0,
    '[SB] Sonneborn-Berger A=6 / B=0');
  ok(idx(s, 'A') < idx(s, 'B'), '[SB] A (venceu adversário forte) acima de B');
})();

// ── 6. antiguidade vs juventude (MESMO dado, ordem OPOSTA) ─────────────────
(function () {
  const parts = [
    { name: 'A', birthDate: '01/01/1980' }, // mais velho
    { name: 'B', birthDate: '01/01/2000' }, // mais novo
    { name: 'C' }, { name: 'D' },
  ];
  const matches = [
    { p1: 'A', p2: 'C', winner: 'A', scoreP1: 6, scoreP2: 3 },
    { p1: 'B', p2: 'D', winner: 'B', scoreP1: 6, scoreP2: 3 },
  ];
  const sOld = W._computeStandings(liga(parts, matches, { tiebreakers: ['antiguidade'] }));
  ok(row(sOld, 'A').points === 3 && row(sOld, 'B').points === 3, '[idade] A,B empatados em 3');
  ok(idx(sOld, 'A') < idx(sOld, 'B'), '[antiguidade] mais velho (A/1980) acima');
  const sYoung = W._computeStandings(liga(parts, matches, { tiebreakers: ['juventude'] }));
  ok(idx(sYoung, 'B') < idx(sYoung, 'A'), '[juventude] mais novo (B/2000) acima (ordem oposta)');
})();

// ── 7. filtro por categoria isola a classificação ──────────────────────────
(function () {
  const parts = [
    { name: 'F1', category: 'Fem' }, { name: 'F2', category: 'Fem' },
    { name: 'M1', category: 'Masc' }, { name: 'M2', category: 'Masc' },
  ];
  const matches = [
    { p1: 'F1', p2: 'F2', winner: 'F1', category: 'Fem' },
    { p1: 'M1', p2: 'M2', winner: 'M1', category: 'Masc' },
  ];
  const t = liga(parts, matches);
  const fem = W._computeStandings(t, 'Fem');
  const masc = W._computeStandings(t, 'Masc');
  ok(fem.length === 2 && fem.every((r) => r.name[0] === 'F'), '[categoria] Fem só tem F1,F2');
  ok(masc.length === 2 && masc.every((r) => r.name[0] === 'M'), '[categoria] Masc só tem M1,M2');
  ok(row(fem, 'F1').points === 3 && row(fem, 'F2').points === 0, '[categoria] Fem pontua só jogos Fem');
})();

// ── 8. t.tiebreakers=[] cai no DEFAULT (não pula todos) ────────────────────
(function () {
  // mesmo cenário do confronto_direto, mas com lista VAZIA → default inclui confronto.
  const t = liga(['A', 'B', 'C', 'D'], [
    { p1: 'A', p2: 'B', winner: 'A' },
    { p1: 'A', p2: 'C', winner: 'C' },
    { p1: 'A', p2: 'D', winner: 'D' },
    { p1: 'B', p2: 'C', winner: 'B' },
    { p1: 'B', p2: 'D', winner: 'D' },
    { p1: 'C', p2: 'D', winner: 'C' },
  ], { tiebreakers: [] });
  const s = W._computeStandings(t);
  ok(idx(s, 'A') < idx(s, 'B'), '[fallback] lista vazia usa default → confronto resolve (A>B)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' standings-tiebreakers: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
