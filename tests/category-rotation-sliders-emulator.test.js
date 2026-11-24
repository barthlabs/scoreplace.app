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
        '--config',config,'node tests/category-rotation-sliders-emulator.test.js'], {
        cwd:path.resolve(__dirname,'..'),env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH},
        timeout:180000,stdio:['ignore','pipe','pipe']
      });
      assert.match(output,/category sliders physical: OK/);
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
  const categories=['Alpha','Beta','Gamma'];
  const cfg=format.defaultConfig('Beach Tennis');
  Object.assign(cfg,{disputa:'dupla',parceria:'rotation_groups',classifAtiva:true,grupos:1,classificados:2,classifScope:'per_group',classificationSliderMode:'category'});
  cfg.eliminatoria.ativa=false;
  cfg.rotationCategoryRules=[
    {category:'Alpha',groupFormation:{mode:'size',value:4},rounds:3,allowRepeatPartners:false,destination:'ranking'},
    {category:'Beta',groupFormation:{mode:'size',value:8},rounds:7,allowRepeatPartners:false,destination:'ranking'},
    {category:'Gamma',groupFormation:{mode:'size',value:12},rounds:3,allowRepeatPartners:false,destination:'ranking'}
  ];
  const compiled=format.compileToPhases(cfg,{sport:'Beach Tennis',categories});
  const created=await invoke('createTournament',{tournamentId:id,config:{...compiled.topLevel,
    name:'Sliders sintéticos',sport:'Beach Tennis',fmt2:cfg,combinedCategories:categories}});
  assert.equal(created.ok,true,JSON.stringify(created));
  const ref=db.collection('tournaments').doc(id);
  const fresh=()=>ref.get().then(s=>s.data());
  assert.deepEqual((await fresh()).fmt2.rotationCategoryRules,cfg.rotationCategoryRules);
  assert.equal((await fresh()).fmt2.classificationSliderMode,'category');
  await ref.update({testModeEnabled:true});
  const repeated=structuredClone(cfg);repeated.rotationCategoryRules[1].rounds=14;repeated.rotationCategoryRules[1].allowRepeatPartners=true;
  const repeatedCompiled=format.compileToPhases(repeated,{sport:'Beach Tennis',categories});
  await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{...repeatedCompiled.topLevel,fmt2:repeated,phases:repeatedCompiled.phases}});
  assert.deepEqual((await fresh()).phases[0].classification.rotationCategoryRules,repeated.rotationCategoryRules);
  assert.equal((await fresh()).testModeEnabled,true);
  for (const mutate of [c=>{c.rotationCategoryRules[0].category='Não declarada';},
    c=>{c.rotationCategoryRules[0].rounds=7;},c=>{c.rotationCategoryRules[0].groupFormation.value=3;}]) {
    const invalid=structuredClone(repeated);mutate(invalid);
    await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{name:'Não salvar',fmt2:invalid}}),{code:'invalid-argument'});
    assert.deepEqual((await fresh()).fmt2.rotationCategoryRules,repeated.rotationCategoryRules);
  }
  const twoPhases=structuredClone(cfg);
  twoPhases.eliminatoria.ativa=true;twoPhases.eliminatoria.openReiRainha=true;twoPhases.eliminatoria.qualifyAll=true;
  twoPhases.rotationCategoryRules.forEach(r=>{r.destination='elimination';});
  twoPhases.eliminatoria.formationCategoryRules=twoPhases.rotationCategoryRules.map(r=>({...r,
    groupFormation:{mode:'size',value:4},rounds:3}));
  const secondCompiled=format.compileToPhases(twoPhases,{sport:'Beach Tennis',categories});
  await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{...secondCompiled.topLevel,fmt2:twoPhases,phases:secondCompiled.phases}});
  assert.deepEqual((await fresh()).phases[1].classification.rotationCategoryRules,twoPhases.eliminatoria.formationCategoryRules);
  assert.deepEqual((await fresh()).phases[0].classification.rotationCategoryRules,twoPhases.rotationCategoryRules);
  const diverged=structuredClone(secondCompiled.phases);diverged[1].classification.rotationCategoryRules[0].rounds=7;
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:twoPhases,phases:diverged}}),{code:'invalid-argument'});
  cfg.eliminatoria.formationCategoryRules=null; // remoção explícita da fase, nunca omissão de cliente antigo
  const common=structuredClone(cfg);common.classificationSliderMode='common';
  common.rotationCategoryRules=cfg.rotationCategoryRules.map(r=>({...r,groupFormation:{mode:'size',value:4},rounds:3}));
  await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:common}});
  assert.equal((await fresh()).fmt2.classificationSliderMode,'common');
  assert((await fresh()).fmt2.rotationCategoryRules.every(r=>r.groupFormation.value===4&&r.rounds===3));
  await invoke('updateTournamentConfiguration',{tournamentId:id,patch:{fmt2:cfg}});
  const restored=await fresh();
  assert.deepEqual(restored.phases[0].classification.rotationCategoryRules,cfg.rotationCategoryRules);
  const sbId='sb_'+id+'_sliders',sb=db.collection('sandboxes').doc(sbId);
  const batch=db.batch();
  batch.set(sb,{...restored,id:sbId,status:'closed',isSandbox:true,sbState:'ready',sandboxOf:id,
    sandboxOwnerUid:owner,notificationsMuted:true,participants:[],matches:[],groups:[],rounds:[],
    courtNames:['Quadra 1','Quadra 2','Quadra 3'],resultEntry:['organizer'],
    canonicalRegistrationMigration:{...restored.canonicalRegistrationMigration,registrationCount:28}});
  let sequence=0;
  for(const [i,category] of categories.entries()) {
    const categoryId=restored.categoryDefinitions.find(d=>d.label===category).id;
    for(let n=0;n<(i===2?12:8);n++) {
      const uid='sliders-'+category+'-'+n;
      batch.set(db.collection('users').doc(uid),{displayName:category+' Atleta '+n});
      batch.set(sb.collection('registrations').doc(uid),{registrationId:uid,participantKind:'account',
        participantUid:uid,participantKey:'uid:'+uid,categoryId,status:'confirmed',enrollSeq:++sequence});
    }
  }
  await batch.commit();
  const attempts=await Promise.allSettled(Array.from({length:2},()=>invoke('drawRound',{
    tournamentId:sbId,sandbox:true,operationId:randomUUID()})));
  assert.equal(attempts.filter(r=>r.status==='fulfilled'&&r.value.ok).length,1,JSON.stringify(attempts));
  assert.equal(attempts.find(r=>r.status==='rejected').reason.code,'failed-precondition');
  const readMatches=async()=> (await sb.collection('matches').get()).docs.map(s=>s.data().jogo);
  const matches=await readMatches();
  assert.equal(matches.length,29,'cada pessoa recebe exatamente os jogos pedidos');
  for(const [i,category] of categories.entries()) {
    const games=matches.filter(m=>m.category===category),counts=new Map();
    for(const game of games)for(const uid of [...game.team1Uids,...game.team2Uids])counts.set(uid,(counts.get(uid)||0)+1);
    assert.equal(counts.size,i===2?12:8);
    assert([...counts.values()].every(n=>n===cfg.rotationCategoryRules[i].rounds));
  }
  const call=(name,data)=>invoke(name,{tournamentId:sbId,sandbox:true,operationId:randomUUID(),...data});
  const physical=mid=>sb.collection('matches').doc(mid).get().then(s=>s.data().jogo);
  const alpha=matches.filter(m=>m.category==='Alpha');
  const first=alpha[0],series=alpha.filter(m=>String(m.monarchGroup)===String(first.monarchGroup));
  assert.equal(series.length,3);
  const capability=backend('./court-capability-digest.js').digestFor(path.dirname(backend.resolve('./index.js')));
  await db.doc('operationRuntimeCapabilities/endMatchOnCourt').set({ready:true,centralSourceDigest:capability});
  assert.equal((await call('assignMatchCourt',{matchId:first.id,court:'Quadra 1',confirmCall:true})).ok,true);
  const scored=await call('applyMatchResult',{matchId:first.id,payload:{s1:4,s2:3,useSets:false}});
  assert.equal(scored.ok,true,JSON.stringify(scored));
  const beforeScore=await physical(first.id);
  assert(beforeScore.winner);
  const released=await call('endMatchOnCourt',{matchId:first.id,action:'release',monarchEndWholeBlock:true});
  assert.deepEqual(new Set(released.releasedMatchIds),new Set(series.filter(m=>m.id!==first.id).map(m=>m.id)));
  assert.deepEqual(await physical(first.id),beforeScore,'placar confirmado nas chaves físicas não muda ao encerrar restante');
  for(const mid of released.releasedMatchIds)assert.equal((await physical(mid)).court,null);
  const gamma=matches.filter(m=>m.category==='Gamma'&&m.round===1);
  assert.equal(gamma.length,3,'três partidas da mesma rodada são quartetos independentes');
  for(let i=0;i<2;i++)assert.equal((await call('assignMatchCourt',{matchId:gamma[i].id,court:'Quadra '+(i+2),confirmCall:true})).ok,true);
  const other=await physical(gamma[1].id);
  const endOne=await call('endMatchOnCourt',{matchId:gamma[0].id,action:'release',monarchEndWholeBlock:true});
  assert.deepEqual(endOne.releasedMatchIds,[gamma[0].id]);
  assert.deepEqual(await physical(gamma[1].id),other,'outra quadra mantém jogo e relógio');
  const beta=matches.filter(m=>m.category==='Beta'&&m.round===1);
  assert.equal(beta.length,2,'Super 8 começa com duas partidas para duas quadras');
  assert.equal(new Set(beta.flatMap(m=>m.team1Uids.concat(m.team2Uids))).size,8);
  for(let i=0;i<2;i++)assert.equal((await call('assignMatchCourt',{matchId:beta[i].id,court:'Quadra '+(i+1),confirmCall:true})).ok,true);
  const secondBeta=await physical(beta[1].id);
  const endBeta=await call('endMatchOnCourt',{matchId:beta[0].id,action:'release',monarchEndWholeBlock:true});
  assert.deepEqual(endBeta.releasedMatchIds,[beta[0].id]);
  assert.deepEqual(await physical(beta[1].id),secondBeta,'Super 8 não trata o outro quarteto como parte de um bloco');
  const changed=structuredClone(cfg);changed.rotationCategoryRules[1].rounds=5;
  await assert.rejects(invoke('updateTournamentConfiguration',{tournamentId:sbId,sandbox:true,patch:{fmt2:changed}}),{code:'failed-precondition'});
  assert.equal((await sb.get()).data().testModeEnabled,true);
  assert.equal((await fresh()).testModeEnabled,true);
  console.log('category sliders physical: OK');
}
run().then(()=>console.log('✓ Firestore demo: salvar/reabrir, sorteio canônico, jogos por pessoa, bloco, placar e quadras independentes'))
  .catch(error=>{console.error(error.stdout?.toString()||'',error.stderr?.toString()||'',error);process.exitCode=1;});
