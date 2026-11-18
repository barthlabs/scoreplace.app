'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { window: W, E } = require('./headless');

const compiledOfficial = W.FORMAT2.compileToPhases({
  disputa:'dupla', grupos:2, parceria:'rotation_groups_8',
  rodadas:{ modo:'fixo', n:5 }, classifAtiva:true, classificados:1,
  classifScope:'per_group', eliminatoria:{ ativa:true, linhas:1, origem:'formar' }
}, { sport:'Beach Tennis', categories:['Fem A', 'Fem B', 'Masc A'] });
assert.deepEqual(compiledOfficial.phases[1].officialGroupBracketOrder,
  ['Fem A', 'Fem B', 'Masc A'],
  'o compilador persiste a ordem oficial das categorias na chave por vencedores de grupo');

const phases = W.FORMAT2.compileToPhases({ disputa:'dupla', grupos:1, classifAtiva:false,
  eliminatoria:{ ativa:true, openReiRainha:true, reiRainhaCut:2,
    formacao:'performance', linhas:1, dupla:false, terceiro:true } },
{ sport:'Beach Tennis' }).phases;
phases[1].officialGroupBracketOrder = ['Feminino', 'Masculino'];
phases[1].officialGroupBracketGroupOrder = {
  Feminino:[1,2,3,4], Masculino:[1,2,3,4]
};
const categories = ['Feminino', 'Masculino'];
const groups = categories.flatMap((category, ci) =>
  Array.from({ length:4 }, (_, i) => {
    const code = String.fromCharCode(65 + Math.floor(i / 2)) + (ci * 2 + (i % 2) + 1);
    const rows = Array.from({ length:4 }, (_, j) => ({ name:category + '-' + code + '-' + j,
      uid:category + '-' + code + '-' + j }));
    const matches = Array.from({ length:3 }, (_, j) => ({
      id:category + '-' + code + '-' + j, phaseIndex:0, category,
      p1:rows[0].name, p2:rows[1].name, winner:null
    }));
    return { name:'Grupo ' + code, category, players:rows, rows, matches };
  }));
const t = { id:'torneio-generico', phases, currentPhaseIndex:0,
  combinedCategories:categories, groups, matches:groups.flatMap(g => g.matches),
  politicaDaChave:'bye', scheduleWindow:{ interleavedPlan:{ blocks:[
    ...groups.filter(g => g.category === 'Feminino').map(g => ({ kind:'groups', category:g.category })),
    ...groups.filter(g => g.category === 'Masculino').map(g => ({ kind:'groups', category:g.category }))
  ] } } };

const plan = E.prepareOfficialGroupBracket(t, 1, 'ph-' + t.id + '-1');
assert(plan && plan.matches.length > 0);
const first = plan.matches.find(m => m.category === 'Feminino' && m.round === 1 &&
  m.p1GroupSource === 'A1');
assert(first && first.p2GroupSource === 'A2', 'cruzamento A1 × A2 usa os códigos completos');
assert.equal(first.p1, 'TBD');
assert.equal(first.p2, 'TBD');
assert.equal(new Set(plan.matches.map(m => m.id)).size, plan.matches.length,
  'IDs de toda a árvore já são estáveis');
const single = structuredClone(t);
single.combinedCategories = ['Feminino'];
single.groups = single.groups.filter(g => g.category === 'Feminino');
single.matches = single.groups.flatMap(g => g.matches);
single.phases[1].officialGroupBracketOrder = ['Feminino'];
single.phases[1].officialGroupBracketGroupOrder = { Feminino:[1,2,3,4] };
const singlePlan = E.prepareOfficialGroupBracket(single, 1, 'ph-single-1-c0');
assert(singlePlan.matches.some(m => m.p1GroupSource === 'A1' && m.p2GroupSource === 'A2'),
  'categoria única também respeita o cruzamento oficial A1 × A2');

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = source.indexOf('function _phaseBracketSignature(');
const end = source.indexOf('/* Grava o torneio respeitando', start);
assert(start > 0 && end > start);
const drawWindow = { _phasesEngine:E, _collectAllMatches:W._collectAllMatches,
  _assignGlobalGameNumbers:() => 0 };
const operation = vm.runInNewContext(source.slice(start, end) + '\n({prepare:_prepareOfficialPhasePlan,reconcile:_reconcileOfficialPhasePlan,activate:_activateOfficialPhasePlanOnCall})', {
  drawWindow, createHash, Buffer, hasDrawnBracket:tour => !!(tour && tour.matches && tour.matches.length),
  phaseStandingsFn:g => g.rows, HttpsError:class extends Error {
    constructor(code, message) { super(message); this.code = code; }
  }
});
operation.prepare(t, 1);
assert.equal(t.phaseBracketPlanVersion, 1);
assert.equal(t.phaseBracketPlanV1.matches.length, plan.matches.length);
const originalIds = t.phaseBracketPlanV1.matches.map(m => m.id);
const calledAt = '2026-11-18T12:00:00Z';
groups.filter(g => g.category === 'Feminino').flatMap(g => g.matches).forEach(m => {
  m.courtCalledAt = calledAt;
});
assert.equal(operation.activate(t, groups[0].matches[0], calledAt).join(','), 'Feminino',
  'categoria concentrada entra na operação pela última chamada, sem placar');
