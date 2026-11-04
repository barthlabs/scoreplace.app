'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { validate, assessGenerated } = require('./category-window-core');
const { _window: window } = require('./draw-core');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const day = '2026-11-13';
const t = {
  startDate:day + 'T08:00', endDate:day + 'T19:30', courtCount:2,
  combinedCategories:['Diamante', 'Ouro', 'Prata'], participants:[],
  scheduleWindow: { version:1, days:[{ day, startTime:'08:00', endTime:'19:30' }], categoryWindows:[
    { category:'Diamante', day, startTime:'08:00', endTime:'15:00' },
    { category:'Ouro', day, startTime:'09:30', endTime:'16:00' },
    { category:'Prata', day, startTime:'14:30', endTime:'19:30' }
  ] },
  matches: [
    { id:'d1', category:'Diamante', round:1, team1Uids:['a'], team2Uids:['b'] },
    { id:'d2', category:'Diamante', round:1, team1Uids:['c'], team2Uids:['d'] },
    { id:'o1', category:'Ouro', round:1, team1Uids:['e'], team2Uids:['f'] },
    { id:'p1', category:'Prata', round:1, team1Uids:['g'], team2Uids:['h'] }
  ]
};
assert.equal(validate(t, HttpsError).length, 3);
const plan = window._schGradeEstimada(t);
assert.equal(plan.cabe, true);
assert.equal(plan.slots.length, 4);
const byId = new Map(plan.slots.map(slot => [slot.matchId, slot]));
for (const [id, category] of [['d1','Diamante'],['d2','Diamante'],['o1','Ouro'],['p1','Prata']]) {
  const slot = byId.get(id), config = t.scheduleWindow.categoryWindows.find(item => item.category === category);
  const hhmm = new Date(slot.ms).toISOString().slice(11, 16);
  const start = new Date(day + 'T' + config.startTime + ':00-03:00').getTime();
  const end = new Date(day + 'T' + config.endTime + ':00-03:00').getTime();
  assert.ok(slot.ms >= start && slot.ms + 30 * 60000 <= end, id + ' respeita janela');
  assert.ok(hhmm);
}
const short = structuredClone(t);
short.courtCount = 1;
short.scheduleWindow.categoryWindows[0].endTime = '08:20';
assert.equal(window._schGradeEstimada(short).cabe, false, 'não publica chave fora da capacidade');
assert.throws(() => validate(Object.assign({}, t, { scheduleWindow: Object.assign({}, t.scheduleWindow, {
  categoryWindows:[{ category:'Ouro', day, startTime:'07:00', endTime:'09:00' }]
}) }), HttpsError), error => error.code === 'invalid-argument');
const outsidePhase = structuredClone(t);
outsidePhase.scheduleWindow.days.push({ day:'2026-11-14', startTime:'08:00', endTime:'19:30' });
outsidePhase.scheduleWindow.categoryWindows.push({ category:'Ouro', day:'2026-11-14', startTime:'09:30', endTime:'16:00' });
assert.throws(() => validate(outsidePhase, HttpsError), error =>
  error.code === 'invalid-argument' && /Ouro.*2026-11-14/.test(error.message),
  'janela não pode sair da data final da fase mesmo que o dia exista na grade');
assert.deepEqual(validate({ scheduleWindow:'legacy-invalid' }, HttpsError), [],
  'torneio antigo sem janelas por categoria mantém o comportamento anterior');
const unknownKey = structuredClone(t);
unknownKey.scheduleWindow.extra = 'silencioso';
assert.throws(() => validate(unknownKey, HttpsError), error => error.code === 'invalid-argument',
  'campo desconhecido na agenda com janelas é recusado');
const invalidDay = structuredClone(t);
invalidDay.scheduleWindow.days.push({ day:'2026-11-14', startTime:'20:00', endTime:'19:00' });
assert.throws(() => validate(invalidDay, HttpsError), error => error.code === 'invalid-argument',
  'dia inválido é recusado mesmo sem janela de categoria nesse dia');
const invalidEmpty = [];
invalidEmpty.categoryWindows = [];
assert.throws(() => validate({ scheduleWindow:invalidEmpty }, HttpsError), error => error.code === 'invalid-argument',
  'lista vazia explícita de janelas não legitima contêiner inválido');
assert.throws(() => validate({ scheduleWindow:{ version:1, days:[], categoryWindows:null } }, HttpsError),
  error => error.code === 'invalid-argument', 'null explícito não apaga janelas');
assert.throws(() => validate({ scheduleWindow:{ version:1, days:[], categoryWindows:[], extra:true } }, HttpsError),
  error => error.code === 'invalid-argument', 'remoção explícita não apaga chave desconhecida silenciosamente');
const badStored = structuredClone(t);
badStored.scheduleWindow.categoryWindows[0].endTime = '07:00';
const beforeCheck = JSON.stringify(badStored);
const skipped = assessGenerated(badStored, window._schGradeEstimada, HttpsError);
assert.equal(skipped.pulou, 'agenda-categoria-invalida', 'autoDraw pula agenda inválida já persistida');
assert.equal(JSON.stringify(badStored), beforeCheck, 'checagem não grava nem altera a rodada');
assert.equal(assessGenerated(short, window._schGradeEstimada, HttpsError).pulou,
  'agenda-categoria-nao-cabe', 'autoDraw pula rodada que excede a janela');
assert.equal(assessGenerated(t, undefined, HttpsError).pulou,
  'agenda-categoria-nao-cabe', 'autoDraw falha fechado sem estimador de capacidade');
assert.equal(assessGenerated(t, window._schGradeEstimada, HttpsError), null, 'agenda válida pode seguir');
const autoSource = fs.readFileSync(require.resolve('./index.js'), 'utf8');
for (const marker of ['Auto-draw: agenda por categoria inválida', 'Auto-draw phase: agenda por categoria inválida']) {
  const position = autoSource.indexOf(marker);
  assert.ok(position > 0 && autoSource.lastIndexOf('assessGenerated(', position) > 0,
    marker + ' usa a checagem testada');
  assert.ok(autoSource.indexOf('return { pulou: _windowCheck.pulou }', position) <
    autoSource.indexOf('_gravaTorneio(tx,', position), marker + ' pula antes de persistir');
}
console.log('✓ janelas de categoria, sobreposição e capacidade');
