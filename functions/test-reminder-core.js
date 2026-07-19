/* Núcleo do lembrete de torneio (item 7) — janelas 7d/2d/0d que ESPELHAM o cliente
 * (_checkTournamentReminders). Data-only em BRT. Puro → testável sem emulador.
 *
 * Reproduz a falha: se a janela do servidor divergir do cliente (ex.: contar em UTC, ou
 * disparar em 3d/1d), o lembrete sai no dia errado ou não sai. Trava os dias exatos.
 */
const rc = require("./reminder-core");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  ✗", m); } };
console.log("──── reminder-core ────");

// now fixo: 2026-07-19T12:00:00Z (BRT 09:00, dia 19).
const NOW = Date.parse("2026-07-19T12:00:00Z");

const w7 = rc.reminderWindowFor("2026-07-26", NOW);
ok(w7 && w7.days === 7 && w7.level === "all" && w7.key === "r7d", "7 dias antes → r7d (all)");
const w2 = rc.reminderWindowFor("2026-07-21", NOW);
ok(w2 && w2.days === 2 && w2.level === "important" && w2.key === "r2d", "2 dias antes → r2d (important)");
const w0 = rc.reminderWindowFor("2026-07-19", NOW);
ok(w0 && w0.days === 0 && w0.level === "fundamental" && w0.key === "r0d", "no dia → r0d (fundamental)");

ok(rc.reminderWindowFor("2026-07-22", NOW) === null, "3 dias → null (fora da janela)");
ok(rc.reminderWindowFor("2026-07-20", NOW) === null, "1 dia → null");
ok(rc.reminderWindowFor("2026-07-27", NOW) === null, "8 dias → null");
ok(rc.reminderWindowFor("2026-07-18", NOW) === null, "passado → null");

// componente de hora é ignorado (data-only, igual ao cliente).
const wT = rc.reminderWindowFor("2026-07-19T20:30", NOW);
ok(wT && wT.days === 0, "startDate com hora → conta só a data");

// borda BRT: às 01:00 UTC (22:00 BRT do dia 19), "hoje" ainda é 19 em BRT.
const NOW_LATE = Date.parse("2026-07-20T01:00:00Z");
const wEdge = rc.reminderWindowFor("2026-07-26", NOW_LATE);
ok(wEdge && wEdge.days === 7, "borda BRT (UTC 01:00 = BRT 22:00 do dia anterior) → dia BRT certo");

// startDate inválido → null (defensivo).
ok(rc.reminderWindowFor("", NOW) === null, "vazio → null");
ok(rc.reminderWindowFor("amanhã", NOW) === null, "lixo → null");

// níveis (espelha _notifLevelAllowed).
ok(rc.notifLevelAllowed("todas", "all") === true, "todas aceita all");
ok(rc.notifLevelAllowed("importantes", "all") === false, "importantes recusa all");
ok(rc.notifLevelAllowed("importantes", "important") === true, "importantes aceita important");
ok(rc.notifLevelAllowed("fundamentais", "important") === false, "fundamentais recusa important");
ok(rc.notifLevelAllowed("none", "fundamental") === false, "none recusa tudo");

// mensagem por janela.
ok(rc.reminderMessage({ days: 7 }, "Copa").indexOf("semana") !== -1, "msg 7d fala em semana");
ok(rc.reminderMessage({ days: 0 }, "Copa").indexOf("hoje") !== -1, "msg 0d fala em hoje");

console.log("  " + pass + " asserts OK, " + fail + " falhas");
if (fail > 0) { console.error("❌ reminder-core FALHOU"); process.exit(1); }
console.log("✅ reminder-core: OK");
