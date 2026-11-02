'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('node:child_process');
  const fs = require('node:fs'), os = require('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e11-receipt-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  {encoding:'utf8'}).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore:{rules:path.join(root, 'tests/concurrency/firestore.allow.rules')},
    emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}
  }));
  const result = spawnSync('firebase', ['emulators:exec','--only','firestore','--config',config,
    '--project','demo-scoreplace','node tests/e11-recibo-functions-emulator.test.js'], {
    cwd:root,encoding:'utf8',timeout:180000,
    env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:' + process.env.PATH}
  });
  fs.rmSync(temp,{recursive:true,force:true});
  const output=(result.stdout||'')+(result.stderr||'');
  process.stdout.write(output);
  if(result.error) console.error(result.error);
  process.exit(result.status===0 || /Script exited successfully \(code 0\)/.test(output) ? 0 : 1);
}

process.env.GCLOUD_PROJECT='demo-scoreplace';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-scoreplace'});
const CF=require('../functions/index.js');
const admin=require('module').createRequire(path.join(root,'functions/index.js'))('firebase-admin');
const canonical=require('../functions/canonical-enrollment-core.js');
const call=(name,data,uid)=>CF[name].run({data,auth:uid?{uid,token:{uid}}:null,
  rawRequest:{headers:{}},acceptsStreaming:false});
const rejected=(promise,code)=>assert.rejects(promise,error=>error && error.code===code);
const clone=value=>JSON.parse(JSON.stringify(value));

(async()=>{
  const db=admin.firestore();
  const id='tour_'+Date.now()+'_'+ 'b'.repeat(32);
  const ref=db.doc('tournaments/'+id);
  const definitions=[
    {id:'a',label:'A',dimension:'custom',enabled:true,exclusivityGroup:'choice',criteria:{}},
    {id:'b',label:'B',dimension:'custom',enabled:true,exclusivityGroup:'choice',criteria:{}},
    {id:'off',label:'Off',dimension:'custom',enabled:false,criteria:{}}
  ];
  await ref.set({id,name:'Fixture E11',creatorUid:'org',status:'open',participants:[],
    categoryDefinitions:definitions,enrollmentRigor:'casual',
    canonicalRegistrationMigration:{fingerprint:'e11-fixture',registrationCount:0},memberUids:['org']});
  const enroll=(uid,ids,caller=uid)=>call('enrollParticipant',{tournamentId:id,
    participantObj:{uid,categoryIds:ids}},caller);
  const first=await enroll('self',['off']);
  assert.equal(first.outcome,'rejected');
  assert.equal(first.alreadyEnrolled,false);
  assert.equal((await ref.collection('registrations').get()).size,0,'rejeição não cria inscrição');
  const conflict=await enroll('self',['a','b']);
  assert.equal(conflict.outcome,'conflict');
  assert.equal((await ref.collection('registrations').get()).size,0,'conflito não cria inscrição');
  await rejected(enroll('self',['a'],'org'),'permission-denied');
  assert.equal((await ref.collection('registrations').get()).size,0,'organizador não inscreve conta alheia');
  const originalDecide=canonical.decide;
  const before=clone((await ref.get()).data());
  canonical.decide=()=>({outcome:'futureValue',enrollment:{creates:[],updates:[]}});
  try { await rejected(enroll('self',['a']),'failed-precondition'); }
  finally { canonical.decide=originalDecide; }
  assert.deepEqual(clone((await ref.get()).data()),before,'desfecho desconhecido não escreve antes do erro');
  assert.equal((await ref.collection('registrations').get()).size,0);
  const enrolled=await enroll('self',['a']);
  assert.equal(enrolled.outcome,'enrolled');
  assert(enrolled.participants.some(item=>item.uid==='self'));
  assert.equal((await ref.collection('registrations').get()).size,1);
  const already=await enroll('self',['a']);
  assert.equal(already.alreadyEnrolled,true);
  await rejected(call('deenrollParticipant',{tournamentId:id,userUid:'self'},'stranger'),'permission-denied');
  const removed=await call('deenrollParticipant',{tournamentId:id,userUid:'self'},'self');
  assert.equal(removed.notFound,false);
  assert.equal(removed.participants.length,0);
  const missing=await call('deenrollParticipant',{tournamentId:id,userUid:'self'},'self');
  assert.equal(missing.notFound,true);
  await enroll('self',['a']);
  await enroll('other',['a']);
  const docs=await ref.collection('registrations').get();
  const mine=docs.docs.find(doc=>(doc.data()||{}).participantUid==='self');
  await mine.ref.update({status:'waitlisted'});
  const left=await call('leaveStandby',{tournamentId:id},'self');
  assert.equal(left.removed,true); assert.equal(left.canonical,true);
  assert.equal(Object.hasOwn(left,'standbyParticipants'),false,'canônico não fabrica lista vazia');
  assert.equal(Object.hasOwn(left,'waitlist'),false,'canônico não fabrica fila vazia');
  assert(left.participants.some(item=>item.uid==='other'),'outro inscrito segue no elenco');
  const noWait=await call('leaveStandby',{tournamentId:id},'self');
  assert.equal(noWait.removed,false);
  const manual=await call('enrollParticipant',{tournamentId:id,organizerManual:true,
    participantObj:{manualParticipantId:'manual-m1',displayName:'Participante manual',categoryIds:['a']}},'org');
  assert.equal(manual.outcome,'enrolled');
  await rejected(call('deenrollParticipant',{tournamentId:id,manualParticipantId:'manual-m1'},'self'),'permission-denied');
  const organizerRemoval=await call('deenrollParticipant',{tournamentId:id,manualParticipantId:'manual-m1'},'org');
  assert.equal(organizerRemoval.notFound,false);
  assert.equal(organizerRemoval.participants.some(item=>item.manualParticipantId==='manual-m1'),false);
  console.log('✓ E11 emulador: sucesso, recusa, conflito, desconhecido sem escrita, saída, espera e autorização');
})().catch(error=>{console.error(error);process.exitCode=1;});
