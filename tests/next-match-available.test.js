'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const window = {};
const context = vm.createContext({ window });
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/next-match.js'), 'utf8'), context);
const next = window.ScoreplaceNextMatch;
for (const placeholder of ['Vencedor do Grupo 9', 'Perdedora do jogo 12',
  'Classificada A1', 'A definir', 'TBD']) {
  assert.equal(next.knownSide(placeholder), false, placeholder + ' não é uma dupla definida');
}
const called = { id: 'court', court: 'Quadra 4', courtCalledAt: '2026-10-23T18:00:00Z',
  p1: 'Ana / Bia', team1Uids: ['ana-uid', 'bia-uid'], p2: 'Caio / Dora', team2Uids: ['caio-uid', 'dora-uid'] };
const busy = { id: 'busy', p1: 'Ana / Eva', team1Uids: ['ana-uid', 'eva-uid'], p2: 'Fabio / Gabi' };
const free = { id: 'free', p1: 'Hugo / Iara', p2: 'Joao / Keli' };
assert.equal(next.firstAvailable([busy, free], [called], {}).id, 'busy',
  'antes de carregar occupancy, a seleção isolada mantém a agenda sem lançar erro');
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/court-occupancy.js'), 'utf8'), context);
assert.equal(next.firstAvailable([busy, free], [called], {}).id, 'free',
  'após carregar occupancy, pula dupla que já disputa outro jogo');
assert.equal(next.firstAvailable([busy, free], [called], { court: 'released' }).id, 'busy',
  'jogo liberado sem placar deixa de bloquear a dupla');
assert.equal(next.firstAvailable([busy], [called], {}), null,
  'não inventa próximo jogo se todas as duplas estão em quadra');
assert.equal(next.conflictsWithActive({ id:'x', p1:'Ana', p1Uid:'outra-ana', p2:'Zoe' }, [called]), false,
  'duas pessoas identificadas com o mesmo nome não se confundem');
assert.equal(next.conflictsWithActive({ id:'x', p1:'Ana / Outra', p2:'Zoe' }, [called]), true,
  'sem UID no próximo jogo, o nome da atleta já identificada em quadra impede a chamada');
assert.equal(next.conflictsWithActive({ id:'x', p1:'Manual / Outra', p2:'Zoe' },
  [{ id:'court2', p1:'Manual / Parceira', p2:'Pedro' }]), true,
  'nomes manuais sem ID bloqueiam a dupla correta');
const activeTie = { phaseTieDecisions:{ '0':{ group:{ matches:[{
  id:'tie-1', court:'Quadra 2', courtCalledAt:'2026-11-13T12:00:00Z',
  p1:{name:'Ana'}, p2:{name:'Bia'}
}] } } } };
assert.equal(next.firstAvailable([{ id:'later', p1:'Ana / Eva', p2:'Caio / Dora' }],
  [], {}, activeTie), null, 'desempate em quadra também impede chamar a mesma atleta');
const identifiedTie = { phaseTieDecisions:{ '0':{ group:{ matches:[{
  id:'tie-uid', court:'Quadra 2', courtCalledAt:'2026-11-13T12:00:00Z',
  p1:{name:'Ana', key:'uid:ana-1'}, p2:{name:'Bia', key:'uid:bia-1'}
}] } } } };
assert.equal(next.firstAvailable([{ id:'other-ana', p1:'Ana', p1Uid:'ana-2', p2:'Zoe' }],
  [], {}, identifiedTie).id, 'other-ana', 'nome igual com UID distinto continua chamável');
assert.equal(next.firstAvailable([{ id:'same-ana', p1:'Ana', p1Uid:'ana-1', p2:'Zoe' }],
  [], {}, identifiedTie), null, 'UID do desempate ainda bloqueia a mesma atleta');
const serverDraw = require('../functions-autodraw/draw-core.js');
assert.equal(serverDraw._window, globalThis, 'o shim do servidor compartilha window com globalThis');
assert.equal(typeof serverDraw._window.ScoreplaceNextMatch.conflictsWithActive, 'function',
  'a callable de quadra recebe a mesma regra de conflito no servidor real');
const backend = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const groupGuardStart = backend.indexOf("if (court && ['call', 'restore'].includes(requestedTieAction.type))");
const groupGuardEnd = backend.indexOf("if (requestedTieAction.type === 'clock')", groupGuardStart);
const titleGuardStart = backend.indexOf("if (['call', 'restore'].includes(action.type))", backend.indexOf('const next = { source:'));
const titleGuardEnd = backend.indexOf("if (action.type === 'clock')", titleGuardStart);
assert(groupGuardStart >= 0 && groupGuardEnd > groupGuardStart &&
  titleGuardStart >= 0 && titleGuardEnd > titleGuardStart,
  'guardas das duas chamadas de desempate localizadas');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const occupancy = require('../js/domain/court-occupancy.js');
