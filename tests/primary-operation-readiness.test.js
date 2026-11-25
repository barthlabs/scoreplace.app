'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const core = require('../scripts/check-primary-operation-readiness');

const regions = ['us-east1','us-east4'];
const names = ['court','score','presence','presence-wo','end-court','control'].map(name=>'sp-op-'+name+'-v3');
const config = { schema:3, regions, services:{} }, manifest=[];
for(const name of names) {
  config.services[name] = { digest:'a'.repeat(64), urls:{} };
  for(const region of regions) {
    const url='https://'+name+'-'+region+'.example.test';
    config.services[name].urls[region]=url;
    manifest.push({name,region,url,sourceDigest:'a'.repeat(64),image:'image@sha256:'+'b'.repeat(64),revision:name+'-r1'});
  }
}
const calls=[];
async function describe(kind,name,region) {
  calls.push([kind,name,region]);
  const row=manifest.find(row=>row.region===region&&(row.name===name||row.revision===name));
  if(kind==='services')return {status:{url:row.url,latestReadyRevisionName:'unused-new-ready',traffic:[{revisionName:row.revision,percent:100}]}};
  return {metadata:{name:row.revision},status:{conditions:[{type:'Ready',status:'True'}]},spec:{containers:[{image:row.image,env:[
    {name:'SP_SOURCE_DIGEST',value:row.sourceDigest},{name:'SP_OPERATION_REGION',value:region}
  ]}]}};
}
(async()=>{
  const result=await core.selectPrimary(config,manifest,{describe,checkPort:async()=>{}});
  assert.equal(result.region,'us-east1');assert.equal(result.verified.length,6);
  assert(calls.every(call=>call[2]==='us-east1'),'healthy preferred primary does not wait for backups');
  assert(calls.filter(call=>call[0]==='revisions').every(call=>call[1].endsWith('-r1')),'checks the traffic revision, not latestReady');
  calls.length=0;
  const fallback=await core.selectPrimary(config,manifest,{describe,checkPort:async url=>{if(url.includes('us-east1'))throw Error('down');}});
  assert.equal(fallback.region,'us-east4','uses configured fallback when the preferred primary is unavailable');
  assert.throws(()=>core.requiredRows(config,manifest.concat(manifest[0]),'us-east1'),/divergente/);
  assert.throws(()=>core.requiredRows(config,manifest.filter(row=>row!==manifest[0]),'us-east1'),/divergente/);
  assert.throws(()=>core.requiredRows(config,manifest,'elsewhere'),/fora/);
  await assert.rejects(core.verifyRegion(config,manifest,'us-east1',{describe:async(kind,name,region)=>{
    const value=await describe(kind,name,region);if(kind==='revisions')value.spec.containers[0].env[0].value='wrong';return value;
  },checkPort:async()=>{}}),/Fonte/);
  await assert.rejects(core.selectPrimary(config,manifest,{describe,checkPort:async()=>{throw Error('CORS');}}),/Nenhuma/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sp-primary-test-'));
  try {
    const cfgFile=path.join(dir,'config.json'),manifestFile=path.join(dir,'manifest.json'),receiptFile=path.join(dir,'receipt.json');
    fs.writeFileSync(cfgFile,JSON.stringify(config));fs.writeFileSync(manifestFile,JSON.stringify(manifest));
    const output=execFileSync(process.execPath,[path.join(__dirname,'../scripts/check-primary-operation-readiness.js'),
      '--dry-run','--config',cfgFile,'--manifest',manifestFile,'--receipt',receiptFile],{encoding:'utf8'});
    assert.equal(JSON.parse(output).mode,'dry-run');assert(!fs.existsSync(receiptFile),'dry-run cannot attest a deployment');
    core.writeReceipt(receiptFile,result,fs.readFileSync(cfgFile),fs.readFileSync(manifestFile),new Date('2026-11-25T12:00:00Z'));
    const receipt=JSON.parse(fs.readFileSync(receiptFile));
    assert.equal(receipt.configHash,core.hash(fs.readFileSync(cfgFile)));assert.equal(receipt.manifestHash,core.hash(fs.readFileSync(manifestFile)));
    assert.equal(fs.statSync(receiptFile).mode&0o777,0o600);assert.equal(receipt.verified.length,6);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  console.log('✓ principal: tráfego/digest/Auth por seis portas, fallback e recibo privado sem aguardar backups');
})().catch(error=>{console.error(error);process.exitCode=1;});
