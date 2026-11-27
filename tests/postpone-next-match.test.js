'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = source.indexOf('window._bracketPostponedOrder = function');
const end = source.indexOf('window._bracketEnsureCourtReleaseListener = function', start);
assert(start > 0 && end > start);
const context = { window: {}, Map, String, Array };
vm.runInNewContext(source.slice(start, end), context);
const ordered = (postponed) => Array.from(context.window._bracketPostponedOrder(
  [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }], postponed), m => m.id);

assert.deepEqual(ordered([]), ['j1', 'j2', 'j3']);
assert.deepEqual(ordered(['j1']), ['j2', 'j3', 'j1']);
assert.deepEqual(ordered(['j1', 'j2']), ['j3', 'j1', 'j2']);
assert.deepEqual(ordered(['j2', 'j1']), ['j3', 'j2', 'j1']);
assert.deepEqual(ordered(['j1', 'j2', 'j3']), ['j1', 'j2', 'j3']);
assert.deepEqual(ordered(['antigo', 'j1']), ['j2', 'j3', 'j1']);
assert.deepEqual(Array.from(context.window._bracketPostponedOrder(
  [{ id: 'j19' }, { id: 'j20' }, { id: 'j22' }], ['j19'], ['j19']), m => m.id),
['j19', 'j20', 'j22'], 'após chamar outro jogo, o pulado volta antes do seguinte');
assert.deepEqual(Array.from(context.window._bracketPostponedOrder(
  [{ id: 'j19' }, { id: 'j20' }, { id: 'j22' }], ['j19'], []), m => m.id),
['j20', 'j22', 'j19'], 'pular novamente adia o mesmo jogo até a próxima chamada');
const selectStart = source.indexOf('window._bracketOperationsSelect = function');
const selectEnd = source.indexOf('\nfunction _bracketReconcileOperationalOrder(', selectStart);
assert(selectStart > end && selectEnd > selectStart);
vm.runInNewContext(fs.readFileSync('js/domain/court-occupancy.js', 'utf8'), context);
context.window.ScoreplaceNextMatch = { knownSide:() => true, firstAvailable:list => list[0] || null };
context.window._collectAllMatches = t => t.matches;
context.window._bracketCourtReleased = () => ({});
context.window._bracketCourtPostponed = () => ['j1'];
context.window._bracketCourtPostponedReady = () => [];
context.window._dashboardNextMatchCompare = (a, b) => Date.parse(a.item.m.scheduledAt) - Date.parse(b.item.m.scheduledAt);
context._matchCardTimestamp = value => Date.parse(value);
context._bracketOperationsGroup = () => null;
context.Date = Date;
context.Set = Set;
vm.runInNewContext(source.slice(selectStart, selectEnd), context);
const futureMatches = ['j1', 'j2', 'j3'].map((id, index) => ({ id, p1:'A', p2:'B',
  scheduledAt:new Date(Date.UTC(2026, 10, 13, 12, index * 35)).toISOString() }));
const nextFor = id => context.window._bracketOperationsSelect({ id, courtCount:2, matches:futureMatches }).next.id;
assert.equal(nextFor('sb_future_event'), 'j2');
assert.equal(nextFor('tour_future_event'), 'j2');
context.window._bracketCourtReleased = () => ({ j1:'2026-11-13T13:00:00Z' });
const withPending = context.window._bracketOperationsSelect({ id:'tour_future_event', courtCount:2, matches:futureMatches });
assert(!withPending.future.some(m => m.id === 'j1'), 'placar pendente não reaparece nos próximos jogos');
assert(withPending.pending.some(m => m.id === 'j1'), 'placar permanece acessível em pendentes');
context.window._bracketCourtReleased = () => ({});
const originalKnownSide=context.window.ScoreplaceNextMatch.knownSide;
context.window.ScoreplaceNextMatch.knownSide=value=>!!value && value!=='TBD';
const finalCalled={id:'final',scheduledGameNumber:90,p1:'Ana',p2:'Bia',court:'Quadra 1',courtCalledAt:'2026-11-27T19:00:00Z'};
const phantomThird={id:'third-legacy',label:'BUI.THIRDPLACEMATCH',phase:'thirdplace',p1:'TBD',p2:'TBD'};
const finishedQueue=context.window._bracketOperationsSelect({id:'no-third-place',courtCount:2,matches:[finalCalled,phantomThird]});
assert(!finishedQueue.next,'sem confronto real ainda chamável, não há próxima partida');
assert.equal(finishedQueue.future.length,0,'placeholder de terceiro lugar sem número não aparece após a final');
context.window.ScoreplaceNextMatch.knownSide=originalKnownSide;
const groupStart = source.indexOf('function _bracketOperationsGroup(');
const groupEnd = source.indexOf('\nfunction _bracketOperationsNavHtml(', groupStart);
assert(groupStart > 0 && groupEnd > groupStart);
context.window._bracketMonarchGroupLabel = (_, group) => group.name;
vm.runInNewContext(source.slice(groupStart, groupEnd), context);
const series = [19, 20, 21, 22].map((number, index) => ({
  id: 'j' + number, _gameNum: number, p1: 'A / B', p2: 'C / D',
  isMonarch: index < 3, category: 'Fem Diamante', round: 1,
  monarchGroup: index < 3 ? 6 : 7, phaseIndex: 0,
  scheduledAt: new Date(Date.UTC(2026, 10, 13, 12, index * 35)).toISOString()
}));
const event = { id: 'tour_series', courtCount: 2, scheduleWindow: { days: [{ day: '2026-11-13' }] }, matches: series };
context.window._bracketCourtPostponed = () => ['j19'];
context.window._bracketCourtPostponedReady = () => [];
assert.equal(context.window._bracketOperationsSelect(event).next.id, 'j22',
  'pular o primeiro da série não oferece o segundo nem o terceiro');
