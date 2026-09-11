'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {scan}=require('../scripts/tournament-writer-census-core');
const root=path.join(__dirname,'../js');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
// APIs antigas ainda definidas no store, sem chamadores de produto após esta leva.
// Mantidas provisoriamente por cobertura de compatibilidade; são dívida explícita.
const debt={
 'store.js#sync#saveTournament':1,
 'store.js#syncImmediate#saveTournament':1,
 'store.js#commitTournamentTx#mutateTournament':1,
 'store.js#mutate#commitTournamentTx':2,
 'store.js#reseedMatchRoster#commitMatchResult':1,
 'store.js#commitDrawTx#commitTournamentTx':1,
 'store.js#commitMatchResult#mutateMatchResult':1,
 'store.js#seedMatchResultDocs#commitMatchResult':1,
 // Simulação explícita do desenvolvedor, só em sandbox. Não é exceção para produto.
 'views/tournaments-draw.js#window._devSimulateCurrentPhase#saveTournament':1,
 'views/tournaments-draw.js#window._devSimulateCurrentPhase#sync':1
};
const counts={};
for(const file of walk(root).filter(f=>f.endsWith('.js'))){
 const rel=path.relative(root,file).replace(/\\/g,'/');
 for(const row of scan(fs.readFileSync(file,'utf8'))){
  const key=rel+'#'+row.owner+'#'+row.name;
  counts[key]=(counts[key]||0)+1;
  assert(Object.hasOwn(debt,key),'writer fora da dívida classificada: '+rel+':'+row.line+' '+row.owner+' → '+row.name);
 }
}
for(const [key,n] of Object.entries(counts))assert(n<=debt[key],'nova chamada na porta '+key);
assert.equal(scan('// store.mutate(t)\nconst s="AppStore.mutate(x)";').length,0);
assert.equal(scan('const s=window.AppStore;s.mutate(t);s["commitTournamentTx"](t);').length,2);
assert.equal(scan('const {mutate:m}=window.AppStore;m(t);').length,1);
assert.equal(scan('const f=window.AppStore.mutate;f.call(window.AppStore,t);').length,1);
assert.equal(scan('s.mutate.call(s,t);').length,1);
assert(!fs.readFileSync(path.join(root,'views/tournaments.js'),'utf8').includes('addBotsFunction'));
console.log('✓ censo AST: zero writer de produto fora das Functions; '+Object.values(counts).reduce((a,b)=>a+b,0)+' chamadas internas/simulação classificadas como dívida, sem tolerância para novas rotas.');
