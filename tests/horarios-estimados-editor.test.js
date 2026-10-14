'use strict';
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const start = source.indexOf('function _estimatedGameDays()');
const end = source.indexOf('function setupCreateTournamentModal()', start);
let failures = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failures++; }
ok(start >= 0 && end > start, 'controle diário usa as funções reais do editor');
if (start >= 0 && end > start) {
  const nodes = {
    'tourn-start-date':{ value:'2026-10-22' }, 'tourn-end-date':{ value:'2026-10-23' },
    'tourn-start-time':{ value:'18:00' }, 'tourn-end-time':{ value:'22:40' },
    'estimated-games-window-days':{ innerHTML:'', textContent:'', insertAdjacentHTML(){} }
  };
  const context = { window:{}, document:{ getElementById:id => nodes[id] || null }, Date, Object, Array, String };
  vm.runInNewContext(source.slice(start, end), context);
  context.window._estimatedGameHoursState = { saved:{ version:1, days:[
    { day:'2026-10-22', startTime:'18:00', endTime:'22:40', categoryFlow:'rounds' },
    { day:'2026-10-23', startTime:'18:00', endTime:'22:40', categoryFlow:'categories' }
  ] }, valuesByDay:{}, touched:false, locked:false };
  context.window._renderEstimatedGameHours();
  ok(context.window._readEstimatedGameHours() === null, 'abrir sem editar não envia campo obsoleto ao servidor');
  ok(nodes['estimated-games-window-days'].innerHTML.includes('22:40'), 'lê os horários salvos no documento');
  context.window._setEstimatedGameHour({ dataset:{ day:'2026-10-23', kind:'startTime' }, value:'08:00' });
  const result = context.window._readEstimatedGameHours();
  ok(result.days.length === 2 && result.days[1].startTime === '08:00' && result.days[0].endTime === '22:40', 'salva horários distintos por dia');
  ok(result.days[0].categoryFlow === 'rounds', 'preserva decisões do planejamento do sorteio');
  context.window._setEstimatedGameHour({ dataset:{ day:'2026-10-23', kind:'endTime' }, value:'07:00' });
  ok(!!context.window._readEstimatedGameHours().error, 'rejeita janela com fim antes do início');
  context.window._estimatedGameHoursState.locked = true;
  ok(context.window._readEstimatedGameHours() === null, 'não reescreve agenda depois do sorteio');
}
ok(/scheduleWindow:estimatedGameHours/.test(source), 'grava na mesma chave usada pelo planejamento e pelo motor');
process.exit(failures ? 1 : 0);