context.window._bracketCourtPostponedReady = () => ['j19'];
assert.equal(context.window._bracketOperationsSelect(event).next.id, 'j19',
  'depois de outra chamada, o primeiro da série retorna');
context.window._bracketCourtPostponedReady = () => [];
assert.equal(context.window._bracketOperationsSelect(event).next.id, 'j22',
  'pular outra vez mantém o mesmo primeiro jogo adiado');
const activeDiamond = Array.from({ length: 8 }, (_, index) => ({
  id: 'diamond-' + index, category:'Fem Diamante', p1:'Diamante A' + index, p2:'Diamante B' + index,
  court:'Quadra ' + (index + 1), courtCalledAt:'2026-11-13T11:00:00.000Z',
  scheduledAt:'2026-11-13T11:00:00.000Z'
}));
const firstGold = { id:'gold-1', category:'Fem Ouro', phaseIndex:1, p1:'Ouro A', p2:'Ouro B',
  scheduledAt:'2026-11-13T12:40:00.000Z' };
context.window.ScoreplacePhaseCallOrder = { allowed:(_, __, m) => m.category === 'Fem Diamante' };
context.window._bracketCourtPostponed = () => [];
context.window._bracketCourtPostponedReady = () => [];
const fullCourts = context.window._bracketOperationsSelect({ id:'tour_full_courts', courtCount:8,
  matches:[...activeDiamond, firstGold] });
assert.equal(fullCourts.active.length, 8);
assert.equal(fullCourts.next.id, 'gold-1', 'mostra o primeiro Ouro mesmo com todas as quadras ocupadas');
assert.equal(fullCourts.nextCallable, true, 'jogo definido de outra etapa permanece candidato a chamada');
const scheduledPlan = { id:'tour_interleaved_order', courtCount:8,
  scheduleWindow:{ interleavedPlan:{ schema:1, editorVersion:2, blocks:[] } }, matches:[firstGold] };
assert.equal(context.window._bracketOperationsSelect(scheduledPlan).next.id, firstGold.id,
  'ordem da agenda prioriza, mas não esconde confronto definido quando não há outro jogo disponível');
assert.equal(context.window._bracketOperationsSelect(scheduledPlan).nextCallable, true);
const withoutHour = { id:'gold-without-hour', category:'Fem Ouro', phaseIndex:1,
  p1:'Ouro A', p2:'Ouro B' };
const unscheduled = context.window._bracketOperationsSelect({ id:'tour_unscheduled', courtCount:2,
  scheduleWindow:{ days:[{ day:'2026-11-14' }, { day:'2026-11-15' }] },
  matches:[withoutHour] });
assert.equal(unscheduled.next.id, withoutHour.id,
  'confronto definido sem horário entra na fila operacional também em torneio de dois dias');
assert(unscheduled.freeCourts.includes('Quadra 2'), 'quadra livre é calculada junto da fila');
const priority = context.window._bracketOperationsSelect({ id:'tour_priority', courtCount:2,
  matches:[firstGold, { ...withoutHour, id:'diamond-priority', category:'Fem Diamante' }] });
assert.equal(priority.next.id, 'diamond-priority',
  'agenda prioriza sua fase, mesmo se o confronto de outra fase tem horário anterior');
