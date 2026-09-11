'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/store.js'),'utf8');
const start=source.indexOf('  hydrateMatchResults(tournamentId) {');
const end=source.indexOf('\n  // Grava o resultado',start);
const storeCode='({'+source.slice(start,end)+'})';
const dash=fs.readFileSync(path.join(root,'js/views/dashboard.js'),'utf8');
const ds=dash.indexOf('  try {\n    _dashMyTournaments.filter');
const de=dash.indexOf('\n  /* ⛔ `organizadosCount`',ds);
const dashCode=dash.slice(ds,de);
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
(async()=>{
 const query=deferred();let reads=0,saves=0;
 const ctx={window:{FirestoreDB:{loadMatchResults(){reads++;return query.promise;}},_collectAllMatches:t=>t.matches}};
 const store=vm.runInNewContext(storeCode,ctx);store.currentUser={uid:'a'};store.tournaments=[{id:'t',matches:[{id:'m'}]}];store._saveToCache=()=>saves++;store._overlayResultOnMatch=(m,r)=>Object.assign(m,r);
 const old=store.tournaments[0];const p=store.hydrateMatchResults('t');assert.equal(p,store.hydrateMatchResults('t'));assert.equal(reads,1);
 const fresh={id:'t',matches:[{id:'m',roster:'fresh'}]};store.tournaments=[fresh];query.resolve({m:{scoreP1:6}});assert.equal(await p,true);assert.equal(fresh.matches[0].scoreP1,6);assert.equal(fresh.matches[0].roster,'fresh');assert.equal(old.matches[0].scoreP1,undefined);assert.equal(saves,1);
 for(const change of ['account','delete']){
  const d=deferred();ctx.window.FirestoreDB.loadMatchResults=()=>d.promise;const pending=store.hydrateMatchResults('t');
  if(change==='account')store.currentUser={uid:'b'};else store.tournaments=[];
  d.resolve({m:{scoreP1:99}});assert.equal(await pending,false);assert.equal(saves,1);
 }
 let attempts=0,paints=0;const d=deferred();const tournament={id:'t',updatedAt:'2026-09-11',status:'active'};
 const c={window:{AppStore:{hydrateMatchResults(){attempts++;return attempts===1?d.promise:Promise.resolve(true);}},_dashPedirRepintura(){paints++;}},_dashMyTournaments:[tournament]};
 vm.runInNewContext(dashCode,c);vm.runInNewContext(dashCode,c);await drain();assert.equal(attempts,1);assert.equal(tournament._resultsHydrated,undefined);
 d.reject(new Error('offline'));await drain();assert.equal(tournament._resultsHydrating,false);vm.runInNewContext(dashCode,c);await drain();assert.equal(attempts,2);assert.equal(tournament._resultsHydrated,true);assert.equal(paints,1);
 const seen=[];const list=Array.from({length:7},(_,i)=>({id:String(i),status:'active',updatedAt:'2026-09-'+String(i+1).padStart(2,'0')}));list.push({id:'sandbox',status:'active',updatedAt:'2026-09-30'});
 vm.runInNewContext(dashCode,{window:{AppStore:{hydrateMatchResults(id){seen.push(id);return Promise.resolve(true);}},_isSandboxRef:id=>id==='sandbox'},_dashMyTournaments:list});await drain();assert.deepEqual(seen,['6','5','4','3','2']);
 console.log('✅ L8: retry, coalescência, snapshot fresco, troca de conta, remoção, datas ISO e sandbox');
})().catch(e=>{console.error(e);process.exitCode=1;});
