'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { window: W, E, load } = require('./headless');
const tieCore = require('../functions-autodraw/phase-tie-core');
const resultCore = require('../functions-autodraw/result-core');
const blueprint = require('./fixtures/camis-interleaved-plan');
load('schedule-poll.js');
const source = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const from = source.indexOf('function _buildPhaseTieRuntime(');
const to = source.indexOf('exports.advanceTournamentPhase = onCall', from);
assert(from > 0 && to > from);
const groupCounts = [['Fem Diamante',8], ['Fem Ouro',16], ['Fem Prata',12]];
const groups = groupCounts.flatMap(([category,count]) =>
  Array.from({ length:count }, (_, i) => {
    const players = Array.from({ length:4 }, (_, j) => category + '-' + i + '-' + j);
    return { name:'Grupo ' + (i+1) + ' ' + category, category, players,
      rows:players.map((name, rank) => ({ name, uid:name, gameDiff:4-rank })),
      matches:[0,1,2].map(stage => ({
        id:'match-rr-r1-g' + i + '-' + stage + '-' + category.replace(/ /g, '_'),
        category, phaseIndex:0, groupIdx:i, round:1, isMonarch:true,
        winner:null,
        team1:[players[0],players[1]], team2:[players[2],players[3]]
      })) };
  }));
const phases = W.FORMAT2.compileToPhases({ disputa:'dupla', grupos:1, classifAtiva:false,
  eliminatoria:{ ativa:true, openReiRainha:true, reiRainhaCut:2,
    formacao:'performance', linhas:1, dupla:false, terceiro:true } },
  { sport:'Beach Tennis' }).phases;
const t = { id:'camis-fixture', creatorUid:'organizador', status:'active',
  sport:'Beach Tennis', phases, currentPhaseIndex:0,
  startDate:'2026-11-13T08:00', endDate:'2026-11-13T21:00',
  courtCount:8, gameDuration:30, callTime:5, warmupTime:5,
  combinedCategories:groupCounts.map(item => item[0]), politicaDaChave:'bye',
  rankingPrimary:'games_diff', tiebreakers:[],
  fmt2:{ tieResolution:'singles_then_draw', tieSinglesPoints:5, tieSinglesMargin:1 },
  groups, scheduleWindow:{ days:[{ day:'2026-11-13', startTime:'08:00', endTime:'21:00' }],
    interleavedPlan:blueprint } };
const drawWindow = {
  _phasesEngine:E,
  _assignGlobalGameNumbers:W._assignGlobalGameNumbers,
  _standingsOrdemChave:() => ({}), _standingsBuildH2H:() => ({}),
  _standingsCompareConfig:(a,b) => b.gameDiff-a.gameDiff,
  _collectAllMatches:W._collectAllMatches,
  _schGradeEstimada:W._schGradeEstimada,
  _schAplicarGrade:W._schAplicarGrade
};
const advance = vm.runInNewContext(source.slice(from, to) + '\n_materializeInterleavedReadyCategories;', {
  drawWindow, _phaseTieCore:tieCore, phaseStandingsFn:g => g.rows,
  HttpsError:class extends Error {}
});
assert.equal(W._schAplicarGrade(t), 108, 'sorteio agenda todos os grupos antes dos resultados');
for (const g of groups.filter(g => g.category === 'Fem Diamante')) {
  g.matches.forEach(m => { m.winner=g.players[0]; });
}
assert.deepEqual(Array.from(advance(t, t.id, '2026-11-13T13:00:00Z')), ['Fem Diamante']);
assert.equal(t.currentPhaseIndex, 0);
assert.equal(t.matches.filter(m => m.category === 'Fem Diamante' && !m.isBye).length, 8);
assert.equal(t.matches.filter(m => m.category === 'Fem Diamante' && !m.isBye)
  .every(m => m.scheduledGameNumber > 72 && m.scheduledAt && m.court), true);
assert.equal(new Set(t.matches.flatMap(m => [m.team1Obj,m.team2Obj])
  .filter(team => team && team.fixedPair).map(team => team.displayName)).size, 8);
const quarter = t.matches.find(m => m.category === 'Fem Diamante' && m.round === 1 && !m.isBye);
assert(quarter && quarter.p1 && quarter.p2);
const quarterResult = resultCore.applyResult(t, { matchId:quarter.id,
  payload:{ scoreP1:6, scoreP2:4 }, actor:{ uid:'organizador' }, forceApply:true,
  now:Date.parse('2026-11-13T13:35:00Z') });
assert(quarterResult.ok && quarter.winner, 'quartas recebem placar com Prata ainda na fase 0');
assert.equal(t.currentPhaseIndex, 0);
assert.equal(advance(t, t.id, '2026-11-13T13:00:01Z').length, 0, 'retry não duplica jogos');
for (const g of groups.filter(g => g.category === 'Fem Ouro')) {
  g.matches.forEach(m => { m.winner=g.players[0]; });
}
assert.deepEqual(Array.from(advance(t, t.id, '2026-11-13T15:00:00Z')), ['Fem Ouro']);
assert.equal(t.currentPhaseIndex, 0, 'Prata ainda joga a classificatória');
for (const g of groups.filter(g => g.category === 'Fem Prata')) {
  g.matches.forEach(m => { m.winner=g.players[0]; });
}
assert.deepEqual(Array.from(advance(t, t.id, '2026-11-13T18:20:00Z')), ['Fem Prata']);
assert.equal(t.currentPhaseIndex, 1);
assert.equal(t.matches.filter(m => !m.isBye).length, 36);
assert.equal(new Set(t.matches.map(m => m.id)).size, t.matches.length);
assert.equal(new Set(W._collectAllMatches(t).filter(m => !m.isBye)
  .map(m => m.scheduledGameNumber)).size, 144);
assert.equal(Math.max(...t.matches.map(m => m.scheduledGameNumber || 0)), 144);
console.log('CAMIS: 1º+2º formam uma dupla por grupo; categorias avançam separadamente');
