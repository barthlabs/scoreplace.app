'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { createRequire } = require('node:module');
const project = 'demo-scoreplace';

async function run() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const fs = require('node:fs'), os = require('node:os'), net = require('node:net');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-category-sliders-'));
    try {
      const port = await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject).listen(0, '127.0.0.1', () => {
          const value = server.address().port;
          server.close(() => resolve(value));
        });
      });
      const config = path.join(temp, 'firebase.json');
      fs.writeFileSync(config, JSON.stringify({ emulators: { firestore: { host:'127.0.0.1',port },ui:{enabled:false} } }));
      const output = require('./emulador').rodarNoEmulador(['emulators:exec','--only','firestore','--project',project,
        '--config',config,'node tests/universal-phase-grid-emulator.test.js'], {
        cwd:path.resolve(__dirname,'..'),env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH},
        timeout:180000,stdio:['ignore','pipe','pipe']
      });
      assert.match(output,/universal grid physical: OK/);
    } finally { fs.rmSync(temp,{recursive:true,force:true}); }
    return;
  }
  assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^127\.0\.0\.1:\d+$/);
  process.env.GCLOUD_PROJECT=project;
  process.env.FIREBASE_CONFIG=JSON.stringify({projectId:project});
  const api=require('../functions-autodraw/index.js');
  const backend=createRequire(require.resolve('../functions-autodraw/index.js'));
  const db=backend('firebase-admin/firestore').getFirestore();
  const format=backend('./draw-core.js')._window.FORMAT2;
  const owner='B17n7JCXYOfqahlcLZ0fKxGGyUu1';
  const invoke=(name,data,uid=owner)=>api[name].run({auth:{uid,token:{uid}},data,rawRequest:{headers:{}}});
  const id='tour_'+Date.now()+'_'+randomBytes(16).toString('hex');
  const {scenario,G,w,D}=require('./universal-phase-grid.test');
  const categories=['Quadro B','Quadro C'];
  const t=scenario(categories,[16,32],[8,8],[5,5],[4,2]);
  t.fmt2.tieResolution='draw_order';
  t.scoring={type:'sets',setsToWin:1,gamesPerSet:7,fixedSet:true,fixedSetGames:7,tiebreakEnabled:false};
  const compiled=format.compileToPhases(t.fmt2,{sport:t.sport,categories});
  const original=G.suggestProjected(t,D,w);
  const rows=G.suggestedAssignments(original.tiles,6,t);
  const proposed=G.applyAssignments(original.tiles,original.plan,D,rows);
  assert(!proposed.error,proposed.error);
  const window={mode:'organizer',days:D,interleavedPlan:proposed.plan};
  const config={...compiled.topLevel,...t,maxParticipants:48,name:'Grade sintética',startDate:D[0].day,endDate:D[0].day,
    scheduleWindow:window,courtNames:Array.from({length:6},(_,i)=>'Quadra '+(i+1))};
  const create=await invoke('createTournament',{tournamentId:id,config});
  assert(create.ok);
  const ref=db.collection('tournaments').doc(id),fresh=()=>ref.get().then(s=>s.data());
  let stored=await fresh();
  assert.deepEqual(stored.scheduleWindow.interleavedPlan,proposed.plan);
  const fingerprint=stored.canonicalRegistrationMigration.fingerprint;
  const updatePlan=plan=>invoke('updateTournamentConfiguration',{tournamentId:id,patch:{scheduleWindow:{...window,interleavedPlan:plan}}});
  await assert.rejects(updatePlan(original.plan),e=>e.code==='failed-precondition' && /Atualize o aplicativo/.test(e.message));
  await updatePlan({...original.plan,groupAssignments:[]});
  await updatePlan(proposed.plan);
  const corrupt=structuredClone(proposed.plan);corrupt.groupAssignments[0].courts=[5];
  await assert.rejects(updatePlan(corrupt),{code:'invalid-argument'});
  const reordered=structuredClone(proposed.plan);
  const a=reordered.blocks[0],b=reordered.blocks[1];[a.courts,b.courts]=[b.courts,a.courts];
  await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{scheduleWindow:{...window,interleavedPlan:reordered}}});
  stored=await fresh();
  assert.deepEqual(stored.scheduleWindow.interleavedPlan,reordered);
  assert.equal(stored.canonicalRegistrationMigration.fingerprint,fingerprint);
  const invalid=structuredClone(t.fmt2);invalid.qualificationCategoryRules[0].perGroup=9;
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:invalid}}),{code:'invalid-argument'});
  const sbId='sb_'+id+'_grid',sb=db.collection('sandboxes').doc(sbId),batch=db.batch();
  batch.set(sb,{...stored,id:sbId,isSandbox:true,sbState:'ready',sandboxOf:id,testModeEnabled:true,
    sandboxOwnerUid:owner,status:'closed',notificationsMuted:true,resultEntry:['organizer'],participants:[],matches:[],groups:[],rounds:[],
    canonicalRegistrationMigration:{...stored.canonicalRegistrationMigration,registrationCount:48}});
  let seq=0;
  for(const category of categories) {
    const def=stored.categoryDefinitions.find(d=>d.label===category);
    for(let n=0;n<t.maxParticipantsByCategory[category];n++) {
      const uid='grid-'+seq;
      batch.set(db.collection('users').doc(uid),{displayName:'Jogador '+seq});
      batch.set(sb.collection('registrations').doc(uid),{registrationId:uid,participantKind:'account',participantUid:uid,
        participantKey:'uid:'+uid,categoryId:def.id,status:'confirmed',enrollSeq:++seq});
    }
  }
  await batch.commit();
  const call=(name,data={})=>invoke(name,{tournamentId:sbId,sandbox:true,operationId:randomUUID(),...data});
  const last=sb.collection('registrations').doc('grid-47');
  const registration=(await last.get()).data();
  const departure=db.batch();departure.delete(last);departure.update(sb,{'canonicalRegistrationMigration.registrationCount':47});await departure.commit();
  await assert.rejects(call('drawRound'),e=>e.code==='failed-precondition' && e.details?.i18nKey==='phaseGrid.groupAssignmentStale');
  assert.equal((await sb.collection('matches').get()).size,0);
  const arrival=db.batch();arrival.set(last,registration);arrival.update(sb,{'canonicalRegistrationMigration.registrationCount':48});await arrival.commit();
  assert((await call('drawRound')).ok);
  await assert.rejects(call('drawRound'),{code:'failed-precondition'});
  await assert.rejects(call('updateTournamentConfiguration',{patch:{scheduleWindow:{...window,interleavedPlan:{...original.plan,groupAssignments:[]}}}}),{code:'failed-precondition'});
  const read=async()=> (await sb.collection('matches').get()).docs.map(s=>s.data().jogo);
  let games=await read();assert.equal(games.length,60);
  assert(games.every(m=>m.scheduledAt && Number(m.scheduledGameNumber || m._gameNum)>0),JSON.stringify(games[0]));
  for (const row of rows) {
    const group=games.filter(m=>m.scheduledGroupLabel===row.label);
    assert.equal(group.length,10);
    assert(group.every(m=>m.category===row.category && m.groupIdx+1===row.groupNumber && m.scheduledGroupEntry===row.entry));
    assert.deepEqual([...new Set(group.map(m=>m.court))].sort(),row.courts.map(c=>'Quadra '+c));
    assert.equal(group.filter(m=>m.round===1).length,2);
  }
  const firstDate=games.map(m=>m.scheduledAt).sort()[0];
  assert.equal(new Set(games.filter(m=>m.scheduledAt===firstDate).map(m=>m.court)).size,6);
  const firstEnd=Math.max(...games.filter(m=>m.scheduledGroupEntry===1).map(m=>Date.parse(m.scheduledAt)+15*60000));
  assert(games.filter(m=>m.scheduledGroupEntry===2).every(m=>Date.parse(m.scheduledAt)>=firstEnd));
  const changed=structuredClone(t.fmt2);changed.qualificationCategoryRules[0].perGroup=2;
  await assert.rejects(call('updateTournamentConfiguration',{patch:{fmt2:changed}}),{code:'failed-precondition'});
  for(const cat of categories) {
    for(const [i,m] of games.filter(m=>!m.phaseIndex && m.category===cat).entries()) {
      const result=await call('applyMatchResult',{matchId:m.id,payload:{gsmFinal:true,sets:[{gamesP1:7-i%4,gamesP2:i%4}],setsWonP1:1,setsWonP2:0,isFixedSet:true}});
      assert(result.ok,JSON.stringify(result));
    }
    const physical=await read(),finals=physical.filter(m=>m.phaseIndex===1 && m.category===cat);
    assert.equal(finals.length,4);
    assert(finals.every(m=>m.scheduledAt));
    const semifinalists=finals.filter(m=>m.round===1).flatMap(m=>m.team1Obj.participants.concat(m.team2Obj.participants));
    assert.equal(new Set(semifinalists.map(p=>p.uid)).size,8);
  }
  for (const variant of ['simples','eliminatória direta','outra classificatória']) {
    const category='Categoria', count=variant==='outra classificatória'?16:8;
    const sample=scenario([category],[count],[8],[3],variant==='outra classificatória'?[4]:null);
    if (variant==='outra classificatória') {
      sample.fmt2.eliminatoria.openReiRainha=true;
      sample.fmt2.eliminatoria.formationCategoryRules=[{category,groupFormation:{mode:'size',value:4},rounds:3,allowRepeatPartners:false,destination:'elimination'}];
      sample.fmt2.eliminatoria.formationQualificationCategoryRules=[{category,perGroup:2}];
    } else {
      delete sample.fmt2.rotationCategoryRules;
      Object.assign(sample.fmt2,{disputa:'individual',parceria:null,grupos:2,groupFormation:{mode:'count',value:2},
        rodadas:{modo:'todos',turnos:'ida'},classifAtiva:variant==='simples'});
      sample.fmt2.eliminatoria.ativa=variant==='eliminatória direta';
      sample.fmt2.eliminatoria.terceiro=false;
    }
    const spec=format.compileToPhases(sample.fmt2,{sport:sample.sport,categories:[category]});
    const proposed=G.suggestProjected(sample,D,w);
    assert(!proposed.error,proposed.error);
    const id='tour_'+Date.now()+'_'+randomBytes(16).toString('hex');
    const config={...spec.topLevel,...sample,name:'Agenda '+variant,maxParticipants:count,
      startDate:D[0].day,endDate:D[0].day,scheduleWindow:{mode:'organizer',days:D,interleavedPlan:proposed.plan}};
    assert((await invoke('createTournament',{tournamentId:id,config})).ok);
    const ref=db.collection('tournaments').doc(id), data=(await ref.get()).data();
    await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{scheduleWindow:config.scheduleWindow}});
    // A porta canônica de avanço usa tournaments; exercitar também esse armazenamento no projeto demo.
    const sandbox=variant!=='outra classificatória',sbId=sandbox?'sb_'+id+'_fixture':id,sb=sandbox?db.collection('sandboxes').doc(sbId):ref,batch=db.batch();
    batch.set(sb,{...data,registrationSettings:{source:'scoreplace',pricing:{mode:'single',cents:0}},id:sbId,isSandbox:sandbox,sbState:'ready',sandboxOf:id,testModeEnabled:sandbox,
      sandboxOwnerUid:owner,status:'closed',notificationsMuted:true,resultEntry:['organizer'],participants:[],matches:[],groups:[],rounds:[],
      canonicalRegistrationMigration:{...data.canonicalRegistrationMigration,registrationCount:count}});
    for(let i=0;i<count;i++) {
      const uid='grid-player-'+i;
      batch.set(db.collection('users').doc(uid),{displayName:'Jogador '+i});
      batch.set(sb.collection('registrations').doc(uid),{registrationId:uid,participantKind:'account',participantUid:uid,
        participantKey:'uid:'+uid,categoryId:data.categoryDefinitions[0].id,status:'confirmed',enrollSeq:i+1});
    }
    await batch.commit();
    const call=(name,payload={})=>invoke(name,{tournamentId:sbId,sandbox,operationId:randomUUID(),...payload});
    assert((await call('drawRound')).ok);
    const matches=(await sb.collection('matches').get()).docs.map(d=>d.data().jogo);
    assert.equal(matches.filter(m=>!m.isBye).length,proposed.plan.blocks.filter(b=>b.phaseIndex===0).reduce((n,b)=>n+b.games,0),variant);
    assert(matches.filter(m=>!m.isBye).every(m=>m.scheduledAt),variant);
    if (variant==='outra classificatória') {
      const changed=structuredClone(sample.fmt2);changed.eliminatoria.formationQualificationCategoryRules[0].perGroup=4;
      await assert.rejects(call('updateTournamentConfiguration',{patch:{fmt2:changed}}),{code:'failed-precondition'});
      assert.equal((await sb.get()).data().fmt2.eliminatoria.formationQualificationCategoryRules[0].perGroup,2);
      for (const phase of [0,1]) {
        const physical=(await sb.collection('matches').get()).docs.map(d=>d.data().jogo);
        for (const m of physical.filter(m=>m.phaseIndex===phase || !phase&&!m.phaseIndex))
          assert((await call('applyMatchResult',{matchId:m.id,payload:{s1:4,s2:3,useSets:false}})).ok);
        const advance=await call('advanceTournamentPhase');
        assert(advance.ok,JSON.stringify(advance));
        const next=(await sb.collection('matches').get()).docs.map(d=>d.data().jogo).filter(m=>m.phaseIndex===phase+1);
        assert.equal(next.length,proposed.plan.blocks.filter(b=>b.phaseIndex===phase+1).reduce((n,b)=>n+b.games,0));
        assert(next.every(m=>m.scheduledAt));
      }
    }
  }
  console.log('universal grid physical: OK');
}
run().then(()=>console.log('✓ Firestore demo: criação, edição, grade oficial, sorteio físico e avanço de duas categorias com cortes distintos.'))
  .catch(error=>{console.error(error.stdout?.toString()||'',error.stderr?.toString()||'',error);process.exitCode=1;});
