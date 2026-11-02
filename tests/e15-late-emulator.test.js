'use strict';
const assert=require('node:assert/strict');
const path=require('node:path'),root=path.join(__dirname,'..');
if(!process.env.FIRESTORE_EMULATOR_HOST){
 const {spawnSync,execFileSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os');
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-e15-repro-'));
 const port=Number(execFileSync(process.execPath,['-e',"const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],{encoding:'utf8'}).trim());
 const config=path.join(temp,'firebase.json');
 fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(root,'tests/concurrency/firestore.allow.rules')},emulators:{firestore:{host:'127.0.0.1',port},ui:{enabled:false},singleProjectMode:true}}));
 const r=spawnSync('firebase',['emulators:exec','--only','firestore','--config',config,'--project','demo-scoreplace','node tests/e15-late-emulator.test.js'],{cwd:root,encoding:'utf8',timeout:180000,env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH}});
 fs.rmSync(temp,{recursive:true,force:true});
 const output=(r.stdout||'')+(r.stderr||'');process.stdout.write(output);
 if(r.error)console.error(r.error);
 process.exit(r.status===0||/Script exited successfully \(code 0\)/.test(output)?0:1);
}
process.env.GCLOUD_PROJECT='demo-scoreplace';
process.env.FIREBASE_CONFIG=JSON.stringify({projectId:'demo-scoreplace'});
const {window:W}=require(path.join(root,'tests/headless.js'));
const dc=require(path.join(root,'functions-autodraw/draw-core.js'));
const Draw=require(path.join(root,'functions-autodraw/index.js'));
const CF=require(path.join(root,'functions/index.js'));
const admin=require('module').createRequire(path.join(root,'functions/index.js'))('firebase-admin');
const R=require(path.join(root,'functions/registration-core.js'));
const M=require(path.join(root,'functions/registration-mutations-core.js'));
const split=require(path.join(root,'functions-autodraw/vendor/tournament-split-core.js'));
if(!admin.apps.length)admin.initializeApp({projectId:'demo-scoreplace'});
(async()=>{
 const db=admin.firestore(),id='tour_'+Date.now()+'_'+'d'.repeat(32),ref=db.doc('tournaments/'+id);
 const players=Array.from({length:5},(_,i)=>({uid:'u'+i,displayName:'P'+i,name:'P'+i,categoryId:'a',category:'A',categories:['A']}));
 const t={id,name:'E15 synthetic',creatorUid:'org',memberUids:['org',...players.map(p=>p.uid)],status:'active',format:'Eliminatórias Simples',teamSize:1,enrollmentMode:'individual',participants:players,combinedCategories:['A'],categoryDefinitions:[{id:'a',label:'A',dimension:'custom',enabled:true}],currentPhaseIndex:0,lateEnrollment:'expand',newMatchups:true,checkedIn:{},absent:{},standbyParticipants:[],waitlist:[],teamOrigins:{},matches:[],sport:'Beach Tennis',startDate:'2026-06-01T09:00:00',endDate:'2026-06-01T20:00:00'};
 for(const p of players)t.checkedIn[p.uid]=Date.now();
 const drawn=dc.drawInitial(t,{decisions:{}});
 assert.equal(drawn.ok,true,'fixture sorteada pelo motor real');
 const fp='e15-fixture';
 const raw={...t,canonicalRegistrationMigration:{fingerprint:fp,registrationCount:6}};
 raw.participants=[];raw.waitlist=[];raw.standbyParticipants=[];
 const divided=split.dividir(raw,['matches']);
 await ref.set({...divided.config,_semPesados:['matches','participants','opponentHistory'],_nPartes:{matches:divided.matches.length}});
 for(const m of divided.matches)await ref.collection('matches').doc(m._chave).set(m);
 for(let i=0;i<5;i++){
  const uid='u'+i,registrationId=R.registrationId('uid:'+uid,'a');
  await ref.collection('registrations').doc(registrationId).set({registrationId,tournamentId:id,categoryId:'a',participantKey:'uid:'+uid,participantKind:'account',participantUid:uid,status:'confirmed',validationState:'approved',migrationFingerprint:fp,fixedPairId:null});
 }
 const uid='late',registrationId=R.registrationId('uid:'+uid,'a');
 await ref.collection('registrations').doc(registrationId).set({registrationId,tournamentId:id,categoryId:'a',participantKey:'uid:'+uid,participantKind:'account',participantUid:uid,status:'waitlisted',validationState:'approved',migrationFingerprint:fp,fixedPairId:null});
 await ref.update({checkedIn:{...t.checkedIn,[uid]:Date.now()}});
 const invoke=()=>Draw.integrateLateEntries.run({data:{tournamentId:id},auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 const out=await invoke();
 const after=(await ref.collection('registrations').doc(registrationId).get()).data().status;
 const parent=(await ref.get()).data();
 assert.equal(out.changed,true);
 assert.equal(out.promoted,1);
 assert(out.tournament.participants.some(p=>p.uid===uid),
   'resposta da Function mostra o elenco já confirmado, sem esperar outro listener');
 assert(!out.tournament.standbyParticipants.some(p=>p.uid===uid),
   'resposta não deixa promovido na espera');
 assert.equal(after,'confirmed','promoção canônica no mesmo commit da chave');
 const matches=(await ref.collection('matches').get()).docs.map(d=>d.data().jogo);
 assert(matches.some(m=>JSON.stringify(m).includes(uid)),'jogo físico do torneio dividido contém tardio');
 assert.deepEqual(parent.waitlist,[],'projeção da espera não vazou para o pai');
 assert.deepEqual(parent.standbyParticipants,[],'projeção de standby não vazou');
 assert.deepEqual(parent.participants,[],'projeção de inscritos não vazou');
 const repeated=await invoke();
 assert.equal(repeated.changed,false,'segunda integração é idempotente');
 assert.equal((await ref.collection('matches').get()).size,matches.length,'segunda integração não cria jogo');
 await ref.update({waitlist:[{uid,displayName:'Late',name:'Late',categoryId:'a',category:'A',categories:['A'],_lateJoin:true}]});
 const out2=await invoke(),parent2=(await ref.get()).data(),after2=(await ref.collection('registrations').doc(registrationId).get()).data().status;
 assert.equal(out2.changed,false,'lista antiga não vira fonte paralela');
 assert.equal(after2,'confirmed');
 assert.equal(parent2.waitlist.length,1,'lista antiga não é reescrita pela projeção');
 const enrollId='tour_'+Date.now()+'_'+'c'.repeat(32),enrollRef=db.doc('tournaments/'+enrollId);
 await enrollRef.set({...divided.config,id:enrollId,creatorUid:'org',
   phases:[{kind:'elimination',lateEnrollment:'expand'}],
   canonicalRegistrationMigration:{fingerprint:'e15-enroll',registrationCount:5},
   _semPesados:['matches','participants','opponentHistory'],
   _nPartes:{matches:divided.matches.length}});
 for(const m of divided.matches)await enrollRef.collection('matches').doc(m._chave).set(m);
 for(let i=0;i<5;i++){
   const p='u'+i,rid=R.registrationId('uid:'+p,'a');
   await enrollRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:enrollId,
     categoryId:'a',participantKey:'uid:'+p,participantKind:'account',participantUid:p,
     status:'confirmed',migrationFingerprint:'e15-enroll',fixedPairId:null});
 }
 const enroll=(person)=>CF.enrollParticipant.run({data:{tournamentId:enrollId,
   participantObj:{uid:person,categoryIds:['a']}},auth:{uid:person,token:{uid:person}},
   rawRequest:{headers:{}},acceptsStreaming:false});
 const accepted=await enroll('late');
 assert.equal(accepted.waitlisted,true,'callable aceita inscrição tardia na janela');
 assert.equal((await enrollRef.collection('registrations').doc(registrationId).get()).data().status,
   'waitlisted','callable grava apenas a espera canônica');
 assert.deepEqual((await enrollRef.get()).data().waitlist,[],
   'callable não cria segunda fonte de espera');
 const orgRoster=await CF.getCanonicalTournamentRoster.run({data:{tournamentId:enrollId},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert(orgRoster.standbyParticipants.some(p=>p.uid==='late'),
   'organização lê espera a partir de registrations');
 const playerRoster=await CF.getCanonicalTournamentRoster.run({data:{tournamentId:enrollId},
   auth:{uid:'u0',token:{uid:'u0'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.deepEqual(playerRoster.standbyParticipants,[],
   'participante não recebe espera de outras pessoas');
 const pairA='pair-a',pairB='pair-b',pairC='pair-c';
 for(const person of [pairA,pairB]){
   const receipt=await enroll(person);
   assert.equal(receipt.waitlisted,true,'nova pessoa fica na espera canônica');
 }
 const pairInvoke=(first,second)=>CF.formPair.run({data:{tournamentId:enrollId,
   uid1:first,uid2:second,categoryId:'a'},auth:{uid:'org',token:{uid:'org'}},
   rawRequest:{headers:{}},acceptsStreaming:false});
 const pairReceipt=await pairInvoke(pairA,pairB);
 assert.equal(pairReceipt.outcome,'paired');
 const pairDocs=await Promise.all([pairA,pairB].map(person=>enrollRef.collection('registrations')
   .doc(R.registrationId('uid:'+person,'a')).get()));
 assert(pairDocs.every(doc=>doc.data().status==='waitlisted'),'formar dupla não confirma inscrição antes da chave');
 assert(pairDocs[0].data().fixedPairId && pairDocs[0].data().fixedPairId===pairDocs[1].data().fixedPairId,
   'a dupla é gravada na fonte canônica');
 const left=await CF.leaveStandby.run({data:{tournamentId:enrollId},auth:{uid:pairA,token:{uid:pairA}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(left.removed,true);
 assert.equal((await pairDocs[0].ref.get()).data().status,'withdrawn');
 const survivor=(await pairDocs[1].ref.get()).data();
 assert.equal(survivor.status,'waitlisted');
 assert.equal(survivor.fixedPairId,null,'sair da espera não deixa dupla órfã');
 assert.equal((await enroll(pairC)).waitlisted,true);
 await pairInvoke(pairB,pairC);
 const splitReceipt=await CF.splitPair.run({data:{tournamentId:enrollId,
   uid1:pairB,uid2:pairC,categoryId:'a'},auth:{uid:'org',token:{uid:'org'}},
   rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(splitReceipt.outcome,'split');
 for(const person of [pairB,pairC]){
   const item=(await enrollRef.collection('registrations').doc(R.registrationId('uid:'+person,'a')).get()).data();
   assert.equal(item.status,'waitlisted');assert.equal(item.fixedPairId,null);
 }
 await assert.rejects(()=>Draw.formLatePair.run({data:{tournamentId:enrollId,key1:pairB,key2:pairC},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false}),/Atualize o aplicativo/);
 await assert.rejects(()=>Draw.splitLatePair.run({data:{tournamentId:enrollId,id1:pairB,id2:pairC},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false}),/Atualize o aplicativo/);
 await enrollRef.update({registrationLimit:'2020-01-01T00:00:00.000Z'});
 const closedEnrollment=await enroll('closed-user');
 assert.equal(closedEnrollment.enrollmentClosed,true,'fora da janela recusa sem escrita');
 assert.equal((await enrollRef.collection('registrations').get()).size,9);
 const capId='tour_'+Date.now()+'_'+'b'.repeat(32),capRef=db.doc('tournaments/'+capId);
 await capRef.set({id:capId,name:'E15 limite',creatorUid:'org',status:'open',
   memberUids:['org'],participants:[],maxParticipants:5,
   categoryDefinitions:[{id:'a',label:'A',dimension:'custom',enabled:true}],
   canonicalRegistrationMigration:{fingerprint:'e15-cap',registrationCount:5}});
 for(let i=0;i<5;i++){
   const p='u'+i,rid=R.registrationId('uid:'+p,'a');
   await capRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:capId,
     categoryId:'a',participantKey:'uid:'+p,participantKind:'account',participantUid:p,
     status:'confirmed',migrationFingerprint:'e15-cap',fixedPairId:null});
 }
 const full=await CF.enrollParticipant.run({data:{tournamentId:capId,
   participantObj:{uid:'over-capacity',categoryIds:['a']}},
   auth:{uid:'over-capacity',token:{uid:'over-capacity'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(full.capacityFull,true,'limite antes do sorteio recusa sem escrita');
 assert.equal((await capRef.collection('registrations').get()).size,5);
 const paidId='tour_'+Date.now()+'_'+'e'.repeat(32),paidRef=db.doc('tournaments/'+paidId);
 await paidRef.set({...divided.config,id:paidId,creatorUid:'org',
   registrationSettings:{source:'scoreplace',pricing:{mode:'single',cents:1000}},
   canonicalRegistrationMigration:{fingerprint:'e15-paid',registrationCount:6},
   _semPesados:['matches','participants','opponentHistory'],
   _nPartes:{matches:divided.matches.length},checkedIn:{...t.checkedIn,[uid]:Date.now()}});
 for(const m of divided.matches)await paidRef.collection('matches').doc(m._chave).set(m);
 for(let i=0;i<5;i++){
   const p='u'+i,rid=R.registrationId('uid:'+p,'a');
   await paidRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:paidId,
     categoryId:'a',participantKey:'uid:'+p,participantKind:'account',participantUid:p,
     status:'confirmed',migrationFingerprint:'e15-paid',fixedPairId:null});
 }
 await paidRef.collection('registrations').doc(registrationId).set({registrationId,tournamentId:paidId,
   categoryId:'a',participantKey:'uid:'+uid,participantKind:'account',participantUid:uid,
   status:'waitlisted',migrationFingerprint:'e15-paid',fixedPairId:null});
 const paid=await Draw.integrateLateEntries.run({data:{tournamentId:paidId},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(paid.changed,false,'cobrança tardia não ativa vaga');
 assert(paid.recusas.some(item=>item.registrationId===registrationId
   && item.motivo==='pagamento-tardio-indisponivel'),'recusa de cobrança é explícita');
 assert.equal((await paidRef.collection('registrations').doc(registrationId).get()).data().status,
   'waitlisted','inscrição paga continua na espera');
 assert.equal((await paidRef.collection('matches').get()).size,divided.matches.length,
   'nenhum jogo pago foi criado');
 await paidRef.update({registrationSettings:{source:'scoreplace',pricing:{mode:'single',cents:0}},
   newMatchups:false});
 const closed=await Draw.integrateLateEntries.run({data:{tournamentId:paidId},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(closed.changed,false,'janela de novos confrontos fechada não integra');
 assert(closed.recusas.some(item=>item.motivo==='sem-vaga-ou-janela'),
   'recusa da janela vem com mensagem para a tela');
 assert.equal((await paidRef.collection('registrations').doc(registrationId).get()).data().status,
   'waitlisted','janela fechada mantém status');
 const pairId='tour_'+Date.now()+'_'+'9'.repeat(32),pairRef=db.doc('tournaments/'+pairId);
 const pairEntries=Array.from({length:5},(_,i)=>({p1Uid:'pa'+i,p2Uid:'pb'+i,
   displayName:'Par '+i,categoryId:'a',category:'A',categories:['A'],fixedPair:true}));
 const pairTournament={...t,id:pairId,name:'E15 dupla tardia',teamSize:2,participants:pairEntries,
   checkedIn:{},matches:[],waitlist:[],standbyParticipants:[]};
 for(let i=0;i<5;i++){pairTournament.checkedIn['pa'+i]=Date.now();pairTournament.checkedIn['pb'+i]=Date.now();}
 pairTournament.checkedIn['late-a']=Date.now();pairTournament.checkedIn['late-b']=Date.now();
 for(const person of ['late-a','late-b']) await db.doc('users/'+person).set({displayName:person});
 assert.equal(dc.drawInitial(pairTournament,{decisions:{}}).ok,true);
 pairTournament.checkedIn['late-a']=Date.now();pairTournament.checkedIn['late-b']=Date.now();
 const pairDivided=split.dividir({...pairTournament,
   canonicalRegistrationMigration:{fingerprint:'e15-pair',registrationCount:12}},['matches']);
 await pairRef.set({...pairDivided.config,_semPesados:['matches','participants','opponentHistory'],
   _nPartes:{matches:pairDivided.matches.length},participants:[]});
 for(const match of pairDivided.matches) await pairRef.collection('matches').doc(match._chave).set(match);
 for(let i=0;i<5;i++){
   const ids=['pa'+i,'pb'+i].map(person=>R.registrationId('uid:'+person,'a'));
   const fixedPairId=M.canonicalPairId(pairId,'a',ids);
   for(let side=0;side<2;side++){
     const person=side?'pb'+i:'pa'+i,rid=ids[side];
     await pairRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:pairId,
       categoryId:'a',participantKey:'uid:'+person,participantKind:'account',participantUid:person,
       status:'confirmed',migrationFingerprint:'e15-pair',fixedPairId});
   }
 }
 for(const person of ['late-a','late-b']){
   const rid=R.registrationId('uid:'+person,'a');
   await pairRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:pairId,
     categoryId:'a',participantKey:'uid:'+person,participantKind:'account',participantUid:person,
     status:'waitlisted',migrationFingerprint:'e15-pair',fixedPairId:null});
 }
 const pairedLate=await CF.formPair.run({data:{tournamentId:pairId,uid1:'late-a',uid2:'late-b',categoryId:'a'},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(pairedLate.outcome,'paired');
 const pairStatus=async person=>(await pairRef.collection('registrations').doc(R.registrationId('uid:'+person,'a')).get()).data();
 assert.equal((await pairStatus('late-a')).status,'waitlisted');
 assert.equal((await pairStatus('late-b')).status,'waitlisted');
 const pairIntegrated=await Draw.integrateLateEntries.run({data:{tournamentId:pairId},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(pairIntegrated.promoted,2,'dupla só promove com vaga física conjunta: '+JSON.stringify(pairIntegrated));
 assert.equal((await pairStatus('late-a')).status,'confirmed');
 assert.equal((await pairStatus('late-b')).status,'confirmed');
 const pairGames=(await pairRef.collection('matches').get()).docs.map(doc=>doc.data().jogo||{});
 assert(pairGames.some(game=>[game.team1Uids,game.team2Uids].some(ids=>Array.isArray(ids)&&ids.includes('late-a')&&ids.includes('late-b')) ||
   [game.team1Obj,game.team2Obj].some(entry=>entry && [entry.p1Uid,entry.p2Uid].includes('late-a') && [entry.p1Uid,entry.p2Uid].includes('late-b'))),
   'os dois integrantes ocupam o mesmo lado de um jogo físico: '+JSON.stringify(pairGames.filter(game=>JSON.stringify(game).includes('late-a'))));
 assert.equal((await Draw.integrateLateEntries.run({data:{tournamentId:pairId},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false})).changed,false,
   'repetir integração não duplica dupla');
 const fullId='tour_'+Date.now()+'_'+'8'.repeat(32),fullRef=db.doc('tournaments/'+fullId);
 const fullEntries=Array.from({length:8},(_,i)=>({p1Uid:'fa'+i,p2Uid:'fb'+i,
   displayName:'Equipe '+i,categoryId:'a',category:'A',categories:['A'],fixedPair:true}));
 const fullTournament={...t,id:fullId,name:'E15 chave cheia de duplas',teamSize:2,
   participants:fullEntries,checkedIn:{},matches:[],waitlist:[],standbyParticipants:[]};
 assert.equal(dc.drawInitial(fullTournament,{decisions:{}}).ok,true);
 fullTournament.newMatchups=false;
 fullTournament.checkedIn['late-a']=Date.now();fullTournament.checkedIn['late-b']=Date.now();
 const fullSplit=split.dividir({...fullTournament,
   canonicalRegistrationMigration:{fingerprint:'e15-full',registrationCount:18}},['matches']);
 await fullRef.set({...fullSplit.config,_semPesados:['matches','participants','opponentHistory'],
   _nPartes:{matches:fullSplit.matches.length},participants:[]});
 for(const match of fullSplit.matches)await fullRef.collection('matches').doc(match._chave).set(match);
 for(let i=0;i<8;i++){
   const ids=['fa'+i,'fb'+i].map(person=>R.registrationId('uid:'+person,'a'));
   const fixedPairId=M.canonicalPairId(fullId,'a',ids);
   for(let side=0;side<2;side++){
     const person=side?'fb'+i:'fa'+i,rid=ids[side];
     await fullRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:fullId,
       categoryId:'a',participantKey:'uid:'+person,participantKind:'account',participantUid:person,
       status:'confirmed',migrationFingerprint:'e15-full',fixedPairId});
   }
 }
 for(const person of ['late-a','late-b']){
   const rid=R.registrationId('uid:'+person,'a');
   await fullRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:fullId,
     categoryId:'a',participantKey:'uid:'+person,participantKind:'account',participantUid:person,
     status:'waitlisted',migrationFingerprint:'e15-full',fixedPairId:null});
 }
 assert.equal((await CF.formPair.run({data:{tournamentId:fullId,uid1:'late-a',uid2:'late-b',categoryId:'a'},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false})).outcome,'paired');
 const fullBefore=(await fullRef.collection('matches').get()).docs.map(doc=>JSON.stringify(doc.data().jogo)).sort();
 const fullOutcome=await Draw.integrateLateEntries.run({data:{tournamentId:fullId},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 assert.equal(fullOutcome.promoted||0,0,'chave cheia não promove metade da dupla');
 for(const person of ['late-a','late-b'])assert.equal((await fullRef.collection('registrations')
   .doc(R.registrationId('uid:'+person,'a')).get()).data().status,'waitlisted');
 assert.deepEqual((await fullRef.collection('matches').get()).docs.map(doc=>JSON.stringify(doc.data().jogo)).sort(),
   fullBefore,'chave cheia não altera confrontos publicados');
 const raceId='tour_'+Date.now()+'_'+'f'.repeat(32),raceRef=db.doc('tournaments/'+raceId);
 await raceRef.set({...divided.config,id:raceId,creatorUid:'org',
   canonicalRegistrationMigration:{fingerprint:'e15-race',registrationCount:5},
   _semPesados:['matches','participants','opponentHistory'],
   _nPartes:{matches:divided.matches.length},checkedIn:{...t.checkedIn,[uid]:Date.now()}});
 for(const m of divided.matches)await raceRef.collection('matches').doc(m._chave).set(m);
 for(let i=0;i<5;i++){
   const p='u'+i,rid=R.registrationId('uid:'+p,'a');
   await raceRef.collection('registrations').doc(rid).set({registrationId:rid,tournamentId:raceId,
     categoryId:'a',participantKey:'uid:'+p,participantKind:'account',participantUid:p,
     status:'confirmed',migrationFingerprint:'e15-race',fixedPairId:null});
 }
 const raceReg=raceRef.collection('registrations').doc(registrationId);
 const arrival=db.runTransaction(async tx=>{
   const rootSnap=await tx.get(raceRef),registrationSnap=await tx.get(raceReg);
   assert.equal(rootSnap.data().canonicalRegistrationMigration.registrationCount,5);
   assert.equal(registrationSnap.exists,false);
   tx.create(raceReg,{registrationId,tournamentId:raceId,categoryId:'a',participantKey:'uid:'+uid,
     participantKind:'account',participantUid:uid,status:'waitlisted',
     migrationFingerprint:'e15-race',fixedPairId:null});
   tx.update(raceRef,{'canonicalRegistrationMigration.registrationCount':6});
 });
 const integration=Draw.integrateLateEntries.run({data:{tournamentId:raceId},
   auth:{uid:'org',token:{uid:'org'}},rawRequest:{headers:{}},acceptsStreaming:false});
 await Promise.all([arrival,integration]);
 const raceStatus=(await raceReg.get()).data().status;
 const raceMatches=(await raceRef.collection('matches').get()).docs
   .filter(doc=>JSON.stringify(doc.data().jogo).includes(uid));
 assert.equal(raceStatus==='confirmed',raceMatches.length>0,
   'chegada concorrente só confirma se jogo foi gravado');
 assert(raceMatches.length<=1,'chegada concorrente não duplica jogo');
 const monarchId='tour_'+Date.now()+'_'+'a'.repeat(32),monarchRef=db.doc('tournaments/'+monarchId);
 const monarch={id:monarchId,name:'E15 Rei/Rainha',creatorUid:'org',memberUids:['org'],
   status:'active',format:'Liga',ligaRoundFormat:'rei_rainha',teamSize:1,
   enrollmentMode:'individual',combinedCategories:['A'],
   categoryDefinitions:[{id:'a',label:'A',dimension:'custom',enabled:true}],
   currentPhaseIndex:0,lateEnrollment:'expand',newMatchups:true,genderRatio:'25/75',
   checkedIn:{},absent:{},participants:[],standbyParticipants:[],waitlist:[],
   rounds:[{round:1,matches:[{id:'m1',p1:'M1 / M2',p2:'M3 / M4',
     team1Uids:['m1','m2'],team2Uids:['m3','m4']}],monarchGroups:[
     {players:['M1','M2','M3','M4'],playersUids:['m1','m2','m3','m4'],matches:[{id:'m1'}]},
     {players:['M5','M6','M7','M8'],playersUids:['m5','m6','m7','m8'],matches:[]}]}],
   matches:[],sport:'Beach Tennis',startDate:'2026-06-01T09:00:00',
   endDate:'2026-06-01T20:00:00',
   canonicalRegistrationMigration:{fingerprint:'e15-monarch',registrationCount:13}};
 for(let i=1;i<=13;i++){
   const u='m'+i;
   monarch.checkedIn[u]=Date.now();
   monarch.memberUids.push(u);
   await db.doc('users/'+u).set({displayName:'M'+i,
     gender:i===9?'masculino':'feminino'});
 }
 const monSplit=split.dividir(monarch,['matches']);
 await monarchRef.set({...monSplit.config,_semPesados:['matches','participants','opponentHistory'],
   _nPartes:{matches:monSplit.matches.length}});
 for(const m of monSplit.matches)await monarchRef.collection('matches').doc(m._chave).set(m);
 for(let i=1;i<=13;i++){
   const u='m'+i,rid=R.registrationId('uid:'+u,'a');
   await monarchRef.collection('registrations').doc(rid).set({registrationId:rid,
     tournamentId:monarchId,categoryId:'a',participantKey:'uid:'+u,
     participantKind:'account',participantUid:u,status:i<=8?'confirmed':'waitlisted',
     migrationFingerprint:'e15-monarch',fixedPairId:null});
 }
 await Draw.autoDrawReconcile.run({});
 const monAfter=(await monarchRef.get()).data();
 const monStatuses=await monarchRef.collection('registrations').get();
 const monGroups=monAfter.rounds?.[0]?.monarchGroups||[];
 assert.equal(monGroups.length,3,'agendador forma grupo de quatro indivíduos da espera canônica');
 assert.deepEqual(monGroups[0].playersUids,['m1','m2','m3','m4'],
   'grupo anterior não é recalculado');
 assert.equal(monGroups[2].playersUids.length,4,'novo grupo recebe quatro tardios');
 assert(monGroups[2].playersUids.every(person=>Number(person.slice(1))>8),
   'novo grupo contém apenas pessoas da espera canônica');
 assert.equal(monStatuses.docs.filter(d=>Number(d.data().participantUid.slice(1))>8
   && d.data().status==='confirmed').length,4,'agendador considera a espera inteira e promove quatro');
 assert.equal(monStatuses.docs.filter(d=>Number(d.data().participantUid.slice(1))>8
   && d.data().status==='waitlisted').length,1,'quinto tardio continua aguardando vaga');
 assert.deepEqual(monAfter.participants,[],'roster projetado não volta ao documento');
 assert.deepEqual(monAfter.waitlist,[],'espera projetada não volta ao documento');
 const eight=Array.from({length:8},(_,i)=>({uid:'g'+i,displayName:'G'+i,name:'G'+i}));
 const ordinaryGroup=W._phasesEngine.generatePhase(eight,
   {formatCode:'grupos_mata',gruposCount:1,fixedPairs:false,source:{}},{idPrefix:'e15-eight'});
 assert.equal(ordinaryGroup.groups.length,1,'oito pertencem a um grupo comum');
 assert.equal(ordinaryGroup.groups[0].players.length,8);
 assert.equal(ordinaryGroup.groups[0].matches.length,28,'todos contra todos: 8×7/2 jogos');
 assert.equal(ordinaryGroup.groups[0].format,undefined,'nenhum formato especial para oito');
 console.log('✓ E15 emulador: divisão, promoção atômica, cobrança, corrida e Rei/Rainha');
})().catch(e=>{console.error(e);process.exitCode=1});
