/* REGRESSÃO: phaseComplete de fase 0 armazenada em MATCHES TAGGEADOS (t.matches) — node tests/phase-complete-tagged.test.js
 *
 * Bug real (staging, Confra "BT Alta da Clínica"): fase 0 = Liga Rei/Rainha rodada única,
 * 78 jogos em t.matches (phaseIndex 0), t.rounds VAZIO, phases[0].rounds=1. phaseComplete
 * contava rodadas em t.rounds (0) vs needL=1 → SEMPRE false → torneio TRAVADO na fase 1
 * (nunca avança/sorteia a eliminatória). Fix: as travas de nº-de-rodadas só valem quando
 * há t.rounds; com jogos em t.matches vai direto pra "todos decididos".
 * Ver project_progress_end_multiphase, feedback_tests_must_reproduce_real_failure.
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function monMatch(gi, mi, P4, winnerTeam) {
  var t1 = mi === 0 ? [P4[0], P4[1]] : mi === 1 ? [P4[0], P4[2]] : [P4[0], P4[3]];
  var t2 = mi === 0 ? [P4[2], P4[3]] : mi === 1 ? [P4[1], P4[3]] : [P4[1], P4[2]];
  return {
    id: 'm' + gi + mi, phaseIndex: 0, bracket: 'monarch', isMonarch: true, monarchGroup: gi,
    team1: t1, team2: t2, p1: t1.join(' / '), p2: t2.join(' / '),
    winner: winnerTeam ? t1.join(' / ') : null, scoreP1: 6, scoreP2: 2
  };
}
function confra(allDecided) {
  var matches = [];
  [0, 1].forEach(function (gi) {
    var P4 = ['g' + gi + 'a', 'g' + gi + 'b', 'g' + gi + 'c', 'g' + gi + 'd'];
    for (var mi = 0; mi < 3; mi++) matches.push(monMatch(gi, mi, P4, allDecided));
  });
  return {
    id: 'CONFRA', currentPhaseIndex: 0, rounds: [], matches: matches,
    phases: [
      { name: 'Classificatórias', format: 'Liga', formatCode: 'liga', reiRainha: true, rounds: 1, source: { type: 'enrollment' } },
      { name: 'Elim', format: 'Eliminatórias Simples', formatCode: 'elim_simples', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } }
    ]
  };
}

// 1) Fase 0 Liga Rei/Rainha em t.matches, TODOS decididos → COMPLETA (destrava o avanço).
ok(E.phaseComplete(confra(true)) === true, 'Liga Rei/Rainha (jogos em t.matches) todos decididos → phaseComplete TRUE');

// 2) Um jogo pendente → NÃO completa.
(function () {
  var t = confra(true);
  t.matches[t.matches.length - 1].winner = null;
  ok(E.phaseComplete(t) === false, 'com 1 jogo pendente → phaseComplete FALSE');
})();

// 3) NÃO regride a trava incremental: Liga nativa (t.rounds) 1 de 3 rodadas → NÃO completa.
(function () {
  var t = {
    id: 'L', currentPhaseIndex: 0, matches: [],
    rounds: [{ status: 'complete', matches: [{ id: 'a', p1: 'X', p2: 'Y', winner: 'X' }] }],
    phases: [
      { name: 'Liga', format: 'Liga', formatCode: 'liga', rounds: 3, source: { type: 'enrollment' } },
      { name: 'Elim', format: 'Eliminatórias Simples', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankTo: 999 }] } }
    ]
  };
  ok(E.phaseComplete(t) === false, 'Liga incremental 1/3 rodadas (t.rounds) → phaseComplete FALSE (trava preservada)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-complete-tagged: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
