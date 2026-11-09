'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.join(__dirname,'..');
if(!process.env.FIRESTORE_EMULATOR_HOST){
  const {spawnSync,execFileSync}=require('node:child_process');
  const fs=require('node:fs'),os=require('node:os');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-e14-category-'));
  const port=Number(execFileSync(process.execPath,['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],{encoding:'utf8'}).trim());
  const config=path.join(temp,'firebase.json');
  fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(root,'tests/concurrency/firestore.allow.rules')},
    emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}}));
  const result=spawnSync('firebase',['emulators:exec','--only','firestore','--config',config,
    '--project','demo-scoreplace','node tests/e14-category-emulator.test.js'],{
      cwd:root,encoding:'utf8',timeout:180000,
      env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH}});
  fs.rmSync(temp,{recursive:true,force:true});
  const output=(result.stdout||'')+(result.stderr||'');process.stdout.write(output);
  if(result.error)console.error(result.error);
  process.exit(result.status===0||/Script exited successfully \(code 0\)/.test(output)?0:1);
}
process.env.GCLOUD_PROJECT='demo-scoreplace';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-scoreplace'});
const CF=require('../functions/index.js');
const Draw=require('../functions-autodraw/index.js');
const admin=require('module').createRequire(path.join(root,'functions/index.js'))('firebase-admin');
const registrationCore=require('../functions/registration-core.js');
const definitions=[{id:'a',label:'A',dimension:'custom',enabled:true},
  {id:'b',label:'B',dimension:'custom',enabled:true}];