assert(priority.queue.some(m => m.id === firstGold.id),
  'a fase adiada continua selecionável pelo organizador');
const withTie = { id:'tour_full_courts', courtCount:8, matches:[...activeDiamond, firstGold],
  phaseTieDecisions:{ '0':{ 'group-0:1:2':{ choice:'play', status:'pending', groupName:'Fem Diamante · Grupo A1',
    matches:[{ id:'tie-a', displayGameNumber:'3A', p1:{name:'Ana'}, p2:{name:'Bia'} }] } } } };
const nextTie = context.window._bracketOperationsSelect(withTie);
assert.equal(nextTie.next.id, 'tie-a', 'desempate pendente precede a próxima partida regular');
assert.equal(nextTie.next.isTieBreak, true);
assert.equal(nextTie.next.category, 'Fem Diamante · Grupo A1',
  'metadado do grupo permanece na fila mesmo com a designação curta no card');
assert.equal(nextTie.tieCanPostpone, true, 'outro jogo pronto pode ser chamado mesmo sem prioridade na grade');
context.window.ScoreplacePhaseCallOrder = { allowed:() => true };
assert.equal(context.window._bracketOperationsSelect(withTie).tieCanPostpone, true,
  'com jogo pronto de outra fase, organizador pode adiar o desempate Diamante');
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].postponedAt = '2026-11-13T12:02:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, firstGold.id,
  'pular desempate mostra o Ouro na fila');
firstGold.courtCalledAt = '2026-11-13T12:03:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, 'tie-a',
  'após chamar o Ouro, desempate retorna para nova decisão do organizador');
const secondGold = { id:'gold-2', category:'Fem Ouro', phaseIndex:1, p1:'Ouro C', p2:'Ouro D',
  scheduledAt:'2026-11-13T12:45:00.000Z' };
withTie.matches.push(secondGold);
assert.equal(context.window._bracketOperationsSelect(withTie).tieCanPostpone, true,
  'o desempate que voltou pode ser pulado novamente se outro jogo está pronto');
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].postponedAt = '2026-11-13T12:04:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, secondGold.id,
  'novo adiamento oferece o jogo seguinte');
withTie.matches.pop();
delete firstGold.courtCalledAt;
delete withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].postponedAt;
context.window.ScoreplacePhaseCallOrder = { allowed:(_, __, m) => m.category === 'Fem Diamante' };
const laterDiamond = { id:'diamond-later', category:'Fem Diamante', p1:'Outra A', p2:'Outra B',
  phaseIndex:0, scheduledAt:'2026-11-13T13:00:00.000Z' };
withTie.matches.push(laterDiamond);
assert.equal(context.window._bracketOperationsSelect(withTie).tieCanPostpone, true,
  'o estado do desempate reconhece outro jogo elegível na mesma fase');
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].postponedAt = '2026-11-13T12:02:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, laterDiamond.id,
  'pular a simples deixa o próximo jogo classificatório ser chamado');
laterDiamond.courtCalledAt = '2026-11-13T13:00:00Z';
firstGold.courtCalledAt = '2026-11-13T13:00:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, 'tie-a',
  'sem outro jogo chamável, a simples volta antes da fase seguinte');
assert.equal(context.window._bracketOperationsSelect(withTie).tieCanPostpone, false,
  'na volta final o desempate é o único elegível');
const dependent = { id:'diamond-final', category:'Fem Diamante', phaseIndex:1,
  p1:'Classificado A1', p2:'Classificado A2', scheduledAt:'2026-11-13T14:00:00.000Z' };
withTie.matches.push(dependent);
context.window.ScoreplaceNextMatch.knownSide = side => !String(side).startsWith('Classificado');
assert.equal(context.window._bracketOperationsSelect(withTie).tieCanPostpone, false,
  'eliminatória indefinida não conta como alternativa ao desempate');
withTie.matches.pop();
delete firstGold.courtCalledAt;
delete withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].postponedAt;
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].court = 'Quadra 8';
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].courtCalledAt = '2026-11-13T12:00:00Z';
assert(context.window._bracketOperationsSelect(withTie).active.some(m => m.id === 'tie-a'),
  'desempate chamado aparece entre os jogos em quadra');
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, firstGold.id,
  'Ouro continua disponível enquanto o desempate ocupa uma quadra');
