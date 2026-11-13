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
  id:'camis-fixture', name:'Teste de grade', courtCount:8, gameDuration:30, callTime:5, warmupTime:5,
  startDate:`${day}T08:00`, endDate:`${day}T15:00`,
  scheduleWindow:{ days:[{ day, startTime:'08:00', endTime:'15:00', categoryFlow:'categories' }],
    categoryWindows:[{ category:'Diamante', day, startTime:'08:00', endTime:'15:00' }] },
  matches
};
const grade = W._schGradeEstimada(tournament);
assert(grade && grade.cabe, 'grade deve caber');
assert.equal(grade.atomica, true);
const byId = new Map(grade.slots.map(slot => [slot.matchId, slot]));
const starts = [...new Set(grade.slots.map(slot => slot.ms))].sort((a,b) => a-b);
assert.equal(starts.length, 3, 'três jogos por quarteto no mesmo bloco');
assert.equal(starts[1] - starts[0], 40 * 60000);
assert.equal(starts[2] - starts[1], 30 * 60000);
assert.equal(byId.get('g1-j1').ms, byId.get('g8-j1').ms);
assert.equal(byId.get('g1-j2').ms, starts[1]);
for (let group = 1; group <= 8; group++) {
  const slots = [1,2,3].map(stage => byId.get(`g${group}-j${stage}`));
  assert.deepEqual(slots.map(slot => slot.scheduledGameNumber), [3*group-2,3*group-1,3*group]);
  assert.equal(new Set(slots.map(slot => slot.court)).size, 1);
  assert.deepEqual(slots.map(slot => slot.durationMs / 60000), [40,30,30]);
}
const withoutCategoryWindow = { ...tournament, scheduleWindow:{ days:tournament.scheduleWindow.days } };
const generalGrade = W._schGradeEstimada(withoutCategoryWindow);
assert(generalGrade && generalGrade.cabe, 'grade sem janela de categoria deve caber');
assert.equal(generalGrade.atomica, true);
const generalFirst = generalGrade.slots.filter(slot => slot.ms === Math.min(...generalGrade.slots.map(item => item.ms)));
assert.equal(generalFirst.length, 8);
assert.equal(new Set(generalFirst.map(slot => slot.matchId.split('-')[0])).size, 8,
  'outro caminho de grade não repete o quarteto no mesmo horário');
const withTimes = { ...tournament, matches:matches.map(m => ({ ...m, scheduledAt:byId.get(m.id).iso,
  scheduledKind:'estimate', scheduledGameNumber:byId.get(m.id).scheduledGameNumber,
  court:byId.get(m.id).court, scheduleSource:'estimate' })) };
