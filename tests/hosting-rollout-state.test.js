'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const core=require('../scripts/hosting-rollout-state');
const commit='a'.repeat(40),version='2.7.73';
const saved={schema:1,state:'published-backups-pending',commit,version,regionalFingerprint:'b'.repeat(64)};
const current={commit,version,regionalFingerprint:saved.regionalFingerprint,main:commit,release:{commit,versao:version},liveVersion:version};
core.assertResume(saved,current);
for(const patch of [{commit:'c'.repeat(40)},{version:'2.7.74'},{main:'c'.repeat(40)},{regionalFingerprint:'d'.repeat(64)},{release:{commit:'d'.repeat(40),versao:version}},{liveVersion:'2.7.72'}])assert.throws(()=>core.assertResume(saved,{...current,...patch}),/Retomada recusada/);
assert.throws(()=>core.assertResume({...saved,state:'completed'},current),/Retomada recusada/);
assert.throws(()=>core.receiptPath('../../bad'),/Commit inválido/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sp-rollout-inputs-'));
try{
  for(const file of core.inputs){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),'{}');}
  const first=core.fingerprint(dir);fs.appendFileSync(path.join(dir,core.inputs[0]),' ');assert.notEqual(core.fingerprint(dir),first);
  fs.unlinkSync(path.join(dir,core.inputs[1]));assert.throws(()=>core.fingerprint(dir));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
const unique=require('node:crypto').randomBytes(20).toString('hex'),file=core.receiptPath(unique);
try{core.save({...saved,commit:unique});assert.equal(fs.statSync(file).mode&0o777,0o600);assert.equal(fs.statSync(path.dirname(file)).mode&0o777,0o700);}finally{fs.rmSync(file,{force:true});}
const firebase=require('../firebase.json');assert.equal(firebase.hosting.headers.find(h=>h.source==='/release.json').headers.find(h=>h.key==='Cache-Control').value,'no-store');
assert(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8').includes("url.indexOf('/release.json') !== -1) return;"));
console.log('✓ retomada: SHA/versão/main/artefato/fingerprint exatos, recibo privado e sem cache');