assert.equal(context.window._bracketOperationsSelect(withTie).waitingForTie, false);
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].courtReleasedAt = '2026-11-13T12:03:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, firstGold.id,
  'Ouro continua disponível se a quadra da simples for liberada');
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].sets = [{ p1:5, p2:3 }];
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].winnerKey = 'name:Ana';
assert(!context.window._bracketOperationsSelect(withTie).active.some(m => m.id === 'tie-a'),
  'resultado da simples, gravado com winnerKey, retira o card da faixa operacional');
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, firstGold.id,
  'Ouro volta à fila depois da decisão do desempate');
const concentratedStart = source.indexOf('window._isConcentratedTournament = function');
const concentratedEnd = source.indexOf('\nwindow._matchCoordsFromId = function', concentratedStart);
assert(concentratedStart > 0 && concentratedEnd > concentratedStart);
vm.runInNewContext(source.slice(concentratedStart, concentratedEnd), context);
const futureSchedule = { days:[{ day:'2026-11-13', startTime:'08:00', endTime:'19:30' }] };
assert.equal(context.window._isConcentratedTournament({ id:'sb_future_event', scheduleWindow:futureSchedule }), true);
assert.equal(context.window._isConcentratedTournament({ id:'tour_future_event', scheduleWindow:futureSchedule }), true);
assert.doesNotMatch(source, /data-postpone-next|data-tie-action="postpone"|action:\s*['"]postpone['"]/,
  'a faixa permite selecionar outro confronto sem botão nem envio de adiamento');
const reloadStart = source.indexOf('window._bracketReloadCourtState = function', start);
const reloadEnd = source.indexOf('window._bracketEnsureCourtReleaseListener = function', reloadStart);
assert(reloadStart > start && reloadEnd === end);
let resolveRead;
let sourceOption;
context.window.FirestoreDB = { db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
  get: option => { sourceOption = option; return new Promise(resolve => { resolveRead = resolve; }); }
}) }) }) }) } };
context.Promise = Promise;
const entry = { ready: true, revision: 7, postponed: ['j1'] };
const pending = context.window._bracketReloadCourtState('tour_test', entry);
assert.equal(entry.ready, false, 'o cache aguarda a revisão nova do servidor');
assert.equal(sourceOption.source, 'server');
resolveRead({ exists: true, data: () => ({ revision: 8, postponed: ['j2'], postponedReady: ['j1'] }) });
pending.then(() => {
  assert.equal(entry.ready, true);
  assert.equal(entry.revision, 8);
  assert.deepEqual(Array.from(entry.postponed), ['j2']);
  assert.deepEqual(Array.from(entry.postponedReady), ['j1']);
  console.log('✓ a fila respeita os adiamentos persistidos e a revisão confirmada pelo servidor');
}).catch(error => { console.error(error); process.exitCode = 1; });

// A recomendação física de uma quadra não muda a ordem pública da grade.
const fc={window:{},Map,Set,String,Array,Date};
for(const file of ['next-match','court-occupancy','group-alternation'])vm.runInNewContext(fs.readFileSync('js/domain/'+file+'.js','utf8'),fc);
vm.runInNewContext(source.slice(start,end),fc);
fc.window._collectAllMatches=t=>t.matches;fc.window._bracketCourtPostponed=()=>[];fc.window._bracketCourtPostponedReady=()=>[];
fc.window._dashboardNextMatchCompare=(a,b)=>fc.window.ScoreplaceGroupAlternation.compareQueue(a.item.m,b.item.m);
fc._matchCardTimestamp=v=>Date.parse(v)||0;fc._bracketOperationsGroup=()=>null;
vm.runInNewContext(source.slice(selectStart,selectEnd),fc);
const rows=[['A','B',1,1,[1,2]],['B','B',2,2,[1,2]],['C','C',1,1,[3,4]],['D','C',2,1,[5,6]],['E','C',3,2,[3,4]],['F','C',4,2,[5,6]]]
 .map(([label,category,groupNumber,entry,courts])=>({label,category,groupNumber,entry,courts,phaseIndex:0}));
const ft={id:'queue-grade',courtCount:6,courtNames:Array.from({length:6},(_,i)=>'Quadra '+(i+1)),currentPhaseIndex:0,
 phases:[{kind:'classification',classification:{partnerRotation:'groups',rotationCategoryRules:['B','C'].map(category=>({category,groupFormation:{mode:'size',value:8},groupAlternation:true}))}}],scheduleWindow:{interleavedPlan:{schema:2,groupAssignments:rows}},matches:[]};
