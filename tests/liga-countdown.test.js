/* COUNTDOWN da Liga — estados do box "Início da temporada / Próximo sorteio / Rodada em
 * andamento / Fim do torneio". node tests/liga-countdown.test.js
 *
 * Trava window._ligaCountdownEvent(t) — a FONTE ÚNICA da decisão (tournaments.js E dashboard.js
 * chamam DAQUI). Antes, a lógica era duplicada inline nos 2 render sites, sem teste → "vive
 * regredindo" (dono, jul/2026). Este teste é a rede.
 *
 * BUG REAL reproduzido (staging tour_1783113349754, Ranking multi-fase): rounds=0 (NÃO sorteado),
 * startDate JÁ passou, drawFirstDate no FUTURO (1º sorteio ~6h), endDate dentro de 48h. O widget
 * mostrava "🏆 Fim do torneio 1d 23h" em vez da regressiva "🏁 Início da temporada" pro 1º
 * sorteio. Causa: passo 1 só olhava startDate (futuro), passo 2 travado por sorteioRealizado →
 * caía no passo 3 (fim ≤48h). Os asserts [BUG-A] falham se a correção do estado 1 for revertida.
 *
 * 2º bug [BUG-B]: sorteado, rodada ATIVA (rolando), fim dentro de 48h → mostrava "Fim do torneio"
 * escondendo "Rodada em andamento". Rodada rolando tem PRIORIDADE sobre o fim.
 *
 * Ver project_progress_end_multiphase, project_phase_round_awaiting_start.
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const now = Date.now();
const HOUR = 3600000, D = 86400000;
// ISO em hora LOCAL (sem Z) — o helper parseia strings sem Z como local (igual à prod, que
// guarda drawFirstDate/startDate/endDate em horário local). Usar toISOString (UTC) defasaria
// pelo fuso e o round-trip parse falharia — artefato de teste, não do código.
function iso(ms) { var d = new Date(ms), p = function (n) { return String(n).padStart(2, '0'); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); }

ok(typeof W._ligaCountdownEvent === 'function', '_ligaCountdownEvent existe');

// ── [BUG-A] Antes do 1º sorteio: startDate passou, 1º sorteio no futuro, fim ≤48h ──
// Espelha tour_1783113349754: Liga multi-fase, rounds=0, drawManual=true (planejado).
(function () {
  const t = {
    id: 'a', format: 'Liga', drawManual: true,
    drawFirstDate: iso(now + 6 * HOUR),        // 1º sorteio daqui ~6h (ISO com T)
    startDate: iso(now - 3 * HOUR),            // início já passou
    endDate: iso(now + 44 * HOUR),             // fim dentro das 48h (o "1d 23h" do print)
    currentPhaseIndex: 0,
    phases: [{ formatCode: 'liga', rounds: 3, reiRainha: true }, { formatCode: 'elim_simples', rounds: 1 }],
    rounds: [],
  };
  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind === 'first-draw', '[BUG-A] antes do 1º sorteio → first-draw (não tournament-end) — got ' + (e && e.kind));
  ok(e && Math.abs(e.ts - (now + 6 * HOUR)) < 2 * HOUR, '[BUG-A] regressiva mira o 1º sorteio (~+6h) — got ' + (e && iso(e.ts)));
  // [BUG-A2] O RÓTULO tem que dizer a verdade: startDate já passou ⇒ a temporada JÁ começou,
  // então NUNCA rotular de "Início da Temporada" (mentira reportada pelo dono, 17/jul).
  ok(e && e.labelKey === 'tourn.nextDraw', '[BUG-A2] rótulo = "Próximo sorteio" (o evento é o SORTEIO) — got ' + (e && e.labelKey));
  ok(e && e.labelKey !== 'tourn.ligaStart', '[BUG-A2] NUNCA "Início da Temporada" com startDate já passado');
  // 'first-draw' ≠ 'next-draw': sem rodada sorteada, o chamador não pode desenhar a linha
  // "Rodada em andamento" (o _ligaRoundInProgressRow cai no fallback do startDate e inventa).
  ok(e && e.kind !== 'next-draw', '[BUG-A2] kind first-draw (não next-draw) → sem linha de rodada fantasma');
})();

// ── [A2] startDate no futuro → conta pro startDate (comportamento de fase única preservado) ──
(function () {
  const t = { id: 'a2', format: 'Liga', startDate: iso(now + 5 * HOUR), endDate: iso(now + 10 * D), rounds: [] };
  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind === 'season-start' && Math.abs(e.ts - (now + 5 * HOUR)) < HOUR, '[A2] startDate futuro → season-start no startDate — got ' + (e && e.kind));
})();

// ── [BUG-B] Sorteado, rodada ATIVA (rolando), fim ≤48h, sem sorteio auto → rodada em andamento ──
(function () {
  const t = {
    id: 'b', format: 'Liga', drawManual: true,
    startDate: iso(now - 2 * D), endDate: iso(now + 40 * HOUR),   // fim dentro das 48h
    currentPhaseIndex: 0,
    phases: [{ formatCode: 'liga', rounds: 3 }, { formatCode: 'elim_simples', rounds: 1 }],
    rounds: [{ round: 1, matches: [{ p1: 'A / B', p2: 'C / D', startedAt: now - HOUR }] }], // sem winner = ativa
  };
  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind === 'round-in-progress', '[BUG-B] rodada rolando + fim ≤48h → round-in-progress (não tournament-end) — got ' + (e && e.kind));
})();

// ── [C] Sorteado, rodada ENCERRADA (todos resultados), fim ≤48h, sem sorteio → fim do torneio ──
(function () {
  const t = {
    id: 'c', format: 'Liga', drawManual: true,
    startDate: iso(now - 2 * D), endDate: iso(now + 20 * HOUR),
    phases: [{ formatCode: 'liga', rounds: 1 }],
    rounds: [{ round: 1, matches: [{ p1: 'A / B', p2: 'C / D', winner: 'A / B', startedAt: now - 2 * HOUR, resultAt: now - HOUR }] }],
  };
  const e = W._ligaCountdownEvent(t);
  ok(e && e.kind === 'tournament-end', '[C] rodada encerrada + fim ≤48h → tournament-end — got ' + (e && e.kind));
})();

// ── [D] Sorteado, auto-draw com próximo sorteio agendado → próximo sorteio ──
(function () {
  const t = {
    id: 'd', format: 'Liga', drawManual: false,
    drawFirstDate: iso(now - D).slice(0, 10), drawFirstTime: '08:00', drawIntervalDays: 1,
    startDate: iso(now - D), endDate: iso(now + 10 * D),   // fim longe
    phases: [{ formatCode: 'liga', rounds: 5 }],
    rounds: [{ round: 1, matches: [{ p1: 'A / B', p2: 'C / D', startedAt: now - HOUR }] }],
  };
  const nd = W._ligaNextDrawEventTs && W._ligaNextDrawEventTs(t);
  // só valida o estado se o agendamento realmente produz um próximo sorteio futuro (robustez)
  const e = W._ligaCountdownEvent(t);
  if (nd && nd > now) ok(e && e.kind === 'next-draw', '[D] auto + próximo sorteio agendado → next-draw — got ' + (e && e.kind));
  else ok(e && e.kind === 'round-in-progress', '[D] auto sem próximo slot futuro → round-in-progress — got ' + (e && e.kind));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' liga-countdown: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
