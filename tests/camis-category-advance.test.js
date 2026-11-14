'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { window: W, E, load } = require('./headless');
const tieCore = require('../functions-autodraw/phase-tie-core');
const standingsAdapter = require('../functions-autodraw/vendor/standings-core.js');
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
phases[1].officialGroupBracketOrder = ['Fem Ouro'];
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
  drawWindow, _standingsAdapter:standingsAdapter, _phaseTieCore:tieCore, phaseStandingsFn:g => g.rows,
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
const earlyCfg = E.projectPhaseCfg(phases[1], t, 1);
const earlyBuilt = E.buildCategorizedPhaseBrackets(t, groups.filter(g => g.category === 'Fem Ouro'),
  {...earlyCfg, politicaDaChave:'bye'}, g => g.rows, 'ph-' + t.id + '-1-c1', {});
const officialPhoto = E.buildCategorizedPhaseBrackets(t, groups.filter(g => g.category === 'Fem Ouro'),
  {...earlyCfg, officialGroupBracketGroupOrder:{ 'Fem Ouro':[1,2,3,4,5,6,7,8,9,10,16,12,13,14,15,11] },
    politicaDaChave:'bye'}, g => g.rows, 'ph-' + t.id + '-1-c1', {});
const photoFirst = officialPhoto.matches.filter(m => m.round === 1 && !m.isThirdPlace);
assert(photoFirst.find(m => m.id.endsWith('VC-R1-P6')).p1.includes('Fem Ouro-15-0'),
  'posição 11 da foto usa o grupo 16');
assert(photoFirst.find(m => m.id.endsWith('VC-R1-P8')).p2.includes('Fem Ouro-10-0'),
  'posição 16 da foto usa o grupo 11');
const earlyMatch = earlyBuilt.matches.find(m => m.round === 1 && m.id.endsWith('VC-R1-P1'));
assert(earlyMatch);
earlyMatch.court = 'Quadra 1';
earlyMatch.phaseIndex = 1;
earlyMatch.courtCalledAt = '2026-11-13T13:10:00Z';
earlyMatch.scheduledAt = '2026-11-13T16:00:00Z';
earlyMatch._gameNum = 77;
earlyMatch.scheduledGameNumber = 77;
t.matches.push(earlyMatch);
const earlyResult = resultCore.applyResult(t, { matchId:earlyMatch.id,
  payload:{ scoreP1:6, scoreP2:4 }, actor:{ uid:'organizador' }, forceApply:true,
  now:Date.parse('2026-11-13T13:40:00Z') });
assert(earlyResult.ok && earlyMatch.winner, 'oitavas da Ouro recebem placar antes do fim da Prata');
for (const g of groups.filter(g => g.category === 'Fem Ouro')) {
  g.matches.forEach(m => { m.winner=g.players[0]; });
}
assert.deepEqual(Array.from(advance(t, t.id, '2026-11-13T15:00:00Z')), ['Fem Ouro']);
const ouroFirstRound = t.matches.filter(m => m.category === 'Fem Ouro' && m.round === 1 && !m.isThirdPlace);
assert.equal(ouroFirstRound.length, 8);
assert.equal(ouroFirstRound.find(m => m.id === earlyMatch.id).courtCalledAt, earlyMatch.courtCalledAt,
  'materialização posterior preserva o jogo da Ouro já chamado');
assert.equal(ouroFirstRound.find(m => m.id === earlyMatch.id).winner, earlyMatch.winner,
  'materialização posterior preserva o placar já lançado');
