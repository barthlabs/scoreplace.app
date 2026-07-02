/* REGRESSÃO: barra de progresso do TORNEIO INTEIRO prevê TODAS as fases — node tests/games-plan-multiphase.test.js
 *
 * Bug real (Confra staging): fase 0 = Rei/Rainha em t.matches (t.rounds vazio). O contador
 * _materializedPhaseGames(t,0) só olhava t.rounds → 0 jogos na fase 0 → o total mascarava a
 * eliminatória (totalP < done → totalP=done) → barra roxa 100% já na fase classificatória.
 * Fix: contar também os jogos taggeados phaseIndex 0 em t.matches. Assim totalPlanned soma
 * fase 0 (real) + fase seguinte (projetada pelo motor) → pct < 100 enquanto há eliminatória.
 * Ver project_progress_end_multiphase, project_phase_games_count.
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function mk(gi, mi, P4) {
  var t1 = mi === 0 ? [P4[0], P4[1]] : mi === 1 ? [P4[0], P4[2]] : [P4[0], P4[3]];
  var t2 = mi === 0 ? [P4[2], P4[3]] : mi === 1 ? [P4[1], P4[3]] : [P4[1], P4[2]];
  return { id: 'm' + gi + mi, phaseIndex: 0, bracket: 'monarch', isMonarch: true, monarchGroup: gi,
    team1: t1, team2: t2, p1: t1.join(' / '), p2: t2.join(' / '), winner: t1.join(' / '), scoreP1: 6, scoreP2: 2 };
}
function confra() {
  var matches = [];
  for (var gi = 0; gi < 3; gi++) { var P4 = ['g' + gi + 'a', 'g' + gi + 'b', 'g' + gi + 'c', 'g' + gi + 'd']; for (var mi = 0; mi < 3; mi++) matches.push(mk(gi, mi, P4)); }
  return { id: 'C', currentPhaseIndex: 0, rounds: [], matches: matches,
    phases: [
      { name: 'Classif', format: 'Liga', formatCode: 'liga', reiRainha: true, rounds: 1, source: { type: 'enrollment' } },
      { name: 'Elim', format: 'Eliminatórias Simples', formatCode: 'elim_simples', fixedPairs: true, pairingStrategy: 'top',
        source: { type: 'previous_phase', mapping: [{ dest: 'upper', label: 'Ouro', rankFrom: 1, rankTo: 999 }, { dest: 'lower', label: 'Prata', rankFrom: 1, rankTo: 999 }] } }
    ] };
}

(function () {
  var t = confra();
  W.AppStore = W.AppStore || {}; W.AppStore.tournaments = [t];
  var gp = W._tournamentGamesPlan(t);
  ok(gp.multiPhase === true, 'multi-fase detectado');
  ok(gp.totalPlanned > 9, 'total do torneio SOMA a eliminatória (fase 0 = 9 real + fase 1 projetada) — got ' + gp.totalPlanned);
  ok(gp.pct < 100, 'barra do torneio inteiro NÃO fica 100% na fase classificatória — got ' + gp.pct + '%');
  ok(gp.totalDone === 9, 'jogos feitos = 9 (fase 0)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' games-plan-multiphase: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
