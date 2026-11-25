'use strict';
const assert=require('node:assert/strict'),core=require('../scripts/cult-group-labels-core');
const rows=['B1','B2','C1','C2','C3','C4'].map((label,i)=>({phaseIndex:0,category:i<2?'Retinol · Categoria B':'Colágeno · Categoria C',groupNumber:i<2?i+1:i-1,label,entry:i===0||i===2||i===3?1:2,courts:i<2?[1,2]:i===2||i===4?[3,4]:[5,6]}));
const parent={time:{seconds:100,nanoseconds:99},data:{id:core.CULT_ID,currentPhaseIndex:0,updatedAt:{seconds:99,nanoseconds:2},participants:[{manualParticipantId:'PRIVATE_ID',name:'PRIVATE_PLAYER'}],_phaseReadCertificate:{digest:'unchanged'},scheduleWindow:{interleavedPlan:{groupAssignments:rows}}}};
const records=rows.flatMap((row,i)=>Array.from({length:14},(_,j)=>({id:'match-'+i+'-'+j,time:{seconds:100,nanoseconds:j},data:{_loc:{groupName:'technical-'+j},jogo:{phaseIndex:0,category:row.category,groupIdx:row.groupNumber-1,isMonarch:true,scheduledGroupLabel:row.label,groupName:'technical-'+j,monarchGroup:j,scoreP1:4,scoreP2:3,winner:'PRIVATE_PLAYER',team1SlotIds:['manual:PRIVATE_ID'],court:'Quadra '+row.courts[j%2],scheduledAt:'2026-11-29T08:00:00Z'}}})));
const before=core.stable({parent,records}),p=core.proposal(parent,records);
assert.equal(core.stable({parent,records}),before,'preview never changes inputs');
assert.deepEqual(p.afterAssignments.map(r=>r.label),['A','B','C','D','E','F']);
assert.equal(p.parentTime.seconds,100);assert.equal(p.parentTime.nanoseconds,99);assert.equal(p.games[0].time.seconds,100);
assert(p.groups.every(g=>g.count===14));assert.equal(p.games.length,84);
assert(!core.stable(p).includes('PRIVATE_PLAYER')&&!core.stable(p).includes('PRIVATE_ID'),'backup/plan never exports player names or identity IDs');
const after=structuredClone(parent),renamed=structuredClone(records);
after.data.scheduleWindow.interleavedPlan.groupAssignments=p.afterAssignments;after.data.updatedAt={seconds:101,nanoseconds:0};
renamed.forEach(r=>{r.data.jogo.scheduledGroupLabel=p.games.find(g=>g.id===r.id).after;});
assert(core.applied(p,after,renamed));
assert.equal(core.rootHash(parent.data),core.rootHash(after.data));
for(let i=0;i<records.length;i++) {
 assert.equal(core.gameHash(records[i].data),core.gameHash(renamed[i].data));
 assert.equal(renamed[i].data.jogo.groupName,records[i].data.jogo.groupName);
 assert.equal(renamed[i].data.jogo.monarchGroup,records[i].data.jogo.monarchGroup);
}
renamed[0].data.jogo.scoreP1=5;assert(!core.applied(p,after,renamed));
assert.throws(()=>core.proposal(parent,records.slice(1)),/Censo/);
assert.throws(()=>core.proposal(parent,records.concat(records[0])),/Censo/);
const duplicate=structuredClone(records);duplicate[1].id=duplicate[0].id;assert.throws(()=>core.proposal(parent,duplicate),/Partida/);
const wrong=structuredClone(parent);wrong.data.scheduleWindow.interleavedPlan.groupAssignments[0].label='Outro';assert.throws(()=>core.proposal(wrong,records),/rótulo/);
const wrongGroup=structuredClone(records);wrongGroup[0].data.jogo.groupIdx=1;assert.throws(()=>core.proposal(parent,wrongGroup));
console.log('✓ grupos CULT A–F:84partidas, censo, identidade técnica e dados protegidos, plano sem PII');

// Existing consumers use display labels without renumbering technical group identities.
const fs=require('node:fs'),vm=require('node:vm'),grid=require('../js/domain/phase-grid-plan');
const bound=grid.bindAssignments(rows.map(r=>({...r,kind:'groups',matchIds:['opaque-'+r.label]})),p.afterAssignments);
assert.deepEqual(bound.map(tile=>tile.assignment.label),['A','B','C','D','E','F']);
const source=fs.readFileSync('js/views/bracket.js','utf8'),context=vm.createContext({window:{}});
vm.runInContext(source.slice(source.indexOf('window._bracketMonarchGroupLabel = function'),source.indexOf('function _bracketOperationsGroup(')),context);
for(const label of ['A','B','C','D','E','F'])assert.equal(context.window._bracketMonarchGroupLabel({}, {name:'technical',matches:[{scheduledGroupLabel:label,monarchGroup:27}]}),label);
