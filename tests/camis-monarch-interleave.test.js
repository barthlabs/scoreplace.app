const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sandbox: W } = require('./render-harness');
for (const name of ['schedule-poll.js', 'schedule-organizer.js', 'tournament-sumula.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views', name), 'utf8'), W, { filename:name });
}
const day = '2026-11-13';
const matches = [];
for (let group = 0; group < 8; group++) {
  const p = ['A','B','C','D'].map(letter => `Atleta ${group + 1}${letter}`);
  const pairs = [[[0,1],[2,3]], [[0,2],[1,3]], [[0,3],[1,2]]];
  pairs.forEach((pair, stage) => matches.push({
    id:`g${group + 1}-j${stage + 1}`, isMonarch:true, monarchGroup:group,
    phaseIndex:0, round:1, category:'Diamante',
    p1:pair[0].map(i => p[i]).join(' / '), p2:pair[1].map(i => p[i]).join(' / ')
  }));
}
const tournament = {
  id:'camis-fixture', name:'Teste de grade', courtCount:8, gameDuration:40,
  startDate:`${day}T08:00`, endDate:`${day}T15:00`,
  scheduleWindow:{ days:[{ day, startTime:'08:00', endTime:'15:00', categoryFlow:'categories' }],
    categoryWindows:[{ category:'Diamante', day, startTime:'08:00', endTime:'15:00' }] },
  matches
};
const grade = W._schGradeEstimada(tournament);
assert(grade && grade.cabe, 'grade deve caber');
const byId = new Map(grade.slots.map(slot => [slot.matchId, slot]));
const starts = [...new Set(grade.slots.map(slot => slot.ms))].sort((a,b) => a-b);
assert.equal(starts.length, 3, 'três passagens dos grupos');
for (let stage = 1; stage <= 3; stage++) {
  const ids = matches.filter(m => byId.get(m.id).ms === starts[stage - 1]);
  assert.equal(ids.length, 8);
  assert.equal(new Set(ids.map(m => m.monarchGroup)).size, 8);
  assert(ids.every(m => m.id.endsWith(`j${stage}`)));
}
assert.equal(byId.get('g1-j1').ms, byId.get('g8-j1').ms);
assert.equal(byId.get('g1-j2').ms, starts[1]);
const withoutCategoryWindow = { ...tournament, scheduleWindow:{ days:tournament.scheduleWindow.days } };
const generalGrade = W._schGradeEstimada(withoutCategoryWindow);
assert(generalGrade && generalGrade.cabe, 'grade sem janela de categoria deve caber');
const generalFirst = generalGrade.slots.filter(slot => slot.ms === Math.min(...generalGrade.slots.map(item => item.ms)));
assert.equal(generalFirst.length, 8);
assert.equal(new Set(generalFirst.map(slot => slot.matchId.split('-')[0])).size, 8,
  'outro caminho de grade não repete o quarteto no mesmo horário');
const withTimes = { ...tournament, matches:matches.map(m => ({ ...m, scheduledAt:byId.get(m.id).iso })) };
const plan = W._operationalSchedulePlan(withTimes);
assert.equal(plan.unscheduledCount, 0);
const first = plan.items.filter(i => Date.parse(i.scheduledAt) === starts[0]);
assert.equal(first.length, 8);
assert.equal(new Set(first.map(i => i.court)).size, 8);
assert.equal(new Set(first.map(i => i.matchId.split('-')[0])).size, 8);
const sumula = W.ScoreplaceSumula.collect(withTimes, withTimes.matches);
assert.equal(sumula.matches.length, 24);
assert(sumula.matches.every(m => m.court.startsWith('Quadra ')), 'súmula usa quadra prevista');
assert.equal(new Set(sumula.matches.filter(m => m.number <= 8).map(m => m.id.split('-')[0])).size, 8,
  'súmula numera primeiro um jogo de cada quarteto');
assert.equal(sumula.matches.find(m => m.number === 9).id.split('-')[0],
  sumula.matches.find(m => m.number === 1).id.split('-')[0], 'jogo 9 retoma o primeiro quarteto');
for (let group = 1; group <= 8; group++) {
  const games = sumula.matches.filter(m => m.id.startsWith(`g${group}-`)).sort((a,b) => a.number - b.number);
  assert.deepEqual(games.map(m => m.number), [group, group + 8, group + 16]);
  assert.equal(new Set(games.map(m => m.court)).size, 1,
    'as três parcerias do quarteto mantêm a quadra prevista na súmula');
}
const manual = { ...withTimes, matches:withTimes.matches.map(m => m.id === 'g1-j1' ? { ...m, court:'Quadra Principal' } : m) };
const manualSumula = W.ScoreplaceSumula.collect(manual, manual.matches);
assert.equal(manualSumula.matches.find(m => m.id === 'g1-j1').court, 'Quadra Principal');
// O evento inteiro combina três categorias com janelas diferentes. A primeira
// onda da Diamante ainda precisa ocupar as oito quadras com oito quartetos.
const categories = [
  ['Diamante', 8, '08:00', '15:00'],
  ['Ouro', 16, '09:30', '16:00'],
  ['Prata', 12, '14:30', '19:30']
];
let nextGroup = 0;
const fullMatches = categories.flatMap(([category, count]) => Array.from({ length:count }, () => {
  const group = nextGroup++;
  return matches.slice(0, 3).map((m, stage) => ({ ...m,
    id:`${category}-${group}-${stage}`, category, monarchGroup:group,
    p1:`Pessoa ${group}A / Pessoa ${group}B`, p2:`Pessoa ${group}C / Pessoa ${group}D`
  }));
}).flat());
const full = { ...tournament, matches:fullMatches,
  startDate:`${day}T08:00`, endDate:`${day}T19:30`,
  scheduleWindow:{ days:[{ day, startTime:'08:00', endTime:'19:30', categoryFlow:'categories' }],
    categoryWindows:categories.map(([category,,startTime,endTime]) => ({ category, day, startTime, endTime })) }
};
const fullGrade = W._schGradeEstimada(full);
assert(fullGrade && fullGrade.cabe && fullGrade.slots.length === 108,
  '144 atletas em três categorias produzem 108 jogos dentro das janelas');
const firstStart = Math.min(...fullGrade.slots.map(slot => slot.ms));
const firstWave = fullGrade.slots.filter(slot => slot.ms === firstStart);
assert.equal(firstWave.length, 8);
assert.equal(new Set(firstWave.map(slot => slot.matchId.split('-')[1])).size, 8,
  'jogos 1–8 usam quartetos distintos no torneio completo');
console.log('CAMIS Rei/Rainha: 8 quartetos, 3 passagens, quadras e súmula corretos');