assert.equal(t.matches.filter(m => m.phaseIndex === 1 && m.category === 'Feminino').length,
  plan.matches.filter(m => m.category === 'Feminino').length);
assert.equal(t.matches.filter(m => m.phaseIndex === 1 && m.category === 'Masculino').length, 0);
assert.equal(operation.activate(t, groups[0].matches[0], calledAt).length, 0,
  'chamada repetida não duplica a chave');
groups[0].matches.forEach(m => { m.winner = groups[0].rows[0].name; });
operation.reconcile(t, JSON.parse(JSON.stringify(t)), {});
const filled = t.matches.find(m => m.id === first.id);
assert(filled.p1.includes(groups[0].rows[0].name), 'vencedor preenche a vaga existente');
assert.equal(filled.p2, 'TBD', 'grupo ainda aberto continua pendente');
assert.deepEqual(t.phaseBracketPlanV1.matches.map(m => m.id), originalIds,
  'reconciliação não recria os confrontos');
const future = W._sumulaUpcomingBracket(t, 1);
const plannedFirst = future.categories.find(bucket => bucket.category === 'Feminino').matches
  .find(m => m.id === first.id);
assert.equal(plannedFirst.source1, 'Vencedor do Grupo A1');
assert.equal(plannedFirst.source2, 'Vencedor do Grupo A2');
assert(plannedFirst.p1.includes(groups[0].rows[0].name) && !plannedFirst.p2,
  'súmula usa a mesma chave e preenche só a vaga resolvida');
const stale = structuredClone(t);
delete stale.phaseBracketPlanVersion;
delete stale.phaseBracketPlanV1;
operation.reconcile(stale, structuredClone(t), {});
assert.equal(stale.phaseBracketPlanVersion, 1,
  'escrita antiga pela fronteira do servidor preserva o marcador e a chave');
assert.equal(JSON.stringify(stale.phaseBracketPlanV1.matches.map(m => m.id)), JSON.stringify(originalIds));
const invalid = structuredClone(t);
invalid.phaseBracketPlanV1 = null;
assert.throws(() => operation.reconcile(invalid, invalid, {}), /chave planejada.*ausente/i,
  'marcador sem plano falha fechado');
const unavailableEngine = structuredClone(t);
const operationWithoutEngine = vm.runInNewContext(source.slice(start, end) + '\n({reconcile:_reconcileOfficialPhasePlan})', {
  drawWindow:{}, phaseStandingsFn:() => [], HttpsError:class HttpsError extends Error {
    constructor(code, message) { super(message); this.code = code; }
  },
  createHash, Buffer, console
});
assert.throws(() => operationWithoutEngine.reconcile(unavailableEngine, unavailableEngine, {}),
  /Motor de classificação da chave indisponível/,
  'motor ausente falha com precondition controlada ao validar o plano salvo');
const locked = structuredClone(t);
locked.matches.find(m => m.id === first.id).courtCalledAt = calledAt;
locked.groups[0].rows = locked.groups[0].rows.slice().reverse();
assert.throws(() => operation.reconcile(locked, structuredClone(t), {}), /após a chamada/i,
  'correção de classificado após a chamada da eliminatória recusa toda a escrita');

const spread = structuredClone(t);
spread.scheduleWindow.interleavedPlan.blocks = [
  { kind:'groups', category:'Feminino' }, { kind:'groups', category:'Masculino' },
  { kind:'groups', category:'Feminino' }
];
spread.phaseBracketPlanV1.operationalAtByCategory = {};
spread.matches = spread.matches.filter(m => m.phaseIndex === 0);
assert.equal(operation.activate(spread, spread.groups[0].matches[0], calledAt).length, 0,
  'agenda intercalada aguarda chamada de todas as categorias');
const noBlocks = structuredClone(spread);
delete noBlocks.scheduleWindow.interleavedPlan;
assert.equal(operation.activate(noBlocks, noBlocks.groups[0].matches[0], calledAt).length, 0,
  'sem blocos canônicos o gatilho é global');
const withWo = structuredClone(spread);
withWo.groups.filter(g => g.category === 'Masculino').flatMap(g => g.matches)
  .forEach(m => { m.wo = true; });
assert.deepEqual(Array.from(operation.activate(withWo, withWo.groups[0].matches[0], calledAt)), categories,
  'W.O. histórico satisfaz a grade, mas a ativação ainda exige uma chamada nova');
console.log('✓ chave oficial nasce no sorteio, ativa por chamada e mantém vagas/IDs');
