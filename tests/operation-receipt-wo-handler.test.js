'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const core=require('../functions-autodraw/operation-receipt-core');
const drawCore=require('../functions-autodraw/draw-core');
const source=fs.readFileSync(require('node:path').join(__dirname,'../functions-autodraw/index.js'),'utf8');
const start=source.indexOf('exports.setTournamentPresenceWithWOSubstitution = onCall');
const end=source.indexOf('// ─── Escolha explícita de substituto',start);
assert(start>=0&&end>start);
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const id='387638c7-0f33-45eb-a217-1314bfe68d73';
const data={tournamentId:'tour_test',targetUid:'person',targetName:'Player',action:'present',operationId:id};
const t={participants:[{uid:'person',displayName:'Player'}]};
const prepared=core.prepare({operationId:id,actorUid:'owner',parentPath:'tournaments/tour_test',
 kind:'presence-wo',target:'person',action:'present',payload:{targetUid:'person',targetName:'Player'}});
async function run(engineResult,existing){
 const calls=[];
 let saved=null;
 const ref={path:'tournaments/tour_test',get:async()=>({exists:true,data:()=>t}),
  collection:()=>({doc:()=>({path:'tournaments/tour_test/operationReceipts/'+id})})};
 const db={collection:()=>({doc:()=>ref}),runTransaction:async fn=>fn({
  get:async()=>({exists:!!existing,data:()=>existing}),create:(_ref,doc)=>{calls.push('create');saved=doc;},set:()=>calls.push('set')})};
 const ctx={exports:{},onCall:fn=>fn,HttpsError,db,_operationReceipt:core,
  _isTournamentAdmin:()=>true,_preloadDrawNames:async()=>{},
  _leTorneio:async()=>JSON.parse(JSON.stringify(t)),_enrichParticipantsFromProfiles:()=>{},
  drawWindow:{_participantUids:p=>[p.uid],_memberNameByUid:()=> 'Player'},
  _antesDoMotor:()=>({}),_reconcileSurplusBeforeWrite:()=>{},
  _gravaTorneio:()=>({clean:{id:'tour_test'}}),
  _drawFail:(code,msg)=>new HttpsError(code,msg),
  setPresenceWithWOSubstitutionFn:(current,opts)=>{calls.push('motor');
   return typeof engineResult==='function'?engineResult(current,opts):engineResult;},
  String,Array,Object,Date,console};
 vm.runInNewContext(source.slice(start,end),ctx);
 return {response:await ctx.exports.setTournamentPresenceWithWOSubstitution({auth:{uid:'owner'},data}),calls,saved};
}
(async()=>{
 const refused=await run({ok:false,reason:'missing-target'});
 assert.equal(refused.response.ok,false);
 assert.deepEqual(refused.calls,['motor'],'recusa do motor não grava recibo');
 const accepted=await run({ok:true,action:'present',substitutions:{ok:true,subCount:1,
  subDetails:[{name:'Pessoa privada',when:new Date(),optional:undefined},undefined]}});
 assert.equal(accepted.response.ok,true);
 assert.deepEqual(accepted.calls,['motor','create'],'sucesso grava recibo');
 assert.deepEqual(accepted.saved.response,{ok:true,result:{ok:true,action:'present',
  substitutions:{ok:true,subCount:1}}},'recibo não guarda nomes ou valores opcionais do motor');
 for (const action of ['present','clear']) {
  data.action=action;
  const actual=await run((current,opts)=>drawCore.setPresenceWithWOSubstitution(current,opts));
  assert.equal(actual.response.ok,true,'motor real aceita '+action);
  assert.equal(actual.saved.response.result.action,action,'recibo registra desfecho do motor real');
  assert.equal(typeof actual.saved.response.result.substitutions.subCount,'number');
 }
 data.action='present';
 const receipt=core.document(prepared,{ok:true,result:{ok:true,action:'present'}});
 const replay=await run({ok:true},receipt);
 assert.equal(replay.response.replayed,true);
 assert.deepEqual(replay.calls,[],'replay não executa motor nem grava');
 console.log('✓ W.O. presença: recusa sem recibo, sucesso atômico e replay sem motor');
})().catch(e=>{console.error(e);process.exitCode=1});
