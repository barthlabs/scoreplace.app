'use strict';
const assert = require('assert/strict'), fs = require('fs'), vm = require('vm'), crypto = require('crypto');
const { makeCreateTournament, WINDOW_MS } = require('../functions-autodraw/tournament-create');
const { makeSaveTournamentReplay } = require('../functions-autodraw/tournament-replay');
const win = require('../functions-autodraw/draw-core')._window;
const mirror = require('../functions-autodraw/vendor/match-roster');
const server = fs.readFileSync('functions-autodraw/index.js','utf8');
class HttpsError extends Error { constructor(code,message){super(message);this.code=code;} }
const configSource = server.slice(server.indexOf('const _CAMPOS_CONFIG_TORNEIO'), server.indexOf('function _fasesDeConfiguracaoAtualizaveis'));
const config = new Function('HttpsError', configSource + '\nreturn {fields:_CAMPOS_CONFIG_TORNEIO,cloneConfig:_clonaConfigDeclarativa};')(HttpsError);
const boundarySource = server.slice(server.indexOf('function _applyWriteBoundary('),server.indexOf('\n// Re-sorteio:',server.indexOf('function _applyWriteBoundary(')));
const boundary = new Function('drawWindow','_agenda','HttpsError',boundarySource+'\nreturn _applyWriteBoundary;')(win,require('../functions-autodraw/agenda-core'),HttpsError);
const copy = x => JSON.parse(JSON.stringify(x));
function fakeDB() {
  const docs = new Map(); let queue = Promise.resolve(), writes=0;
  function ref(path) { return {path,collection:n=>({doc:id=>ref(path+'/'+n+'/'+id)})}; }
  const db={docs,collection:n=>({doc:id=>ref(n+'/'+id)}),get writes(){return writes;},runTransaction(fn){
    const task=queue.then(async()=>{
      let pending=[];
      const tx={get:async r=>({exists:docs.has(r.path),data:()=>copy(docs.get(r.path))}),create:(r,x)=>{assert(!docs.has(r.path),'create-only');pending.push([r.path,copy(x)]);},update:(r,x)=>{assert(docs.has(r.path));pending.push([r.path,{...docs.get(r.path),...copy(x)}]);}};
      // Exercita retry do callback sem efetivar a tentativa abortada.
      await fn(tx); pending=[];
      const result=await fn(tx);
      pending.forEach(([p,d])=>docs.set(p,d)); writes+=pending.length; return result;
    });queue=task.catch(()=>{});return task;
  }};return db;
}
let count=0;
async function test(label,fn){await fn();console.log('✓ '+label);count++;}
const clock=Date.now(), id='tour_'+clock+'_'+'a'.repeat(32);
const payload={tournamentId:id,config:{name:'Copa',sport:'Tênis',format:'Eliminatórias Simples',isPublic:true}};
const auth={uid:'owner',token:{email:'org@example.com',email_verified:true}};
const read=async(tx,ref,id)=>{const snap=await tx.get(ref);return snap.exists?{...snap.data(),id}:null;};
function creator(db,time=clock){return makeCreateTournament({db,HttpsError,FieldValue:{serverTimestamp:()=> 'server-time'},...config,compile:(c,x)=>win.FORMAT2.compileToPhases(c,x),boundary,readTournament:read,now:()=>time});}
(async()=>{
 await test('criação concorrente/retry grava uma vez e identidade vem do servidor',async()=>{
  const db=fakeDB();db.docs.set('users/owner',{displayName:'Organizador real'});
  const fn=creator(db), request={auth,data:copy(payload)};
  const result=await Promise.all([fn(request),fn(request)]);
  assert.equal(db.writes,2);assert.equal(result.filter(x=>x.changed).length,1);
  const t=db.docs.get('tournaments/'+id);assert.equal(t.creatorUid,'owner');assert.equal(t.organizerName,'Organizador real');assert.equal(t.status,'open');assert.equal(t._nascidoEm,'server-time');assert.deepEqual(t.participants,[]);assert(!t._semPesados);assert(t.memberUids.includes('owner'));
  t.matches=[{id:'new-game',winner:'A'}];db.docs.set('tournaments/'+id,t);
  const retry=await fn(request);assert.deepEqual(retry.tournament.matches,t.matches);assert.equal(db.writes,2);
 });
 await test('auth, colisão, injeção de estado e payload grande são recusados sem escrita',async()=>{
  const db=fakeDB(),fn=creator(db);
  await assert.rejects(fn({data:payload}),{code:'unauthenticated'});
  for(const extra of [{creatorUid:'other'},{participants:[{uid:'x'}]},{phases:[{matches:[]}]},{fmt2:{participants:[]}},JSON.parse('{"scoring":{"__proto__":{"adminUids":["x"]}}}'),{name:'x'.repeat(241)}]) {
   await assert.rejects(fn({auth,data:{...payload,config:{...payload.config,...extra}}}));
  }
  assert.equal(db.writes,0);
  await fn({auth,data:payload});
  await assert.rejects(fn({auth:{uid:'intruder'},data:payload}),{code:'already-exists'});
  await assert.rejects(fn({auth,data:{...payload,config:{...payload.config,name:'Outra'}}}),{code:'already-exists'});
  assert.equal(db.writes,2);
 });
 await test('exclusão seguida de retry nunca recria, mesmo após limpar recibo expirado',async()=>{
  const db=fakeDB();await creator(db)({auth,data:payload});db.docs.delete('tournaments/'+id);
  await assert.rejects(creator(db)({auth,data:payload}),{code:'not-found'});
  db.docs.delete('tournamentCreationRequests/'+id);
  await assert.rejects(creator(db,clock+WINDOW_MS+60001)({auth,data:payload}),{code:'invalid-argument'});
  assert(!db.docs.has('tournaments/'+id));
 });
 await test('compilador real cria fases vazias a partir de Format2 declarativo',async()=>{
  const db=fakeDB();const cfg=win.FORMAT2.defaultConfig();
  const out=await creator(db)({auth,data:{...payload,config:{...payload.config,fmt2:cfg}}});
  assert(out.tournament.phases.length);assert.deepEqual(out.tournament.matches,[]);assert(out.tournament.fmt2);
 });
 const replay={v:2,totalPoints:1,points:[{w:1,a:0,b:0}],scoring:{setsToWin:1},truncated:false};
 function replayHandler(db){return makeSaveTournamentReplay({db,HttpsError,readTournament:read,findMatch:(t,id)=>t.matches.find(m=>m.id===id),isAdmin:(t,uid)=>t.creatorUid===uid,playerUids:m=>[m.p1Uid,m.p2Uid].filter(Boolean),buildMirror:mirror.buildMirrorDoc,now:()=>clock});}
 await test('replay usa UID canônico e não altera placar/proposta/roster concorrentes',async()=>{
  const db=fakeDB(),fn=replayHandler(db);
  const t={creatorUid:'owner',matches:[{id:'m',p1Uid:'player',p2Uid:'opponent',p1:'A',p2:'B',winner:'A',scoreP1:6,scoreP2:3}]};
  db.docs.set('tournaments/t',t);const before={playerUids:['player','opponent'],winner:'A',scoreP1:6,pendingResult:{scoreP1:7}};db.docs.set('tournaments/t/results/m',before);
  const data={tournamentId:'t',matchId:'m',replay};
  await assert.rejects(fn({auth:{uid:'stranger'},data}),{code:'permission-denied'});
  assert.equal(db.writes,0);await fn({auth:{uid:'player'},data});await fn({auth:{uid:'player'},data});assert.equal(db.writes,1);
  assert.deepEqual(db.docs.get('tournaments/t/results/m'),{...before,replay});assert.deepEqual(db.docs.get('tournaments/t'),t);
  await assert.rejects(fn({auth,data:{...data,replay:{...replay,points:Array(601).fill({w:1})}}}),{code:'invalid-argument'});
  await assert.rejects(fn({auth,data:{...data,replay:{...replay,points:[{w:1,a:{text:'inválido'}}]}}}),{code:'invalid-argument'});
  db.docs.set('sandboxes/s',{...t,sandboxOwnerUid:'dev'});
  await assert.rejects(fn({auth:{uid:'player'},data:{...data,tournamentId:'s',sandbox:true}}),{code:'permission-denied'});
  await fn({auth:{uid:'dev'},data:{...data,tournamentId:'s',sandbox:true}});assert(db.docs.has('sandboxes/s/resultsSandbox/m'));assert(!db.docs.has('sandboxes/s/results/m'));
 });
 const source=fs.readFileSync('js/store.js','utf8');
 function browser(){
  let saves=0, calls=[], uploads=0;const context={window:{},console,Uint8Array};const w=context.window;
  w.crypto=crypto.webcrypto;w._error=()=>{};w._warn=()=>{};
  w._subirImagemTorneio=async()=>{uploads++;return 'https://image.example/'+uploads;};
  vm.createContext(context);
  const a=source.indexOf('  addTournament(data) {'),b=source.indexOf('\n  logAction(',a);
  vm.runInContext('window.AppStore={tournaments:[],currentUser:{uid:"owner"},_saveToCache(){},'+source.slice(a,b)+'};',context);
  w.AppStore._saveToCache=()=>saves++;
  w.FirestoreDB={_callFn:async(name,data)=>{calls.push({name,data});throw new Error('rede caiu');}};
  return {w,get calls(){return calls;},get uploads(){return uploads;},get saves(){return saves;}};
 }
 await test('cliente cria antes do upload e recupera ID/URL após falha sem cache antecipado',async()=>{
  const b=browser(), data={name:'Copa',sport:'Tênis',format:'Liga',logoData:'data:image/png;base64,AA'};
  let original,commandNames=[];
  b.w.FirestoreDB._callFn=async(name,request)=>{
   commandNames.push(name);
   if(name==='createTournament'){original=request;assert.equal(b.uploads,0);return {ok:true,tournament:{id:request.tournamentId,name:'Servidor'}};}
   throw new Error('resposta da imagem perdida');
  };
  await assert.rejects(b.w.AppStore.addTournament(data));assert.equal(b.w.AppStore.tournaments.length,0);assert.equal(b.saves,0);assert.equal(b.uploads,1);
  assert.deepEqual(commandNames,['createTournament','updateTournamentConfiguration']);
  let release; b.w.FirestoreDB._callFn=async(name,request)=>{
   if(name==='createTournament'){assert.deepEqual(request,original);await new Promise(r=>release=r);}
   else assert.equal(request.patch.logoUrl,'https://image.example/1');
   return {ok:true,tournament:{id:request.tournamentId,name:'Servidor'}};
  };
  const p=b.w.AppStore.addTournament(data),q=b.w.AppStore.addTournament(data);assert.equal(p,q);
  await new Promise(r=>setImmediate(r));assert.equal(b.w.AppStore.tournaments.length,0);release();const id=await p;await q;
  assert.equal(id,original.tournamentId);assert.equal(b.uploads,1);assert.equal(b.w.AppStore.tournaments.length,1);assert.equal(b.w.AppStore.tournaments[0].name,'Servidor');assert.equal(b.saves,1);
 });
 await test('edição faz upload da imagem original e envia somente URL',async()=>{
  const b=browser();b.w.AppStore.tournaments.push({id:'e',name:'Antigo'});let patch;
  b.w._callCF=async(name,data)=>{patch=data.patch;return {data:{tournament:{id:'e',name:'Novo',logoUrl:data.patch.logoUrl}}};};
  await b.w.AppStore.addTournament({id:'e',name:'Novo',logoData:'data:image/png;base64,AA'});
  assert.equal(b.uploads,1);assert.equal(patch.logoUrl,'https://image.example/1');assert(!('logoData' in patch));
 });
 await test('proporção só muda após resposta; erro preserva snapshot concorrente',async()=>{
  const src=fs.readFileSync('js/views/bracket-ui.js','utf8');const a=src.indexOf('window._toggleWlBalance =');
  let reject;const t={wlGroupBalance:'livre'},w={AppStore:{currentUser:{uid:'owner'},_saveToCache(){}},_findTournamentById:()=>t,_isUserOrgOrCoHost:()=>true,FirestoreDB:{_callFn:(name,data)=>{assert.equal(name,'updateTournamentConfiguration');assert.equal(data.patch.wlGroupBalance,'equilibrado');return new Promise((_,r)=>reject=r);}}};
  vm.runInNewContext(src.slice(a),{window:w});w._toggleWlBalance('t');assert.equal(t.wlGroupBalance,'livre');t.wlGroupBalance='equilibrado';reject(new Error('falha'));
  await new Promise(r=>setImmediate(r));assert.equal(t.wlGroupBalance,'equilibrado');
 });
 console.log(count+' cenários comportamentais passaram');
})().catch(err=>{console.error(err);process.exitCode=1;});
