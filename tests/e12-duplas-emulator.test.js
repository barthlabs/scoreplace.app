'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('node:child_process');
  const fs = require('node:fs'), os = require('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e12-pair-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  { encoding:'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({ firestore:{ rules:path.join(root, 'tests/concurrency/firestore.allow.rules') },
    emulators:{ firestore:{host:'127.0.0.1',port}, ui:{enabled:false}, singleProjectMode:true } }));
  const result = spawnSync('firebase', ['emulators:exec','--only','firestore','--config',config,
    '--project','demo-scoreplace','node tests/e12-duplas-emulator.test.js'], {
    cwd:root, encoding:'utf8', timeout:180000,
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
const registration=require('../functions/registration-core.js');
const splitParts=require('../functions/vendor/tournament-split-core.js');
const call=(name,data,uid)=>CF[name].run({data,auth:uid?{uid,token:{uid}}:null,
  rawRequest:{headers:{}},acceptsStreaming:false});
const rejected=(promise,code)=>assert.rejects(promise,error=>error&&error.code===code);
const clone=value=>JSON.parse(JSON.stringify(value));

(async()=>{
  const db=admin.firestore();
  const id='tour_'+Date.now()+'_'+ 'e'.repeat(32);
  const ref=db.doc('tournaments/'+id);
  const fp='e12-emulator';
  const reservations=[
    {manualParticipantId:'slot-1',displayName:'Jogador 01',name:'Jogador 01',isPlaceholder:true},
    {manualParticipantId:'slot-2',displayName:'Jogador 02',name:'Jogador 02',isPlaceholder:true}
  ];
  const invitation={id:'alice__bob',inviterUid:'alice',inviteeUid:'bob',createdAt:Date.now()};
  const ranking={phaseIndex:0,order:['alice','bob'],scores:[21,18]};
  const definitions=[{id:'a',label:'A',dimension:'custom',enabled:true,
    exclusivityGroup:'choice',criteria:{}}];
  await ref.set({id,creatorUid:'org',status:'open',teamSize:2,enrollmentMode:'teams',
    manualPairing:'open',memberUids:['org','alice','bob'],pairRequests:[invitation],
    placeholderReservations:reservations,classification:ranking,categoryDefinitions:definitions,
    enrollmentRigor:'casual',canonicalRegistrationMigration:{fingerprint:fp,registrationCount:2}});
  const makeRegistration=uid=>({registrationId:registration.registrationId('uid:'+uid,'a'),
    tournamentId:id,categoryId:'a',participantKey:'uid:'+uid,participantKind:'account',
    participantUid:uid,status:'confirmed',validationState:'approved',fixedPairId:null,
    migrationFingerprint:fp});
  for(const uid of ['alice','bob']){
    const item=makeRegistration(uid);
    await ref.collection('registrations').doc(item.registrationId).set(item);
  }
  const pair=(uid,more={})=>call('formPair',{tournamentId:id,uid1:'alice',uid2:'bob',
    categoryId:'a',...more},uid);
  const snapshot=async()=>({parent:clone((await ref.get()).data()),
    regs:(await ref.collection('registrations').orderBy('registrationId').get()).docs.map(d=>clone(d.data()))});
  const before=await snapshot();
  await rejected(pair('bob',{pairRequestId:'wrong'}),'failed-precondition');
  assert.deepEqual(await snapshot(),before,'ID errado não altera pai, recibo, convite ou inscrições');
  await rejected(pair('alice',{pairRequestId:invitation.id}),'failed-precondition');
  assert.deepEqual(await snapshot(),before,'convidante não aceita o próprio convite');
  await rejected(call('formPair',{tournamentId:id,manualId1:'slot-1',manualId2:'slot-2'},'org'),
    'failed-precondition');
  assert.deepEqual(await snapshot(),before,'duas reservas não viram inscrições confirmadas');
  const formed=await pair('bob',{pairRequestId:invitation.id});
  assert.equal(formed.outcome,'paired');
  assert.deepEqual(formed.pairRequests,[]);
  const after=await snapshot();
  assert.deepEqual(after.parent.classification,ranking,'classificação consolidada preservada');
  assert.deepEqual(after.parent.placeholderReservations,reservations,'reservas preservadas');
  assert.equal(after.parent.canonicalRegistrationMigration.registrationCount,2);
  assert.equal(after.regs.length,2);
  assert(after.regs[0].fixedPairId&&after.regs[0].fixedPairId===after.regs[1].fixedPairId);
  await rejected(pair('bob',{pairRequestId:invitation.id}),'failed-precondition');
  assert.deepEqual(await snapshot(),after,'convite consumido não forma outra dupla');
  const split=await call('splitPair',{tournamentId:id,uid1:'alice',uid2:'bob',categoryId:'a'},'bob');
  assert.equal(split.outcome,'split');
  const splitState=await snapshot();
  assert(splitState.regs.every(item=>item.fixedPairId===null));
  await ref.update({pairRequests:[invitation]});
  const oldClient=await pair('bob');
  assert.equal(oldClient.outcome,'paired','cliente antigo sem pairRequestId exige convite correspondente');
  assert.deepEqual((await ref.get()).data().pairRequests,[]);
  await call('splitPair',{tournamentId:id,uid1:'alice',uid2:'bob',categoryId:'a'},'bob');
  await ref.update({pairRequests:[invitation]});
  const raced=await Promise.allSettled([pair('bob',{pairRequestId:invitation.id}),
    pair('bob',{pairRequestId:invitation.id})]);
  assert.equal(raced.filter(item=>item.status==='fulfilled'&&item.value.outcome==='paired').length,1,
    'duas chamadas concorrentes geram só uma dupla');
  assert.equal(raced.filter(item=>item.status==='rejected').length,1);
  assert.deepEqual((await ref.get()).data().pairRequests,[]);
  assert.deepEqual((await ref.get()).data().classification,ranking);
  await rejected(call('enrollParticipant',{tournamentId:id,organizerManual:true,
    participantObj:{uid:'third',categoryIds:['a']}},'org'),'permission-denied');
  const manual=await call('enrollParticipant',{tournamentId:id,organizerManual:true,
    participantObj:{manualParticipantId:'manual-real',displayName:'Inscrito manual',categoryIds:['a']}},'org');
  assert.equal(manual.outcome,'enrolled');
  assert.equal((await ref.collection('registrations').get()).size,3);
  assert.deepEqual((await ref.get()).data().placeholderReservations,reservations);
  const sandboxId='sb_'+id+'_e12';
  const sandboxRef=db.doc('sandboxes/'+sandboxId);
  await sandboxRef.set({...before.parent,id:sandboxId,isSandbox:true,sbState:'ready',
    notificationsMuted:true,sandboxOf:id,sandboxOwnerUid:'org',pairRequests:[]});
  for(const item of before.regs)await sandboxRef.collection('registrations').doc(item.registrationId).set(item);
  const privateBefore=clone((await sandboxRef.get()).data());
  await rejected(call('formPair',{tournamentId:sandboxId,sandbox:true,
    uid1:'alice',uid2:'bob',categoryId:'a'},'alice'),'not-found');
  await rejected(call('splitPair',{tournamentId:sandboxId,sandbox:true,
    uid1:'alice',uid2:'bob',categoryId:'a'},'alice'),'not-found');
  assert.deepEqual(clone((await sandboxRef.get()).data()),privateBefore,
    'não dono não altera sandbox canônico por formPair ou splitPair');
  const sandboxPair=await call('formPair',{tournamentId:sandboxId,sandbox:true,
    uid1:'alice',uid2:'bob',categoryId:'a'},'org');
  assert.equal(sandboxPair.outcome,'paired','dono do sandbox autorizado no original forma sem convite stale');
  assert.equal((await sandboxRef.collection('registrations').get()).size,2);
  const legacyId='tour_'+Date.now()+'_'+ 'f'.repeat(32);
  const legacyRef=db.doc('tournaments/'+legacyId);
  const legacyRoster=[{uid:'legacy-a',displayName:'Legado A',name:'Legado A',enrollSeq:1},
    {uid:'legacy-b',displayName:'Legado B',name:'Legado B',enrollSeq:2}];
  const divided=splitParts.dividir({id:legacyId,participants:legacyRoster,matches:[],
    groups:[],opponentHistory:[]},['participants']);
  await legacyRef.set({id:legacyId,creatorUid:'org',status:'open',teamSize:2,
    manualPairing:'open',enrollmentMode:'teams',participants:[],
    _semPesados:['participants'],_nPartes:{participants:2},
    memberUids:['org','legacy-a','legacy-b'],
    pairRequests:[{id:'legacy-a__legacy-b',inviterUid:'legacy-a',inviteeUid:'legacy-b'}]});
  for(const item of divided.participants)await legacyRef.collection('inscritos').doc(item._k).set(item);
  const legacySandboxId='sb_'+legacyId+'_e12';
  const legacySandboxRef=db.doc('sandboxes/'+legacySandboxId);
  await legacySandboxRef.set({...clone((await legacyRef.get()).data()),id:legacySandboxId,
    isSandbox:true,sbState:'ready',notificationsMuted:true,sandboxOf:legacyId,sandboxOwnerUid:'org'});
  const legacyPrivateBefore=clone((await legacySandboxRef.get()).data());
  await rejected(call('formPair',{tournamentId:legacySandboxId,sandbox:true,
    uid1:'legacy-a',uid2:'legacy-b'},'legacy-b'),'not-found');
  await rejected(call('splitPair',{tournamentId:legacySandboxId,sandbox:true,
    uid1:'legacy-a',uid2:'legacy-b'},'legacy-b'),'not-found');
  assert.deepEqual(clone((await legacySandboxRef.get()).data()),legacyPrivateBefore,
    'não dono não altera sandbox legado por formPair ou splitPair');
  const legacy=await call('formPair',{tournamentId:legacyId,uid1:'legacy-a',uid2:'legacy-b',
    pairRequestId:'legacy-a__legacy-b'},'legacy-b');
  assert.equal(legacy.outcome,'paired','torneio dividido forma com convite e elenco hidratado');
  assert.equal((await legacyRef.collection('inscritos').get()).size,1,'dupla é uma entrada dividida');
  assert.deepEqual((await legacyRef.get()).data().pairRequests,[],'convite legado consumido');
  console.log('✓ E12 emulador: reserva separada, convite/ID/concorrência, recibo de dupla e inscrição manual');
})().catch(error=>{console.error(error);process.exitCode=1;});
