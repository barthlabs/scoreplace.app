'use strict';
const assert = require('node:assert/strict');
const rotation = require('../js/views/super-eight-core');
const draw = require('../functions-autodraw/draw-core');
const validate = require('../functions-autodraw/format-intent-validation-core').validateNewFormatIntent;
const format = draw._window.FORMAT2;
for (let n = 4; n <= 32; n++) {
  const players = Array.from({length:n}, (_, i) => 'Atleta' + i);
  for (const repeat of [true,false]) for (const g of [...Array(2*n).keys()].slice(1).concat(128)) {
    if (n*g % 4 || !repeat && g >= n) {
      assert(rotation.groupError(n,g,repeat)); continue;
    }
    const plan = rotation.buildGroups(players,g,repeat);
    const rounds = plan.rounds, counts = new Map(), partners = new Set();
    for (const round of rounds) {
      if (!plan.series) assert.equal(new Set(round.flat(2)).size,round.length*4);
      for (const match of round) {
        assert.equal(new Set(match.flat()).size,4);
        for (const pair of match) {
          const key = pair.slice().sort().join('|');
          if (!repeat) assert(!partners.has(key)); partners.add(key);
          for (const person of pair) counts.set(person,(counts.get(person) || 0) + 1);
        }
      }
    }
    assert.equal(counts.size,n);
    assert([...counts.values()].every(actual => actual === g));
    assert.equal(rounds.flat().length,n*g/4);
  }
}
function fixture(sizes, rounds, formations, repeat=[], advance=[]) {
  const categories=sizes.map((_,i)=>'Classe '+i);
  const cfg=format.defaultConfig('Beach Tennis');
  Object.assign(cfg,{parceria:'rotation_groups',disputa:'dupla',classifAtiva:true,grupos:1,classificados:2,classifScope:'per_group'});
  cfg.eliminatoria.ativa=advance.length>0;
  cfg.eliminatoria.origem='formar';
  cfg.rotationCategoryRules=categories.map((category,i)=>({category,groupFormation:formations[i],rounds:rounds[i],
    allowRepeatPartners:!!repeat[i],destination:advance.includes(i)?'elimination':'ranking'}));
  const participants=categories.flatMap((category,i)=>Array.from({length:sizes[i]},(_,j)=>({
    uid:category+'-'+j,displayName:category+' Jogador '+j,category,categories:[category],ligaActive:true
  })));
  validate(cfg,Error,null,2,categories);
  const t={id:'synthetic-sliders',sport:'Beach Tennis',fmt2:cfg,combinedCategories:categories,participants,
    rulesContractVersion:2,storageCanonico:true,status:'closed',matches:[],rounds:[]};
  assert.equal(draw.compileFromFmt2(t).ok,true);
  assert.equal(t.phases[0].classification.partnerRotation,'groups');
  assert.equal(t.phases[0].fixedPairs,false);
  assert.equal(draw.drawInitial(t,{idStamp:1}).ok,true);
  assert.equal(draw.drawInitial(t,{idStamp:1}).reason,'already-drawn');
  for (const [i,category] of categories.entries()) {
    const matches=t.matches.filter(m=>m.category===category);
    assert.equal(matches.length,sizes[i]*rounds[i]/4,category);
    const ids=new Map();
    for (const m of matches) {
      assert(!m.isBye);
      for(const uid of [...m.team1Uids,...m.team2Uids]) ids.set(uid,(ids.get(uid)||0)+1);
    }
    assert.equal(ids.size,sizes[i]); assert([...ids.values()].every(n=>n===rounds[i]));
  }
  return t;
}
const mixed=fixture([16,8,12,10,5],[5,7,3,4,8],
  [{mode:'count',value:2},{mode:'size',value:8},{mode:'size',value:4},{mode:'count',value:1},{mode:'count',value:1}],
  [false,false,false,false,true],[0]);
assert.equal(mixed.phases.length,2);
const queens=mixed.matches.filter(m=>m.category==='Classe 2');
assert(queens.every(m=>m.rotationSeries));
assert.equal(new Set(queens.map(m=>m.round)).size,1);
assert.equal(new Set(queens.map(m=>m.monarchGroup)).size,3);
const {advance}=require('../functions-autodraw/monarch-court-series');
const day={scheduleWindow:{days:['2030-01-01']}};
function autoCall(matches) {
  const first=matches[0]; Object.assign(first,{court:'1',courtCalledAt:'2030-01-01T00:00:00Z',winner:first.p1});
  return advance(day,first,matches,'2030-01-01T00:10:00Z',
    {isFinished:m=>!!m.winner,occupiesCourt:()=>false},{config:()=>({call:0,warmup:0})},{});
}
assert(autoCall(queens));
const large=fixture([12],[3],[{mode:'count',value:1}]);
assert.equal(large.matches.filter(m=>m.round===1).length,3);
assert.equal(autoCall(large.matches),null);
const eighty=fixture([16,16,16,8,8,8,8],[5,5,5,7,7,7,7],Array(7).fill({mode:'size',value:8}),[],[0,1,2]);
assert.equal(eighty.matches.length,116);
assert.equal(eighty.phases[0].classification.rotationCategoryRules.filter(r=>r.destination==='elimination').length,3);
console.log('✓ Rodízio 4–32 pessoas por grupo, séries de quartetos, rodadas independentes, 80 atletas e destinos por categoria.');
const engine=draw._window._phasesEngine;
function finishPhase(t,phase) {
  t.matches.filter(m=>m.phaseIndex===phase).forEach((m,i)=>{
    Object.assign(m,{scoreP1:6,scoreP2:i%5,winner:m.p1,winnerUids:m.team1Uids});
  });
}
finishPhase(eighty,0);
const advance0 = (t,phase) => engine.materializeNextPhase(t,
  g=>engine.standingsDaFaseAnterior(g,t,{},true,phase),'test-p'+(phase+1),{agoraIso:'2030-01-01',rnd:()=>0.63});
