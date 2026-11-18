import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const port=Number(process.env.SP_E15_PORT);
if(!port)throw new Error('SP_E15_PORT obrigatório');
const rules=fs.readFileSync('firestore.rules','utf8');
assert(rules.includes("&& igual('waitlist')"),'waitlist precisa estar em elencoIntacto');
assert(rules.includes("&& igual('standbyParticipants')"),'standby precisa estar em elencoIntacto');
const env=await initializeTestEnvironment({projectId:'demo-scoreplace',
  firestore:{host:'127.0.0.1',port,rules}});
try{
  const id='tournaments/e15-canonical';
  await env.withSecurityRulesDisabled(async context=>context.firestore().doc(id).set({
    id:'e15-canonical',creatorUid:'org',memberUids:['org','alice'],status:'open',
    canonicalRegistrationMigration:{fingerprint:'e15',registrationCount:1},
    participants:[],standbyParticipants:[],waitlist:[]
  }));
  for(const uid of ['org','alice']){
    const db=env.authenticatedContext(uid).firestore();
    await assertFails(db.doc(id).update({waitlist:[{uid:'alice'}]}));
    await assertFails(db.doc(id).update({standbyParticipants:[{uid:'alice'}]}));
  }
  await assertSucceeds(env.authenticatedContext('org').firestore().doc(id).update({
    updatedAt:'2026-11-01T00:00:00Z'
  }));
  const prepared='tournaments/e15-prepared';
  await env.withSecurityRulesDisabled(async context=>context.firestore().doc(prepared).set({
    id:'e15-prepared',creatorUid:'org',memberUids:['org'],status:'active',
    phaseBracketPlanVersion:1,phaseBracketPlanV1:{schema:1,matches:[]}
  }));
  const admin=env.authenticatedContext('org').firestore().doc(prepared);
  await assertFails(admin.update({phaseBracketPlanVersion:2}));
  await assertFails(admin.update({phaseBracketPlanV1:{schema:1,matches:[{id:'falso'}]}}));
  await assertSucceeds(admin.update({updatedAt:'2026-11-01T00:00:01Z'}));
  console.log('✓ E15 Rules: cliente antigo não escreve espera canônica; atualização independente permitida');
}finally{await env.cleanup();}
