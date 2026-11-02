'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');
if(!process.env.FIRESTORE_EMULATOR_HOST){
  const {spawnSync,execFileSync}=require('node:child_process');
  const fs=require('node:fs'),os=require('node:os');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-e13-legacy-'));
  const port=Number(execFileSync(process.execPath,['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],{encoding:'utf8'}).trim());
  const config=path.join(temp,'firebase.json');
  fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(root,'tests/concurrency/firestore.allow.rules')},
    emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}}));
  const result=spawnSync('firebase',['emulators:exec','--only','firestore','--config',config,
    '--project','demo-scoreplace','node tests/e13-atribuicao-legado-emulator.test.js'],{
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
const invoke=(id,edits,uid='org')=>CF.applyEnrollmentAssignments.run({
  data:{tournamentId:id,sport:'Beach Tennis',edits},auth:{uid,token:{uid}},
  rawRequest:{headers:{}},acceptsStreaming:false});
const clone=(value)=>JSON.parse(JSON.stringify(value));
(async()=>{
  const db=admin.firestore(),id='tour_'+Date.now()+'_'+ 'c'.repeat(32),ref=db.doc('tournaments/'+id);
  await ref.set({id,creatorUid:'org',sport:'Beach Tennis',combinedCategories:['A','B'],
    participants:[{uid:'alice',category:'A',categories:['A']},{uid:'bob',category:'A',categories:['A']}]});
  const before=clone((await ref.get()).data());
  await assert.rejects(invoke(id,[{uid:'alice',category:'B'},{uid:'missing',category:'B'}]),
    (error)=>error&&error.code==='failed-precondition');
  assert.deepEqual(clone((await ref.get()).data()),before,'alvo final ausente aborta todo o bloco');
  await assert.rejects(invoke(id,[{uid:'alice',category:'B'},{uid:'alice',category:'A'}]),
    (error)=>error&&error.code==='invalid-argument');
  assert.deepEqual(clone((await ref.get()).data()),before,'duplicata recusa sem escrita');
  await assert.rejects(invoke(id,Array.from({length:161},(_,i)=>({uid:'u'+i,category:'B'}))),
    (error)=>error&&error.code==='invalid-argument');
  assert.deepEqual(clone((await ref.get()).data()),before,'limite não corta silenciosamente');
  const done=await invoke(id,[{uid:'alice',category:'B'},{uid:'bob',category:'B'}]);
  assert.equal(done.ok,true);assert.equal(done.outcome,'assigned');assert.equal(done.resolvedEntries,2);
  assert.ok(done.tournament,'forma antiga da resposta preservada');
  const persisted=(await ref.collection('inscritos').get()).docs.map((doc)=>doc.data().item||doc.data());
  assert.deepEqual(persisted.map((item)=>item.category).sort(),['B','B'],
    'writer legado mantém o roster dividido após a transação');
  const pairId='tour_'+Date.now()+'_'+ 'd'.repeat(32),pairRef=db.doc('tournaments/'+pairId);
  await pairRef.set({id:pairId,creatorUid:'org',sport:'Beach Tennis',combinedCategories:['A','B'],
    participants:[{p1ManualId:'p1',p1Name:'Um',p2ManualId:'p2',p2Name:'Dois',category:'A',categories:['A']}]});
  const pairBefore=clone((await pairRef.get()).data());
  await assert.rejects(invoke(pairId,[
    {manualParticipantId:'p1',pairMember:'p1',category:'A'},
    {manualParticipantId:'p2',pairMember:'p2',category:'B'}]),
  (error)=>error&&error.code==='invalid-argument');
  assert.deepEqual(clone((await pairRef.get()).data()),pairBefore,'dupla conflitante não grava');
  console.log('✓ E13 legado: bloco atômico, sem truncamento, recibo aditivo e dupla coerente');
})().catch((error)=>{console.error(error);process.exitCode=1;});
