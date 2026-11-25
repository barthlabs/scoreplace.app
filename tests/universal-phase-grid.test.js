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
  assert(delayed.tiles.some(tile=>tile.category===names[0] && tile.day===days[0].day),'nova grade substitui os horários duplicados por categoria');
  assert.equal(G.v2Duration({phaseIndex:0,round:2,games:1},{gameDuration:20,setupScope:'first_round',warmupTime:5,
    phases:[{scoring:{setsToWin:2}}]}),50);
  const de=scenario(['A'],[16],[8],[3],null,'single');
  de.fmt2.classifAtiva=false;Object.assign(de.fmt2.eliminatoria,{ativa:true,dupla:true,grandFinal:true,grandFinalReset:true});
  const dePlan=propose(de);assert(dePlan.blocks.some(b=>b.optional));
  const legacy=require('./fixtures/phase-grid-category-window-2761.json');
  const beforeLegacy=JSON.stringify(legacy);
  G.assertPlan(legacy.t,legacy.plan,legacy.days,w);
  assert(G.expand(legacy.plan,legacy.t).every(t=>t.day==='2026-12-02' && t.startTime>='10:00'));
  assert.equal(JSON.stringify(legacy),beforeLegacy,'abrir/validar não migra nem apaga horários salvos');
  const regenerated=G.suggestProjected(legacy.t,legacy.days,w);
  G.assertPlan(legacy.t,regenerated.plan,legacy.days,w);
  assert(regenerated.tiles.some(t=>t.day===legacy.days[0].day));
  const full=scenario(names,[16,32],[8,8],[7,7],[4,2]);
  full.gameDuration=30;full.callTime=5;full.warmupTime=5;
  const short=[{day:D[0].day,startTime:'08:00',endTime:'12:00'}];
  const extra=G.suggestProjected(full,short,w);
  assert(!extra.error,extra.error);assert.equal(extra.plan.totalGames,92);
  assert.equal(extra.tiles.reduce((n,t)=>n+t.games,0),92);
  G.assertPlan(full,extra.plan,short,w);
  assert.equal(G.overlapIds(extra.tiles,extra.plan).size,0);
  assert(extra.tiles.some(t=>G.outsideWindow(t,short[0])));
  assert.deepEqual(extra.plan.days,short,'a janela proposta não é aumentada silenciosamente');
  const rules=G.suggestedAssignments(extra.tiles,6,full);
  const assignedExtra=G.applyAssignments(extra.tiles,extra.plan,short,rules);
  assert(!assignedExtra.error,assignedExtra.error);G.assertPlan(full,assignedExtra.plan,short,w);
  for(const mode of ['compact','spread']) {
    const arranged=G.preset(assignedExtra.tiles,assignedExtra.plan,short,mode);
    assert(!arranged.error,arranged.error);G.assertPlan(full,G.toPlan(assignedExtra.plan,arranged.tiles),short,w);
  }
  const tiny=[{day:D[0].day,startTime:'23:50',endTime:'23:51'}];
  const overnight=G.suggestProjected(full,tiny,w);assert(!overnight.error,overnight.error);
  G.assertPlan(full,overnight.plan,tiny,w);
  assert.equal(overnight.tiles[0].startTime,'23:50');
  assert(overnight.tiles.some(t=>t.day==='2026-12-02'));
  assert(overnight.tiles.every(t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t.startTime)));
  assert(G.displayDays(overnight.plan,overnight.tiles,tiny).some(d=>d.overflow && d.day==='2026-12-02'));
  assert.equal(G.overlapIds(overnight.tiles,overnight.plan).size,0);
  assert.deepEqual(G.toPlan(overnight.plan,G.expand(overnight.plan,full)),overnight.plan);
  const invalid=structuredClone(overnight.plan);invalid.blocks[0].day='2027-12-01';
  assert.throws(()=>G.assertPlan(full,invalid,tiny,w),/horário/);
  const swapped=structuredClone(plan);swapped.blocks[1].courts=swapped.blocks[0].courts;
  assert.throws(()=>G.assertPlan(t,swapped,D,w),/quadra/);
  // The configured group cross uses the real phase engine, independently of inter-group scores.
  const cross=scenario(['Categoria B','Categoria C'],[16,32],[8,8],[7,7],[4,2]);
  cross.fmt2.eliminatoria.semeadura='grupos';
  const crossPlan=G.suggestProjected(cross,D,w);assert(!crossPlan.error,crossPlan.error);
  G.assertPlan(cross,crossPlan.plan,D,w);assert.equal(crossPlan.plan.totalGames,92);
  assert.deepEqual(crossPlan.plan.groupAssignments.map(r=>[r.label,r.entry,r.courts]),[
    ['B1',1,[1,2]],['B2',2,[1,2]],['C1',1,[3,4]],['C2',1,[5,6]],['C3',2,[3,4]],['C4',2,[5,6]]]);
  for(const row of crossPlan.plan.groupAssignments) {
    const group=crossPlan.tiles.filter(tile=>tile.assignment?.label===row.label);
    assert.equal(group.length,14);assert.equal(new Set(group.map(t=>t.round)).size,7);
    assert(group.every(t=>row.courts.includes(t.court)));
  }
  const earlyCross=crossPlan.tiles.filter(t=>t.assignment?.entry===1),lateCross=crossPlan.tiles.filter(t=>t.assignment?.entry===2);
  assert(Math.max(...earlyCross.map(t=>G.minutes(t.startTime)+t.duration))<=Math.min(...lateCross.map(t=>G.minutes(t.startTime))));
  const crossSemis=crossPlan.tiles.filter(t=>t.kind==='elimination' && t.round===1);
  assert.deepEqual(crossSemis.map(t=>G.matchupLabel(t,crossPlan.tiles)),[
    'Vencedor do grupo B1 × 3º/4º do grupo B2','3º/4º do grupo B1 × Vencedor do grupo B2',
    'Vencedor do grupo C1 × Vencedor do grupo C4','Vencedor do grupo C2 × Vencedor do grupo C3']);
  assert.equal(new Set(crossSemis.map(t=>t.startTime)).size,1,'four semis use the first free courts');
  assert.deepEqual(crossSemis.map(t=>t.court),[1,2,3,4]);
  const decisions=crossPlan.tiles.filter(t=>t.kind==='elimination' && t.round===2);
  assert(decisions.every(t=>G.matchupLabel(t,crossPlan.tiles).includes('da Semifinal')));
  assert.equal(new Set(decisions.map(t=>t.startTime)).size,1);
  const serialized=JSON.stringify(crossPlan.plan);
  assert(!serialized.includes('display') && !serialized.includes('qualificationOrigin'));
  const reopened=G.describeProjectedTiles(cross,G.expand(crossPlan.plan,cross),w);
  assert.deepEqual(G.toPlan(crossPlan.plan,reopened),crossPlan.plan);
  assert.equal(reopened.filter(t=>t.kind==='elimination' && t.round===1).map(t=>G.matchupLabel(t,reopened)).join('|'),crossSemis.map(t=>G.matchupLabel(t,crossPlan.tiles)).join('|'));
  const unordered=G.suggestProjected({...cross,scheduleWindow:{interleavedPlan:{groupAssignments:[]}}},D,w);
  assert(!unordered.error,unordered.error);assert.deepEqual(unordered.plan.groupAssignments,[]);
  const compiledCross=F.compileToPhases(cross.fmt2,{sport:cross.sport,categories:cross.combinedCategories});
  const sourceGroups=cross.combinedCategories.flatMap((category,ci)=>Array.from({length:ci?4:2},(_,gi)=>({category,groupIdx:gi,name:'Grupo '+(gi+1),rows:Array.from({length:8},(_,ri)=>({uid:category+gi+ri,name:category+' G'+(gi+1)+' #'+(ri+1),wins:100*(gi+1)-ri,points:100*(gi+1)-ri,played:7,gamesWon:200-ri,gamesLost:ri}))})));
  const builtCross=w._phasesEngine.buildCategorizedPhaseBrackets(cross,sourceGroups,compiledCross.phases[1],g=>g.rows,'cross',{rnd:()=>.37});
  const pairs=builtCross.matches.filter(m=>m.round===1).map(m=>[m.team1Obj.participants.map(p=>p.name).join('/'),m.team2Obj.participants.map(p=>p.name).join('/')]);
  assert.deepEqual(pairs,[
    ['Categoria B G1 #1/Categoria B G1 #2','Categoria B G2 #3/Categoria B G2 #4'],
    ['Categoria B G1 #3/Categoria B G1 #4','Categoria B G2 #1/Categoria B G2 #2'],
    ['Categoria C G1 #1/Categoria C G1 #2','Categoria C G4 #1/Categoria C G4 #2'],
    ['Categoria C G2 #1/Categoria C G2 #2','Categoria C G3 #1/Categoria C G3 #2']]);
  assert(!JSON.stringify(builtCross).includes('qualificationOrigin'));
  for(const quota of [1,3,9]) {
    const invalidCross=structuredClone(cross);invalidCross.fmt2.qualificationCategoryRules[0].perGroup=quota;
    assert(F.groupCrossError(invalidCross.fmt2) || F.qualificationError(invalidCross.fmt2,invalidCross.combinedCategories,c=>invalidCross.maxParticipantsByCategory[c],invalidCross.sport));
  }
  console.log('✓ Grade baseada nas partidas reais, ordem, duas quadras, cortes distintos, partidas consecutivas, grade obsoleta e 119 partidas.');
}

// Rótulos são derivados: não modificam contrato, assinatura nem precedência de duração explícita.
if(require.main===module) {
 const t=scenario(['Categoria B','Categoria C'],[16,32],[8,8],[7,7],[4,2]);t.gameDuration=25;
 const result=G.suggestProjected(t,D,w);assert(!result.error,result.error);
 const before=JSON.stringify(result.plan),signature=result.plan.inputSignature;
 result.tiles.forEach(tile=>G.matchupLabel(tile,result.tiles,result.plan));
 G.assertPlan(t,result.plan,D,w);assert.equal(JSON.stringify(result.plan),before);assert.equal(result.plan.inputSignature,signature);
 assert.equal(G.v2Duration({kind:'elimination',phaseIndex:0,round:1,games:1},{gameDuration:25,phases:[{gameDuration:40}]}),40);
}
