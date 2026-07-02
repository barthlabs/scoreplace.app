/* AGENDAMENTO DE SORTEIO (auto/manual/data/intervalo/temporada) — node tests/draw-schedule.test.js
 *
 * Congela a MATEMÁTICA do auto-draw sobre o código REAL (tournaments-utils.js, já no harness):
 *   • `window._owedDrawSlotMs(firstDate, firstTime, intervalDays, lastFired, nowMs)` — núcleo PURO
 *     (todos os inputs explícitos, incl. nowMs → determinístico). Qual slot de sorteio está DEVIDO:
 *     fica <= now ENQUANTO pendente, avança pro próximo slot só DEPOIS de disparado (dedup por lastFired).
 *   • `window._nextOwedDrawMs(t, nowMs)` — os GATES: só Liga/Ranking auto (não-manual, com data, não
 *     encerrado) tem sorteio devido; cap pela temporada (`_ligaSeasonEndMs` = endDate/ligaSeasonMonths).
 * É a math que o autoDraw do servidor (where('nextDrawAt','<=',now)) e o poller do cliente compartilham.
 */
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const D = 86400000; // 1 dia em ms
// firstDraw fixo (BRT) — mesma conversão que a função usa internamente.
const FD = new Date('2026-07-01T19:00:00-03:00').getTime();

// ── A) _owedDrawSlotMs — núcleo PURO, timestamps fixos ───────────────────────
(function () {
  const f = W._owedDrawSlotMs;
  ok(typeof f === 'function', '[owed] _owedDrawSlotMs existe');

  // 1) primeiro sorteio ainda no futuro → o próprio firstDraw
  ok(f('2026-07-01', '19:00', 7, null, FD - D) === FD, '[owed] now < firstDraw → firstDraw');

  // 2) intervalo < 1 = SORTEIO ÚNICO (sem repetição)
  ok(f('2026-07-01', '19:00', 0, null, FD + 3600000) === FD, '[owed] único pendente (interval 0, não disparado) → firstDraw (devido)');
  ok(f('2026-07-01', '19:00', 0, FD, FD + 3600000) === null, '[owed] único JÁ disparado (lastFired>=firstDraw) → null');
  ok(f('2026-07-01', '19:00', 0, FD - D, FD + 3600000) === FD, '[owed] único: lastFired ANTES do firstDraw não conta → ainda devido');

  // 3) intervalo semanal (7d) — slot atual fica devido até disparar
  ok(f('2026-07-01', '19:00', 7, null, FD + 3 * D) === FD, '[owed] 7d, +3d, não disparado → slot 0 (firstDraw) devido');
  ok(f('2026-07-01', '19:00', 7, null, FD + 10 * D) === FD + 7 * D, '[owed] 7d, +10d, não disparado → slot 1 (firstDraw+7d) devido');
  ok(f('2026-07-01', '19:00', 7, FD + 7 * D, FD + 10 * D) === FD + 14 * D, '[owed] 7d, +10d, slot 1 JÁ disparado → próximo slot (firstDraw+14d)');
  ok(f('2026-07-01', '19:00', 7, FD, FD + 10 * D) === FD + 7 * D, '[owed] 7d, +10d, só slot 0 disparado → slot 1 ainda devido');

  // 4) intervalo como STRING (parseInt) e data inválida
  ok(f('2026-07-01', '19:00', '7', null, FD + 3 * D) === FD, '[owed] intervalDays string "7" = numérico');
  ok(f('data-invalida', '19:00', 7, null, FD) === null, '[owed] data inválida → null');

  // 5) horário default 19:00 quando ausente
  ok(f('2026-07-01', null, 7, null, FD - D) === FD, '[owed] firstTime ausente → default 19:00');
})();

// ── B) _nextOwedDrawMs — gates de torneio ────────────────────────────────────
(function () {
  const g = W._nextOwedDrawMs;
  ok(typeof g === 'function', '[next] _nextOwedDrawMs existe');
  const baseLiga = { format: 'Liga', drawFirstDate: '2026-07-01', drawFirstTime: '19:00', drawIntervalDays: 7 };
  const NOW = FD + 3 * D; // dentro do slot 0

  ok(g(Object.assign({}, baseLiga), NOW) === FD, '[next] Liga auto válida → slot devido (firstDraw)');
  ok(g({ format: 'Eliminatórias Simples', drawFirstDate: '2026-07-01', drawIntervalDays: 7 }, NOW) === null, '[next] não-Liga → null');
  ok(g(Object.assign({ drawManual: true }, baseLiga), NOW) === null, '[next] Liga MANUAL → null');
  ok(g({ format: 'Liga', drawIntervalDays: 7 }, NOW) === null, '[next] Liga sem drawFirstDate → null');
  ok(g(Object.assign({ status: 'finished' }, baseLiga), NOW) === null, '[next] Liga encerrada → null');
  ok(g(Object.assign({}, baseLiga, { format: 'Ranking' }), NOW) === FD, '[next] formato legado "Ranking" = Liga → slot devido');

  // dedup por lastAutoDrawAt
  ok(g(Object.assign({ lastAutoDrawAt: FD }, baseLiga), FD + 10 * D) === FD + 7 * D, '[next] slot 0 já sorteado (lastAutoDrawAt) → próximo devido');

  // temporada encerrada (endDate antes do slot devido) → null
  ok(g(Object.assign({ endDate: '2026-06-30' }, baseLiga), NOW) === null, '[next] temporada encerrada (endDate < slot) → null');
  // endDate DEPOIS do slot → continua devido
  ok(g(Object.assign({ endDate: '2026-12-31' }, baseLiga), NOW) === FD, '[next] endDate no futuro → slot devido normal');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' draw-schedule: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
