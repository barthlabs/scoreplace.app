#!/usr/bin/env node
'use strict';
// Operação administrativa explicitamente autorizada para o PDF corrigido do CULT.
// Não simula login de organizador e não escreve o documento-pai do torneio.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const admin=require('../functions/node_modules/firebase-admin');
const {makeService,readFile}=require('../functions/tournament-regulation');
const functionRequire=require('node:module').createRequire(path.resolve(__dirname,'../functions/package.json'));
const {HttpsError}=functionRequire('firebase-functions/v2/https');
const tid='tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
const args=process.argv.slice(2),[mode,fileArgument,planArgument,pinArgument]=args;
if(args.length>4||pinArgument!==undefined&&!/^--sha256=[0-9a-f]{64}$/.test(pinArgument))throw Error('Pin inválido: use o quarto argumento --sha256=<64hex>.');
if(!['--preview','--apply'].includes(mode)||!fileArgument||!planArgument)throw Error('uso: anexar-regulamento-cult.cjs --preview|--apply PDF PLANO_PRIVADO.json [--sha256=<64hex>]');
const credential=process.env.GOOGLE_APPLICATION_CREDENTIALS;
if(!credential)throw Error('Prepare a credencial persistente antes de executar.');
const identity=JSON.parse(fs.readFileSync(credential,'utf8'));
if(identity.project_id!=='scoreplace-app'||!identity.client_email)throw Error('Credencial fora do projeto autorizado.');
const filePath=path.resolve(fileArgument),planPath=path.resolve(planArgument),bytes=fs.readFileSync(filePath);
const payload={fileName:path.basename(filePath),dataUrl:'data:application/pdf;base64,'+bytes.toString('base64')};
const checked=readFile(payload,HttpsError);
const approved=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../docs/regulamentos/cult-2026/regulamento-cult-2026.manifest.json'),'utf8'));
const approvedSha256=pinArgument===undefined?approved.pdfSha256:pinArgument.slice('--sha256='.length);
if(checked.sha256!==approvedSha256)throw Error('PDF diferente do arquivo conferido e aprovado.');
payload.fileName=checked.fileName;
admin.initializeApp({projectId:'scoreplace-app',storageBucket:'scoreplace-app.firebasestorage.app'});
const db=admin.firestore(),parent=db.collection('tournaments').doc(tid),current=parent.collection('regulations').doc('current');

(async()=>{const [snapshot,active]=await Promise.all([parent.get(),current.get()]);if(!snapshot.exists)throw Error('CULT não encontrado.');
 if(snapshot.data().testModeEnabled!==true)throw Error('CULT deve permanecer em modo de teste nesta operação.');
 if(mode==='--preview'){
  const [policy]=await admin.storage().bucket().iam.getPolicy();
  if((policy.bindings||[]).some(binding=>(binding.members||[]).some(member=>['allUsers','allAuthenticatedUsers'].includes(member))))throw Error('Bucket com acesso IAM público; operação recusada.');
  const plan={version:1,tournamentId:tid,filePath,fileName:checked.fileName,approvedSha256,sha256:checked.sha256,sizeBytes:bytes.length,requestId:crypto.randomUUID(),expectedRevision:active.exists?active.data().revision:'',previous:active.exists?active.data():null,creatorUid:snapshot.data().creatorUid,reason:'explicit-user-request',createdAt:new Date().toISOString()};
  fs.writeFileSync(planPath,JSON.stringify(plan,null,2),{mode:0o600,flag:'wx'});
  fs.writeFileSync(planPath+'.backup.json',JSON.stringify({updateTime:snapshot.updateTime.toDate().toISOString(),data:snapshot.data(),regulation:plan.previous},null,2),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({mode:'preview',tournamentId:tid,sha256:plan.sha256,sizeBytes:plan.sizeBytes,expectedRevision:plan.expectedRevision}));return;
 }
 const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
 if(plan.approvedSha256!==approvedSha256||plan.fileName!==checked.fileName||plan.tournamentId!==tid||plan.filePath!==filePath||plan.sha256!==checked.sha256||plan.sizeBytes!==bytes.length||plan.creatorUid!==snapshot.data().creatorUid||plan.reason!=='explicit-user-request')throw Error('Arquivo ou torneio diverge da prévia.');
 const service=makeService({db,storage:admin.storage(),HttpsError,authorizeAdministrative:(t,id,actor)=>id===tid&&t.testModeEnabled===true&&t.creatorUid===plan.creatorUid&&actor.uid===identity.client_email&&actor.reason===plan.reason});
 const result=await service.publish({...payload,tournamentId:tid,sandbox:false,requestId:plan.requestId,expectedRevision:plan.expectedRevision},{kind:'administrative',uid:identity.client_email,reason:plan.reason});
 if(result.superseded)throw Error('A revisão já foi substituída; não houve reinstalação.');
 try{
  const activeNow=(await current.get()).data();if(activeNow.fileName!==checked.fileName)throw Error('Nome do arquivo diverge da prévia.');if(activeNow.revision!==plan.requestId)throw Error('Regulamento substituído durante a conferência.');
  const [downloaded]=await admin.storage().bucket().file(activeNow.storagePath).download();if(!downloaded.equals(bytes))throw Error('Bytes baixados divergem do PDF aprovado.');
  fs.writeFileSync(planPath+'.receipt.json',JSON.stringify({tournamentId:tid,actor:{kind:'administrative',uid:identity.client_email},reason:plan.reason,revision:plan.requestId,sha256:checked.sha256,sizeBytes:bytes.length,parentUpdateTimeBefore:snapshot.updateTime.toDate().toISOString(),parentUpdateTimeAfter:(await parent.get()).updateTime.toDate().toISOString(),verifiedAt:new Date().toISOString()},null,2),{mode:0o600});
  console.log(JSON.stringify({mode:'applied',tournamentId:tid,revision:plan.requestId,sha256:checked.sha256,downloadVerified:true}));
 }catch(error){
  const restored=await db.runTransaction(async tx=>{const fresh=await tx.get(current);if(!fresh.exists||fresh.data().revision!==plan.requestId)return false;if(plan.previous)tx.set(current,plan.previous);else tx.delete(current);tx.delete(parent.collection('regulationRevisions').doc(plan.requestId));return true;});
  if(restored)await admin.storage().bucket().file(result.regulation.storagePath).delete({ignoreNotFound:true});
  throw error;
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
