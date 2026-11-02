'use strict';
const assert=require('node:assert/strict');
const {window:W,sandbox}=require('./render-harness');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const t={id:'e15-ui',canonicalRegistrationMigration:{fingerprint:'fp'},
  standbyParticipants:[{uid:'a',categoryId:'cat'},{uid:'b',categoryId:'cat'}],
  waitlist:[],participants:[]};
W.AppStore.tournaments=[t];
W._getWaitlist=()=>t.standbyParticipants;
W._ljClearForming=()=>{};
const calls=[],toasts=[];
sandbox.showNotification=(title,message,kind)=>toasts.push({title,message,kind});
W.FirestoreDB={
  formPair:async(_id,opts)=>{calls.push({kind:'formPair',opts});return{outcome:'paired'};},
  splitPair:async(_id,opts)=>{calls.push({kind:'splitPair',opts});return{outcome:'split'};},
  formLatePair:async()=>{calls.push({kind:'legacyForm'});return{};},
  splitLatePair:async()=>{calls.push({kind:'legacySplit'});return{};}
};
W._lateCanonicalPairRefresh=async()=>t;
W._applyCFTournament=()=>{};
(async()=>{
  W._callIntegrateLate=async()=>({data:{ok:true,changed:false,promoted:0}});
  W._formLateJoinDupla(t.id,'a','b');await flush();
  assert.equal(calls[0].kind,'formPair');
  assert.equal(calls[0].opts.categoryId,'cat');
  assert.equal(calls[0].opts.uid1,'a');assert.equal(calls[0].opts.uid2,'b');
  assert(toasts.some(item=>item.title.includes('Dupla na espera')),
    'formação sem vaga não anuncia integração na chave');
  assert(!calls.some(item=>item.kind==='legacyForm'));
  t.standbyParticipants=[{p1Uid:'a',p2Uid:'b',categoryId:'cat',fixedPairId:'pair-1'}];
  W._splitLateDupla(t.id,'a','b');await flush();
  assert(calls.some(item=>item.kind==='splitPair'&&item.opts.categoryId==='cat'));
  assert(!calls.some(item=>item.kind==='legacySplit'));
  assert(toasts.some(item=>item.title.includes('Dupla desfeita')));
  console.log('✓ E15 UI: dupla na espera usa recibo canônico e não anuncia vaga inexistente');
})().catch(error=>{console.error(error);process.exitCode=1;});