for(const g of rows)for(let round=1;round<=3;round++)for(let lane=0;lane<2;lane++){
 const people=(round===1?[0,1,2,3,4,5,6,7]:[0,4,1,5,2,6,3,7]).slice(lane*4,lane*4+4).map(i=>g.label+'-p'+i);
 ft.matches.push({id:g.label+'-'+round+'-'+lane,isMonarch:true,category:g.category,groupIdx:g.groupNumber-1,scheduledGroupLabel:g.label,phaseIndex:0,round,
  scheduledAt:new Date(Date.parse('2026-11-26T12:00:00Z')+((round-1)*2+g.entry-1)*35*60000).toISOString(),
  scheduledGameNumber:(round-1)*12+(g.entry-1)*6+rows.filter(r=>r.entry===g.entry).indexOf(g)*2+lane+1,
  scheduledCourt:ft.courtNames[g.courts[lane]-1],p1:people.slice(0,2).join(' / '),p2:people.slice(2).join(' / '),team1Uids:people.slice(0,2),team2Uids:people.slice(2)});
}
ft._nJogos=ft.matches.length;const released={},cache={released,lastReleasedByCourt:{}};
fc.window._bracketCourtReleased=()=>released;fc.window._bracketCourtReleaseCache={[ft.id]:cache};
const match=id=>ft.matches.find(m=>m.id===id),read=()=>fc.window._bracketOperationsSelect(ft);
const call=(id,court)=>Object.assign(match(id),{court,courtCalledAt:'2026-11-26T12:11:00Z'});
const release=id=>{released[id]='2026-11-26T12:12:00Z';cache.lastReleasedByCourt[match(id).court]={releasedAt:released[id]};};
for(const m of ft.matches.filter(m=>m.scheduledGameNumber<=6))call(m.id,m.scheduledCourt);
assert.equal(read().next.id,'B-1-0');
release('A-1-0');call('B-1-0','Quadra 1');
assert.equal(read().next.id,'B-1-1','todas ocupadas: próximo B permanece primeiro');
release('D-1-0');const snapshot=JSON.stringify(ft),state=read();
assert.equal(state.fast8.next.id,'F-1-0','recomendação física original continua disponível internamente');
assert.equal(state.next.id,'B-1-1','F da quadra livre não ultrapassa o segundo B');
assert.deepEqual(Array.from(state.queue.slice(0,5),m=>m.id),['B-1-1','E-1-0','E-1-1','F-1-0','F-1-1']);
assert(state.fast8.check(match('B-1-1'),'Quadra 5').ok);
assert.equal(state.fast8.check(match('B-1-1'),'Quadra 2').ok,false,'quadra ocupada continua bloqueada');
assert.equal(JSON.stringify(ft),snapshot,'consulta não muda grade ou partidas');
const originalUid=match('B-1-1').team1Uids[0];match('B-1-1').team1Uids[0]=match('B-1-0').team1Uids[0];
assert.equal(read().next.id,'B-1-1','cabeça com atleta ocupado não promove posterior');assert.equal(read().fast8.check(match('B-1-1'),'Quadra 5').reason,'fast8-player-busy');match('B-1-1').team1Uids[0]=originalUid;
for(const [id,court,releaseId,next] of [['B-1-1','Quadra 5','D-1-1','E-1-0'],['E-1-0','Quadra 6','C-1-0','E-1-1'],['E-1-1','Quadra 3','C-1-1','F-1-0'],['F-1-0','Quadra 4','A-1-1','F-1-1']]){
 call(id,court);release(releaseId);assert.equal(read().next.id,next,'liberação em outra quadra mantém BB EE FF');
}
const odd=JSON.parse(JSON.stringify(ft));odd.id='odd-queue';odd.scheduleWindow.interleavedPlan.groupAssignments=odd.scheduleWindow.interleavedPlan.groupAssignments.filter(g=>g.label!=='F');odd.matches=odd.matches.filter(m=>m.scheduledGroupLabel!=='F');odd.matches.forEach(m=>{delete m.court;delete m.courtCalledAt;});odd._nJogos=odd.matches.length;
fc.window._bracketCourtReleased=()=>({});const oddState=fc.window._bracketOperationsSelect(odd);assert(oddState.fast8.eligible);assert.equal(oddState.next.scheduledGameNumber,1);assert.deepEqual(Array.from(oddState.queue,m=>m.scheduledGameNumber),Array.from(oddState.queue,m=>m.scheduledGameNumber).sort((a,b)=>a-b));fc.window._bracketCourtReleased=()=>released;
const savedCount=ft._nJogos;ft._nJogos++;assert.equal(read(),null,'carga incompleta não habilita chamada');ft._nJogos=savedCount;
console.log('✓ chamada Fast8 mantém grade BB EE FF independentemente da quadra livre');
