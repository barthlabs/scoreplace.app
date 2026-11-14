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
const summary = require('../functions-autodraw/tournament-summary-core.js');

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

(function () {
  var t = confra();
  t.scheduleWindow = { days: [{ day: '2026-11-13', startTime: '08:00', endTime: '21:00' }],
    interleavedPlan: { schema: 1 } };
  t.phases[0].kind = 'classification';
  t.phases[1].kind = 'elimination';
  t.matches = [
    { id: 'class', phaseIndex: 0, p1: 'A', p2: 'B', winner: 'A', resultAt: '2026-11-13T12:00:00Z' },
    { id: 'final', phaseIndex: 1, p1: 'C', p2: 'D', winner: 'C', resultAt: '2026-11-13T23:00:00Z' }
  ];
  var gp = W._tournamentGamesPlan(t);
  ok(gp.totalPlanned === 2 && gp.totalDone === 2 && gp.complete,
    'chave já materializada conta jogos reais apesar do índice operacional antigo');
  ok(W._isContinuousClassificationTournament(t),
    'evento concentrado agrega classificatória e eliminatória na mesma contagem');
  var html = W._buildProgressInner(t);
  ok(/2\/2 (?:jogos|partidas) \(100%\)/.test(html), 'painel exibe todos os jogos do torneio');
  ok(!/fase 1 de 2|Torneio em andamento/.test(html), 'painel concluído não mostra fase fictícia nem andamento');
  ok(W._maybeFinishMultiPhase(t) && t.status === 'finished' && t.currentPhaseIndex === 1 && !!t.finishedAt,
    'último placar encerra o evento mesmo com índice operacional atrasado');
  ok(t.finishedAt === '2026-11-13T23:00:00.000Z',
    'relógio do torneio congela no último placar, mesmo se encerrar depois');
  var pending = confra();
  pending.scheduleWindow = t.scheduleWindow;
  pending.phases[0].kind = 'classification';
  pending.phases[1].kind = 'elimination';
  pending.matches = [
    { id: 'class', phaseIndex: 0, p1: 'A', p2: 'B', winner: 'A' },
    { id: 'final', phaseIndex: 1, p1: 'C', p2: 'D', winner: null }
  ];
  ok(!W._maybeFinishMultiPhase(pending) && pending.status !== 'finished',
    'final pendente não encerra o torneio');
})();

(function () {
  var t = confra();
  t.scheduleWindow = { interleavedPlan: { schema: 1 } };
  t.phases[0].kind = 'classification';
  t.phases[1].kind = 'elimination';
  t.matches = [];
  for (var i = 0; i < 146; i++) {
    t.matches.push({ id: 'game-' + i, phaseIndex: i < 108 ? 0 : 1,
      p1: 'A', p2: 'B', winner: 'A' });
  }
  var scored = function (id) { return { id: id, winnerKey: 'A', sets: [{ p1: 5, p2: 3 }] }; };
  t.phaseTieDecisions = { '0': {
    played: { choice: 'play', matches: [scored('tie-1'), scored('tie-2'), scored('tie-3'), scored('tie-4')] },
    skipped: { choice: 'draw', matches: [{ id: 'tie-unused', winnerKey: null, sets: [] }] },
    mirrored: { choice: 'play', matches: [scored('game-5')] }
  } };
  var gp = W._tournamentGamesPlan(t);
  ok(gp.totalPlanned === 150 && gp.totalDone === 150 && gp.complete,
    '146 jogos normais + 4 desempates disputados = 150 concluídos');
  ok(W._playedTournamentTieMatches(t).length === 4,
    'desempate não jogado ou já materializado não duplica a contagem');
  var card = summary.buildSummary(t, 'T150', summary.helpersDe(W));
  ok(card.matchesTotal === 150 && card.matchesDone === 150 && card.progressPct === 100,
    'cartão inicial usa o mesmo total do torneio contínuo');
  t.matches[145].winner = null;
  gp = W._tournamentGamesPlan(t);
  ok(gp.totalPlanned === 150 && gp.totalDone === 149 && !gp.complete,
    'último jogo ainda sem placar impede encerramento');
  t.history = [{ phaseTieDecision: { matches: [scored('tie-2'), scored('tie-archived')] } }];
  gp = W._tournamentGamesPlan(t);
  ok(gp.totalPlanned === 151 && gp.totalDone === 150,
    'desempate jogado e depois arquivado continua no total sem duplicar outro jogo');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' games-plan-multiphase: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
