'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},console};
vm.runInNewContext(fs.readFileSync('js/firebase-db.js','utf8'),context);
const db=context.window.FirestoreDB;
(async()=>{
 for(const [id,collection] of [['tour_123','tournaments'],['sb_tour_123','sandboxes']]){
  const paths=[];let result={exists:true,data:()=>({revision:'current'})};
  db.db={collection:name=>{paths.push(name);return{doc:key=>{paths.push(key);return{collection:name=>{paths.push(name);return{doc:key=>{paths.push(key);return{get:async()=>result};}};}};}};}};
  assert.equal((await db.loadTournamentRegulation(id)).revision,'current');
  assert.deepEqual(paths,[collection,id,'regulations','current']);
  result={exists:false};assert.equal(await db.loadTournamentRegulation(id),null);
  db.db={collection:()=>{throw Error('permission-denied')}};
  await assert.rejects(()=>db.loadTournamentRegulation(id),/permission-denied/);
 }
 db.db=null;await assert.rejects(()=>db.loadTournamentRegulation('tour_123'),/Banco/);
 console.log('PASS metadados de regulamento: módulo real, produção/sandbox, ausência e falhas preservadas.');
})().catch(error=>{console.error(error);process.exitCode=1});