const plan = W._operationalSchedulePlan(withTimes);
assert.equal(plan.unscheduledCount, 0);
assert.equal(plan.cabe, true);
assert.deepEqual(Array.from(plan.items, i => i.scheduledGameNumber), Array.from({length:24}, (_, i) => i+1));
const first = plan.items.filter(i => Date.parse(i.scheduledAt) === starts[0]);
assert.equal(first.length, 8);
assert.equal(new Set(first.map(i => i.court)).size, 8);
assert.equal(new Set(first.map(i => i.matchId.split('-')[0])).size, 8);
const sumula = W.ScoreplaceSumula.collect(withTimes, withTimes.matches);
assert.equal(sumula.matches.length, 24);
assert(sumula.matches.every(m => m.court.startsWith('Quadra ')), 'súmula usa quadra prevista');
assert.equal(new Set(sumula.matches.map(m => m.number)).size, 24);
for (let group = 1; group <= 8; group++) {
  const games = sumula.matches.filter(m => m.id.startsWith(`g${group}-`)).sort((a,b) => a.number - b.number);
  assert.deepEqual(games.map(m => m.number), [3*group-2, 3*group-1, 3*group]);
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
assert.equal(fullGrade.atomica, true);
assert.equal(new Set(fullGrade.slots.map(slot => slot.scheduledGameNumber)).size, 108);
assert.deepEqual(Array.from(fullGrade.slots, slot => slot.scheduledGameNumber), Array.from({length:108}, (_, i) => i+1));
const firstStart = Math.min(...fullGrade.slots.map(slot => slot.ms));
const firstWave = fullGrade.slots.filter(slot => slot.ms === firstStart);
assert.equal(firstWave.length, 8);
assert.equal(new Set(firstWave.map(slot => slot.matchId.split('-')[1])).size, 8,
  'oito quartetos distintos começam juntos na primeira faixa');
const fullGeneral = { ...full, scheduleWindow:{ days:full.scheduleWindow.days } };
const fullGeneralGrade = W._schGradeEstimada(fullGeneral);
assert.equal(fullGeneralGrade.atomica, true, 'CAMIS real não precisa de categoryWindows');
assert.equal(fullGeneralGrade.slots.length, 108);
const g0 = fullGeneralGrade.slots.filter(slot => slot.matchId.startsWith('Diamante-0-'));
assert.deepEqual(Array.from(g0, slot => slot.ms - g0[0].ms), [0,40*60000,70*60000]);
assert.equal(new Set(g0.map(slot => slot.court)).size, 1);
assert.equal(fullGeneralGrade.slots[3].ms, fullGeneralGrade.slots[0].ms,
  'Jogo 4 de outro grupo pode começar junto do Jogo 1');
const fresh = { ...fullGeneral, matches:fullMatches.map(m => ({ ...m })) };
const changed = [];
assert.equal(W._schAplicarGrade(fresh, changed), 108);
assert.equal(changed.length, 108);
assert(fresh.matches.every(m => m.scheduledAt && m.court && m.scheduleSource === 'estimate' && Number.isInteger(m.scheduledGameNumber)));
W._assignGlobalGameNumbers(fresh);
assert(fresh.matches.every(m => m._gameNum === m.scheduledGameNumber), 'card e agenda usam o mesmo Jogo N');
assert.equal(new Set(fresh.matches.map(m => m._gameNum)).size, 108);
assert.equal(W._schGradeEstimada(fresh).atomica, true, 'quadra estimada não vira bloqueio manual');
assert.equal(W._schAplicarGrade(fresh, []), 0, 'reaplicar a mesma grade é idempotente');
fresh.matches[0].scheduledGameNumber = 999;
assert.equal(W._schAplicarGrade(fresh, []), 1, 'número velho é corrigido mesmo quando o horário não muda');
assert.equal(fresh.matches[0].scheduledGameNumber, 1);
const called = { ...fresh, matches:fresh.matches.map(m => ({ ...m })) };
const calledGame = called.matches[0];
calledGame.courtCalledAt = `${day}T08:10:00-03:00`;
calledGame.court = 'Quadra 3';
const calledBefore = [calledGame.court, calledGame.scheduledAt, calledGame.scheduledGameNumber];
W._schAplicarGrade(called, []);
assert.deepEqual([calledGame.court, calledGame.scheduledAt, calledGame.scheduledGameNumber], calledBefore,
  'recalcular a grade não move jogo já chamado nem reescreve seu horário ou número');
const shortWindow = { ...fullGeneral, scheduleWindow:{ days:[{day,startTime:'08:00',endTime:'08:30'}] }, matches:fullMatches.map(m => ({...m})) };
const shortPlan = W._schGradeEstimada(shortWindow);
assert.equal(shortPlan.atomica, true);
assert.equal(shortPlan.cabe, false);
assert.equal(W._schAplicarGrade(shortWindow, []), 0);
assert(shortWindow.matches.every(m => !m.scheduledAt && !m.court && !m.scheduledGameNumber));
const locked = { ...fullGeneral, matches:fullMatches.map((m,i) => i === 0 ? {...m, scheduledAt:'2026-11-13T11:00:00.000Z', scheduledKind:'estimate',
  scheduleLocked:true, scheduleSource:'organizer', court:'Quadra 4', scheduledGameNumber:77} : {...m}) };
assert.notEqual(W._schGradeEstimada(locked).atomica, true);
W._schAplicarGrade(locked, []);
assert.equal(locked.matches[0].court, 'Quadra 4');
assert.equal(locked.matches[0].scheduledGameNumber, 77);
const started = { ...fullGeneral, matches:fullMatches.map((m,i) => i === 0 ? {...m, startedAt:'2026-11-13T11:00:00.000Z'} : {...m}) };
assert.notEqual(W._schGradeEstimada(started).atomica, true);
const decided = { ...fullGeneral, matches:fullMatches.map((m,i) => i === 0 ? {...m, winner:'u1', scheduledGameNumber:1} : {...m}) };
assert.notEqual(W._schGradeEstimada(decided).atomica, true, 'resultado parcial não ativa renumeração atômica');
const legacy = { ...fullGeneral, matches:fullMatches.map((m,i) => i === 0 ? {...m, scheduledAt:'2026-11-13T11:00:00.000Z'} : {...m}) };
assert.notEqual(W._schGradeEstimada(legacy).atomica, true);
const partialNumbers = { ...fullGeneral, matches:fullMatches.map((m,i) => i < 3 ? {...m, scheduledGameNumber:70+i} : {...m}) };
assert.equal(W._schGradeEstimada(partialNumbers).atomica, true);
assert.equal(W._schAplicarGrade(partialNumbers, []), 108);
assert.deepEqual(partialNumbers.matches.slice(0,3).map(m => m.scheduledGameNumber), [1,2,3]);
assert.equal(new Set(partialNumbers.matches.map(m => m.scheduledGameNumber)).size, 108);
const manualCourt = { ...fullGeneral, matches:fullMatches.map((m,i) => i === 0 ? {...m, court:'Quadra Principal'} : {...m}) };
assert.notEqual(W._schGradeEstimada(manualCourt).atomica, true, 'quadra manual sem origem explícita é preservada');
const sameRefs = { ...tournament, rounds:[{matches:[matches[0]], monarchGroups:[{matches:[matches[0]]}]}] };
assert.equal(W._schGradeEstimada(sameRefs).atomica, true, 'mesma referência pode aparecer em matches e rounds');
const divergentCopy = { ...tournament, rounds:[{matches:[], monarchGroups:[{matches:[{...matches[0]}]}]}] };
assert.notEqual(W._schGradeEstimada(divergentCopy).atomica, true, 'cópia legada divergente não recebe número parcial');
const twoDays = { ...tournament, scheduleWindow:{days:[{day,startTime:'08:00',endTime:'15:00'},
  {day:'2026-11-14',startTime:'08:00',endTime:'15:00'}]} };
assert.notEqual(W._schGradeEstimada(twoDays).atomica, true);
const extraGame = { ...tournament, matches:matches.concat({id:'extra',round:1,category:'Diamante',p1:'A',p2:'B'}) };
assert.notEqual(W._schGradeEstimada(extraGame).atomica, true);
const bye = { ...tournament, matches:matches.concat({id:'bye',isBye:true,scheduledGameNumber:1}) };
assert.equal(W._schGradeEstimada(bye).atomica, true, 'BYE não consome designação');
const repeatAthletes = { ...tournament, courtCount:2, matches:matches.slice(0,6).map(m => ({...m,
  team1Uids:['u1','u2'], team2Uids:['u3','u4']})) };
const repeatGrade = W._schGradeEstimada(repeatAthletes);
assert.equal(repeatGrade.atomica, true);
assert.equal(repeatGrade.slots.find(s => s.matchId === 'g2-j1').ms - repeatGrade.slots[0].ms, 100*60000,
  'atletas repetidos em outro quarteto não jogam em duas quadras ao mesmo tempo');
const ordinary = { ...tournament, matches:matches.slice(0,3).map(m => ({...m, isMonarch:false})) };
assert.notEqual(W._schGradeEstimada(ordinary).atomica, true);
W._schAplicarGrade(ordinary, []);
assert(ordinary.matches.every(m => !m.court && !m.scheduledGameNumber), 'outros formatos mantêm a aplicação anterior');
console.log('CAMIS Rei/Rainha: quartetos consecutivos, quadras e números únicos');
