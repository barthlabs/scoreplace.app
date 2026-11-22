'use strict';
const assert=require('assert');
const {REQUIRED_FUNCTIONS,REGIONS,buildReadyDocument}=require('../scripts/end-court-readiness-core');

const commit='a'.repeat(40),regionalDigest='b'.repeat(64),centralDigest='c'.repeat(64);
const requiredManifest={schema:1,backendCommit:commit,functions:[...REQUIRED_FUNCTIONS]};
const receipt={schema:1,entries:Object.fromEntries(REQUIRED_FUNCTIONS.map(name=>[name,{backendCommit:commit,
  deployedAt:'2026-11-22T00:00:00.000Z',result:'success',mode:'only'}]))};
const exportedNames=new Set(REQUIRED_FUNCTIONS);
const rows=(version,regions)=>regions.map((region,index)=>({name:`sp-op-end-court-${version}`,region,
  target:'endMatchOnCourt',commit,sourceDigest:regionalDigest,image:`gcr.io/scoreplace/app@sha256:${String(index+1).repeat(64)}`,
  url:`https://${version}-${region}.example.invalid`,revision:`${version}-${region}-revision`,
  env:{SP_SOURCE_DIGEST:regionalDigest,SP_OPERATION_REGION:region}}));
const regionalManifests={v2:rows('v2',REGIONS.v2),v3:rows('v3',REGIONS.v3)};
const valid=()=>buildReadyDocument({requiredManifest,receipt,exportedNames,regionalManifests,
  sourceDigest:regionalDigest,centralSourceDigest:centralDigest});
const result=valid();
assert.deepStrictEqual(result,{ready:true,sourceDigest:regionalDigest,centralSourceDigest:centralDigest,
  sourceCommit:commit,verifiedVersions:['v2','v3'],regions:['us-east1','us-east4','us-south1','us-central1','southamerica-east1']});

let writes=0;
function writeOnlyAfterValidation(args){const document=buildReadyDocument(args);writes++;return document;}
const base={requiredManifest,receipt,exportedNames,regionalManifests,sourceDigest:regionalDigest,centralSourceDigest:centralDigest};
for(const functions of [REQUIRED_FUNCTIONS.slice(1),[...REQUIRED_FUNCTIONS,'extra'],
  [...REQUIRED_FUNCTIONS.slice(1),'endMatchOnCourt','endMatchOnCourt']]) {
  assert.throws(()=>writeOnlyAfterValidation({...base,requiredManifest:{...requiredManifest,functions}}));
}
assert.throws(()=>writeOnlyAfterValidation({...base,receipt:{schema:1,entries:{}}}),/receipt|publicação/i);
assert.strictEqual(writes,0,'receipt ausente ou conjunto errado não pode gravar ready:true');
assert.throws(()=>writeOnlyAfterValidation({...base,regionalManifests:{...regionalManifests,v2:regionalManifests.v2.slice(1)}}),/incompleto/i);
const duplicate={...regionalManifests,v3:[...regionalManifests.v3,regionalManifests.v3[0]]};
assert.throws(()=>writeOnlyAfterValidation({...base,regionalManifests:duplicate}),/duplicado/i);
const badDigest={...regionalManifests,v2:regionalManifests.v2.map((row,i)=>i?row:{...row,sourceDigest:'d'.repeat(64)})};
assert.throws(()=>writeOnlyAfterValidation({...base,regionalManifests:badDigest}),/não confere/i);
assert.strictEqual(writes,0);
assert.strictEqual(writeOnlyAfterValidation(base).ready,true);
assert.strictEqual(writes,1,'só o conjunto integral e confirmado habilita readiness');
console.log('✓ readiness exige sete recibos e oito linhas regionais verificadas');
