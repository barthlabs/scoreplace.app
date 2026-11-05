'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'index.js'), 'utf8');
const start = source.indexOf('function _pendingInitialScheduleExceedsWindow(');
const end = source.indexOf('\n// O marcador de revisão', start);
assert(start > 0 && end > start);
const drawWindow = require('./draw-core')._window;
const localDay = iso => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(new Date(iso));
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
};
const check = vm.runInNewContext(source.slice(start, end) + '\n_pendingInitialScheduleExceedsWindow', {
  drawWindow, _scheduleLocalDay:localDay, Date, Number, Array
});
const t = {
  startDate:'2026-10-22T18:00:00-03:00', endDate:'2026-10-22T22:40:00-03:00',
  scheduleWindow:{ days:[{ day:'2026-10-22', startTime:'18:00', endTime:'22:40', categoryFlow:'rounds' }] },
  gameDuration:25, callTime:5, warmupTime:5
};
const game = scheduledAt => ({ id:'game-1', requiredDay:'2026-10-22', scheduledAt });
assert.equal(check(t, { matches:[game('2026-10-22T21:30:00-03:00')] }), false);
assert.equal(check(t, { matches:[game('2026-10-22T22:15:00-03:00')] }), true);
assert.equal(check(t, { matches:[game('2026-10-23T00:10:00-03:00')] }), true);
assert.equal(check(t, { matches:[game(null)] }), false, 'chave sem agenda mantém publicação anterior');
assert.equal(check(t, { matches:[game('2026-10-22T21:30:00-03:00'),
  { id:'game-2', requiredDay:'2026-10-22' }] }), true, 'agenda parcial não oculta jogo sem horário');
const route = source.slice(source.indexOf('exports.resolvePendingDraw ='), source.indexOf('exports.setPendingInitialSchedule ='));
assert(route.indexOf('_pendingInitialScheduleExceedsWindow(t, pd.draft)') > 0);
assert(route.indexOf('_pendingInitialScheduleExceedsWindow(t, pd.draft)') < route.indexOf('_aplicaRascunhoDoSorteioInicial(t, pd.draft)'));
console.log('✓ publicação direta do rascunho recusa horário excedente antes de materializar a chave');
