#!/usr/bin/env node
'use strict';
// Explicit organizer decision. ADC is the executor; this script never impersonates a user.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto'),{createRequire}=require('node:module');
const repo=path.resolve(__dirname,'..');
const core=require('../functions-autodraw/fast8-configuration-core');
const drawCore=require('../functions-autodraw/draw-core'),context=drawCore._window;
const split=require('../functions-autodraw/vendor/tournament-split-core');
class ConfigError extends Error {constructor(code,message){super(message);this.code=code;}}
function stable(value) {
  if(value && typeof value.toJSON==='function') return stable(value.toJSON());
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  return value;
}
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8'}).trim();
const version=snap=>snap && snap.exists ? snap.updateTime.toDate().toISOString()+':'+snap.updateTime.nanoseconds : null;
function sameSnapshot(manifest,current) {
  if(manifest.rootVersion!==current.rootVersion || manifest.courtVersion!==current.courtVersion || manifest.partsHash!==current.partsHash)
    throw new ConfigError('aborted','O torneio mudou desde a preparação; gere outro manifesto antes de aplicar.');
}
async function read(tx,ref) {
  const root=await tx.get(ref),court=await tx.get(ref.collection('courtState').doc('main'));
  if(!root.exists) throw new ConfigError('not-found','Torneio não encontrado.');
  const parts={};
  const tournament=await split.montarDoBanco({...root.data(),id:ref.id},async(collection,part)=>{
    const snap=await tx.get(ref.collection(collection));
    parts[part || collection]=snap.docs.map(doc=>({id:doc.id,version:version(doc),data:doc.data()})).sort((a,b)=>a.id.localeCompare(b.id));
    return snap.docs.map(doc=>doc.data());
  });
  if(typeof context._collectAllMatches==='function') tournament.matches=context._collectAllMatches(tournament);
  return {root:root.data(),court:court.exists?court.data():null,tournament,parts,
    rootVersion:version(root),courtVersion:version(court),partsHash:hash(parts)};
}
async function main() {
  const args=process.argv.slice(2),value=key=>{const at=args.indexOf(key);return at<0?null:args[at+1];};
  const apply=args.includes('--apply'),manifestFile=value('--manifest');
  if(apply && !manifestFile) throw new Error('Use --apply --manifest <manifesto privado preparado>.');
  const manifest=manifestFile?JSON.parse(fs.readFileSync(manifestFile,'utf8')):null;
  const id=manifest?.tournamentId || value('--tournament');
  if(!id || !/^tour_[A-Za-z0-9_]+$/.test(id)) throw new Error('Informe o ID exato com --tournament.');
  const ownerInstruction=manifest?.ownerInstruction || value('--owner-instruction');
  if(!ownerInstruction) throw new Error('Registre a instrução explícita do organizador com --owner-instruction.');
  const sourceSha=git(['rev-parse','HEAD']),dirty=!!git(['status','--porcelain']);
  if(apply) {
    if(dirty || manifest.dirty || manifest.sourceSha!==sourceSha) throw new Error('Aplique apenas o código limpo, revisado e publicado do manifesto.');
    execFileSync(process.execPath,['scripts/check-backend-publicado.js'],{cwd:repo,stdio:'inherit'});
    for(const origin of ['https://scoreplace.app','https://scoreplace-app.web.app']) {
      const response=await fetch(origin+'/release.json?fast8='+Date.now(),{cache:'no-store'});
      if(!response.ok || (await response.json()).commit!==sourceSha) throw new Error('O corte do manifesto ainda não está publicado nos dois endereços.');
    }
  }
  const backend=createRequire(require.resolve('../functions-autodraw/index.js'));
  const {initializeApp,applicationDefault}=backend('firebase-admin/app');
  const {getFirestore}=backend('firebase-admin/firestore');
  const keyPath=process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if(!keyPath) throw new Error('Use a credencial persistente ADC, sem login de usuário.');
  const executorPrincipal=JSON.parse(fs.readFileSync(keyPath,'utf8')).client_email;
  if(!executorPrincipal) throw new Error('Executor de serviço indisponível.');
  initializeApp({credential:applicationDefault(),projectId:'scoreplace-app'});
  const db=getFirestore(),ref=db.collection('tournaments').doc(id);
  const current=await db.runTransaction(tx=>read(tx,ref));
  if(args.includes('--census')) {
    const t=current.tournament;
    console.log(JSON.stringify({status:t.status,phaseIndex:Number(t.currentPhaseIndex || 0),rulesContractVersion:t.rulesContractVersion,
      phaseKinds:(t.phases || []).map(p=>({kind:p.kind,started:!!p.startedAt,materialized:!!p.materializedAt})),
      firstClassification:t.phases?.[0]?.kind==='classification',eliminationActive:t.fmt2?.eliminatoria?.ativa,
      phaseMaterialized:t._phaseMaterialized || 0,matchCountsByPhase:(t.matches || []).reduce((o,m)=>{o[m.phaseIndex || 0]=(o[m.phaseIndex || 0] || 0)+1;return o;},{}),
      tieDecisionCount:Object.keys((t.phaseTieDecisions || {})['0'] || {}).length,
      groups:context.ScoreplaceGroupAlternation.config(t).groups.map(g=>({label:g.label,entry:g.entry})),
      alternation:context.ScoreplaceGroupAlternation.enabled(t),thirdPlace:t.fmt2?.eliminatoria?.thirdPlaceEnabled!==false}));
    return;
  }
  const intent=manifest?.intent || {groupAlternation:true,thirdPlaceEnabled:false};
  const planned=core.plan(current.tournament,intent,context,ConfigError,drawCore.hasDrawnBracket(current.tournament));
  const configKeys=['fmt2','phases','scheduleWindow'];
  const configuration=Object.fromEntries(configKeys.map(key=>[key,planned.after[key]]));
  if(!apply) {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'sp-fast8-config-'));
    fs.chmodSync(directory,0o700);
    const backup=path.join(directory,'backup.json');
    fs.writeFileSync(backup,JSON.stringify(current),{mode:0o600});
    const prepared={schema:1,tournamentId:id,sourceSha,dirty,preparedAt:new Date().toISOString(),
      ownerInstruction,requestedByOwnerUid:current.root.creatorUid,executorPrincipal,intent,
      rootVersion:current.rootVersion,courtVersion:current.courtVersion,partsHash:current.partsHash,
      backup,backupSha:hash(current),configurationHash:hash(configuration)};
    const file=path.join(directory,'manifest.json');fs.writeFileSync(file,JSON.stringify(prepared,null,2),{mode:0o600});
    console.log(JSON.stringify({prepared:true,manifest:file,dirty,groups:context.ScoreplaceGroupAlternation.config(planned.after).groups.map(g=>({label:g.label,entry:g.entry})),
      matchCount:(current.tournament.matches || []).length,currentPhase:current.tournament.currentPhaseIndex || 0,
      alternationBefore:current.root.scheduleWindow?.groupAlternation===true,alternationAfter:true,
      thirdPlaceBefore:current.root.fmt2?.eliminatoria?.thirdPlaceEnabled!==false,thirdPlaceAfter:false}));
    return;
  }
  const backup=JSON.parse(fs.readFileSync(manifest.backup,'utf8'));
  if(hash(backup)!==manifest.backupSha || manifest.requestedByOwnerUid!==current.root.creatorUid ||
      manifest.configurationHash!==hash(configuration) || manifest.executorPrincipal!==executorPrincipal)
    throw new Error('Manifesto, decisão, executor ou backup divergente.');
  sameSnapshot(manifest,current);
  const receiptId='fast8-'+Date.now(),at=new Date().toISOString();
  const receipt={schema:1,kind:'organizer-fast8-configuration',tournamentId:id,sourceSha,ownerInstruction,
    requestedByOwnerUid:current.root.creatorUid,executorPrincipal,at,backupSha:manifest.backupSha,
    beforeHash:hash(Object.fromEntries(configKeys.map(key=>[key,current.root[key]]))),afterHash:hash(configuration),partsHash:current.partsHash};
  await db.runTransaction(async tx=>{
    const fresh=await read(tx,ref);sameSnapshot(manifest,fresh);
    const again=core.plan(fresh.tournament,intent,context,ConfigError,drawCore.hasDrawnBracket(fresh.tournament));
    const config=Object.fromEntries(configKeys.map(key=>[key,again.after[key]]));
    if(hash(config)!==manifest.configurationHash) throw new Error('O plano mudou durante a transação.');
    tx.update(ref,{...config,updatedAt:at,fast8ConfigurationReceipt:receiptId});
    tx.create(db.collection('tournamentConfigurationReceipts').doc(receiptId),receipt);
  });
  const after=await db.runTransaction(tx=>read(tx,ref));
  const verified=hash(Object.fromEntries(configKeys.map(key=>[key,after.root[key]])))===manifest.configurationHash;
  // Activity after the commit belongs to the organizer. Never overwrite it in recovery.
  if(!verified && after.root.fast8ConfigurationReceipt===receiptId && after.root.updatedAt===at &&
      after.partsHash===manifest.partsHash && after.courtVersion===manifest.courtVersion) {
    await db.runTransaction(async tx=>{
      const fresh=await read(tx,ref);
      if(fresh.rootVersion!==after.rootVersion || fresh.partsHash!==manifest.partsHash || fresh.courtVersion!==manifest.courtVersion)
        throw new Error('Nova atividade impede restaurar a configuração automaticamente.');
      tx.update(ref,{...Object.fromEntries(configKeys.map(key=>[key,backup.root[key]])),updatedAt:new Date().toISOString(),fast8ConfigurationReceipt:null});
      tx.update(db.collection('tournamentConfigurationReceipts').doc(receiptId),{rolledBackAt:new Date().toISOString()});
    });
    throw new Error('Verificação falhou; somente a configuração foi restaurada.');
  }
  if(!verified) throw new Error('Verificação divergente com atividade posterior; configuração preservada para investigação.');
  const output=path.join(path.dirname(manifestFile),'receipt.json');fs.writeFileSync(output,JSON.stringify({...receipt,verified:true,partsUnchanged:after.partsHash===manifest.partsHash},null,2),{mode:0o600});
  console.log(JSON.stringify({applied:true,receipt:output,alternation:true,thirdPlace:false,partsUnchanged:after.partsHash===manifest.partsHash}));
}
module.exports={stable,hash,sameSnapshot};
if(require.main===module) main().catch(error=>{console.error(error.code || 'error',error.message);process.exitCode=1;});
