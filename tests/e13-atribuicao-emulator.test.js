'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('node:child_process');
  const fs = require('node:fs'), os = require('node:os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e13-assignment-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  { encoding:'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({ firestore:{ rules:path.join(root,'tests/concurrency/firestore.allow.rules') },
    emulators:{ firestore:{host:'127.0.0.1',port}, ui:{enabled:false}, singleProjectMode:true } }));
  const result = spawnSync('firebase', ['emulators:exec','--only','firestore','--config',config,
    '--project','demo-scoreplace','node tests/e13-atribuicao-emulator.test.js'], {
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
const R=require('../functions/registration-core.js');
const Mutations=require('../functions/registration-mutations-core.js');
const clone=(value)=>JSON.parse(JSON.stringify(value));
const invoke=(data,uid='org')=>CF.assignCanonicalPlaceholderCategoryBatch.run({
  data,auth:{uid,token:{uid}},rawRequest:{headers:{}},acceptsStreaming:false });
const rejectCode=(promise,code)=>assert.rejects(promise,(error)=>error&&error.code===code);

(async()=>{
  const db=admin.firestore(),stamp=Date.now();
  const definitions=[{id:'a',label:'A',dimension:'custom',enabled:true},
    {id:'b',label:'B',dimension:'custom',enabled:true},
    {id:'c',label:'C',dimension:'custom',enabled:true}];
  const make=async(suffix)=>{
    const id='tour_'+stamp+'_'+suffix.repeat(32),ref=db.doc('tournaments/'+id),fp='e13-'+suffix;
    await ref.set({id,creatorUid:'org',memberUids:['org','alice','bob'],status:'open',
      categoryDefinitions:definitions,canonicalRegistrationMigration:{fingerprint:fp,registrationCount:2},
      placeholderReservations:[{manualParticipantId:'slot-1',displayName:'Jogador 1',isPlaceholder:true},
        {manualParticipantId:'slot-2',displayName:'Jogador 2',isPlaceholder:true}],participants:[]});
    for(const uid of ['alice','bob']){
      const item={registrationId:R.registrationId('uid:'+uid,'a'),tournamentId:id,categoryId:'a',
        participantKey:'uid:'+uid,participantKind:'account',participantUid:uid,status:'confirmed',
        validationState:'approved',migrationFingerprint:fp,fixedPairId:null};
      await ref.collection('registrations').doc(item.registrationId).set(item);
    }
    return {id,ref};
  };
  const first=await make('e');
  const payload=(id,operationId)=>({tournamentId:id,sandbox:false,operationId,
    reservations:[{manualParticipantId:'slot-1',toCategoryId:'a'},
      {manualParticipantId:'slot-2',toCategoryId:'b'}],
    edits:[{userUid:'alice',fromCategoryId:'a',toCategoryId:'b'},
      {userUid:'bob',fromCategoryId:'a',toCategoryId:'b'}]});
  const p=payload(first.id,'e13_good_'+stamp);
  await rejectCode(invoke(p,'stranger'),'permission-denied');
  assert.equal((await first.ref.collection('assignmentReceipts').get()).size,0);
  const result=await invoke(p);
  assert.equal(result.ok,true); assert.equal(result.outcome,'assigned');
  assert.equal(result.resolvedEntries,4); assert.equal(result.changed,4);
  const parent=(await first.ref.get()).data();
  assert.equal(parent.canonicalRegistrationMigration.registrationCount,6);
  assert.equal(parent.placeholderReservations.length,0);
  assert.equal((await first.ref.collection('registrations').get()).size,6);
  assert.equal((await first.ref.collection('registrationCategoryAudit').get()).size,2);
  const genderOnly={tournamentId:first.id,sandbox:false,operationId:'e13_gender_'+stamp,
    reservations:[],edits:[{userUid:'alice',fromCategoryId:'b',toCategoryId:'b',
      genders:[{userUid:'alice',gender:'feminino'}]}]};
  const genderReply=await invoke(genderOnly);
  assert.equal(genderReply.outcome,'assigned');
  const aliceBId=R.registrationId('uid:alice','b');
  assert.equal((await first.ref.collection('registrations').doc(aliceBId).get()).data().gender,'feminino');
  assert.equal((await invoke(genderOnly)).replayed,true);
  const oldClientReply=await invoke({...genderOnly,operationId:'e13_old_client_'+stamp,
    edits:[{userUid:'alice',fromCategoryId:'b',toCategoryId:'b'}]});
  assert.equal(oldClientReply.outcome,'unchanged');
  assert.equal((await first.ref.collection('registrations').doc(aliceBId).get()).data().gender,'feminino');
  await rejectCode(invoke({...genderOnly,edits:[{...genderOnly.edits[0],
    genders:[{userUid:'alice',gender:'masculino'}]}]}),'failed-precondition');
  await rejectCode(invoke({...genderOnly,operationId:'e13_gender_invalid_'+stamp,
    edits:[{...genderOnly.edits[0],genders:[{userUid:'alice',gender:'desconhecido'}]}]}),'invalid-argument');
  await invoke({...genderOnly,operationId:'e13_gender_clear_'+stamp,
    edits:[{...genderOnly.edits[0],genders:[{userUid:'alice',gender:''}]}]});
  assert.equal((await first.ref.collection('registrations').doc(aliceBId).get()).data().gender,null);
  const reservationGender={tournamentId:first.id,sandbox:false,operationId:'e13_res_gender_'+stamp,
    reservations:[],edits:[{manualParticipantId:'slot-1',fromCategoryId:'a',toCategoryId:'a',
      genders:[{manualParticipantId:'slot-1',gender:'feminino'}]}]};
  await invoke(reservationGender);
  assert.equal((await first.ref.collection('registrations').doc(R.registrationId('manual:slot-1','a')).get()).data().gender,'feminino');
  const historic=await make('k');
  const oldId='slot-1', historicRegistration={registrationId:R.registrationId('manual:'+oldId,'a'),
    tournamentId:historic.id,categoryId:'a',participantKey:'manual:'+oldId,participantKind:'manual',
    manualParticipantId:oldId,manualDisplayName:'Antiga vaga',status:'withdrawn',
    validationState:'approved',migrationFingerprint:'e13-k',fixedPairId:null};
  await historic.ref.collection('registrations').doc(historicRegistration.registrationId).set(historicRegistration);
  await historic.ref.update({'canonicalRegistrationMigration.registrationCount':3,
    _nPartes:{participants:1}});
  await historic.ref.collection('inscritos').doc('m'+oldId).set({item:{manualParticipantId:oldId,isPlaceholder:true}});
  const historicPayload={tournamentId:historic.id,sandbox:false,operationId:'e13_historic_'+stamp,
    reservations:[{manualParticipantId:'slot-1',toCategoryId:'a',gender:'feminino'},
      {manualParticipantId:'slot-2',toCategoryId:'b'}],edits:[]};
  const historicResult=await invoke(historicPayload);
  assert.equal(historicResult.changed,3);
  assert.equal(historicResult.remappedIds['slot-1'],'slot-1-g1');
  assert.equal((await historic.ref.collection('registrations').doc(R.registrationId('manual:slot-1-g1','a')).get()).data().gender,'feminino');
  assert.equal((await historic.ref.collection('inscritos').doc('mslot-1').get()).exists,false);
  assert.equal((await historic.ref.get()).data()._nPartes.participants,0);
  assert.equal((await historic.ref.collection('registrations').doc(historicRegistration.registrationId).get()).data().status,'withdrawn');
  assert.equal((await historic.ref.collection('registrations').get()).size,5);
  assert.equal((await invoke(historicPayload)).replayed,true);
  await rejectCode(invoke({...historicPayload,operationId:'e13_stale_'+stamp}),'already-exists');
  const missing=await make('l');
  await missing.ref.collection('registrations').doc(R.registrationId('manual:slot-1','a')).set({
    ...historicRegistration,tournamentId:missing.id,migrationFingerprint:'e13-l'});
  await missing.ref.update({'canonicalRegistrationMigration.registrationCount':3,_nPartes:{participants:1}});
  await rejectCode(CF.assignCanonicalPlaceholderCategoryBatch.run({
    data:{tournamentId:missing.id,sandbox:false,manualParticipantIds:['slot-1'],toCategoryId:'a'},
    auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false
  }),'already-exists');
  await rejectCode(invoke({...historicPayload,tournamentId:missing.id,operationId:'e13_missing_'+stamp}),
    'failed-precondition');
  assert.equal((await missing.ref.collection('assignmentReceipts').get()).size,0);
  const divergent=await make('m');
  await divergent.ref.collection('registrations').doc(R.registrationId('manual:slot-1','a')).set({
    ...historicRegistration,tournamentId:divergent.id,migrationFingerprint:'e13-m'});
  await divergent.ref.update({'canonicalRegistrationMigration.registrationCount':3,_nPartes:{participants:1}});
  await divergent.ref.collection('inscritos').doc('mslot-1').set({item:{manualParticipantId:'other',isPlaceholder:true}});
  await rejectCode(invoke({...historicPayload,tournamentId:divergent.id,operationId:'e13_divergent_'+stamp}),
    'failed-precondition');
  const after=clone((await first.ref.get()).data());
  const replay=await invoke(p);
  assert.equal(replay.replayed,true,'resposta perdida retorna recibo anterior');
  assert.equal(replay.operationId,p.operationId);
  assert.deepEqual(clone((await first.ref.get()).data()),after,'retry não grava de novo');
  assert.equal((await first.ref.collection('registrationCategoryAudit').get()).size,2);
  await rejectCode(invoke({...p,edits:[...p.edits].reverse()}),'failed-precondition');

  const second=await make('f');
  const bad=payload(second.id,'e13_bad_'+stamp);
  bad.edits[1].fromCategoryId='b';
  const before=clone((await second.ref.get()).data());
  const registrationsBefore=(await second.ref.collection('registrations').get()).docs.map((doc)=>clone(doc.data()));
  await rejectCode(invoke(bad),'failed-precondition');
  assert.deepEqual(clone((await second.ref.get()).data()),before,'erro no último alvo não grava reserva nem primeira edição');
  assert.deepEqual((await second.ref.collection('registrations').get()).docs.map((doc)=>clone(doc.data())),registrationsBefore);
  assert.equal((await second.ref.collection('assignmentReceipts').get()).size,0);
  assert.equal((await second.ref.collection('registrationCategoryAudit').get()).size,0);
  const conflict=payload(second.id,'e13_conflict_'+stamp);
  conflict.edits.push({manualParticipantId:'slot-1',fromCategoryId:'a',toCategoryId:'b'});
  await rejectCode(invoke(conflict),'invalid-argument');
  assert.deepEqual(clone((await second.ref.get()).data()),before);
  await rejectCode(invoke({...payload(second.id,'e13_large_'+stamp),
    reservations:Array.from({length:161},(_,i)=>({manualParticipantId:'x-'+i,toCategoryId:'a'})),edits:[]}),
  'invalid-argument');
  const goodSecond=payload(second.id,'e13_good2_'+stamp);
  const raced=await Promise.all([invoke(goodSecond),invoke(goodSecond)]);
  assert.equal(raced.filter((item)=>item.replayed).length,1,'concorrência confirma um commit e um replay');
  assert.equal((await second.ref.collection('registrations').get()).size,6);

  const paired=await make('g');
  const pairIds=['alice','bob'].map((uid)=>R.registrationId('uid:'+uid,'a'));
  const pairId=Mutations.canonicalPairId(paired.id,'a',pairIds);
  for(const id of pairIds) await paired.ref.collection('registrations').doc(id).update({fixedPairId:pairId});
  const duplicatePair={...payload(paired.id,'e13_pair_dup_'+stamp),reservations:[]};
  await rejectCode(invoke(duplicatePair),'invalid-argument');
  assert.equal((await paired.ref.collection('registrations').get()).size,2,'dupla duplicada não cria destino');
  const pairMove={...payload(paired.id,'e13_pair_move_'+stamp),reservations:[],
    edits:[{...duplicatePair.edits[0],genders:[{userUid:'alice',gender:'feminino'},
      {userUid:'bob',gender:'masculino'}]}]};
  const pairResult=await invoke(pairMove);
  assert.equal(pairResult.changed,3,'uma edição move a dupla e grava gênero de cada membro');
  assert.equal((await paired.ref.collection('registrations').get()).size,4);
  assert.equal((await paired.ref.collection('registrationCategoryAudit').get()).size,2);
  assert.equal((await paired.ref.collection('registrations').doc(R.registrationId('uid:alice','b')).get()).data().gender,'feminino');
  assert.equal((await paired.ref.collection('registrations').doc(R.registrationId('uid:bob','b')).get()).data().gender,'masculino');

  const financial=await make('h');
  const paidRef=financial.ref.collection('registrations').doc(R.registrationId('uid:alice','a'));
  await paidRef.update({paymentState:'paid',paymentDueCents:1000,paymentCurrency:'BRL'});
  const financialBefore=clone((await financial.ref.get()).data());
  await rejectCode(invoke(payload(financial.id,'e13_paid_'+stamp)),'failed-precondition');
  assert.deepEqual(clone((await financial.ref.get()).data()),financialBefore,
    'histórico financeiro sem configuração recusa o bloco inteiro');
  assert.equal((await financial.ref.collection('registrations').get()).size,2);

  const multiple=await make('j');
  const aliceB={registrationId:R.registrationId('uid:alice','b'),tournamentId:multiple.id,
    categoryId:'b',participantKey:'uid:alice',participantKind:'account',participantUid:'alice',
    status:'confirmed',validationState:'approved',migrationFingerprint:'e13-j',fixedPairId:null};
  await multiple.ref.collection('registrations').doc(aliceB.registrationId).set(aliceB);
  await multiple.ref.update({'canonicalRegistrationMigration.registrationCount':3});
  const multiResult=await invoke({tournamentId:multiple.id,sandbox:false,operationId:'e13_multi_'+stamp,
    reservations:[],edits:[{userUid:'alice',fromCategoryId:'a',toCategoryId:'c'}]});
  assert.equal(multiResult.changed,1,'categoria de origem distingue inscrições da mesma conta');
  assert.equal((await multiple.ref.collection('registrations').doc(aliceB.registrationId).get()).data().status,'confirmed');

  const bulkId='tour_'+stamp+'_'+ 'i'.repeat(32),bulkRef=db.doc('tournaments/'+bulkId);
  const bulkReservations=Array.from({length:137},(_,i)=>({manualParticipantId:'slot-'+i,
    displayName:'Jogador '+i,isPlaceholder:true}));
  await bulkRef.set({id:bulkId,creatorUid:'org',status:'open',categoryDefinitions:definitions,
    canonicalRegistrationMigration:{fingerprint:'e13-bulk',registrationCount:0},
    placeholderReservations:bulkReservations,participants:[]});
  const bulk=await invoke({tournamentId:bulkId,sandbox:false,operationId:'e13_bulk_'+stamp,edits:[],
    reservations:bulkReservations.map((item)=>({manualParticipantId:item.manualParticipantId,toCategoryId:'a'}))});
  assert.equal(bulk.changed,137,'137 reservas cabem no bloco único');
  assert.equal((await bulkRef.collection('registrations').get()).size,137);
  assert.equal((await bulkRef.get()).data().canonicalRegistrationMigration.registrationCount,137);
  const remapId='tour_'+stamp+'_'+'n'.repeat(32),remapRef=db.doc('tournaments/'+remapId);
  const remapReservations=Array.from({length:33},(_,i)=>({manualParticipantId:'historic-'+i,
    displayName:'Jogador '+i,isPlaceholder:true}));
  await remapRef.set({id:remapId,creatorUid:'org',status:'open',categoryDefinitions:definitions,
    canonicalRegistrationMigration:{fingerprint:'e13-remap',registrationCount:33},
    placeholderReservations:remapReservations,participants:[],_nPartes:{participants:33}});
  const remapBatch=db.batch();
  remapReservations.forEach((item)=>{
    const key='manual:'+item.manualParticipantId,registrationId=R.registrationId(key,'a');
    remapBatch.set(remapRef.collection('registrations').doc(registrationId),{
      registrationId,tournamentId:remapId,categoryId:'a',participantKey:key,participantKind:'manual',
      manualParticipantId:item.manualParticipantId,manualDisplayName:item.displayName,status:'withdrawn',
      validationState:'approved',migrationFingerprint:'e13-remap',fixedPairId:null});
    remapBatch.set(remapRef.collection('inscritos').doc('m'+item.manualParticipantId),{item});
  });
  await remapBatch.commit();
  const remapped=await invoke({tournamentId:remapId,sandbox:false,operationId:'e13_33_'+stamp,edits:[],
    reservations:remapReservations.map((item,i)=>({manualParticipantId:item.manualParticipantId,
      toCategoryId:i%2?'a':'b'}))});
  assert.equal(remapped.changed,33);
  assert.equal(Object.keys(remapped.remappedIds).length,33);
  assert.equal((await remapRef.get()).data()._nPartes.participants,0);
  assert.equal((await remapRef.collection('inscritos').get()).size,0);
  assert.equal((await remapRef.collection('registrations').get()).size,66);
  console.log('✓ E13 emulador: lote misto atômico, dupla, 137 vagas, autorização, CAS, retry e concorrência');
})().catch((error)=>{console.error(error);process.exitCode=1;});