ouroFirstRound.forEach((m, i) => {
  assert(m.officialGroupBracket && m.roundName === 'Oitavas de final');
  assert(m.p1.includes('Fem Ouro-' + (i * 2) + '-0'), 'lado esquerdo segue G' + (i * 2 + 1));
  assert(m.p2.includes('Fem Ouro-' + (i * 2 + 1) + '-0'), 'lado direito segue G' + (i * 2 + 2));
});
assert.equal(t.currentPhaseIndex, 0, 'Prata ainda joga a classificatória');
for (const g of groups.filter(g => g.category === 'Fem Prata')) {
  g.matches.forEach(m => { m.winner=g.players[0]; });
}
const preinstalled = structuredClone(t);
preinstalled.phases[1].officialGroupBracketOrder = ['Fem Ouro', 'Fem Prata'];
preinstalled.matches.push(...Array.from({ length:12 }, (_, i) => ({
  id:'official-prata-' + (133+i), _gameNum:133+i, category:'Fem Prata', phaseIndex:1,
  officialGroupBracket:true, scheduledAt:'2026-11-13T19:00:00Z',
  p1:'Prata ' + i, p2:'Prata ' + (i+1), roundName:i < 4 ? 'Oitavas de final' : 'Quartas de final'
})));
const scheduleBefore = drawWindow._schGradeEstimada;
drawWindow._schGradeEstimada = () => { throw Error('chave oficial já instalada não recalcula agenda'); };
assert.deepEqual(Array.from(advance(preinstalled, preinstalled.id, '2026-11-13T18:20:00Z')), ['Fem Prata'],
  'chave oficial já instalada só recupera o marcador e não bloqueia resultado com agenda cheia');
assert.equal(preinstalled.phaseCategoryMaterialized['Fem Prata'].count, 12);
assert.equal(preinstalled.matches.length, t.matches.length + 12, 'não duplica confrontos da Prata');
drawWindow._schGradeEstimada = scheduleBefore;
assert.deepEqual(Array.from(advance(t, t.id, '2026-11-13T18:20:00Z')), ['Fem Prata']);
assert.equal(t.currentPhaseIndex, 1);
assert.equal(t.matches.filter(m => !m.isBye).length, 36);
assert.equal(new Set(t.matches.map(m => m.id)).size, t.matches.length);
assert.equal(new Set(W._collectAllMatches(t).filter(m => !m.isBye)
  .map(m => m.scheduledGameNumber)).size, 144);
assert.equal(Math.max(...t.matches.map(m => m.scheduledGameNumber || 0)), 144);
// O motor relê os grupos ao materializar. Objetos novos não podem fazer a
// ordem resolvida pela simples se perder e recolocar a atleta eliminada.
let reads = 0;
const freshGroups = () => { reads++; return [{ name:'R1 Grupo B', category:'Fem Diamante',
  rows:[{name:'Bianca'}, {name:'Leticia'}, {name:'Nina'}],
  matches:[0,1,2].map(id => ({id:'b'+id,winner:'Bianca'})) }]; };
let qualifiedNames = null;
const freshEngine = { prevPhaseGroups:freshGroups, projectPhaseCfg:() => ({}),
  materializeNextPhase:(_, standingsForGroup) => {
    qualifiedNames = standingsForGroup(freshGroups()[0]).map(row => row.name);
    return {ok:true};
  } };
const freshWindow = { _phasesEngine:freshEngine, _schGradeEstimada:() => ({cabe:true,interleaved:true,slots:[]}),
  _schAplicarGrade:() => {}, _collectAllMatches:() => [] };
const freshAdvance = vm.runInNewContext(source.slice(source.indexOf('function _materializeInterleavedReadyCategories('), to) +
  '\n_materializeInterleavedReadyCategories;', {
  drawWindow:freshWindow, phaseStandingsFn:g => g.rows,
  _buildPhaseTieRuntime:(_, __, groups) => ({ overall:false, pools:groups.map((group,index) =>
    ({id:'group-'+index,group,rows:group.rows})), nextCfg:{}, compareForPool:() => () => 0 }),
  _phaseTieCore:{resolvePhaseTies:(_, __, pools) => ({status:'ready',orderedPools:pools.map(pool => ({
    id:pool.id,rows:[pool.rows[0],pool.rows[2],pool.rows[1]]}))})},
  HttpsError:class extends Error {}
});
assert.deepEqual(Array.from(freshAdvance({ id:'fresh-groups', currentPhaseIndex:0,
  phases:[{}], combinedCategories:['Fem Diamante'], scheduleWindow:{interleavedPlan:{
    blocks:[{kind:'groups',category:'Fem Diamante',courts:[1]}] }} }, 'fresh-groups', '2026-11-13T13:00:00Z')),
  ['Fem Diamante']);
assert(reads >= 2 && qualifiedNames.join(',') === 'Bianca,Nina,Leticia',
  'desempate decidido é preservado quando a materialização relê o grupo');
console.log('CAMIS: 1º+2º formam uma dupla por grupo; categorias avançam separadamente');
