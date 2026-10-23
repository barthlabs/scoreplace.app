'use strict';
// Executa o lote e a transação reais do Firestore no emulador. A resposta da
// primeira escrita é descartada de propósito; a segunda chamada recebe replay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');
const PORT = 8127;
const PROJECT = 'demo-scoreplace';
const backend = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const handlerStart = backend.indexOf('exports.setTournamentPresence = onCall(');
const handlerEnd = backend.indexOf('/* ═══════════════════════════════════════════════════════════════════════════════', handlerStart);
assert(handlerStart >= 0 && handlerEnd > handlerStart, 'handler de presença real encontrado');
const presenceHandler = backend.slice(handlerStart, handlerEnd);
const driver = `
const assert=require('node:assert/strict');
const vm=require('node:vm');
const admin=require(${JSON.stringify(path.join(ROOT, 'functions/node_modules/firebase-admin'))});
const core=require(${JSON.stringify(path.join(ROOT, 'functions/operation-receipt-core'))});
admin.initializeApp({projectId:${JSON.stringify(PROJECT)}});
const db=admin.firestore();
const id1='387638c7-0f33-45eb-a217-1314bfe68d73';
const id2='387638c7-0f33-45eb-a217-1314bfe68d74';
const prepared=(ref,id,kind,payload)=>core.prepare({operationId:id,actorUid:'actor',parentPath:ref.path,
 kind,target:'game',action:'apply',payload});
(async()=>{
 const ref=db.doc('tournaments/tour_receipts');
 await ref.set({touches:0,scores:0});
 const p=prepared(ref,id1,'presence',{target:'player'});
 const rr=ref.collection('operationReceipts').doc(id1);
 async function presence(){
  const prev=await rr.get();
  if(prev.exists){assert(core.matches(prev.data(),p));return core.replay(prev.data());}
  const result={ok:true,updatedAt:1};
  const batch=db.batch();batch.update(ref,{touches:admin.firestore.FieldValue.increment(1)});
  batch.create(rr,core.document(p,result));
  try{await batch.commit();return result;}catch(e){
   assert(e.code===6||e.code==='already-exists');
   const again=await rr.get();assert(core.matches(again.data(),p));return core.replay(again.data());
  }
 }
 const [a,b]=await Promise.all([presence(),presence()]);
 assert(a.ok&&b.ok&&a.replayed!==b.replayed);
 assert.equal((await ref.get()).data().touches,1);
 const p2=prepared(ref,id2,'score',{sets:[6,2]});
 const rr2=ref.collection('operationReceipts').doc(id2);
 async function score(){return db.runTransaction(async tx=>{
  const parent=await tx.get(ref);assert(parent.exists);
  const prev=await tx.get(rr2);
  if(prev.exists){assert(core.matches(prev.data(),p2));return core.replay(prev.data());}
  tx.update(ref,{scores:admin.firestore.FieldValue.increment(1)});
  tx.create(ref.collection('scoreAudit').doc(id2),{outcome:'applied'});
  tx.create(rr2,core.document(p2,{ok:true,outcome:'applied'}));
  return {ok:true,outcome:'applied'};
 });}
 const [c,d]=await Promise.all([score(),score()]);
 assert(c.ok&&d.ok&&c.replayed!==d.replayed);
 assert.equal((await ref.get()).data().scores,1);
 assert.equal((await ref.collection('scoreAudit').get()).size,1);
 assert(!core.matches((await rr2.get()).data(),prepared(ref,id2,'score',{sets:[6,3]})));
 const sb=db.doc('sandboxes/sb_receipts');await sb.set({touches:0});
 const sbp=prepared(sb,id1,'presence',{target:'player'});
 assert.notEqual(sbp.hash,p.hash);
 await sb.collection('operationReceipts').doc(id1).create(core.document(sbp,{ok:true}));
 assert((await rr.get()).exists && (await sb.collection('operationReceipts').doc(id1).get()).exists);
 const refusedId='387638c7-0f33-45eb-a217-1314bfe68d75';
 await db.runTransaction(async tx=>{const current=await tx.get(ref);assert(current.exists);return {ok:false,reason:'refused'};});
 assert(!(await ref.collection('operationReceipts').doc(refusedId).get()).exists);
 // O segundo cenário executa o corpo REAL da callable sobre lote Firestore.
 const realRef=db.doc('tournaments/tour_presence_real');
 await realRef.set({checkedIn:{},absent:{},checkedInConfirmed:{}});
 const handlerContext={exports:{},onCall:(_options,fn)=>fn,admin,
  APP_ORIGINS:[],HttpsError:class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}},
  _partesPerm:{idDeDocumentoValido:()=>true},_isTournamentOrgCaller:()=>true,
  _tSplitFn:{partesDe:()=>[],colecaoDaParte:name=>name},_operationReceipt:core};
 vm.runInNewContext(${JSON.stringify(presenceHandler)},handlerContext);
 const call=()=>handlerContext.exports.setTournamentPresence({auth:{uid:'owner'},data:{
  tournamentId:'tour_presence_real',targetKey:'player',action:'present',operationId:id1}});
 const [r1,r2]=await Promise.all([call(),call()]);
 assert(r1.ok&&r2.ok&&r1.replayed!==r2.replayed);
 const realSaved=(await realRef.get()).data();
 const realReceipt=(await realRef.collection('operationReceipts').doc(id1).get()).data();
 assert.equal(realSaved.checkedIn.player,realReceipt.response.updatedAt,
  'apenas o lote que criou o recibo gravou presença');
 assert.equal((await realRef.collection('operationReceipts').get()).size,1);
 console.log('__OK__');
})().catch(e=>{console.error(e);process.exitCode=1});
`;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sp-receipt-atomic-'));
const config=path.join(tmp,'firebase.json'), script=path.join(tmp,'driver.js');
fs.writeFileSync(config,JSON.stringify({emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true}}));
fs.writeFileSync(script,driver);
const output=rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,'--project',PROJECT,
  'node '+JSON.stringify(script)],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],
  env:Object.assign({},process.env,{PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH})});
assert(output.includes('__OK__'),output.slice(-1200));
console.log('✓ lote e transação atômicos sob corrida, replay, colisão e isolamento');
