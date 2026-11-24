'use strict';
const assert=require('node:assert/strict');
const w=require('../functions-autodraw/draw-core')._window,F=w.FORMAT2,G=w.ScoreplacePhaseGridPlan;
function scenario(names,sizes,groups,games,quota,mode='rotation_groups') {
 const c=F.defaultConfig('Beach Tennis');Object.assign(c,{parceria:mode,disputa:mode==='single'?'individual':'dupla',classificados:2,classifScope:'per_group'});
 const dest=quota?'elimination':'ranking';
 Object.assign(c.eliminatoria,{ativa:!!quota,openReiRainha:false,origem:'formar',formacao:'performance',linhas:1,dupla:false,terceiro:true});
 if(mode==='rotation_groups')c.rotationCategoryRules=names.map((category,i)=>({category,destination:dest,groupFormation:{mode:'size',value:groups[i]},rounds:games[i],allowRepeatPartners:games[i]>=groups[i]}));
 else {c.parceria='fixa';c.grupos=2;c.groupFormation={mode:'count',value:2};}
 if(quota)c.qualificationCategoryRules=names.map((category,i)=>({category,perGroup:quota[i]}));
 const t={fmt2:c,sport:'Beach Tennis',combinedCategories:names,gameDuration:15,callTime:2,warmupTime:3,setupScope:'first_round',courtCount:6,maxParticipantsByCategory:Object.fromEntries(names.map((name,i)=>[name,sizes[i]]))};
 return t;
}
const D=[{day:'2026-12-01',startTime:'08:00',endTime:'22:00'}];
module.exports={w,F,G,scenario,D};
if (require.main===module) {
  function propose(t) {
    const result=G.suggestProjected(t,D,w);
    assert(!result.error,result.error);
    G.assertPlan(t,result.plan,D,w);
    return result.plan;
  }
  const names=['Divisão B','Divisão C'];
  const t=scenario(names,[16,32],[8,8],[5,5],[4,2]);
  const plan=propose(t);
  assert.equal(plan.totalGames,68);
  const proposed=G.suggestProjected(t,D,w),defaults=G.suggestedAssignments(proposed.tiles,6,t);
  assert.deepEqual(defaults.map(r=>[r.label,r.entry,r.courts]),[
    ['B1',1,[1,2]],['B2',2,[1,2]],['C1',1,[3,4]],['C2',1,[5,6]],['C3',2,[3,4]],['C4',2,[5,6]]
  ]);
  const assigned=G.applyAssignments(proposed.tiles,plan,D,defaults);assert(!assigned.error,assigned.error);
  G.assertPlan(t,assigned.plan,D,w);assert.equal(assigned.plan.inputSignature,plan.inputSignature);
  assert.deepEqual(G.toPlan(assigned.plan,G.expand(assigned.plan,t)),assigned.plan);
  assert.deepEqual(G.toPlan(plan,G.expand(plan,t)),plan);
  assert.deepEqual(G.suggestProjected({...t,scheduleWindow:{days:D,interleavedPlan:assigned.plan}},D,w).plan,assigned.plan);
  for(const row of defaults) {
    const games=assigned.tiles.filter(tile=>tile.assignment?.label===row.label);
    assert.equal(games.length,10);
    assert.deepEqual([...new Set(games.map(tile=>tile.court))].sort(),row.courts);
    assert(games.every(tile=>tile.games===1));
  }
  const early=assigned.tiles.filter(tile=>tile.assignment?.entry===1),late=assigned.tiles.filter(tile=>tile.assignment?.entry===2);
  assert(Math.max(...early.map(t=>G.minutes(t.startTime)+t.duration))<=Math.min(...late.map(t=>G.minutes(t.startTime))));
  assert.equal(new Set(early.filter(t=>t.startTime===D[0].startTime).map(t=>t.court)).size,6);
  for(const corrupt of [
    rows=>rows.pop(), rows=>rows[2].courts=[1], rows=>rows[0].courts=[1,1],rows=>rows[0].phaseIndex='0',
    rows=>rows[0].unknown=true, rows=>rows[0].entry=9,rows=>rows[0].courts=[],rows=>rows[0].label='a'.repeat(49),
    rows=>rows[0].label='bad\u202e',rows=>{rows[0].label='É\u00a0 A';rows[1].label='e a';}
  ]) {
    const rows=structuredClone(defaults);corrupt(rows);assert(G.applyAssignments(proposed.tiles,plan,D,rows).error);
    assert.throws(()=>G.assertPlan(t,{...assigned.plan,groupAssignments:rows},D,w));
  }
  const renamed=structuredClone(defaults);renamed[0].label=' B\u00a0\tPrimeiro ';
  assert.equal(G.applyAssignments(proposed.tiles,plan,D,renamed).plan.groupAssignments[0].label,'B Primeiro');
  const changed=structuredClone(assigned.plan);changed.blocks[0].courts=[6];
  assert.throws(()=>G.assertPlan(t,changed,D,w),/quadra/);
  assert.deepEqual(G.applyAssignments(assigned.tiles,assigned.plan,D,[]).plan.groupAssignments,[]);

  assert.equal(plan.blocks[0].category,names[0]);
  for(const [i,name] of names.entries()) {
    assert.equal(plan.blocks.filter(b=>b.category===name&&!b.phaseIndex).length,[20,40][i]);
    assert.equal(plan.blocks.filter(b=>b.category===name&&b.phaseIndex===1).length,4);
  }
  const smaller=structuredClone(t);smaller.fmt2.qualificationCategoryRules[0].perGroup=2;
  assert.throws(()=>G.assertPlan(smaller,plan,D,w),/desatualizada/);
  for(const [people,size,games,tiles,total] of [[8,4,3,2,6],[8,8,7,14,14],[8,8,14,28,28],[12,12,3,9,9]]) {
    const p=propose(scenario(['A'],[people],[size],[games]));
    assert.equal(p.totalGames,total);assert.equal(p.blocks.length,tiles);
    if(size===8)assert.equal(p.blocks.filter(b=>b.startTime==='08:00').length,2);
  }
  for(const mode of ['single','fixa']) assert(propose(scenario(['A'],[16],[8],[3],[2],mode)).totalGames>1);
  const n=[16,16,16,8,8,8,8],cats=n.map((_,i)=>'Categoria '+i);
  const m=scenario(cats,n,n.map(()=>8),n.map(x=>x===8?7:5),n.map(()=>2));
  m.fmt2.qualificationCategoryRules=m.fmt2.qualificationCategoryRules.slice(0,3);
  m.fmt2.rotationCategoryRules.slice(3).forEach(r=>r.destination='ranking');
  assert.equal(propose(m).totalGames,119);
  const validate=(cfg)=>F.qualificationError(cfg,names,c=>t.maxParticipantsByCategory[c],t.sport);
  for(const change of [c=>c.qualificationCategoryRules.pop(),c=>c.qualificationCategoryRules[0].perGroup=9,
    c=>c.qualificationCategoryRules[0].extra=true,c=>c.qualificationCategoryRules[1].category=names[0]]) {
    const cfg=structuredClone(t.fmt2);change(cfg);assert(validate(cfg));
  }
  const generic=structuredClone(t);generic.fmt2.eliminatoria.ativa=false;
  generic.fmt2.rotationCategoryRules.forEach(r=>r.destination='ranking');delete generic.fmt2.qualificationCategoryRules;
  assert.equal(propose(generic).totalGames,60);
  const two=scenario(names,[16,16],[8,8],[5,5],[4,4]);
  two.fmt2.eliminatoria.openReiRainha=true;
  two.fmt2.eliminatoria.formationQualificationCategoryRules=names.map(category=>({category,perGroup:2}));
  const phases=p=>[0,1,2].map(i=>p.blocks.filter(b=>b.phaseIndex===i).reduce((n,b)=>n+b.games,0));
  assert.deepEqual(phases(propose(two)),[40,12,2]);
  two.fmt2.eliminatoria.formationCategoryRules=two.fmt2.rotationCategoryRules.map(r=>({...r,groupFormation:{mode:'size',value:4},rounds:3}));
  assert.deepEqual(phases(propose(two)),[40,12,2]);
  const fixed=scenario(['Times'],[16],[4],[3],null,'fixa');
  fixed.fmt2.rodadas={modo:'todos',turnos:'ida'};
  fixed.fmt2.teamCompetition={enabled:true,teamCount:8,teamNames:Array.from({length:8},(_,i)=>'Time '+i),
    schedule:{enabled:true,mode:'structured',teamsPerGroup:2,gamesPerPairByCategory:{Times:3},groupFormationByCategory:{Times:{mode:'count',value:2}}}};
  assert.equal(propose(fixed).totalGames,12);
  const total=scenario([],[],[],[],null,'single');
  total.maxParticipants=8;total.fmt2.rodadas={modo:'todos',turnos:'ida'};
  assert.equal(propose(total).totalGames,12);
  const tie=require('../functions-autodraw/phase-tie-core');
  const next=F.compileToPhases(t.fmt2,{sport:t.sport,categories:names}).phases[1];
  assert(tie.boundariesFor(F.qualificationForCategory(next,names[0]),8).includes(4));
  assert(tie.boundariesFor(F.qualificationForCategory(next,names[1]),8).includes(2));
  const restricted=structuredClone(generic),days=[D[0],{...D[0],day:'2026-12-02'}];
  restricted.scheduleWindow={days,categoryWindows:[{category:names[0],day:days[1].day,startTime:'10:00',endTime:'20:00'}]};
  const delayed=G.suggestProjected(restricted,days,w);
  assert(!delayed.error,delayed.error);G.assertPlan(restricted,delayed.plan,days,w);
  assert(delayed.tiles.filter(tile=>tile.category===names[0]).every(tile=>tile.day===days[1].day && tile.startTime>='10:00'));
  assert.equal(G.v2Duration({phaseIndex:0,round:2,games:1},{gameDuration:20,setupScope:'first_round',warmupTime:5,
    phases:[{scoring:{setsToWin:2}}]}),50);
  const de=scenario(['A'],[16],[8],[3],null,'single');
  de.fmt2.classifAtiva=false;Object.assign(de.fmt2.eliminatoria,{ativa:true,dupla:true,grandFinal:true,grandFinalReset:true});
  const dePlan=propose(de);assert(dePlan.blocks.some(b=>b.optional));
  const swapped=structuredClone(plan);swapped.blocks[1].courts=swapped.blocks[0].courts;
  assert.throws(()=>G.assertPlan(t,swapped,D,w),/quadra/);
  console.log('✓ Grade baseada nas partidas reais, ordem, duas quadras, cortes distintos, partidas consecutivas, grade obsoleta e 119 partidas.');
}
