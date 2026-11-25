#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const core=require('./cult-group-labels-core');
async function main() {
  const [mode,argument]=process.argv.slice(2);
  if(!['--preview','--apply'].includes(mode)||!argument)throw Error('uso: renomear-grupos-cult.cjs --preview|--apply PLANO_PRIVADO.json');
  const file=path.resolve(argument),temp=fs.realpathSync(os.tmpdir());
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const dir=fs.realpathSync(path.dirname(file));
  if(!dir.startsWith(temp+path.sep)||fs.lstatSync(path.dirname(file)).isSymbolicLink())throw Error('Plano deve ficar em diretório temporário privado real, fora do repo/Drive');
  fs.chmodSync(dir,0o700);
  const credential=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(!credential)throw Error('Prepare a credencial persistente');
  const identity=JSON.parse(fs.readFileSync(credential,'utf8'));
  if(identity.project_id!=='scoreplace-app'||!identity.client_email)throw Error('Credencial fora do projeto');
  const admin=require('../functions/node_modules/firebase-admin');admin.initializeApp({projectId:'scoreplace-app'});
  const db=admin.firestore(),ref=db.doc('tournaments/'+core.CULT_ID);
  const time=value=>({seconds:value.seconds,nanoseconds:value.nanoseconds});
  const timestamp=value=>new admin.firestore.Timestamp(value.seconds,value.nanoseconds);
  async function read() {
    const [parent,matches]=await Promise.all([ref.get(),ref.collection('matches').get()]);
    if(!parent.exists)throw Error('CULT ausente');
    return {parent:{data:parent.data(),time:time(parent.updateTime)},records:matches.docs.map(d=>({id:d.id,data:d.data(),time:time(d.updateTime)}))};
  }
  const state=await read(),proposal=core.proposal(state.parent,state.records);
  if(mode==='--preview') {
    const plan={schema:1,reason:'explicit-user-request',actor:identity.client_email,requestId:crypto.randomUUID(),createdAt:new Date().toISOString(),proposal};
    plan.fingerprint=core.hash(plan);
    fs.writeFileSync(file,JSON.stringify(plan,null,2)+'\n',{mode:0o600,flag:'wx'});
    fs.writeFileSync(file+'.backup.json',JSON.stringify(proposal,null,2)+'\n',{mode:0o600,flag:'wx'});
    console.log(JSON.stringify({mode:'preview',groups:proposal.groups.map(g=>({from:g.from,to:g.to,count:g.count})),matches:proposal.games.length,groupNamePreserved:true,fingerprint:plan.fingerprint}));return;
  }
  if(fs.lstatSync(file).isSymbolicLink())throw Error('Plano não pode ser link');
  const plan=JSON.parse(fs.readFileSync(file,'utf8')),signature=plan.fingerprint;delete plan.fingerprint;
  if(plan.schema!==1||plan.reason!=='explicit-user-request'||plan.actor!==identity.client_email||core.hash(plan)!==signature)throw Error('Plano administrativo inválido');
  const expected=plan.proposal;
  if(core.applied(expected,state.parent,state.records)) {console.log(JSON.stringify({mode:'already-applied',groups:6,matches:84}));return;}
  if(core.stable(proposal)!==core.stable(expected))throw Error('Prévia mudou: recenso/CAS necessário, nada foi gravado');
  const changed=expected.games.filter(g=>g.before!==g.after);
  const batch=db.batch();
  batch.update(ref,{'scheduleWindow.interleavedPlan.groupAssignments':expected.afterAssignments,updatedAt:admin.firestore.FieldValue.serverTimestamp()},{lastUpdateTime:timestamp(expected.parentTime)});
  changed.forEach(g=>batch.update(ref.collection('matches').doc(g.id),{'jogo.scheduledGroupLabel':g.after},{lastUpdateTime:timestamp(g.time)}));
  const written=await batch.commit(),owned=new Map([[ref.path,time(written[0].writeTime)],...changed.map((g,i)=>[ref.collection('matches').doc(g.id).path,time(written[i+1].writeTime)])]);
  try {
    const after=await read();
    if(!core.applied(expected,after.parent,after.records))throw Error('Pós-conferência de rótulos/dados protegidos divergiu');
    fs.writeFileSync(file+'.receipt.json',JSON.stringify({schema:1,requestId:plan.requestId,actor:plan.actor,reason:plan.reason,tournamentId:core.CULT_ID,groups:expected.groups,matches:84,protectedFieldsUnchanged:true,writeTimes:Object.fromEntries(owned),verifiedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({mode:'applied',groups:6,matches:84,protectedFieldsUnchanged:true,groupNamePreserved:true}));
  } catch(error) {
    const current=await read(),byId=new Map(current.records.map(r=>[r.id,r]));
    const unchanged=core.stable(current.parent.time)===core.stable(owned.get(ref.path))&&current.records.length===84&&expected.games.every(g=>{
      const r=byId.get(g.id),expectedTime=owned.get(ref.collection('matches').doc(g.id).path)||g.time;return r&&core.stable(r.time)===core.stable(expectedTime);
    });
    if(!unchanged)throw Error(error.message+'; rollback recusado por concorrência, sem sobrescrever dados');
    const rollback=db.batch(),oldAt=expected.beforeUpdatedAt;
    const restoreAt=!expected.updatedAtExisted?admin.firestore.FieldValue.delete():oldAt?.$timestamp?new admin.firestore.Timestamp(...oldAt.$timestamp):oldAt;
    rollback.update(ref,{'scheduleWindow.interleavedPlan.groupAssignments':expected.beforeAssignments,updatedAt:restoreAt},{lastUpdateTime:timestamp(owned.get(ref.path))});
    changed.forEach(g=>rollback.update(ref.collection('matches').doc(g.id),{'jogo.scheduledGroupLabel':g.before},{lastUpdateTime:timestamp(owned.get(ref.collection('matches').doc(g.id).path))}));
    await rollback.commit();throw Error(error.message+'; rótulos anteriores restaurados com CAS');
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
