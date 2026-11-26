#!/usr/bin/env node
'use strict';
// Operação delimitada ao sorteio oficial do CULT, autorizada pelo organizador.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const admin=require('../functions-autodraw/node_modules/firebase-admin');
const functionRequire=require('node:module').createRequire(path.resolve(__dirname,'../functions-autodraw/package.json'));
const {HttpsError}=functionRequire('firebase-functions/v2/https');
const checkpoint=require('../functions-autodraw/tournament-draw-checkpoint');
const {fingerprint}=require('../functions-autodraw/tournament-rehearsal');
const ID='tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a',OWNER='B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const BACKUP_SHA='169f1aa11a2734c7cb70b5fccf81ce5b39f13b0fdee552dc0c5817cc2e21453c';
const [mode,backupArgument,planArgument,substitutionsArgument,...extra]=process.argv.slice(2);
if(!['--preview','--apply'].includes(mode)||!backupArgument||!planArgument||extra.length)throw Error('uso: --preview|--apply BACKUP_OFICIAL PLANO_PRIVADO');
const backupBytes=fs.readFileSync(path.resolve(backupArgument));
if(crypto.createHash('sha256').update(backupBytes).digest('hex')!==BACKUP_SHA)throw Error('Backup diferente da fotografia oficial conferida.');
const backup=JSON.parse(backupBytes),planPath=path.resolve(planArgument);
if(backup.project!=='scoreplace-app'||backup.tournamentId!==ID||backup.subcollections.matches.length!==84)throw Error('Backup fora do escopo.');
let originalPins=checkpoint.gamePins(backup.tournament.data,backup.subcollections.matches.map(d=>({path:'matches/'+d.id,data:d.data})));
const credential=process.env.GOOGLE_APPLICATION_CREDENTIALS;
if(!credential)throw Error('Prepare a credencial persistente.');
const identity=JSON.parse(fs.readFileSync(credential,'utf8'));
if(identity.project_id!=='scoreplace-app'||!identity.client_email)throw Error('Credencial fora do projeto.');
if(substitutionsArgument){
 const signed=JSON.parse(fs.readFileSync(path.resolve(substitutionsArgument),'utf8')),payload=signed.payload;
 if(!payload||payload.tournamentId!==ID||payload.originalBackupSha!==BACKUP_SHA||payload.verified!==true||payload.changes?.length!==5||
   payload.sourcePdfSha256!=='b22b97ce506a55fa0bb2eed5ef0928daebf7c3e5e869dfa9b3d2e5e7531f3eea'||
   payload.requestSha!=='2912ada63b733448d0be8da74185b4fdf9964a05320f09b06f9bf1ad8dabf290'||
   !crypto.verify('sha256',Buffer.from(fingerprint(payload)),crypto.createPublicKey(identity.private_key),Buffer.from(signed.signature,'base64')))
   throw Error('Recibo das substituições inválido.');
 const rename=require('../functions/rename-canonical-participant-core');
 let originalRoot=backup.tournament.data,originalParts=backup.subcollections.matches.map(d=>({path:'matches/'+d.id,data:d.data}));
 for(const change of payload.changes){originalRoot=rename.replaceStrings(originalRoot,change.oldName,change.newName);originalParts=originalParts.map(d=>({...d,data:rename.replaceStrings(d.data,change.oldName,change.newName)}));}
 originalPins=checkpoint.gamePins(originalRoot,originalParts);
 if(fingerprint(originalPins)!==fingerprint(payload.verifiedGamePins))throw Error('As trocas alteraram a estrutura oficial dos jogos.');
}

