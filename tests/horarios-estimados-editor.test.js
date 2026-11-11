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
    'estimated-games-window-days':{ innerHTML:'', textContent:'', insertAdjacentHTML(){}, querySelector(){ return null; } }
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
  nodes['tourn-start-date'].value = '2026-11-13';
  nodes['tourn-end-date'].value = '2027-01-15';
  nodes['estimated-games-add-day'] = { value:'2027-01-14' };
  context.window._estimatedGameHoursState = { saved:null, valuesByDay:{}, categoryByKey:{}, touched:false, locked:false };
  context.window._renderEstimatedGameHours(true);
  ok(context.window._estimatedGameHoursState.mode === 'participants' && context.window._readEstimatedGameHours().mode === 'participants',
    'editar as datas de uma fase longa preserva a escolha dos participantes');
  context.window._setEstimatedScheduleMode('organizer');
  context.window._addEstimatedGameDay();
  const longResult = context.window._readEstimatedGameHours();
  ok(longResult.days.length === 2 && longResult.days[0].day === '2026-11-13' && longResult.days[1].day === '2027-01-14',
    'fase de dois meses usa somente os dias de jogo escolhidos');
  context.window._setEstimatedScheduleMode('participants');
  ok(context.window._readEstimatedGameHours().mode === 'participants', 'a escolha dos participantes é gravada explicitamente');
  context.window._estimatedGameHoursState = { saved:null, valuesByDay:{}, categoryByKey:{}, touched:false, locked:false, isNew:false };
  context.window._renderEstimatedGameHours();
  ok(context.window._readEstimatedGameHours().mode === 'participants',
    'ao salvar torneio legado sem modo a escolha exibida desliga a grade inferida');
  nodes['tourn-end-date'].value = '2026-11-13';
  context.window._estimatedGameHoursState = { saved:null, valuesByDay:{}, categoryByKey:{}, touched:false, locked:false, isNew:true };
  context.window._renderEstimatedGameHours();
  ok(context.window._estimatedGameHoursState.mode === 'participants' && context.window._readEstimatedGameHours().mode === 'participants',
    'torneio novo de um dia também exige escolha explícita e grava modo por participantes');
  context.window._setEstimatedScheduleMode('organizer');
  ok(context.window._readEstimatedGameHours().mode === 'organizer', 'o organizador pode escolher grade num torneio de um dia');
  nodes['tourn-end-date'].value = '2026-11-19';
  context.window._estimatedGameHoursState = { saved:null, valuesByDay:{}, categoryByKey:{}, touched:true, locked:false, mode:'organizer' };
  context.window._renderEstimatedGameHours();
  context.window._removeEstimatedGameDay('2026-11-14');
  ok(context.window._readEstimatedGameHours().days.length === 6,
    'em uma fase de uma semana o organizador pode retirar dias sem jogos');
}
ok(/scheduleWindow:Object\.assign\(\{\},\s*window\._editingTournament && window\._editingTournament\.scheduleWindow \|\| \{\}, estimatedGameHours/.test(source),
  'preserva a grade existente ao gravar a ordem na mesma chave do planejamento e do motor');
process.exit(failures ? 1 : 0);
