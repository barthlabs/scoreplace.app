const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sandbox: W } = require('./render-harness');
const { E } = require('./headless');
const blueprint = require('./fixtures/camis-interleaved-plan');
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/views/schedule-poll.js'), 'utf8'), W,
  { filename:'schedule-poll.js' });

const day = '2026-11-13';
const matches = [['Fem Diamante',8], ['Fem Ouro',16], ['Fem Prata',12]].flatMap(([category,count]) =>
  Array.from({ length:count }, (_, group) => [0,1,2].map(stage => ({
    id:`match-rr-r1-g${group}-${stage}-${category.replace(/ /g, '_')}`,
    category, isMonarch:true, phaseIndex:0, round:1, monarchGroup:group,
    p1:`Pessoa ${category} ${group}A / Pessoa ${category} ${group}B`,
    p2:`Pessoa ${category} ${group}C / Pessoa ${category} ${group}D`
  }))).flat());
const t = {
  id:'camis-interleaved-fixture', startDate:`${day}T08:00`, endDate:`${day}T21:00`,
  courtCount:8, gameDuration:30, callTime:5, warmupTime:5, matches,
  scheduleWindow:{ days:[{ day, startTime:'08:00', endTime:'21:00' }], interleavedPlan:blueprint }
};
const schedule = W.window._schGradeEstimada(t);
assert(schedule && schedule.cabe && schedule.interleaved);
assert.equal(schedule.reservedGameCount, 144);
assert.equal(schedule.slots.length, 108);
assert.equal(new Set(schedule.slots.map(s => s.scheduledGameNumber)).size, 108);
assert.equal(W.window._schAplicarGrade(t), 108);
assert.equal(W.window._schAplicarGrade(t), 0);
const byCategory = category => t.matches.filter(m => m.category === category);
assert.deepEqual(byCategory('Fem Diamante').slice(0,3).map(m => m.scheduledGameNumber), [1,2,3]);
assert.deepEqual(byCategory('Fem Ouro').slice(0,3).map(m => m.scheduledGameNumber), [25,26,27]);
assert.deepEqual(byCategory('Fem Prata').slice(0,3).map(m => m.scheduledGameNumber), [95,96,97]);
assert.deepEqual(byCategory('Fem Prata').slice(18,21).map(m => m.scheduledGameNumber), [115,116,117]);
const first = byCategory('Fem Diamante').slice(0,3);
assert.deepEqual(first.map(m => Date.parse(m.scheduledAt) - Date.parse(first[0].scheduledAt)),
  [0,40*60000,70*60000]);
assert.equal(new Set(first.map(m => m.court)).size, 1);
const elimination = (category, count) => {
  const groups = Array.from({ length:count }, (_, index) => ({
    name:'Grupo ' + (index+1) + ' ' + category, category,
    standings:[0,1,2,3].map(rank => ({ name:category + '-' + index + '-' + rank,
      uid:category + '-' + index + '-' + rank, gameDiff:4-rank }))
  }));
  const cfg = { kind:'elimination', formatCode:'elim_simples', grandFinal:true,
    fixedPairs:true, pairingStrategy:'top', politicaDaChave:'bye',
    source:{ type:'previous_phase', scope:'per_group', qualifyTopN:2,
      mapping:[{ dest:'main', rankFrom:1, rankTo:2 }] } };
  return E.buildPhaseBrackets(groups, cfg, group => group.standings,
    'elim-' + category.replace(/ /g, '_')).matches.map(m =>
      Object.assign(m, { category, phaseIndex:1 }));
};
t.phaseCategoryMaterialized = {};
for (const [category,count] of [['Fem Diamante',8], ['Fem Ouro',16], ['Fem Prata',12]]) {
  const added = elimination(category,count);
  assert.equal(added.filter(m => !m.isBye).length, count);
  t.matches.push(...added);
  t.phaseCategoryMaterialized[category] = { at:'2026-11-13T12:00:00Z' };
  const updated = W.window._schGradeEstimada(t);
  assert(updated && updated.cabe && updated.interleaved,
    'chave de ' + category + ' cabe na programação reservada');
  assert.equal(updated.slots.length,
    108 + (t.phaseCategoryMaterialized['Fem Diamante'] ? 8 : 0) +
      (t.phaseCategoryMaterialized['Fem Ouro'] ? 16 : 0) +
      (t.phaseCategoryMaterialized['Fem Prata'] ? 12 : 0));
  assert.equal(W.window._schAplicarGrade(t), count);
}
assert.equal(new Set(t.matches.filter(m => !m.isBye).map(m => m.scheduledGameNumber)).size, 144);
assert.equal(Math.max(...t.matches.map(m => m.scheduledGameNumber || 0)), 144);
const short = { ...t, matches:matches.map(m => ({ ...m })), endDate:`${day}T19:30`,
  scheduleWindow:{ ...t.scheduleWindow, days:[{ day,startTime:'08:00',endTime:'19:30' }] } };
assert.equal(W.window._schGradeEstimada(short).cabe, false);
const secondDay = '2026-11-14';
const twoDayPlan = JSON.parse(JSON.stringify(blueprint));
twoDayPlan.blocks[twoDayPlan.blocks.length - 1].day = secondDay;
twoDayPlan.blocks[twoDayPlan.blocks.length - 1].startTime = '08:00';
const twoDay = { ...t, matches:matches.map(m => ({ ...m })), endDate:`${secondDay}T21:00`,
  scheduleWindow:{ days:[{day,startTime:'08:00',endTime:'21:00'},
    {day:secondDay,startTime:'08:00',endTime:'21:00'}], interleavedPlan:twoDayPlan } };
const acrossDays = W.window._schGradeEstimada(twoDay);
assert(acrossDays && acrossDays.cabe && acrossDays.interleaved);
assert.equal(acrossDays.dias, 2);
assert.equal(acrossDays.reservedGameCount, 144);
assert.equal(Math.max(...acrossDays.slots.map(s => s.scheduledGameNumber)), 144);
console.log('CAMIS: grade intercalada reserva 144 designações e 36 duplas de grupo');
