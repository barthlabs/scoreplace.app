'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const order = require('../js/domain/phase-call-order.js');
const grid = require('../js/domain/phase-grid-plan.js');
const plan = require('./fixtures/camis-interleaved-plan.js');
const t = { scheduleWindow:{ interleavedPlan:{...plan, editorVersion:2} }, phaseCategoryMaterialized:{} };
const categories = [['Fem Diamante',24,8], ['Fem Ouro',48,16], ['Fem Prata',36,12]];
const matches = categories.flatMap(([category, groups, elimination]) => [
  ...Array.from({length:groups}, (_, i) => ({ id:category+'-g'+i, category, phaseIndex:0 })),
  ...Array.from({length:elimination}, (_, i) => ({ id:category+'-e'+i, category, phaseIndex:1 }))
]);
const game = (category, phase) => matches.find(m => m.category === category && m.phaseIndex === phase);
matches.forEach(m => { m.p1 = 'Dupla A'; m.p2 = 'Dupla B'; });
const done = m => !!m.resultAt;
assert.deepEqual(order.stages(t).map(s => [s.category, s.kind, s.parallel]), [
  ['Fem Diamante','groups',false], ['Fem Ouro','groups',false],
  ['Fem Diamante','elimination',false], ['Fem Ouro','elimination',true],
  ['Fem Prata','groups',false], ['Fem Prata','elimination',false]
]);
assert(order.valid(order.stages(t)));
const invalid = order.stages(t).map(s => ({...s}));
invalid.splice(1, 0, invalid.splice(2, 1)[0]);
invalid[1].parallel = true;
assert(!order.valid(invalid), 'a eliminatória não pode dividir a onda com sua própria classificatória');
t.scheduleWindow.phaseCallOrder = invalid;
assert(order.valid(order.stages(t)), 'uma ordem salva inválida usa a grade padrão');
delete t.scheduleWindow.phaseCallOrder;
assert(order.allowed(t,matches,game('Fem Diamante',0),done));
assert(order.covers(t,game('Fem Diamante',0)));
assert(!order.covers(t,{ id:'extra', category:'Extra', phaseIndex:0 }), 'jogo fora da grade mantém a checagem de data');
assert(!order.allowed(t,matches,game('Fem Prata',0),done));
const silverOpened = { ...game('Fem Prata',1), id:'silver-opened', officialGroupBracket:true,
  courtCalledAt:'2026-11-13T21:30:00Z' };
const silverNext = { ...game('Fem Prata',1), id:'silver-next', officialGroupBracket:true };
assert(!order.allowed(t,matches,silverNext,done),
  'antes da primeira chamada da Prata, a grade conserva a ordem das etapas');
assert(order.allowed(t,[...matches,silverOpened],silverNext,done),
  'após a primeira chamada oficial da Prata, o próximo confronto definido entra na fila');
assert(!order.allowed(t,[...matches,silverOpened],{...silverNext,p2:'TBD'},done),
  'partida com adversário ainda indefinido não pode ser chamada');
const earlyOuro = {...game('Fem Ouro',1), officialGroupBracket:true};
assert(order.allowed(t,matches,earlyOuro,done),
  'confronto Ouro oficial com duas duplas conhecidas pode ser chamado antes dos outros grupos terminarem');
assert(!order.allowed(t,matches,{ id:'prata-tb', category:'Fem Prata', isTieBreak:true, phaseIndex:0 },done));
matches.filter(m => m.category === 'Fem Diamante' && m.phaseIndex === 0).forEach(m => m.resultAt='x');
assert(order.allowed(t,matches,game('Fem Ouro',0),done),
  'Ouro começa após os 24 jogos Diamante, sem exigir sua chave materializada');
assert(order.allowed(t,matches,game('Fem Diamante',1),done),
  'Diamante definida entra na fila mesmo com grupos Ouro em andamento');
const pendingTie = { category:'Fem Diamante', status:'pending' };
t.phaseTieDecisions = { '0': { 'diamante-a1:1:2':pendingTie } };
assert(order.allowed(t,matches,game('Fem Ouro',0),done),
  'classificatória Ouro pode ocupar as outras quadras enquanto a simples Diamante aguarda');
assert(order.allowed(t,matches,game('Fem Diamante',1),done),
  'desempate de outro grupo não bloqueia um confronto Diamante já definido');
matches.filter(m => m.category === 'Fem Ouro' && m.phaseIndex === 0).forEach(m => m.resultAt='x');
assert(order.allowed(t,matches,game('Fem Diamante',1),done),
  'confronto Diamante com duas duplas definidas segue apesar do desempate de outro grupo');
const dependentElimination = { ...game('Fem Diamante',1), p2:'A definir' };
assert(!order.allowed(t,matches,dependentElimination,done),
  'confronto dependente da simples aguarda a dupla ainda indefinida');
delete t.phaseTieDecisions;
t.phaseCategoryMaterialized['Fem Diamante'] = {at:'x'};
t.phaseCategoryMaterialized['Fem Ouro'] = {at:'x'};
const model = fs.readFileSync('js/views/bracket-model.js', 'utf8');
const collectStart = model.indexOf('window._collectAllMatches = function _collectAllMatches');
const collectEnd = model.indexOf('\n  };', collectStart);
assert(collectStart > 0 && collectEnd > collectStart);
const context = { window:{} };
vm.createContext(context);
vm.runInContext(model.slice(collectStart, collectEnd + 5), context);
const mixedStorage = { matches:matches, rounds:[{matches:matches.map(m => ({...m, resultAt:undefined}))}],
  groups:[{ rounds:[{ matches:matches.map(m => ({...m, resultAt:undefined})) }] }] };
