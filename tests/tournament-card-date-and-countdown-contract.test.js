'use strict';
/* Datas e logo do local são um bloco único no detalhe. A regressiva já
 * informa o início: o card da dashboard não pode repetir "Começa em X dias". */
const fs = require('fs');
const detail = fs.readFileSync('js/views/tournaments.js', 'utf8');
const dashboard = fs.readFileSync('js/views/dashboard.js', 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
const datesAt = detail.indexOf('Datas e logo do local formam um único bloco');
const countdownAt = detail.indexOf('Evento concentrado: a janela publicada manda no relógio');
const titleAt = detail.indexOf('Middle Left: Nome + Logo + Favorito');
const detailSlotAt = detail.indexOf('data-vlogo-pid', datesAt);
ok(datesAt >= 0 && detailSlotAt > datesAt && detailSlotAt < countdownAt, 'logo do local fica ao lado das datas no detalhe');
ok(detail.indexOf('data-vlogo-pid', titleAt) > datesAt, 'logo do local não fica mais preso ao título');
const dashboardDatesAt = dashboard.indexOf('Datas e logo do local. A regressiva logo abaixo');
const dashboardCountdownAt = dashboard.indexOf('if (isFinished) return \'\';', dashboardDatesAt);
const dashboardDateBlock = dashboard.slice(dashboardDatesAt, dashboardCountdownAt);
ok(!/tournament\\.starts(In|Today|Tomorrow)/.test(dashboardDateBlock), 'dashboard não duplica a regressiva com “Começa em”');
process.exit(failed ? 1 : 0);
