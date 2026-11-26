'use strict';
const assert = require('node:assert/strict');
const core = require('../functions/rename-canonical-participant-core');
const { registrationId } = require('../functions/registration-core');

function manual(id, name, categoryId = 'cat-a') {
  const key = 'manual:' + id;
  return { registrationId: registrationId(key, categoryId), tournamentId: 't1', categoryId,
    participantKey: key, participantKind: 'manual', participantUid: null, manualParticipantId: id,
    manualDisplayName: name, status: 'confirmed', validationState: 'approved', fixedPairId: null };
}
const roster = [manual('m1', 'Kelly Cristina'), manual('m2', 'Ana', 'cat-b')];
const tournament = { id: 't1', participants: [], canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 2 } };
const input = { manualParticipantId: 'm1', oldName: 'Kelly Cristina', newName: 'Kelly Barth' };
const game = { id: 'game-1', p1: 'Kelly Cristina / Ana', team1Obj: {
  p1ManualId: 'm1', p1Name: 'Kelly Cristina', p2ManualId: 'm2', p2Name: 'Ana' },
  team2Obj: { p1ManualId: 'm3', p1Name: 'Outra' } };
const result = core.plan(tournament, roster, input, [], [{ ref: 'game-1', data: { jogo: game } }]);
assert.equal(result.target.registrationId, roster[0].registrationId);
assert.equal(result.documents[0].data.jogo.team1Obj.p1Name, 'Kelly Barth');
assert.equal(result.documents[0].data.jogo.team1Obj.p2Name, 'Ana');
assert.equal(result.documents[0].data.jogo.p1, 'Kelly Barth / Ana');
assert.deepEqual(tournament.participants, []);
assert.equal(roster[0].manualDisplayName, 'Kelly Cristina');
assert.throws(() => core.plan({ id: 't1' }, roster, input, [], []), /canônicas/);
assert.throws(() => core.plan({ id: 't1', canonicalRegistrationMigration: { fingerprint: 'fp' } }, roster, input, [], []), /inválido/);
assert.throws(() => core.plan(tournament, roster, { ...input, newName: 'Ána' }, [], []), /já há inscrito/);
assert.throws(() => core.plan(tournament, roster, input, ['Kelly Cristina'], []), /ambíguo/);
assert.throws(() => core.plan(tournament, roster, input, ['Kelly Barth'], []), /conta/);
assert.equal(core.plan(tournament, roster, input, [], [{ ref: 'game-1', data: { jogo: { p1: 'Kelly Cristina' } } }])
  .documents[0].data.jogo.p1, 'Kelly Barth');
assert.equal(core.plan({ ...tournament, absent: { 'Kelly Cristina': true } }, roster, input, [], [])
  .rootPatch.absent['Kelly Barth'], true);
const withRootMirror = core.plan({ ...tournament, participants: [{ manualParticipantId: 'm1',
  displayName: 'Kelly Cristina' }] }, roster, input, [], []);
assert.equal(withRootMirror.rootPatch.participants[0].displayName, 'Kelly Barth');
assert.equal(core.replaceLabel('  Outra   /   Pessoa  ', 'Kelly Cristina', 'Kelly Barth'),
  '  Outra   /   Pessoa  ');
const embedded=core.plan({...tournament,rounds:[{matches:[game]}],participantSlotReplacements:{schema:1,events:[{to:{manualParticipantId:'m1'},newName:'Kelly Cristina',pointsPolicy:'inherit'}]}},roster,input,[],[]);
assert.equal(embedded.rootPatch.rounds[0].matches[0].p1,'Kelly Barth / Ana');
assert.equal(embedded.rootPatch.participantSlotReplacements.events[0].newName,'Kelly Barth');
assert.equal(embedded.rootPatch.participantSlotReplacements.events[0].pointsPolicy,'inherit');
console.log('✓ rename-canonical-participant');