admin.initializeApp({credential:admin.credential.cert(identity),projectId:'scoreplace-app'});
const db=admin.firestore(),ref=db.collection('tournaments').doc(ID),manifest=db.collection('tournamentDrawCheckpoints').doc(ID);
const service=checkpoint.makeService({db,HttpsError});
function verify(root,parts){
 if(!root.exists||root.data().creatorUid!==OWNER||root.data().testModeEnabled!==true||root.data().isSandbox===true||parts.size!==84)throw Error('Torneio fora do escopo ou dados incompletos.');
 const pins=checkpoint.gamePins(root.data(),parts.docs.map(d=>({path:'matches/'+d.id,data:d.data()})));
 if(fingerprint(pins)!==fingerprint(originalPins))throw Error('Os 84 jogos divergem do sorteio oficial; nenhuma substituição foi autorizada.');
 const t={...root.data()};delete t.drawCheckpoint;
 checkpoint.assertCanCaptureExisting(t,parts.docs.map(d=>d.data().jogo||d.data()),HttpsError);
 return pins;
}
(async()=>{
 if(mode==='--preview'){
  const [root,parts,cp]=await Promise.all([ref.get(),ref.collection('matches').get(),manifest.get()]);
  const pins=verify(root,parts);
  if(root.data().drawCheckpoint||cp.exists&&cp.data().activeEpoch)throw Error('Há fotografia ou operação anterior; prévia não pode substituí-la.');
  const staged={...root.data(),preserveDrawOnTestReset:true},epoch=checkpoint.prepareDraw(staged);
  const plan={schema:1,tournamentId:ID,owner:OWNER,backupSha:BACKUP_SHA,pins,epoch,
   expectedUpdateTime:root.updateTime.toDate().toISOString(),expectedRoot:fingerprint(root.data()),createdAt:new Date().toISOString()};
  fs.writeFileSync(planPath,JSON.stringify(plan,null,2),{mode:0o600,flag:'wx'});
  fs.writeFileSync(planPath+'.backup.json',JSON.stringify({root:root.data(),matches:parts.docs.map(d=>({id:d.id,data:d.data()}))}),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({mode:'preview',games:parts.size,pins,epoch,testModeEnabled:true}));return;
 }
 // Não ativa a opção enquanto a porta real de reset ainda tiver código antigo.
 execFileSync('node',['scripts/check-hosting-prerequisites.js'],{cwd:path.resolve(__dirname,'..'),stdio:'pipe'});
 const floor=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.backend-requerido-autodraw.json'),'utf8'));
 const receipts=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.backend-publicado-autodraw-funcoes.json'),'utf8'));
 if(floor.functions.length!==35||!floor.functions.includes('resetTournamentToEnrollment')||
    floor.functions.some(name=>receipts.entries[name]?.backendCommit!==floor.backendCommit||receipts.entries[name]?.result!=='success'))throw Error('Os 35 endpoints novos ainda não estão confirmados.');
 const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
 if(plan.schema!==1||plan.tournamentId!==ID||plan.owner!==OWNER||plan.backupSha!==BACKUP_SHA||fingerprint(plan.pins)!==fingerprint(originalPins))throw Error('Prévia fora do escopo.');
 await db.runTransaction(async tx=>{
  const [root,parts,cp]=await Promise.all([tx.get(ref),tx.get(ref.collection('matches')),tx.get(manifest)]);
  verify(root,parts);
  const current=root.data().drawCheckpoint;
  if(current?.epoch===plan.epoch&&['capturing','active'].includes(current.state))return;
  if(current||cp.exists&&cp.data().activeEpoch||root.updateTime.toDate().toISOString()!==plan.expectedUpdateTime||fingerprint(root.data())!==plan.expectedRoot)throw Error('A prévia ficou desatualizada; não houve escrita.');
  tx.update(ref,{preserveDrawOnTestReset:true,drawCheckpoint:{state:'capturing',epoch:plan.epoch,hash:'',
   expectedGames:plan.pins,preserveBefore:root.data().preserveDrawOnTestReset===true}});
 });
 try{
  let root=await ref.get();
  if(!checkpoint.preserved(root.data()))await service.capture(ID,plan.epoch);
 }catch(error){
  const root=await ref.get();
  if(!(checkpoint.preserved(root.data())&&root.data().drawCheckpoint.epoch===plan.epoch)){
   await service.abortExistingCapture(ID,plan.epoch,error.code||'capture-failed');throw error;
  }
 }
 const [root,parts,cp]=await Promise.all([ref.get(),ref.collection('matches').get(),manifest.get()]);
 verify(root,parts);
 if(!checkpoint.preserved(root.data())||root.data().drawCheckpoint.epoch!==plan.epoch||cp.data().activeEpoch!==plan.epoch||cp.data().hash!==root.data().drawCheckpoint.hash)throw Error('Fotografia ativa não conferiu.');
 const receipt={tournamentId:ID,backendCommit:floor.backendCommit,epoch:plan.epoch,hash:root.data().drawCheckpoint.hash,
  pins:plan.pins,games:parts.size,testModeEnabled:root.data().testModeEnabled,verifiedAt:new Date().toISOString()};
 fs.writeFileSync(planPath+'.receipt.json',JSON.stringify(receipt,null,2),{mode:0o600});
 console.log(JSON.stringify(receipt));
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.terminate());