const groupGuard = new Function('t', 'target', 'court', 'requestedTieAction', 'drawWindow', '_courtOccupancy', 'HttpsError', 'released',
  backend.slice(groupGuardStart, groupGuardEnd) + ' return true;');
const titleGuard = new Function('t', 'match', 'court', 'action', 'drawWindow', '_courtOccupancy', 'HttpsError', 'released',
  backend.slice(titleGuardStart, titleGuardEnd) + ' return true;');
const regularAna = { id:'regular-ana', court:'Quadra 1', courtCalledAt:'2026-11-14T12:00:00Z',
  p1:'Ana', p1Uid:'ana-1', p2:'Beatriz', p2Uid:'bia-1' };
const regularTournament = { games:[regularAna] };
const validationWindow = { _collectAllMatches:tournament=>tournament.games,
  ScoreplaceNextMatch:serverDraw._window.ScoreplaceNextMatch };
for (const [label, guard] of [
  ['classificatório', groupGuard, 'requestedTieAction'],
  ['de título', titleGuard, 'action']
]) {
  const tie = { id:'tie-ana', court:'Quadra 2', p1:{ name:'Ana', key:'uid:ana-1' },
    p2:{ name:'Carla', key:'uid:carla-1' } };
  const action = { type:'call' };
  assert.throws(() => guard(regularTournament, tie, 'Quadra 2', action,
    validationWindow, occupancy, HttpsError, {}), /já está em quadra/,
  `desempate ${label} não chama Ana já em jogo regular noutra quadra`);
  assert.equal(tie.courtCalledAt, undefined, `desempate ${label} recusado não registra chamada`);
  const otherAna = { ...tie, id:'tie-other-ana', p1:{ name:'Ana', key:'uid:ana-2' } };
  assert.equal(guard(regularTournament, otherAna, 'Quadra 2', action,
    validationWindow, occupancy, HttpsError, {}), true,
  `desempate ${label} permite Ana distinta com outro UID`);
}
console.log('✓ próximo jogo pula participantes ocupados e respeita identidade');

// Any of the four people blocks another confrontation, independently of court.
for (const index of [0,1,2,3]) {
  const names=['P1','P2','P3','P4'], ids=['u1','u2','u3','u4'];
  const candidate={id:'four',p1:names.slice(0,2).join(' / '),p2:names.slice(2).join(' / '),team1Uids:ids.slice(0,2),team2Uids:ids.slice(2)};
  for (const court of ['Quadra 1','Quadra 2']) {
    const occupied={id:'other',p1:names[index]+' / Outra',p2:'Terceira / Quarta',team1Uids:[ids[index],'other'],court,courtCalledAt:'2026-11-25T12:00:00Z'};
    assert.equal(next.firstAvailable([candidate],[occupied],{}),null,'qualquer posição bloqueia em '+court);
    assert.equal(next.firstAvailable([candidate],[{...occupied,courtCalledAt:null}],{}).id,'four','previsão não ocupa');
    assert.equal(next.firstAvailable([candidate],[{...occupied,winner:occupied.p1,resultAt:'2026-11-25T13:00:00Z'}],{}).id,'four','resultado libera atleta');
    assert.equal(next.firstAvailable([candidate],[occupied],{other:'released'}).id,'four','encerramento libera atleta');
  }
}
assert.equal(next.conflictsWithActive({id:'manual-next',team1:['Ana','Bia'],team1Uids:[null,null],team1ManualIds:['slot-a','slot-b'],team2:['Cris','Dani'],team2ManualIds:['slot-c','slot-d']},
  [{id:'manual-active',team1:['Nome corrigido','Eva'],team1Uids:[null,null],team1ManualIds:['slot-d','slot-e']}]),true,'identidade manual bloqueia mesmo com nome corrigido');