// Administrative label substitutions keep every slot and game intact.
{
 const subs=require('../scripts/cult-name-substitutions-core.cjs'),reg=require('../functions/registration-core');
 const fixtureRoot={id:'synthetic-cult',testModeEnabled:true,categoryDefinitions:[{id:'b',label:'Categoria B'},{id:'c',label:'Categoria C'}],
  canonicalRegistrationMigration:{fingerprint:'synthetic',registrationCount:48},checkedIn:{'Atleta 0 0':true}};
 const fixtureRegs=[],fixtureDocs=[];
 for(let g=0;g<6;g++){
  const category=g<2?'b':'c',players=Array.from({length:8},(_,i)=>'Atleta '+g+' '+i);
  players.forEach((name,i)=>{const manualParticipantId='slot-'+g+'-'+i,key='manual:'+manualParticipantId;
   fixtureRegs.push({registrationId:reg.registrationId(key,category),tournamentId:fixtureRoot.id,participantKey:key,manualParticipantId,
    participantKind:'manual',participantUid:null,categoryId:category,status:'confirmed',validationState:'approved',fixedPairId:null,manualDisplayName:name});});
  for(let i=0;i<14;i++){const p=Array.from({length:4},(_,j)=>(i*4+j)%8),id='game-'+g+'-'+i;
   fixtureDocs.push({id,collection:'matches',ref:{path:'tournaments/synthetic-cult/matches/'+id},data:{jogo:{id,groupName:'Grupo '+String.fromCharCode(65+g),
    team1:p.slice(0,2).map(k=>players[k]),team2:p.slice(2).map(k=>players[k]),team1SlotIds:p.slice(0,2).map(k=>'manual:slot-'+g+'-'+k),
    team2SlotIds:p.slice(2).map(k=>'manual:slot-'+g+'-'+k),groupLetterAssignments:players.map(name=>({name})),scheduledGameNumber:g*14+i+1}}});
  }
 }
 const fixtureChanges=[0,1,2,3,4].map(g=>({oldName:'Atleta '+g+' 0',newName:'Substituta '+g,group:String.fromCharCode(65+g),category:g<2?'Categoria B':'Categoria C'}));
 const p=subs.build(fixtureRoot,fixtureRegs,fixtureDocs,fixtureChanges,[]);
 const oldRehearsal={state:'active',mode:'preDraw',epoch:'old',hash:'old-hash'};
 const withRehearsal=subs.build({...fixtureRoot,rehearsal:oldRehearsal},fixtureRegs,fixtureDocs,fixtureChanges,[]);
 assert.equal(withRehearsal.rootPatch.rehearsal,undefined);
 for(const rehearsal of [{state:'capturing',mode:'preDraw'},{state:'resetting',mode:'preDraw'},{state:'active',mode:'postDraw'}])
  assert.throws(()=>subs.build({...fixtureRoot,rehearsal},fixtureRegs,fixtureDocs,fixtureChanges,[]));
 assert.equal(p.targets.length,5);assert.equal(p.changedDocs.length,70);assert.equal(p.writes,77);
 assert(p.targets.every(t=>t.appearances===7));
 assert.equal(p.rootPatch.checkedIn['Substituta 0'],true,'map keys follow labels');
 assert.throws(()=>subs.build({...fixtureRoot,testModeEnabled:false},fixtureRegs,fixtureDocs,fixtureChanges,[]));
 assert.throws(()=>subs.build(fixtureRoot,fixtureRegs.map((r,i)=>i? r:{...r,participantUid:'account'}),fixtureDocs,fixtureChanges,[]),/vínculo/);
 assert.throws(()=>subs.build(fixtureRoot,fixtureRegs,fixtureDocs.map((d,i)=>i?d:{...d,data:{jogo:{...d.data.jogo,courtCalledAt:'now'}}}),fixtureChanges,[]),/chamada/);
 assert.throws(()=>subs.build(fixtureRoot,fixtureRegs,fixtureDocs,fixtureChanges,['Substituta 0']),/conta/);
 assert.equal(require('../functions/rename-canonical-participant-core').replaceStrings('Outro Atleta 0 0 Extra','Atleta 0 0','Substituta 0'),'Outro Atleta 0 0 Extra','no substring replacement');
 console.log('✓ cinco substituições administrativas: slots, 84 jogos e mapas reversíveis, com recusas de vínculo/chamada');
}
