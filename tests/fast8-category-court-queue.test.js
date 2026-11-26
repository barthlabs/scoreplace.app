const assert=require('node:assert/strict');const {w,scenario,D}=require('./universal-phase-grid.test');require('../js/domain/group-alternation');const G=require('../js/domain/phase-grid-plan');
const t=scenario(['Tier B','Tier C'],[16,32],[8,8],[7,7],[4,2]);t.fmt2.rotationCategoryRules.forEach(r=>r.groupAlternation=true);t.gameDuration=25;
const out=G.suggestProjected(t,D,w);assert(!out.error,out.error);G.assertPlan(t,out.plan,D,w);assert.equal(out.plan.alternatingCategories.length,2);assert.equal(out.plan.totalGames,92);
const grouped=new Map();for(const x of out.tiles.filter(x=>x.kind==='groups')){const key=x.round+'-'+x.assignment.entry;const times=grouped.get(key)||[];times.push(G.minutes(x.startTime));grouped.set(key,times);}
let floor=0;for(let round=1;round<=7;round++)for(let entry=1;entry<=2;entry++){const times=grouped.get(round+'-'+entry);assert.equal(times.length,6);assert(Math.min(...times)>=floor);floor=Math.max(...times);}
assert.deepEqual(G.toPlan(out.plan,G.expand(out.plan,t)),out.plan);console.log(JSON.stringify({pass:true,games:out.plan.totalGames,waves:[...grouped].map(([wave,times])=>({wave,at:G.clock(Math.min(...times))})),last:out.tiles.at(-1).startTime}));

for(const tile of out.tiles.filter(x=>x.kind==='groups')) assert(tile.assignment.courts.includes(tile.court),'toda rodada mantém a fila impressa por quadra');
for(const count of [2,3,4,5]) {
  const odd=scenario(['Tier B'],[count*8],[8],[7],[2]);
  odd.fmt2.rotationCategoryRules[0].groupFormation={mode:'count',value:count};
  odd.fmt2.rotationCategoryRules[0].groupAlternation=true;
  odd.fmt2.eliminatoria.thirdPlaceEnabled=false;
  const projected=G.suggestProjected(odd,D,w);assert(!projected.error,projected.error);
  G.assertPlan(odd,projected.plan,D,w);
  const compiled=w.FORMAT2.compileToPhases(odd.fmt2,{sport:odd.sport,categories:odd.combinedCategories,population:()=>count*8});
  assert.equal(compiled.cfg.eliminatoria.thirdPlaceEnabled,false);
  assert.equal(compiled.phases.at(-1).thirdPlace,false);
  const disabled=structuredClone(odd.fmt2);disabled.rotationCategoryRules[0].groupAlternation=false;
  assert.equal(w.FORMAT2.compileToPhases(disabled,{sport:odd.sport,categories:odd.combinedCategories,population:()=>count*8}).phases.at(-1).thirdPlace,false,
    'terceiro opcional independe da alternância no modo quantidade');
}
const mixed=scenario(['Tier B','Tier C'],[16,32],[8,8],[7,7],[4,2]);
mixed.fmt2.rotationCategoryRules[0].groupAlternation=true;
mixed.fmt2.rotationCategoryRules[1].groupAlternation=false;
const mixedGrid=G.suggestProjected(mixed,D,w);assert(!mixedGrid.error,mixedGrid.error);G.assertPlan(mixed,mixedGrid.plan,D,w);
assert.deepEqual(mixedGrid.plan.alternatingCategories,[{phaseIndex:0,category:'Tier B'}]);
console.log('✓ 2/3/4/5 grupos, categoria independente e terceiro opcional preservado nos modos tamanho/quantidade');

// A preparação volta em cada entrada alternada, mesmo com first_round global.
const timed=structuredClone(t);Object.assign(timed,{setupScope:'first_round',callTime:5,warmupTime:5,gameDuration:25});
const timedProposal=G.suggestProjected(timed,D,w);assert(!timedProposal.error,timedProposal.error);
assert.equal(timedProposal.plan.timingVersion,3);G.assertPlan(timed,timedProposal.plan,D,w);
assert(timedProposal.tiles.filter(x=>x.kind==='groups').every(x=>x.duration===35));
const withoutPhases=structuredClone(timed);delete withoutPhases.phases;
assert.deepEqual(G.expand(timedProposal.plan,withoutPhases).map(x=>x.duration),timedProposal.tiles.map(x=>x.duration));
const mixedTiming=structuredClone(mixed);Object.assign(mixedTiming,{setupScope:'first_round',callTime:5,warmupTime:5,gameDuration:25});
const mixedTimingPlan=G.suggestProjected(mixedTiming,D,w);assert(!mixedTimingPlan.error,mixedTimingPlan.error);
assert(mixedTimingPlan.tiles.filter(x=>x.kind==='groups'&&x.category==='Tier B').every(x=>x.duration===35));
assert(mixedTimingPlan.tiles.filter(x=>x.kind==='groups'&&x.category==='Tier C'&&x.round>1).every(x=>x.duration===25));
const normalTiming=structuredClone(timed);normalTiming.fmt2.rotationCategoryRules.forEach(r=>r.groupAlternation=false);
assert.equal(G.suggestProjected(normalTiming,D,w).plan.timingVersion,2);
const legacyPlan=structuredClone(timedProposal.plan);legacyPlan.timingVersion=2;
const legacyBefore=JSON.stringify(legacyPlan);
assert(G.expand(legacyPlan,timed).filter(x=>x.kind==='groups'&&x.round>1).every(x=>x.duration===25));
assert.equal(JSON.stringify(legacyPlan),legacyBefore,'leitura não reinterpreta nem reescreve grade legada');
const published=structuredClone(timed);published.currentPhaseIndex=0;published.scheduleWindow={days:D,interleavedPlan:timedProposal.plan};
const futureOnly=structuredClone(published);futureOnly.fmt2.eliminatoria.thirdPlaceEnabled=false;futureOnly.fmt2.eliminatoria.terceiro=false;
const rebuilt=G.rebuildFuture(published,futureOnly,w);
assert.deepEqual(rebuilt.blocks.filter(x=>x.kind==='groups'),timedProposal.plan.blocks.filter(x=>x.kind==='groups'));
assert(G.expand(rebuilt,futureOnly).filter(x=>x.kind==='groups').every(x=>x.duration===35));
const estimate=G.estimateOperation(published,w);assert.equal(estimate.timingVersion,3);
assert.equal(JSON.stringify(published.scheduleWindow.interleavedPlan),JSON.stringify(timedProposal.plan));
console.log('✓ preparação integral em cada entrada; grade aprovada legada preservada; projeção/expansão/fase futura coerentes');