assert(advance0(eighty,0).ok);
assert.equal(eighty.matches.length,119);
const double=fixture([16,8],[3,7],[{mode:'size',value:4},{mode:'size',value:8}],[],[0,1]);
double.fmt2.eliminatoria.openReiRainha=true;
double.fmt2.eliminatoria.qualifyAll=true;
double.fmt2.eliminatoria.formationCategoryRules=double.fmt2.rotationCategoryRules.map(r=>({...r,rounds:3,groupFormation:{mode:'size',value:4}}));
double.matches=[]; double.status='closed';delete double._canonicalDraw;
assert.equal(draw.compileFromFmt2(double).ok,true);
assert.equal(double.phases.length,3);
assert.equal(draw.drawInitial(double,{idStamp:2}).ok,true);
finishPhase(double,0);
let result=advance0(double,0);
assert(result.ok,JSON.stringify(result));
const secondary=double.matches.filter(m=>m.phaseIndex===1);
assert.equal(secondary.length,18,'24 pessoas, 3 jogos por pessoa');
assert.equal(secondary.filter(m=>m.category==='Classe 0').length,12);
assert(secondary.every(m=>m.rotationSeries && m.team1Uids.concat(m.team2Uids).every(Boolean)));
finishPhase(double,1);
result=advance0(double,1);
assert(result.ok,JSON.stringify(result));
assert(double.matches.filter(m=>m.phaseIndex===2).every(m=>m.category && !m.isBye));
const bad=structuredClone(double.fmt2);
bad.rotationCategoryRules[0].category='';
assert.throws(()=>validate(bad,Error,null,2,double.combinedCategories));
console.log('✓ 119 partidas com finais por categoria, duas classificatórias independentes e avanço nominal à final.');
const category='Times', players=Array.from({length:8},(_,i)=>({uid:'pair'+i,displayName:'Dupla '+i,competitionTeamId:'team'+i}));
const teamConfig=format.defaultConfig('Beach Tennis');
Object.assign(teamConfig,{grupos:1,disputa:'dupla',parceria:'fixa',classifAtiva:true,rodadas:{modo:'todos',turnos:'ida'}});
teamConfig.teamCompetition={enabled:true,teamCount:8,teamNames:players.map(p=>p.competitionTeamId),
  schedule:{enabled:true,teamsPerGroup:2,mode:'structured',gamesPerPairByCategory:{Times:3},
    groupFormationByCategory:{Times:{mode:'count',value:2}}}};
teamConfig.classificationSliderMode='category';
validate(teamConfig,Error,null,2,[category],()=>16);
const tcPhase=format.compileToPhases(teamConfig,{sport:'Beach Tennis',categories:[category]}).phases[0];
assert.equal(tcPhase.teamCompetition.schedule.gamesPerPairByCategory.Times,3,'o limite global antigo não trunca a regra por categoria');
const teamMatches=engine.genGroupsFromPool(players,{...tcPhase,category},'team').matches;
assert.equal(teamMatches.length,12);
assert.equal(new Set(teamMatches.map(m=>m.groupIdx)).size,2);
for(const p of players) assert.equal(teamMatches.filter(m=>m.p1===p.displayName||m.p2===p.displayName).length,3);
assert.throws(()=>validate(teamConfig,Error,null,2,['Outra'],()=>16));
assert.throws(()=>validate({...teamConfig,classificationSliderMode:'inventado'},Error,null,2,[category],()=>16));
const shortGroup=structuredClone(teamConfig);
shortGroup.teamCompetition.schedule.groupFormationByCategory.Times.value=4;
assert.throws(()=>validate(shortGroup,Error,null,2,[category],()=>16));
const manualRoster=rotation.rotationRoster({participants:[
  {p1Name:'Pat',p1ManualId:'a',p2Name:'Pat',p2ManualId:'b',category:'Manual'},
  {p1Name:'Jana',p1Uid:'u3',p2Name:'Leo',p2Uid:'u4',category:'Manual'}]});
const rule={category:'Manual',groupFormation:{mode:'count',value:1},rounds:3,allowRepeatPartners:false,destination:'ranking'};
const manualPhase={classification:{partnerRotation:'groups',rotationCategoryRules:[rule]},category:'Manual'};
const manualMatches=engine.genGroupsFromPool(manualRoster,manualPhase,'manual').matches;
assert(manualRoster.every(p=>p.categories[0]==='Manual'));
assert.equal(manualMatches.length,3);
const slots=manualMatches.flatMap(m=>[...m.team1SlotIds,...m.team2SlotIds]).filter(Boolean);
assert.deepEqual(slots.sort(),['manual:a','manual:a','manual:a','manual:b','manual:b','manual:b']);
const manualT={matches:manualMatches,phases:[manualPhase],participants:manualRoster};
finishPhase(manualT,0);
const rows=engine.standingsDaFaseAnterior(engine.prevPhaseGroups(manualT)[0],manualT,{},true,0);
assert.equal(rows.length,4);
assert.deepEqual(rows.filter(r=>r.name==='Pat').map(r=>r.manualParticipantId).sort(),['a','b']);
console.log('✓ Times mantêm duplas e graus exatos. Inscrições manuais homônimas conservam identidades distintas.');
