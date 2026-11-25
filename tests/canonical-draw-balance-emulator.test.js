'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{randomBytes}=require('node:crypto'),{createRequire}=require('node:module');
async function run(){
 if(!process.env.FIRESTORE_EMULATOR_HOST){
  const fs=require('node:fs'),os=require('node:os'),net=require('node:net'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-mode-canonical-'));
  try{const port=await new Promise(resolve=>{const s=net.createServer().listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n))})});
   const config=path.join(temp,'firebase.json');fs.writeFileSync(config,JSON.stringify({emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false}}}));
   const output=require('./emulador').rodarNoEmulador(['emulators:exec','--only','firestore','--project','demo-scoreplace','--config',config,'node tests/canonical-draw-balance-emulator.test.js'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH},timeout:180000,stdio:['ignore','pipe','pipe']});assert.match(output,/canonical mode OK/);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}return;
 }
 assert.match(process.env.FIRESTORE_EMULATOR_HOST,/^127\.0\.0\.1:\d+$/);process.env.GCLOUD_PROJECT='demo-scoreplace';process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-scoreplace'});
 const backend=createRequire(require.resolve('../functions-autodraw/index.js')),api=require('../functions-autodraw/index.js'),db=backend('firebase-admin/firestore').getFirestore();
 const {registrationId}=require('../functions/registration-core'),owner='synthetic-mode-owner',id='tour_'+Date.now()+'_'+randomBytes(16).toString('hex'),ref=db.doc('tournaments/'+id);
 const regs=[['manual:f','b'],['uid:m','b'],['uid:dup','b'],['uid:dup','c']].map(([key,categoryId],i)=>({registrationId:registrationId(key,categoryId),tournamentId:id,categoryId,originCategoryId:categoryId,participantKey:key,participantKind:key.startsWith('uid:')?'account':'manual',participantUid:key.startsWith('uid:')?key.slice(4):null,manualParticipantId:key.startsWith('manual:')?key.slice(7):null,...(key.startsWith('manual:')?{manualDisplayName:'Atleta manual'}:{}),status:'confirmed',fixedPairId:null,enrollSeq:i+1}));
 const root={id,creatorUid:owner,status:'closed',name:'Fixture sintética',sport:'Beach Tennis',combinedCategories:['Pool B','Pool C'],genderCategories:[],participants:[],matches:[],rounds:[],groups:[],canonicalRegistrationMigration:{fingerprint:'synthetic-proof',registrationCount:regs.length},categoryDefinitions:['b','c'].map((category,i)=>({id:category,label:'Pool '+(i?'C':'B'),dimension:'custom',exclusivityGroup:'pool',criteria:{},enabled:true}))};
 await ref.set(root);for(const r of regs)await ref.collection('registrations').doc(r.registrationId).set(r);
 await db.doc('usersPublic/m').set({displayName:'Conta sintética',gender:'masculino'});
 await ref.collection('matches').doc('history').set({_chave:'history',_loc:{tipo:'matches',mi:0},jogo:{id:'history',winner:'Histórico',scoreP1:4,scoreP2:3}});
 const readRegs=async()=>Promise.all(regs.map(r=>ref.collection('registrations').doc(r.registrationId).get().then(s=>s.data())));
 const call=(data,uid=owner)=>api.setDrawBalanceChoice.run({auth:{uid,token:{uid}},data:{tournamentId:id,...data},rawRequest:{headers:{}}});
 const before=await readRegs(),history=(await ref.collection('matches').doc('history').get()).data();
 const free=await call({mode:'livre',assignments:[{name:'ignorado',gender:'inválido'}]});assert(free.ok);assert.equal((await ref.get()).data()._drawBalanceMode,'livre');assert.equal((await ref.get()).data().genderRatioDisabled,true);assert.deepEqual(await readRegs(),before);
 await assert.rejects(call({mode:'livre',assignments:[]},'intruso'),{code:'permission-denied'});
 await assert.rejects(call({mode:'equilibrado',assignments:[{uid:'dup',gender:'feminino'}]}),{code:'failed-precondition'});assert.deepEqual(await readRegs(),before);
 const balanced=await call({mode:'equilibrado',assignments:[{manualParticipantId:'f',categoryId:'b',gender:'feminino'},{uid:'m',categoryId:'b',gender:'feminino'},{uid:'dup',categoryId:'c',gender:'masculino'}],ratio:'50/50',genderRatioDisabled:false});assert(balanced.ok);
 const after=await readRegs();assert.equal(after[0].genderSource,'organizador');assert.equal(after[1].gender,'feminino');assert.equal(after[2].gender,undefined,'outra inscrição do mesmo UID não é alterada');assert.equal(after[3].gender,'masculino');
 assert.equal((await db.doc('usersPublic/m').get()).data().gender,'masculino','perfil global preservado');assert.deepEqual((await ref.collection('matches').doc('history').get()).data(),history);
 assert.deepEqual((await ref.get()).data().canonicalRegistrationMigration,root.canonicalRegistrationMigration);
 const reread=await call({mode:'equilibrado',assignments:[]});assert.equal(reread.tournament.participants.find(p=>p.uid==='m').gender,'feminino','anotação da organização atravessa a projeção');
 for(const lock of [{drawCheckpoint:{state:'capturing'}},{drawCheckpoint:null,rehearsal:{state:'resetting'}}]){await ref.update(lock);const locked=(await ref.get()).data();await assert.rejects(call({mode:'livre',assignments:[]}),{code:'failed-precondition'});assert.deepEqual((await ref.get()).data(),locked);}
 console.log('canonical mode OK');
}
run().then(()=>console.log('✓ modo canônico: Livre, gênero por identidade/categoria, histórico, perfil, guardas e recibos preservados')).catch(e=>{console.error(e.stdout?.toString()||'',e.stderr?.toString()||'',e);process.exitCode=1});
