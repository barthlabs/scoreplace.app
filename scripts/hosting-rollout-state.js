#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const inputs=['.claude/tmp/operation-regions-manifest-v2.json','.claude/tmp/operation-regions-manifest-v3.json','.claude/tmp/operation-legacy-gate-manifest-v2.json','operation-regions.json','operation-regions-v3.json'];
function fingerprint(base=root) {
  const hash=crypto.createHash('sha256');
  for(const file of inputs) {const data=fs.readFileSync(path.join(base,file));if(!data.length)throw Error('Insumo vazio: '+file);hash.update(file).update('\0').update(data).update('\0');}
  return hash.digest('hex');
}
function receiptPath(commit) {
  if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Commit inválido');
  return path.join(os.tmpdir(),'scoreplace-deploy','rollouts',commit+'.json');
}
function save(receipt) {
  const file=receiptPath(receipt.commit),dir=path.dirname(file);
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  if(fs.lstatSync(dir).isSymbolicLink() || (fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()))throw Error('Recibo não pode ser link');
  fs.chmodSync(dir,0o700);
  const temp=file+'.'+process.pid+'.tmp';fs.writeFileSync(temp,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temp,file);
}
function assertResume(saved,current) {
  if(saved.schema!==1 || saved.state!=='published-backups-pending' || saved.commit!==current.commit || saved.version!==current.version ||
    saved.regionalFingerprint!==current.regionalFingerprint || current.main!==current.commit ||
    current.release?.commit!==current.commit || current.release?.versao!==current.version || current.liveVersion!==current.version)
    throw Error('Retomada recusada: commit, versão, ar, main ou insumos regionais divergentes');
}
async function serving(commit,version) {
  const query='?rollout='+Date.now();
  const read=async file=>{const response=await fetch('https://scoreplace.app/'+file+query,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error(file+': HTTP '+response.status);return response.text();};
  const [json,live]=await Promise.all([read('release.json'),read('version.txt')]);
  const release=JSON.parse(json),liveVersion=live.trim();
  if(release.commit!==commit || release.versao!==version || liveVersion!==version)throw Error('Ar ainda não confirma o mesmo artefato');
  return {release,liveVersion};
}
async function main() {
  const [mode,commit,version]=process.argv.slice(2);
  if(!['record','resume-check','complete'].includes(mode)||!/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(version||''))throw Error('uso: hosting-rollout-state.js record|resume-check|complete SHA versão');
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
  if(git('rev-parse','HEAD')!==commit || fs.readFileSync(path.join(root,'version.txt'),'utf8').trim()!==version)throw Error('HEAD ou versão local mudou');
  const mainCommit=git('ls-remote','origin','refs/heads/main').split(/\s/)[0];
  const current={commit,version,regionalFingerprint:fingerprint(),main:mainCommit};
  if(mode==='record') {
    if(mainCommit!==commit)throw Error('main não confirma o artefato');
    save({schema:1,commit,version,regionalFingerprint:current.regionalFingerprint,state:'published-backups-pending',publishedAt:new Date().toISOString()});
    await serving(commit,version);
  } else {
    const saved=JSON.parse(fs.readFileSync(receiptPath(commit),'utf8'));assertResume(saved,{...current,...await serving(commit,version)});
    if(mode==='complete')save({...saved,state:'completed',completedAt:new Date().toISOString()});
  }
  console.log('✓ '+mode+': '+commit.slice(0,8)+' v'+version);
}
if(require.main===module)main().catch(error=>{console.error('✗ '+error.message);process.exitCode=1;});
module.exports={inputs,fingerprint,receiptPath,save,assertResume};
