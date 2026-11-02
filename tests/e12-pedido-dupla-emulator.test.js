'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');
if(!process.env.FIRESTORE_EMULATOR_HOST){
  const {spawnSync,execFileSync}=require('node:child_process');
  const fs=require('node:fs'),os=require('node:os');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-e12-request-'));
  const port=Number(execFileSync(process.execPath,['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],{encoding:'utf8'}).trim());
  const config=path.join(temp,'firebase.json');
  fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(root,'tests/concurrency/firestore.allow.rules')},
    emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}}));
  const result=spawnSync('firebase',['emulators:exec','--only','firestore','--config',config,
    '--project','demo-scoreplace','node tests/e12-pedido-dupla-emulator.test.js'],{
      cwd:root,encoding:'utf8',timeout:180000,
      env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH}});
  fs.rmSync(temp,{recursive:true,force:true});
  const output=(result.stdout||'')+(result.stderr||'');process.stdout.write(output);
  if(result.error)console.error(result.error);
  process.exit(result.status===0||/Script exited successfully \(code 0\)/.test(output)?0:1);
}
process.env.GCLOUD_PROJECT='demo-scoreplace';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-scoreplace'});
const CF=require('../functions-autodraw/index.js');
const admin=require('module').createRequire(path.join(root,'functions-autodraw/index.js'))('firebase-admin');
const R=require('../functions/registration-core.js');
const call=(uid,inviteeUid,id)=>CF.requestTournamentPair.run({data:{tournamentId:id,inviteeUid},
  auth:{uid,token:{uid}},rawRequest:{headers:{}},acceptsStreaming:false});
const clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
  const db=admin.firestore(),id='tour_'+Date.now()+'_'+ 'd'.repeat(32),ref=db.doc('tournaments/'+id);
  const fp='e12-pedido';
  await ref.set({id,creatorUid:'org',memberUids:['org','alice','bob'],status:'open',teamSize:2,
    enrollmentMode:'teams',manualPairing:'open',pairRequests:[],participants:[],
    placeholderReservations:[{manualParticipantId:'slot-1',displayName:'Jogador 01',isPlaceholder:true}],
    canonicalRegistrationMigration:{fingerprint:fp,registrationCount:2}});
  for(const uid of ['alice','bob']){
    const item={registrationId:R.registrationId('uid:'+uid,'a'),tournamentId:id,categoryId:'a',
      participantKey:'uid:'+uid,participantKind:'account',participantUid:uid,status:'confirmed',
      validationState:'approved',migrationFingerprint:fp,fixedPairId:null};
    await ref.collection('registrations').doc(item.registrationId).set(item);
  }
  const first=await call('alice','bob',id);
  assert.equal(first.action,'pending');assert.equal(first.requestId,'alice__bob');
  assert.equal((await ref.get()).data().pairRequests.length,1);
  const second=await call('bob','alice',id);
  assert.equal(second.action,'confirm');assert.equal(second.requestId,first.requestId,
    'pedido recíproco devolve o ID original sem inventar outro');
  assert.equal((await ref.get()).data().pairRequests.length,1,'aceite será consumido por formPair');
  const before=clone((await ref.get()).data());
  await assert.rejects(call('alice','slot-1',id),error=>error&&error.code==='failed-precondition');
  assert.deepEqual(clone((await ref.get()).data()),before,'reserva não recebe convite');
  await ref.update({enrollmentMode:'individual',currentPhaseIndex:0,
    phases:[{reiRainha:true,drawMode:'rei_rainha'},{drawMode:'sorteio'}],pairRequests:[]});
  const phase0=clone((await ref.get()).data());
  await assert.rejects(call('alice','bob',id),error=>error&&error.code==='failed-precondition');
  assert.deepEqual(clone((await ref.get()).data()),phase0,'fase inicial Rei/Rainha não cria convite');
  await ref.update({currentPhaseIndex:1});
  const later=await call('alice','bob',id);
  assert.equal(later.action,'pending','após fase inicial o pedido usa inscritos reais');
  console.log('✓ E12 pedido: ID recíproco, reserva recusada e Rei/Rainha antes/depois');
})().catch(error=>{console.error(error);process.exitCode=1;});
