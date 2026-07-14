/* REGRESSÃO: rodadas PLANEJADAS de uma fase 0 Pontos Corridos (Liga comum OU Rei/Rainha).
 * node tests/liga-phase0-rounds-cap.test.js
 *
 * DUAS regras se sobrepõem aqui. As duas têm rede abaixo — não confundir uma com bug da outra.
 *
 * (1) DERIVAR DO AGENDAMENTO (b1ffc887, 03/jul). Bug real da Confra staging
 *     (tour_1780009816637): phases[0]={formatCode:'liga', rounds:1, reiRainha:TRUE},
 *     drawFirstDate 2026-07-02, drawIntervalDays 1, endDate 2026-07-08T23:00, 110 inscritos,
 *     1 rodada sorteada (72 jogos). A janela ÷ intervalo = 7 rodadas, mas todo downstream lia
 *     phases[0].rounds=1 (resíduo congelado) → estimativa 72/88, relógio "tempo decorrido" e
 *     botão "Avançar" na 1ª rodada. SEM Nº configurado, as planejadas derivam do agendamento —
 *     mode-agnóstico (Rei/Rainha, sorteio simples, duplas formadas).
 *
 * (2) "Nº DE RODADAS MANDA" (501ebd14, 4.5.89-beta, 10/jul — pedido do dono). Quando
 *     phases[i].rounds está EXPLÍCITO ele é a INTENÇÃO e a janela de datas é só o LIMITE
 *     EXTERNO: planned = min(configurado, derivado). Caso real (staging "Ranking"
 *     tour_1783113349754): rounds=2 + fim 11/07 23:00 com sorteio diário desde 09/07 → janela
 *     comporta 3 → a barra dizia "RODADA 1 DE 3", ignorando o 2 digitado. O cap reconcilia no
 *     runtime, sem re-save. Isto REVERTE parcialmente (1): hoje o cache é teto CONFIÁVEL porque
 *     o save grava o N real (format2.js `rounds: cfg.rodadas.n` no ramo da classificatória Liga).
 *
 * ⚠️ HISTÓRIA: este arquivo passou 7 dias encodando só a regra (1) e falhava 4 asserts — a (2)
 *    entrou sem atualizar teste nenhum. Os asserts marcados [CAP] são a rede da (2): revertendo
 *    o `Math.min(_cfg, _derived)` de _phasePlannedRounds eles falham. Os marcados [DERIVA] são a
 *    rede da (1): ela só cede a um N explícito, nunca sumiu.
 *
 * Ver project_phase0_liga_rounds_from_field, project_liga_planned_rounds_strict_boundary,
 * project_progress_end_multiphase.
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

var PER = 72; // jogos por rodada (como no doc real da Confra)

// Reproduz o shape REAL da Confra. mode: 'monarch' | 'simple' (duplas formadas usa 'simple' —
// o que importa é o nº real de jogos por rodada, que o motor grava igual).
// opts.rounds: nº configurado em phases[0].rounds. OMITIDO = organizador não fixou N (deriva).
// opts.noSchedule: sem 1º sorteio/intervalo/fim (one-shot).
// opts.endDate: sobrescreve o fim da fase (pra fronteira estrita).
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
  var end = opts.noSchedule ? '' : (opts.endDate || '2026-07-08T23:00');
  var p0 = {
    name: 'Classificatórias', format: 'Liga', formatCode: 'liga', reiRainha: reiRainha,
    drawFirstDate: opts.noSchedule ? '' : '2026-07-02', drawIntervalDays: opts.noSchedule ? null : 1, drawManual: false
  };
  if (opts.rounds !== undefined) p0.rounds = opts.rounds; // omitido = sem N explícito
  return {
    id: 'C', name: 'Confra', currentPhaseIndex: 0, format: 'Liga', participants: participants,
    rounds: rounds, matches: [],
    drawFirstDate: opts.noSchedule ? '' : '2026-07-02', drawFirstTime: '19:00',
    drawIntervalDays: opts.noSchedule ? null : 1, drawManual: false,
    endDate: end,
    phases: [
      p0,
      { name: 'Eliminatórias Ouro e Prata', format: 'Eliminatórias Simples', formatCode: 'elim_simples', rounds: 19, drawFirstDate: '', drawManual: false }
    ]
  };
}

(function () {
  W.AppStore = W.AppStore || {}; W.AppStore.tournaments = [];

  // ── (1) DERIVA: sem N explícito, as planejadas vêm do agendamento ────────────────────────
  // Janela 02/07 19h → 08/07 23h ÷ 1d = 7. Este é o cenário Confra ORIGINAL, agora expresso
  // como "o organizador não fixou N" (o resíduo rounds:1 virou intenção legítima — ver (2)).

  // [DERIVA] 1) Rei/Rainha deriva 7 do agendamento.
  ok(W._phasePlannedRounds(confra(1, 'monarch'), 0) === 7, 'monarch sem N: planejadas=7 do agendamento — got ' + W._phasePlannedRounds(confra(1, 'monarch'), 0));

  // [DERIVA] 2) MODE-AGNÓSTICO: sorteio simples/duplas com o MESMO agendamento também dá 7.
  //   (3 fixes antigos atacaram só a Liga comum e nunca rodaram na fase Rei/Rainha.)
  ok(W._phasePlannedRounds(confra(1, 'simple'), 0) === 7, 'simple/duplas sem N: planejadas=7 (independe do modo) — got ' + W._phasePlannedRounds(confra(1, 'simple'), 0));

  // [DERIVA] 3) Auto-draw NÃO suprimido (cap 7 > 1 sorteada) → relógio regressivo pro próximo
  //   sorteio, não "tempo decorrido". (No bug antigo cap=1 → suprimido → tempo decorrido.)
  ok(W._suppressAutoDrawForPhases(confra(1, 'monarch')) === false, 'sem N: drawn=1 < cap 7 → auto-draw ATIVO');

  // [DERIVA] 4) Estimativa conta 7×72 na fase 0 (não 1×72). totalPlanned ≥ 504 (+fase 2).
  ok(W._tournamentGamesPlan(confra(1, 'monarch')).totalPlanned >= 7 * PER, 'sem N: estimativa fase 0 = 7×72=504 (+fase 2) — got ' + W._tournamentGamesPlan(confra(1, 'monarch')).totalPlanned);

  // ── (2) CAP: N explícito é a intenção; a janela é só o limite externo ────────────────────

  // [CAP] 5) N=2 com janela de 7 → 2 manda. (Sem o Math.min isto dá 7 = bug "RODADA 1 DE 3".)
  ok(W._phasePlannedRounds(confra(1, 'monarch', { rounds: 2 }), 0) === 2, '[cap] N=2 + janela 7 ⇒ planejadas=2 (Nº manda) — got ' + W._phasePlannedRounds(confra(1, 'monarch', { rounds: 2 }), 0));

  // [CAP] 6) Mode-agnóstico também no cap: sorteio simples com N=2 → 2.
  ok(W._phasePlannedRounds(confra(1, 'simple', { rounds: 2 }), 0) === 2, '[cap] simple: N=2 ⇒ planejadas=2 — got ' + W._phasePlannedRounds(confra(1, 'simple', { rounds: 2 }), 0));

  // [CAP] 7) N=1 explícito (o "resíduo" da Confra, se o org REALMENTE quis 1) → 1, e a fase
  //   acaba na 1ª rodada. É o preço aceito da regra (2): doc legado só reconcilia com re-save.
  ok(W._phasePlannedRounds(confra(1, 'monarch', { rounds: 1 }), 0) === 1, '[cap] N=1 explícito ⇒ planejadas=1');
  ok(W._suppressAutoDrawForPhases(confra(1, 'monarch', { rounds: 1 })) === true, '[cap] N=1 + drawn=1 ⇒ auto-draw suprimido (fase completa)');

  // 8) A janela CONTINUA sendo o limite externo: N=99 não inventa sorteio além do fim.
  ok(W._phasePlannedRounds(confra(1, 'monarch', { rounds: 99 }), 0) === 7, 'N=99 + janela 7 ⇒ planejadas=7 (janela limita) — got ' + W._phasePlannedRounds(confra(1, 'monarch', { rounds: 99 }), 0));

  // ── PISO, SUPRESSÃO, ONE-SHOT, FRONTEIRA ────────────────────────────────────────────────

  // 9) RODADA EXTRA empurra pra frente: 9 sorteadas > 7 planejadas ⇒ planejadas=9.
  ok(W._phasePlannedRounds(confra(9, 'monarch'), 0) === 9, 'rodada extra: 9 sorteadas > 7 ⇒ planejadas=9 — got ' + W._phasePlannedRounds(confra(9, 'monarch'), 0));

  // 10) O piso vale por cima do CAP: N=2 mas 9 sorteadas ⇒ 9 (rodada extra manual não some).
  ok(W._phasePlannedRounds(confra(9, 'monarch', { rounds: 2 }), 0) === 9, 'piso > cap: N=2 mas 9 sorteadas ⇒ planejadas=9 — got ' + W._phasePlannedRounds(confra(9, 'monarch', { rounds: 2 }), 0));

  // 11) Suprime quando ATINGE o planejado (7 sorteadas, cap 7) → aí sim acabou.
  ok(W._suppressAutoDrawForPhases(confra(7, 'monarch')) === true, 'drawn=7 == cap 7 → suprimido (fase completa)');

  // 12) SEM agendamento (one-shot: monarch/grupos sorteado de uma vez) → conta jogos REAIS,
  //   não deriva 7. Preserva o comportamento de games-plan-multiphase.
  ok(W._phasePlannedRounds(confra(1, 'monarch', { noSchedule: true, rounds: 1 }), 0) === 1, 'one-shot sem agendamento → planejadas=1 (rounds cacheado), não deriva 7');

  // 13) FRONTEIRA ESTRITA (project_liga_planned_rounds_strict_boundary): um sorteio agendado
  //   EXATAMENTE no fim da fase NUNCA dispara (o poller pula slot >= fim) → não conta.
  //   1º 02/07 19:00 + 1d, fim 08/07 19:00 = o 7º slot cai no fim ⇒ 6, não 7.
  ok(W._phasePlannedRounds(confra(1, 'monarch', { endDate: '2026-07-08T19:00' }), 0) === 6, 'fronteira estrita: slot exatamente no fim não conta ⇒ 6 — got ' + W._phasePlannedRounds(confra(1, 'monarch', { endDate: '2026-07-08T19:00' }), 0));

  // ── ESTIMATIVA consome as MESMAS planejadas ─────────────────────────────────────────────
  // Isola a fase 0 por DELTA: as duas fixtures só diferem no N da fase 0, então a simulação da
  // fase 2 (mesmos inscritos/config) é idêntica e cancela na subtração.

  // 14) [CAP] Barra respeita o cap: de N=2 pra N=7 a estimativa cresce exatamente 5×72.
  var planN2 = W._tournamentGamesPlan(confra(1, 'monarch', { rounds: 2 })).totalPlanned;
  var planN7 = W._tournamentGamesPlan(confra(1, 'monarch', { rounds: 7 })).totalPlanned;
  ok(planN7 - planN2 === 5 * PER, '[cap] estimativa usa as planejadas: N=7 − N=2 = 5×72=360 — got ' + (planN7 - planN2));

  // 15) Sem N explícito a estimativa bate com N=7 (deriva = 7): as duas contas convergem.
  var planNone = W._tournamentGamesPlan(confra(1, 'monarch')).totalPlanned;
  ok(planNone === planN7, 'sem N ≡ N=7 (deriva 7): estimativa idêntica — got ' + planNone + ' vs ' + planN7);

  // 16) Gate do "Avançar" é alimentado pelo MESMO _phasePlannedRounds (need): com 1 de 7
  //   rodadas o need não é atingido → botão escondido. (O ramo "todos os jogos decididos" do
  //   phaseComplete depende da estrutura de grupos e é coberto por phase-complete-tagged.)
  //   Aqui garantimos que o valor que o gate consome é o derivado/capado — vide asserts acima.
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' liga-phase0-rounds-cap: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
