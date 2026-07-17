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

// ── PRINCÍPIO (dono, jul/2026): "Próximo sorteio" SE E SOMENTE SE o sorteio VAI acontecer.
// A fonte da verdade é a MESMA math do servidor (_nextOwedDrawMs → nextDrawAt → o cron do
// autoDraw). O relógio NUNCA re-deriva a data por conta própria. Dono: "não é para corrigir o
// exemplo. é para corrigir o código para que apresente o que deve conforme a situação".

// ── [BUG-A] Antes do 1º sorteio: startDate passou, 1º sorteio no futuro, fim ≤48h ──
// AUTO (drawManual:false + intervalo) ⇒ o sorteio VAI acontecer ⇒ tem que prometer.
(function () {
  const t = {
    id: 'a', format: 'Liga', drawManual: false, drawIntervalDays: 1,
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

// ── [MENTIRA-1] MANUAL: nada dispara sozinho ⇒ NUNCA prometer "Próximo sorteio" ──────────
// Dono: torneio manual mostrava "Próximo sorteio 4h" pra um sorteio que jamais ia disparar.
(function () {
  const t = {
    id: 'man', format: 'Liga', drawManual: true, drawIntervalDays: 1,
    drawFirstDate: iso(now + 6 * HOUR), startDate: iso(now - 3 * HOUR), endDate: iso(now + 20 * D),
    phases: [{ formatCode: 'liga', rounds: 3 }], rounds: [],
  };
  const e = W._ligaCountdownEvent(t);
  ok(!e || (e.kind !== 'first-draw' && e.kind !== 'next-draw'),
    '[MENTIRA-1] MANUAL não promete sorteio (nada dispara sozinho) — got ' + (e && e.kind));
})();

// ── [MENTIRA-2] Data do 1º sorteio no PASSADO, SEM intervalo (não repete) e JÁ disparou ──
// Caso real do Confra/staging: mostrava "Próximo sorteio 23h49m" sem existir próximo sorteio.
// `_calcNextDrawDate` fazia aritmética cega (1ª data + 1 dia); a math do servidor sabe que
// intervalo vazio = sorteio ÚNICO e que ele já foi (lastAutoDrawAt >= 1º sorteio) → null.
(function () {
  const t = {
    id: 'conf', format: 'Liga', drawManual: false,
    drawFirstDate: iso(now - 4 * HOUR).slice(0, 10), drawFirstTime: '00:01',
    drawIntervalDays: null,                       // sem repetição = sorteio único
    lastAutoDrawAt: iso(now - 3 * HOUR),          // e ele JÁ disparou
    startDate: iso(now - 4 * HOUR), endDate: iso(now + 14 * D), status: 'open',
    phases: [{ formatCode: 'liga', rounds: 1 }, { formatCode: 'elim_simples', rounds: 1 }], rounds: [],
  };
  ok(W._ligaNextDrawEventTs(t) == null, '[MENTIRA-2] sorteio único já disparado → _ligaNextDrawEventTs null');
  const e = W._ligaCountdownEvent(t);
  ok(!e || (e.kind !== 'first-draw' && e.kind !== 'next-draw'),
    '[MENTIRA-2] data passada + sem repetição + já disparou → NÃO promete sorteio — got ' + (e && e.kind));
})();

// ── [FONTE-ÚNICA] o relógio só promete o que o SERVIDOR vai disparar ────────────────────
// Se _ligaNextDrawEventTs divergir de _nextOwedDrawMs (a math do cron), o relógio volta a mentir.
(function () {
  const t = {
    id: 'src', format: 'Liga', drawManual: false, drawIntervalDays: 1,
    drawFirstDate: iso(now + 5 * HOUR), startDate: iso(now - D), endDate: iso(now + 30 * D),
    phases: [{ formatCode: 'liga', rounds: 5 }], rounds: [],
  };
  const owed = W._nextOwedDrawMs ? W._nextOwedDrawMs(t) : null;
  ok(owed != null, '[FONTE-ÚNICA] _nextOwedDrawMs (math do servidor) devolve o slot');
  ok(W._ligaNextDrawEventTs(t) === owed, '[FONTE-ÚNICA] o relógio usa EXATAMENTE o slot do servidor — got ' + W._ligaNextDrawEventTs(t) + ' vs ' + owed);
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
