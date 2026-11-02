import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const port=Number(process.env.SP_E12_PORT);
if(!port)throw new Error('SP_E12_PORT obrigatório');
const actualRules=fs.readFileSync('firestore.rules','utf8');
const guarded="|| (isTournamentParticipant(resource.data) && isParticipantBracketDiff()\n              && (resource.data.get('canonicalRegistrationMigration', {}).get('fingerprint', '') == ''\n                  || !request.resource.data.diff(resource.data).affectedKeys().hasAny(['pairRequests'])))";
assert.equal(actualRules.split(guarded).length,2,'a guarda de pairRequests deve aparecer uma vez');
const baselineRules=actualRules.replace(guarded,
  '|| (isTournamentParticipant(resource.data) && isParticipantBracketDiff())');
const env=await initializeTestEnvironment({projectId:'demo-scoreplace',
  firestore:{host:'127.0.0.1',port,rules:actualRules}});
try{
  const canonical='tournaments/e12-canonical',legacy='tournaments/e12-legacy';
  const base={id:'e12',creatorUid:'org',memberUids:['org','alice','bob'],
    status:'open',participants:[{uid:'alice'},{uid:'bob'}],pairRequests:[]};
  await env.withSecurityRulesDisabled(async context=>{
    await context.firestore().doc(canonical).set({...base,
      canonicalRegistrationMigration:{fingerprint:'e12',registrationCount:2}});
    await context.firestore().doc(legacy).set(base);
  });
  const alice=env.authenticatedContext('alice').firestore();
  const forged=[{id:'alice__bob',inviterUid:'alice',inviteeUid:'bob'}];
  await assertFails(alice.doc(canonical).update({pairRequests:forged}));
  await assertSucceeds(alice.doc(legacy).update({pairRequests:forged}));
  await assertSucceeds(alice.doc(canonical).update({updatedAt:'2026-11-01T00:00:00Z'}));
  console.log('✓ E12 Rules: participante não fabrica convite canônico; escrita permitida e legado controlados');
}finally{await env.cleanup();}
const baseline=await initializeTestEnvironment({projectId:'demo-scoreplace',
  firestore:{host:'127.0.0.1',port,rules:baselineRules}});
try{
  const id='tournaments/e12-baseline';
  await baseline.withSecurityRulesDisabled(async context=>context.firestore().doc(id).set({
    id:'e12-baseline',creatorUid:'org',memberUids:['org','alice','bob'],status:'open',
    participants:[{uid:'alice'},{uid:'bob'}],pairRequests:[],
    canonicalRegistrationMigration:{fingerprint:'e12',registrationCount:2}}));
  await assertSucceeds(baseline.authenticatedContext('alice').firestore().doc(id).update({
    pairRequests:[{id:'alice__bob',inviterUid:'alice',inviteeUid:'bob'}]}));
  console.log('✓ E12 controle: sem a guarda nova, o convite canônico forjado é aceito');
}finally{await baseline.cleanup();}