const fast8 = require('../js/domain/group-alternation.js');
function fastFixture(rounds = 3) {
  const assignments = [['A','B',1,1,[1,2]],['B','B',2,2,[1,2]],['C','C',1,1,[3,4]],
    ['D','C',2,1,[5,6]],['E','C',3,2,[3,4]],['F','C',4,2,[5,6]]].map(([label,category,groupNumber,entry,courts]) =>
    ({label,category,groupNumber,entry,courts,phaseIndex:0}));
  const t = {id:'synthetic-fast-eight',courtCount:6,courtNames:Array.from({length:6},(_,i)=>'Quadra '+(i+1)),
    currentPhaseIndex:0,phases:[{kind:'classification',classification:{partnerRotation:'groups',rotationCategoryRules:
      ['B','C'].map(category=>({category,rounds,groupFormation:{mode:'size',value:8},groupAlternation:true}))}}],
    scheduleWindow:{interleavedPlan:{schema:2,groupAssignments:assignments}},matches:[]};
  for (const g of assignments) for (let round=1;round<=rounds;round++) for (let lane=0;lane<2;lane++) {
    const order=round===1?[0,1,2,3,4,5,6,7]:[0,4,1,5,2,6,3,7];
    const people=order.slice(lane*4,lane*4+4).map(n=>g.label+'-player-'+n);
    t.matches.push({id:g.label+'-'+round+'-'+lane,isMonarch:true,groupIdx:g.groupNumber-1,phaseIndex:0,category:g.category,
      round,scheduledGroupLabel:g.label,scheduledAt:new Date(Date.parse('2026-11-25T12:00:00Z')+((round-1)*2+g.entry-1)*35*60000).toISOString(),
      _gameNum:(round-1)*12+(g.entry-1)*6+assignments.filter(row=>row.entry===g.entry).indexOf(g)*2+lane+1,p1:people.slice(0,2).join(' / '),p2:people.slice(2).join(' / '),
      team1:people.slice(0,2),team2:people.slice(2),team1Uids:people.slice(0,2),team2Uids:people.slice(2)});
  }
  t._nJogos=t.matches.length;return t;
}
const ft=fastFixture(), fr={}, fh={occupancy,next};
const fm=id=>ft.matches.find(m=>m.id===id);
const fsnap=()=>fast8.selection(ft,ft.matches,fr,fh);
assert(fast8.config(ft).eligible);
assert.equal(fsnap().next.id,'A-1-0');
assert(fsnap().check(fm('A-1-0'),'Quadra 5').ok,'quadra impressa é sugestão, permite remanejamento');
assert.deepEqual(fsnap().batch.map(m=>m.scheduledGroupLabel),['A','A','C','C','D','D']);
for(const entry of fast8.sequence(ft,ft.matches).filter(e=>e.match.round===1 && e.group.entry===1)) {
  const m=entry.match,g=entry.group;
  m.scheduledCourt=g.courts[Number(m.id.slice(-1))];m.court=m.scheduledCourt;m.courtCalledAt='2026-11-25T12:00:00Z';
}
assert.equal(fsnap().next.id,'B-1-0');
fr['D-1-0']='2026-11-25T12:10:00Z';
assert.equal(fsnap().next.id,'F-1-0','Q5 livre sugere seu próximo jogo, não o B da Q1');
assert(fsnap().check(fm('B-1-0'),'Quadra 5').ok,'organizador pode escolher B manualmente');
assert.equal(fsnap().check(fm('B-1-0'),'Quadra 3').reason,'fast8-wrong-court','quadra ocupada sempre bloqueia');
assert.equal(fsnap().check(fm('A-2-0'),'Quadra 5').reason,'fast8-player-busy','ambos os jogos anteriores do grupo precisam terminar');
fr['A-1-0']='2026-11-25T12:15:00Z';
assert.equal(fsnap().check(fm('A-2-0'),'Quadra 5').reason,'fast8-player-busy','uma metade livre não libera todo o grupo');
fr['A-1-1']='2026-11-25T12:16:00Z';
assert(fsnap().check(fm('A-2-0'),'Quadra 5').ok,'outra entrada não é barreira para escolha manual segura');
assert.equal(fast8.selection(ft,ft.matches,fr,{...fh,lastReleasedByCourt:{'Quadra 5':{releasedAt:'2026-11-25T12:18:00Z'}}}).next.id,'F-1-0',
  'quadra recém liberada prioriza a própria fila');
assert.equal(fast8.selection(ft,ft.matches.slice(1),fr,fh).check(fm('C-2-0')).reason,'fast8-incomplete-draw');
const legacy=fastFixture();legacy.scheduleWindow.groupAlternation=true;
legacy.phases[0].classification.rotationCategoryRules.forEach(r=>delete r.groupAlternation);
assert(!fast8.config(legacy).eligible,'legado exige migração explícita');
const four=fastFixture();four.phases[0].classification.rotationCategoryRules.forEach(r=>r.groupFormation.value=4);
assert(!fast8.config(four).eligible);
const off=fastFixture();off.phases[0].classification.rotationCategoryRules.forEach(r=>r.groupAlternation=false);
assert(!fast8.enabled(off));
const mixed=fastFixture();mixed.phases[0].classification.rotationCategoryRules[1].groupAlternation=false;
const mixedState=fast8.selection(mixed,mixed.matches,{},fh);
assert(mixedState.waiting.some(m=>m.category==='C'),'categoria normal continua na fila');
assert(mixedState.check(mixed.matches.find(m=>m.category==='C'),'Quadra 5').ok);
for(const count of [2,3,4,5]) assert(fast8.categoryEligibility({},Array(count).fill(8)).eligible);
assert(!fast8.categoryEligibility({},[8]).eligible);
assert(!fast8.categoryEligibility({},[8,7]).eligible);
assert(fast8.eightConfig({parceria:'rotation_groups',rotationCategoryRules:[{category:'B',groupFormation:{mode:'count',value:3}}]},()=>24));
assert(!fast8.eightConfig({parceria:'rotation_groups',rotationCategoryRules:[{category:'B',groupFormation:{mode:'count',value:3}}]},()=>21));
console.log('✓ Fast 8 por categoria: fila da súmula por quadra, remanejamento manual, atletas ocupados e grupos ímpares');