const duplicated = context.window._collectAllMatches(mixedStorage);
assert.equal(duplicated.length, matches.length * 3);
assert(order.allowed(t,duplicated,game('Fem Diamante',1),done));
assert(order.allowed(t,duplicated,game('Fem Ouro',1),done));
assert(!order.allowed(t,matches,game('Fem Prata',0),done));
matches.filter(m => m.phaseIndex === 1 && m.category !== 'Fem Prata').forEach(m => m.resultAt='x');
assert(order.allowed(t,matches,game('Fem Prata',0),done));
// A organização pode optar por sequenciar as eliminatórias em vez de dividi-las.
t.scheduleWindow.phaseCallOrder = order.stages(t).map(s => ({...s}));
t.scheduleWindow.phaseCallOrder[3].parallel = false;
matches.filter(m => m.category === 'Fem Diamante' && m.phaseIndex === 1).forEach(m => delete m.resultAt);
matches.filter(m => m.category === 'Fem Ouro' && m.phaseIndex === 1).forEach(m => delete m.resultAt);
assert(order.allowed(t,matches,game('Fem Diamante',1),done));
assert(!order.allowed(t,matches,game('Fem Ouro',1),done));
// A grade editada não pode exigir fases futuras para liberar o primeiro jogo.
// Fases cujas janelas se sobrepõem dividem as quadras de propósito.
const proposal = grid.suggest({ days:[{day:'2026-11-13',startTime:'08:00',endTime:'21:00'}],
  courts:8, gameDuration:30, callTime:5, warmupTime:5, eliminationPlayMinutes:25,
  categories:[{name:'Fem Diamante',groups:8},{name:'Fem Ouro',groups:16},{name:'Fem Prata',groups:12}] });
assert.equal(proposal.error, undefined);
const planned = { gameDuration:30, callTime:5, warmupTime:5, phaseCategoryMaterialized:{},
  scheduleWindow:{ interleavedPlan:{...proposal.plan, editorVersion:2} } };
const plannedMatches = categories.flatMap(([category, groups, elimination]) => [
  ...Array.from({length:groups}, (_, i) => ({ id:category+'-planned-g'+i, category, phaseIndex:0 })),
  ...Array.from({length:elimination}, (_, i) => ({ id:category+'-planned-e'+i, category, phaseIndex:1 }))
]);
plannedMatches.forEach(m => { m.p1 = 'Dupla A'; m.p2 = 'Dupla B'; });
const plannedGame = (category, phase) => plannedMatches.find(m => m.category === category && m.phaseIndex === phase);
assert(order.allowed(planned, plannedMatches, plannedGame('Fem Diamante',0),done));
assert(!order.allowed(planned, plannedMatches, plannedGame('Fem Ouro',0),done));
plannedMatches.filter(m => m.category === 'Fem Diamante' && m.phaseIndex === 0).forEach(m => m.resultAt='x');
assert(order.allowed(planned, plannedMatches, plannedGame('Fem Ouro',0),done));
assert(order.allowed(planned, plannedMatches, plannedGame('Fem Diamante',1),done),
  'Diamante não aguarda o fechamento da classificatória Ouro');
planned.phaseCategoryMaterialized['Fem Diamante'] = {at:'x'};
plannedMatches.filter(m => m.category === 'Fem Ouro' && m.phaseIndex === 0).forEach(m => m.resultAt='x');
planned.phaseCategoryMaterialized['Fem Ouro'] = {at:'x'};
assert(order.allowed(planned, plannedMatches, plannedGame('Fem Diamante',1),done));
assert(order.allowed(planned, plannedMatches, plannedGame('Fem Ouro',1),done));
assert(!order.allowed(planned, plannedMatches, plannedGame('Fem Prata',0),done),
  'Prata espera as eliminatórias Diamante e Ouro, mesmo com janelas sobrepostas');
plannedGame('Fem Prata',0).courtCalledAt = '2026-11-13T18:30:00Z';
assert(order.allowed(planned, plannedMatches, plannedMatches.find(m => m.category === 'Fem Prata' && m.phaseIndex === 0 && !m.courtCalledAt),done),
  'após a organização iniciar a Prata, os próximos grupos podem ser chamados sem aguardar todos os placares da Ouro');
delete plannedGame('Fem Prata',0).courtCalledAt;
plannedMatches.filter(m => m.phaseIndex === 1 && m.category !== 'Fem Prata')
  .forEach(m => { m.resultAt = 'x'; });
assert(order.allowed(planned, plannedMatches, plannedGame('Fem Prata',0),done));
const sameTime = { ...planned, phaseCategoryMaterialized:{}, scheduleWindow:{
  interleavedPlan:{ ...proposal.plan, editorVersion:2, blocks:proposal.plan.blocks.map(block =>
    block.kind === 'elimination' && block.category === 'Fem Diamante'
      ? { ...block, startTime:'08:00' } : block) }
} };
const simultaneousMatches = plannedMatches.map(match => ({...match}));
simultaneousMatches.filter(match => match.category === 'Fem Diamante' && match.phaseIndex === 0)
  .forEach(match => { delete match.resultAt; });
assert(!order.allowed(sameTime, simultaneousMatches, plannedGame('Fem Diamante',1), done),
  'eliminatória não pode começar junto com sua própria classificatória inconclusa');
simultaneousMatches.filter(match => match.category === 'Fem Diamante' && match.phaseIndex === 0)
  .forEach(match => { match.resultAt = 'x'; });
sameTime.phaseCategoryMaterialized['Fem Diamante'] = {at:'x'};
assert(order.allowed(sameTime, simultaneousMatches, plannedGame('Fem Diamante',1), done));
console.log('Fila libera Ouro após jogos Diamante e aguarda desempate antes da eliminatória');
