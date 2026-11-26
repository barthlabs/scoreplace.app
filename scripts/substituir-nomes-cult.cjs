#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../functions/package.json')),admin=req('firebase-admin');
const {fingerprint}=require('../functions-autodraw/tournament-rehearsal');
const checkpoint=require('../functions-autodraw/tournament-draw-checkpoint'),{gamePins}=checkpoint;
const functionRequire=createRequire(path.resolve(__dirname,'../functions-autodraw/package.json'));
const {HttpsError}=functionRequire('firebase-functions/v2/https');
const {execFileSync}=require('node:child_process');
const core=require('./cult-name-substitutions-core.cjs'),{nameKey}=require('../functions/historical-athlete-claim-core');
const ID='tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a',OWNER='B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const REQUEST_SHA='2912ada63b733448d0be8da74185b4fdf9964a05320f09b06f9bf1ad8dabf290';
const PDF_SHA='b22b97ce506a55fa0bb2eed5ef0928daebf7c3e5e869dfa9b3d2e5e7531f3eea';
const ORIGINAL_SHA='169f1aa11a2734c7cb70b5fccf81ce5b39f13b0fdee552dc0c5817cc2e21453c';
const [mode,inputArgument,planArgument,...extra]=process.argv.slice(2),digest=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!['--preview','--apply'].includes(mode)||!inputArgument||!planArgument||extra.length)throw Error('uso: --preview|--apply REQUEST_PRIVADO PLANO_PRIVADO');
const bytes=fs.readFileSync(path.resolve(inputArgument));
if(digest(bytes)!==REQUEST_SHA)throw Error('Pedido diferente das cinco trocas autorizadas.');
const input=JSON.parse(bytes),planPath=path.resolve(planArgument);
if(input.tournamentId!==ID||input.sourcePdfSha256!==PDF_SHA||digest(fs.readFileSync(input.sourcePdf))!==PDF_SHA)throw Error('PDF ou torneio diverge do pedido autorizado.');
const identity=JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS,'utf8'));
if(identity.project_id!=='scoreplace-app'||!identity.private_key)throw Error('Credencial fora do projeto.');
admin.initializeApp({credential:admin.credential.cert(identity),projectId:'scoreplace-app'});
const db=admin.firestore(),ref=db.collection('tournaments').doc(ID),audit=db.collection('tournamentAdminCorrections').doc(ID).collection('operations').doc(REQUEST_SHA);
const collections=['matches','grupos','participants','inscritos','opponentHistory','checkedIn','woClaims','woLog'];
async function load(reader){
 const get=r=>reader?reader.get(r):r.get();
 const [root,registrations,invites,...parts]=await Promise.all([get(ref),get(ref.collection('registrations')),get(ref.collection('manualClaimInvites')),...collections.map(c=>get(ref.collection(c)))]);
 if(!root.exists||root.data().creatorUid!==OWNER||root.data().testModeEnabled!==true)throw Error('Torneio fora do escopo.');
 const regs=registrations.docs.map(d=>d.data()),manuals=new Set(regs.filter(r=>input.changes.some(c=>c.oldName===r.manualDisplayName)).map(r=>r.manualParticipantId));
 if(invites.docs.some(d=>manuals.has(d.data().manualParticipantId)&&!d.data().revokedAt&&d.data().status!=='revoked'&&Number(d.data().expiresAtMs||Infinity)>Date.now()))throw Error('Há convite de vínculo pendente para uma vaga alvo.');
 const uids=[...new Set(regs.map(r=>r.participantUid).filter(Boolean))];
 const profiles=await Promise.all(uids.map(uid=>get(db.collection('usersPublic').doc(uid))));
 if(profiles.some(p=>!p.exists||!p.data().displayName))throw Error('Perfil de inscrito indisponível.');
 const docs=parts.flatMap((s,i)=>s.docs.map(d=>({id:d.id,collection:collections[i],ref:d.ref,data:d.data()}))).sort((a,b)=>a.ref.path.localeCompare(b.ref.path));
 return {root:root.data(),regs,docs,accountNames:profiles.map(p=>p.data().displayName),
  beforeHash:fingerprint({root:root.data(),regs,docs:docs.map(d=>({path:d.ref.path,data:d.data})),invites:invites.docs.map(d=>d.data())})};
}
function sign(payload){return crypto.sign('sha256',Buffer.from(fingerprint(payload)),identity.private_key).toString('base64');}
function verifiedReceipt(saved,state){
 const payload=saved.payload;
 if(!crypto.verify('sha256',Buffer.from(fingerprint(payload)),crypto.createPublicKey(identity.private_key),Buffer.from(saved.signature,'base64')))throw Error('Recibo inválido.');
 const pins=gamePins(state.root,state.docs.filter(d=>d.collection==='matches').map(d=>({path:'matches/'+d.id,data:d.data})));
 if(payload.requestSha!==REQUEST_SHA||fingerprint(pins)!==fingerprint(payload.verifiedGamePins)||core.rootHash(state.root)!==payload.resultRootHash||
  state.regs.length!==48||payload.targets.some(t=>state.regs.find(r=>r.registrationId===t.registrationId)?.manualDisplayName!==t.newName)||
  fingerprint(state.docs.map(d=>({path:d.ref.path,data:d.data})))!==payload.resultDocsHash)throw Error('O estado mudou após a aplicação; não reaplique nem desfaça automaticamente.');
 return saved;
}
(async()=>{
 if(mode==='--preview'){
  const state=await load();const plan=core.build(state.root,state.regs,state.docs,input.changes,state.accountNames);
  const preview={schema:1,tournamentId:ID,requestSha:REQUEST_SHA,beforeHash:state.beforeHash,expectedPins:plan.gamePins,checkpointEpoch:crypto.randomUUID(),writes:plan.writes,targets:plan.targets,createdAt:new Date().toISOString()};
  fs.writeFileSync(planPath,JSON.stringify(preview,null,2),{mode:0o600,flag:'wx'});
  fs.writeFileSync(planPath+'.backup.json',JSON.stringify({root:state.root,registrations:state.regs,documents:state.docs.map(d=>({path:d.ref.path,data:d.data}))}),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({mode:'preview',targets:plan.targets.length,games:84,writes:plan.writes,allReversible:true}));return;
 }
 const preview=JSON.parse(fs.readFileSync(planPath,'utf8'));
 if(preview.requestSha!==REQUEST_SHA||preview.tournamentId!==ID)throw Error('Prévia fora do escopo.');
 if(!process.env.FIRESTORE_EMULATOR_HOST){
  execFileSync('node',['scripts/check-hosting-prerequisites.js'],{cwd:path.resolve(__dirname,'..'),stdio:'pipe'});
  const floor=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.backend-requerido-autodraw.json'),'utf8'));
  const receipts=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../.backend-publicado-autodraw-funcoes.json'),'utf8'));
  if(floor.functions.length!==35||!floor.functions.includes('resetTournamentToEnrollment')||floor.functions.some(n=>receipts.entries[n]?.backendCommit!==floor.backendCommit||receipts.entries[n]?.result!=='success'))throw Error('Backend novo ainda não está confirmado.');
 }
 const result=await db.runTransaction(async tx=>{
  const [state,receipt]=await Promise.all([load(tx),tx.get(audit)]);
  if(receipt.exists)return verifiedReceipt(receipt.data(),state);
  if(state.beforeHash!==preview.beforeHash)throw Error('Prévia desatualizada; nenhuma alteração foi feita.');
  const planned=core.build(state.root,state.regs,state.docs,input.changes,state.accountNames);
  if(planned.writes!==preview.writes||fingerprint(planned.gamePins)!==fingerprint(preview.expectedPins))throw Error('Plano mudou.');
  const payload={schema:1,tournamentId:ID,requestSha:REQUEST_SHA,sourcePdfSha256:PDF_SHA,originalBackupSha:ORIGINAL_SHA,
   changes:input.changes,targets:planned.targets,checkpointEpoch:preview.checkpointEpoch,verifiedGamePins:planned.gamePins,resultRootHash:planned.rootHash,resultDocsHash:planned.docsHash,
   writes:planned.writes,verified:true,appliedAt:new Date().toISOString()};
  const receiptValue={payload,signature:sign(payload)};
  planned.targets.forEach(t=>tx.update(ref.collection('registrations').doc(t.registrationId),
   {manualDisplayName:t.newName,manualNameKey:nameKey(t.newName),updatedAt:admin.firestore.FieldValue.serverTimestamp()}));
  planned.changedDocs.forEach(d=>tx.set(d.ref,d.data));
  tx.update(ref,{...planned.rootPatch,preserveDrawOnTestReset:true,
   drawCheckpoint:{state:'capturing',epoch:preview.checkpointEpoch,hash:'',expectedGames:planned.gamePins,preserveBefore:state.root.preserveDrawOnTestReset===true},updatedAt:admin.firestore.FieldValue.serverTimestamp(),_phaseReadCertificate:admin.firestore.FieldValue.delete()});
  tx.create(audit,receiptValue);return receiptValue;
 });
 let current=(await ref.get()).data();
 if(current.drawCheckpoint?.epoch!==result.payload.checkpointEpoch||current.preserveDrawOnTestReset!==true)throw Error('A trava pós-sorteio mudou.');
 if(current.drawCheckpoint.state==='capturing')await checkpoint.makeService({db,HttpsError}).capture(ID,result.payload.checkpointEpoch);
 current=(await ref.get()).data();
 const manifest=(await db.collection('tournamentDrawCheckpoints').doc(ID).get()).data();
 if(!checkpoint.preserved(current)||current.drawCheckpoint.epoch!==result.payload.checkpointEpoch||
    manifest?.activeEpoch!==current.drawCheckpoint.epoch||manifest?.hash!==current.drawCheckpoint.hash)throw Error('Fotografia oficial não conferiu; não resetar.');
 verifiedReceipt(result,await load());
 fs.writeFileSync(planPath+'.receipt.json',JSON.stringify(result,null,2),{mode:0o600});
 console.log(JSON.stringify({applied:true,targets:result.payload.targets.length,games:84,writes:result.payload.writes,verified:true,testModeEnabled:true}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.terminate());