const invoke=(fn,data,uid='org')=>fn.run({data,auth:{uid,token:{uid}},rawRequest:{headers:{}},acceptsStreaming:false});
const clone=value=>JSON.parse(JSON.stringify(value));
(async()=>{
  const db=admin.firestore(),stamp=Date.now();let serial=0;
  async function make(){
    const id='tour_'+stamp+'_'+(++serial).toString(16).padStart(32,'0');
    const ref=db.doc('tournaments/'+id);
    await ref.set({id,creatorUid:'org',memberUids:['org'],status:'open',
      canonicalRegistrationMigration:{fingerprint:'e14-'+serial,registrationCount:0},
      categoryDefinitions:clone(definitions),combinedCategories:['A','B'],
      genderCategories:['Antiga'],skillCategories:[],participants:[]});
    return {id,ref};
  }
  const first=await make();
  const remove=(id,category,uid='org')=>invoke(Draw.deleteEmptyTournamentCategory,{tournamentId:id,category},uid);
  const configure=(id,defs,uid='org')=>invoke(CF.setTournamentCategoryDefinitions,
    {tournamentId:id,definitions:defs,rigor:'casual'},uid);
  const empty=await make();
  const emptySaved=await configure(empty.id,[definitions[0]]);
  assert.equal(emptySaved.ok,true,'porta tipada remove categoria sem inscrições ativas');
  const emptyData=(await empty.ref.get()).data();
  assert.deepEqual(emptyData.categoryDefinitions.map(def=>def.id),['a']);
  assert.deepEqual(emptyData.combinedCategories,['A']);
  assert.equal(emptyData.canonicalRegistrationMigration.registrationCount,0);
  const reservedConfig=await make();
  await reservedConfig.ref.update({placeholderReservations:[
    {categoryId:'b',participantKey:'guest:reserved'},
    {categoryId:'a',participantKey:'guest:kept'},
  ]});
  assert.equal((await configure(reservedConfig.id,[definitions[0]])).ok,true);
  assert.deepEqual((await reservedConfig.ref.get()).data().placeholderReservations,[
    {categoryId:'__uncategorized__',participantKey:'guest:reserved'},
    {categoryId:'a',participantKey:'guest:kept'},
  ],'a porta tipada retira também as reservas da categoria apagada');
  await assert.rejects(remove(first.id,'B','intruso'),error=>error.code==='permission-denied');
  assert.equal((await remove(first.id,'B')).outcome,'deleted');
  let parent=(await first.ref.get()).data();
  assert.deepEqual(parent.categoryDefinitions.map(def=>def.id),['a']);
  assert.deepEqual(parent.combinedCategories,['A']);
  assert.deepEqual(parent.genderCategories,['Antiga'],'eixo antigo não vira fonte canônica');
  assert.equal((await remove(first.id,'B')).outcome,'missing');
  await first.ref.update({registrationSettings:{source:'scoreplace',pricing:{mode:'category',centsByCategory:{A:2000}}}});
  await assert.rejects(remove(first.id,'A'),error=>error.code==='failed-precondition');
  await assert.rejects(configure(first.id,[{...definitions[0],label:'Novo A'}]),
    error=>error.code==='failed-precondition');
  await first.ref.update({registrationSettings:admin.firestore.FieldValue.delete()});
  await first.ref.update({maxParticipantsByCategory:{A:12}});
  await assert.rejects(remove(first.id,'A'),error=>error.code==='failed-precondition');
  await assert.rejects(configure(first.id,[{...definitions[0],label:'Novo A'}]),
    error=>error.code==='failed-precondition');
  await first.ref.update({maxParticipantsByCategory:{}});
  const rename=await configure(first.id,[{...definitions[0],label:'Novo A'}]);
  assert.equal(rename.ok,true);
  parent=(await first.ref.get()).data();
  assert.deepEqual(parent.categoryDefinitions.map(def=>def.id),['a']);
  assert.deepEqual(parent.combinedCategories,['Novo A']);
  const configureAxes=(expectedCategoryDefinitions)=>invoke(Draw.setTournamentCategoryConfig,
    {tournamentId:first.id,genderCategories:['Fem'],skillCategories:[],expectedCategoryDefinitions});
  await assert.rejects(configureAxes(definitions),error=>error.code==='failed-precondition');
  await assert.rejects(configureAxes(undefined),error=>error.code==='failed-precondition' &&
    /Atualize o aplicativo/.test(error.message),'cliente antigo recebe instrução distinta sem alterar categorias');
  assert.deepEqual((await first.ref.get()).data().combinedCategories,['Novo A'],
    'cliente antigo ou snapshot obsoleto não reintroduz categoria removida');
  assert.equal((await configureAxes(parent.categoryDefinitions)).changed,true);
  assert.deepEqual((await first.ref.get()).data().combinedCategories,['Fem']);

  const second=await make();
  const item={registrationId:registrationCore.registrationId('uid:alice','b'),tournamentId:second.id,
    categoryId:'b',participantKey:'uid:alice',participantKind:'account',participantUid:'alice',
    status:'confirmed',validationState:'approved',migrationFingerprint:'e14-2',fixedPairId:null};
  await second.ref.collection('registrations').doc(item.registrationId).set(item);
  await second.ref.update({'canonicalRegistrationMigration.registrationCount':1});
  assert.equal((await remove(second.id,'B')).outcome,'deleted');
  assert.deepEqual((await second.ref.get()).data().combinedCategories,['A']);
  const secondRegs=(await second.ref.collection('registrations').get()).docs.map(doc=>doc.data());
  assert.equal(secondRegs.find(entry=>entry.registrationId===item.registrationId).status,'withdrawn');
  assert.equal(secondRegs.find(entry=>entry.categoryId==='__uncategorized__').status,'confirmed');
  assert.equal((await second.ref.get()).data().canonicalRegistrationMigration.registrationCount,2);

  const editor=await make();
  await editor.ref.update({customCategories:['A','B'],maxParticipants:48,
    maxParticipantsByCategory:{A:16,B:32}});
  for(const person of ['first','second']){
    const entry={...item,registrationId:registrationCore.registrationId('uid:'+person,'b'),
      tournamentId:editor.id,participantKey:'uid:'+person,participantUid:person,
      migrationFingerprint:'e14-'+serial};
    await editor.ref.collection('registrations').doc(entry.registrationId).set(entry);
  }
  await editor.ref.update({'canonicalRegistrationMigration.registrationCount':2});
  const edit=await invoke(Draw.updateTournamentConfiguration,{tournamentId:editor.id,patch:{
    customCategories:['Retinol (B)','Colágeno (C)'],
    combinedCategories:['Retinol (B)','Colágeno (C)'],
    maxParticipantsByCategory:{'Retinol (B)':16,'Colágeno (C)':32},maxParticipants:48,
  }});
  assert.equal(edit.ok,true,'editor grava categorias novas com inscrições antigas');
  const edited=(await editor.ref.get()).data();
  assert.deepEqual(edited.combinedCategories,['Retinol (B)','Colágeno (C)']);
  assert.equal(edited.canonicalRegistrationMigration.registrationCount,4);
  const editedRegs=(await editor.ref.collection('registrations').get()).docs.map(doc=>doc.data());
  assert.equal(editedRegs.filter(entry=>entry.status==='confirmed' && entry.categoryId==='__uncategorized__').length,2);
  assert.equal(editedRegs.filter(entry=>entry.status==='withdrawn' && entry.categoryId==='b').length,2);
  assert.equal(editedRegs.filter(entry=>entry.status==='confirmed' && entry.categoryId==='b').length,0);

  const typed=await make();
  const typedEntry={...item,registrationId:registrationCore.registrationId('uid:typed','b'),
    tournamentId:typed.id,participantKey:'uid:typed',participantUid:'typed',
    migrationFingerprint:'e14-'+serial};
  await typed.ref.collection('registrations').doc(typedEntry.registrationId).set(typedEntry);
  await typed.ref.update({'canonicalRegistrationMigration.registrationCount':1});
  const typedSaved=await configure(typed.id,[definitions[0]]);
  assert.equal(typedSaved.uncategorized,1,'porta tipada aplica a mesma regra de exclusão');
  assert.equal((await typed.ref.get()).data().canonicalRegistrationMigration.registrationCount,2);
  assert.equal((await typed.ref.collection('registrations').doc(typedEntry.registrationId).get()).data().status,'withdrawn');

  const ambiguous=await make();
  await ambiguous.ref.update({placeholderReservations:[{participantKey:'guest:unknown'}]});
  assert.equal((await remove(ambiguous.id,'B')).outcome,'deleted');
  parent=(await ambiguous.ref.get()).data();
  assert.deepEqual(parent.categoryDefinitions.map(def=>def.id),['a']);
  assert.deepEqual(parent.placeholderReservations,[{participantKey:'guest:unknown'}]);
  const reserved=await make();
  await reserved.ref.update({placeholderReservations:[{categoryId:'b',participantKey:'guest:known'}]});
  assert.equal((await remove(reserved.id,'B')).outcome,'deleted');
  assert.equal((await reserved.ref.get()).data().placeholderReservations[0].categoryId,
    '__uncategorized__','reserva da categoria excluída permanece sem categoria');

  // Duas transações disputam a mesma raiz: inscrição e remoção nunca podem
  // confirmar uma categoria ausente com inscrição ativa.
  for(let n=0;n<4;n++){
    const current=await make();
    const candidate={...item,registrationId:registrationCore.registrationId('uid:race'+n,'b'),
      tournamentId:current.id,participantKey:'uid:race'+n,participantUid:'race'+n,
      migrationFingerprint:'e14-'+serial};
    const enroll=db.runTransaction(async tx=>{
      const snap=await tx.get(current.ref);
      if(!(snap.data().categoryDefinitions||[]).some(def=>def.id==='b')) throw new Error('categoria removida');
      tx.create(current.ref.collection('registrations').doc(candidate.registrationId),candidate);
      tx.update(current.ref,{'canonicalRegistrationMigration.registrationCount':1});
    });
    const deletion=n%2===0?remove(current.id,'B'):configure(current.id,[definitions[0]]);
    const settled=await Promise.allSettled([enroll,deletion]);
    assert(settled.some(result=>result.status==='fulfilled'),
      'a corrida deve concluir pelo menos uma das operações concorrentes');
    const live=(await current.ref.collection('registrations').get()).docs
      .map(doc=>doc.data()).filter(entry=>entry.status!=='withdrawn');
    const labels=(await current.ref.get()).data().categoryDefinitions.map(def=>def.id);
    assert(live.every(entry=>labels.includes(entry.categoryId)||entry.categoryId==='__uncategorized__'),
      'corrida não deixa inscrição ativa numa categoria excluída');
  }
  console.log('✓ E14 emulador: exclusão/renomeação tipada, preço/limite, autorização e corrida');
})().catch(error=>{console.error(error);process.exitCode=1;});
