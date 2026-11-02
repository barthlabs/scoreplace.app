'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),acorn=require('acorn');
const root=path.join(__dirname,'..');
function property(file,name){const s=fs.readFileSync(path.join(root,file),'utf8');let found;function walk(n){if(!n||typeof n!=='object')return;if(n.type==='Property'&&n.key&&n.key.name===name)found=s.slice(n.start,n.end);Object.values(n).forEach(v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);});}walk(acorn.parse(s,{ecmaVersion:'latest'}));assert(found,name);return found;}
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function drain(){for(let i=0;i<12;i++)await Promise.resolve();}
(async()=>{
 const db=vm.runInNewContext('({'+property('js/firebase-db.js','loadMatchResults')+'})');db.ensureDb=()=>false;await assert.rejects(db.loadMatchResults('t'),{code:'unavailable'});
 db.ensureDb=()=>true;db._tSub=()=>({get:async()=>({forEach(){}})});assert.equal(Object.keys(await db.loadMatchResults('t')).length,0,'coleção vazia real é sucesso');
 {let collection=null,reads=0;const q={get:async()=>{reads++;return {forEach(){}};}};db._tSub=(tid,name)=>{collection=name;return q;};
  await db.loadMatchResults('t');assert.equal(collection,'matches','placar lê o jogo físico');
  await db.loadMatchResults('t',{limit:40});assert.equal(reads,2,'a janela parcial lê todos antes de ordenar, inclusive jogos sem carimbo');
  await db.loadMatchResults('t',{limit:0});assert.equal(reads,3,'limite inválido não trunca a leitura');}
 const a=deferred(),b=deferred();let count=0,saves=0;const window={FirestoreDB:{loadMatchResults(){return ++count===1?a.promise:b.promise;}},_collectAllMatches:t=>t.matches};
 const store=vm.runInNewContext('({'+property('js/store.js','hydrateMatchResults')+','+property('js/store.js','_applyPhysicalResultOnMatch')+'})',{window});store.currentUser={uid:'a'};store.tournaments=[{id:'t',matches:[{id:'m'}]}];store._matchResultFields=['scoreP1'];store._saveToCache=()=>saves++;
 const first=store.hydrateMatchResults('t');store.currentUser={uid:'b'};const second=store.hydrateMatchResults('t');assert.notEqual(first,second);assert.equal(count,2);
 b.resolve({m:{scoreP1:7}});assert.equal(await second,true);a.resolve({m:{scoreP1:1}});assert.equal(await first,false);assert.equal(store.tournaments[0].matches[0].scoreP1,7);assert.equal(saves,1);
 const stale=deferred(),fresh=deferred();let epochReads=0;
 window.FirestoreDB.loadMatchResults=()=>++epochReads===1?stale.promise:fresh.promise;
 store.currentUser={uid:'a'};store.tournaments=[{id:'t',matches:[{id:'m',scoreP1:2}]}];store._resultReadEpochs={t:0};
 const oldRead=store.hydrateMatchResults('t');
 store._resultReadEpochs.t=1; // a confirmação da callable ou eco físico chegou depois do pedido antigo
 const newRead=store.hydrateMatchResults('t');
 assert.notEqual(oldRead,newRead,'nova geração não coalesce com leitura anterior ao save');
 fresh.resolve({m:{scoreP1:8}});assert.equal(await newRead,true);
 stale.resolve({m:{scoreP1:1}});assert.equal(await oldRead,false,'leitura antiga não pode voltar sobre o placar confirmado');
 assert.equal(store.tournaments[0].matches[0].scoreP1,8);
 const text=fs.readFileSync(path.join(root,'js/views/bracket.js'),'utf8');const start=text.indexOf("  if (t && t._resultsHydrated !== 'completa'");const end=text.indexOf('\n  /* ⛔ PORTÃO',start);const code=text.slice(start,end);assert(start>=0&&end>start);
 /* ⛔ A PORTA DE ROTA ENTRA NO CONTEXTO, e é a REAL (extraída de bracket-model.js), não um stub: o
 * bloco da hidratação passou a decidir por ela em 26/set/2026 (o placar não aparecia sem refresh quando
 * se lançava pelo detalhe do torneio). Stub aqui faria este teste medir uma regra que não existe. */
const _rotaSrc=fs.readFileSync(path.join(root,'js/views/bracket-model.js'),'utf8');
const _iRota=_rotaSrc.indexOf('window._rotaMostraAChaveDeste = function');
const _fRota=_rotaSrc.indexOf('\n};',_iRota)+3;
let attempts=0,refresh=0;const t={id:'abc'};const ctx={t,window:{location:{hash:'#bracket/abcd'},AppStore:{hydrateMatchResults(){attempts++;if(attempts===1)throw new Error('offline');t._resultsHydrated='completa';return Promise.resolve(true);}},_softRefreshView(){refresh++;}}};
 vm.runInNewContext(_rotaSrc.slice(_iRota,_fRota),ctx);vm.runInNewContext(code,ctx);vm.runInNewContext(code,ctx);await drain();assert.equal(attempts,1);assert.equal(t._resultsHydrating,false);assert(!t._resultsHydrated);
 vm.runInNewContext(code,ctx);await drain();assert.equal(t._resultsHydrated,'completa');assert.equal(refresh,0,'prefixo de outro torneio não é a mesma rota');
 vm.runInNewContext(code,ctx);await drain();assert.equal(attempts,2,'⛔ segunda abertura NÃO re-hidrata: o caller não derrubou o escopo');
 t._resultsHydrated='parcial';vm.runInNewContext(code,ctx);await drain();assert.equal(attempts,3,'⛔ escopo parcial da dashboard NÃO serve pra chave: ela relê a coleção inteira');
 delete t._resultsHydrated;ctx.window.location.hash='#bracket/abc';vm.runInNewContext(code,ctx);await drain();assert.equal(refresh,1);
 console.log('✓ hidratação: Firestore indisponível, vazio confirmado, jogo físico, conta concorrente, retry da chave, rota exata e escopo completo');
})().catch(e=>{console.error(e);process.exitCode=1;});
