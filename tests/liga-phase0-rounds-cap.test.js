/* REGRESSÃO: fase 0 Pontos Corridos deriva as rodadas do AGENDAMENTO (1º sorteio +
 * repetição + fim), INDEPENDENTE do modo (Rei/Rainha, sorteio simples, duplas formadas).
 * node tests/liga-phase0-rounds-cap.test.js
 *
 * Bug real (Confra staging tour_1780009816637): phase[0]={formatCode:'liga', rounds:1,
 * reiRainha:TRUE}, drawFirstDate 2026-07-02, drawIntervalDays 1, endDate 2026-07-08T23:00,
 * 110 inscritos, 1 rodada sorteada (72 jogos). A janela de 6 dias ÷ intervalo 1 = 7 rodadas,
 * mas TODO downstream lia phases[0].rounds=1 (resíduo congelado) → estimativa 72/88, relógio
 * "tempo decorrido" e botão "Avançar" na 1ª rodada. Pior: 3 fixes anteriores atacaram só a
 * Liga COMUM (_isMon0===false) e nunca rodaram nesta fase Rei/Rainha.
 * Fix: _phasePlannedRounds deriva do agendamento (mode-agnóstico), usado por estimativa
 * (_materializedPhaseGames), cap (_suppressAutoDrawForPhases) e avanço (phaseComplete).
 * Ver project_phase0_liga_rounds_from_field, project_progress_end_multiphase.
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

var PER = 72; // jogos por rodada (como no doc real)

// Reproduz o shape REAL da Confra. mode: 'monarch' | 'simple' (duplas formadas usa 'simple' —
// o que importa é o nº real de jogos por rodada, que o motor grava igual).
function confra(drawnRounds, mode, opts) {
  opts = opts || {};
  var reiRainha = (mode === 'monarch');
  var participants = [];
  for (var i = 0; i < 110; i++) participants.push({ uid: 'u' + i, displayName: 'P' + i });
  var rounds = [];
  for (var r = 0; r < drawnRounds; r++) {
    var matches = [];
    for (var m = 0; m < PER; m++) matches.push({ id: 'r' + r + 'm' + m, round: r + 1, isMonarch: reiRainha, monarchGroup: Math.floor(m / 3), p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 2 });
    var rd = { round: r + 1, matches: matches };
    if (reiRainha) rd.monarchGroups = [{}]; // marca a rodada como Rei/Rainha (isMonarch em phaseComplete)
    rounds.push(rd);
  }
  return {
    id: 'C', name: 'Confra', currentPhaseIndex: 0, format: 'Liga', participants: participants,
    rounds: rounds, matches: [],
    drawFirstDate: opts.noSchedule ? '' : '2026-07-02', drawFirstTime: '19:00',
    drawIntervalDays: opts.noSchedule ? null : 1, drawManual: false,
    endDate: opts.noSchedule ? '' : '2026-07-08T23:00',
    phases: [
      { name: 'Classificatórias', format: 'Liga', formatCode: 'liga', rounds: 1, reiRainha: reiRainha,
        drawFirstDate: opts.noSchedule ? '' : '2026-07-02', drawIntervalDays: opts.noSchedule ? null : 1, drawManual: false },
      { name: 'Eliminatórias Ouro e Prata', format: 'Eliminatórias Simples', formatCode: 'elim_simples', rounds: 19, drawFirstDate: '', drawManual: false }
    ]
  };
}

(function () {
  W.AppStore = W.AppStore || {}; W.AppStore.tournaments = [];

  // 1) RODADAS PLANEJADAS derivam do agendamento (janela 02/07 19h → 08/07 23h ÷ 1d = 7),
  //    NÃO do phases[0].rounds cacheado (=1). Vale pra Rei/Rainha.
  ok(W._phasePlannedRounds(confra(1, 'monarch'), 0) === 7, 'monarch: planejadas=7 do agendamento (não 1 cacheado) — got ' + W._phasePlannedRounds(confra(1, 'monarch'), 0));

  // 2) MODE-AGNÓSTICO: sorteio simples/duplas com o MESMO agendamento também dá 7.
  ok(W._phasePlannedRounds(confra(1, 'simple'), 0) === 7, 'simple/duplas: planejadas=7 (independe do modo)');

  // 3) Auto-draw NÃO suprimido (cap 7 > 1 sorteada) → relógio regressivo pro próximo sorteio,
  //    não "tempo decorrido". (No bug antigo cap=1 → suprimido → tempo decorrido.)
  ok(W._suppressAutoDrawForPhases(confra(1, 'monarch')) === false, 'monarch drawn=1 < cap 7 → auto-draw ATIVO');

  // 4) Estimativa do torneio conta 7×72 na fase 0 (não 1×72=72). totalPlanned ≥ 504.
  ok(W._tournamentGamesPlan(confra(1, 'monarch')).totalPlanned >= 7 * PER, 'estimativa fase 0 = 7×72=504 (+fase 2) — got ' + W._tournamentGamesPlan(confra(1, 'monarch')).totalPlanned);

  // 5) RODADA EXTRA empurra pra frente: 9 sorteadas > 7 planejadas ⇒ planejadas=9.
  ok(W._phasePlannedRounds(confra(9, 'monarch'), 0) === 9, 'rodada extra: 9 sorteadas > 7 ⇒ planejadas=9 — got ' + W._phasePlannedRounds(confra(9, 'monarch'), 0));

  // 6) Suprime quando ATINGE o planejado (7 sorteadas, cap 7) → aí sim acabou.
  ok(W._suppressAutoDrawForPhases(confra(7, 'monarch')) === true, 'drawn=7 == cap 7 → suprimido (fase completa)');

  // 7) Gate do "Avançar" é alimentado pelo MESMO _phasePlannedRounds (need=7): com 1 de 7
  //    rodadas o need não é atingido → botão escondido. (O ramo "todos os jogos decididos"
  //    do phaseComplete depende da estrutura de grupos e é coberto por phase-complete-tagged.)
  //    Aqui garantimos que o valor que o gate consome é 7, não o cacheado 1 — vide asserts 1/6.

  // 8) SEM agendamento (one-shot: monarch/grupos sorteado de uma vez) → conta jogos REAIS,
  //    não 7×72. Preserva o comportamento de games-plan-multiphase.
  ok(W._phasePlannedRounds(confra(1, 'monarch', { noSchedule: true }), 0) === 1, 'one-shot sem agendamento → planejadas=1 (rounds cacheado), não deriva 7');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' liga-phase0-rounds-cap: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
