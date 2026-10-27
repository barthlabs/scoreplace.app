'use strict';
const fs=require('fs');let f=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)f++;};
const fn=fs.readFileSync('functions-autodraw/index.js','utf8'); const start=fn.indexOf('exports.setTournamentCategoryConfig'); const end=fn.indexOf('exports.setTournamentBranding',start); const part=fn.slice(start,end);
ok(start>=0&&part.includes('db.runTransaction')&&part.includes('_isTournamentAdmin')&&part.includes('combinedCategories'),'configuração de categorias é validada e gravada em transação pela Function');
const ui=fs.readFileSync('js/views/tournaments-enrollment-report.js','utf8');const a=ui.slice(ui.indexOf('function _erCommitCats'),ui.indexOf('window._erToggleGender',ui.indexOf('function _erCommitCats')));
ok(a.includes("_callCF('setTournamentCategoryConfig'")&&!a.includes('saveTournament(t)'),'matriz de categorias não salva a ficha inteira no navegador');
const assert=require('node:assert/strict');
const split=require('../js/views/tournament-split-core.js');
class HttpsError extends Error { constructor(code,message){super(message);this.code=code;} }
const guardStart=fn.indexOf('async function _assertCategoryConfigBeforeDraw(');
const guardEnd=fn.indexOf('\n// Uma lista de rótulos',guardStart);
assert(guardStart>=0&&guardEnd>guardStart,'guarda real localizada');
const guard=new Function('hasDrawnBracket','HttpsError','_tSplit',fn.slice(guardStart,guardEnd)+'\nreturn _assertCategoryConfigBeforeDraw;')(
  ()=>false,HttpsError,split);
const handlerEnd=fn.indexOf('exports.setPhaseLateEnrollment',start);
assert(handlerEnd>start,'fim do handler real localizado');
let physicalPart='',writes=0;
const tournament={id:'tour_test',creatorUid:'org',genderCategories:[],skillCategories:[],
  combinedCategories:[],categoryDefinitions:[],canonicalRegistrationMigration:{fingerprint:'native:tour_test',registrationCount:0},
  matches:[],groups:[],_nPartes:{}};
const db={collection:()=>({doc:id=>({id,collection:part=>({part,limit(){return this;}})})}),
  runTransaction:async cb=>cb({get:async ref=>({empty:ref.part!==physicalPart,docs:ref.part===physicalPart?[{id:'drawn'}]:[]})})};
const handler=new Function('onCall','HttpsError','db','_leTorneio','_isTournamentAdmin','_drawFail',
  '_assertCategoryConfigBeforeDraw','_assertLegacyRosterMutationAllowed','_categoryDefinitionsForLabels',
  '_antesDoMotor','_gravaTorneio','const exports={};\n'+fn.slice(start,handlerEnd)+'\nreturn exports.setTournamentCategoryConfig;')(
  (_opts,cb)=>cb,HttpsError,db,async()=>tournament,()=>true,(code,message)=>new HttpsError(code,message),
  guard,()=>{},async()=>{throw new Error('projeção após sorteio');},()=>({}),()=>{writes++;return{clean:tournament};});
(async()=>{
  for(const part of ['matches','grupos','woClaims']){
    physicalPart=split.colecaoDaParte(part);
    await assert.rejects(handler({auth:{uid:'org'},data:{tournamentId:'tour_test',genderCategories:['Fem'],skillCategories:[]}}),
      error=>error.code==='failed-precondition'&&/antes do primeiro sorteio/.test(error.message),part+' físico bloqueia toggle da Análise');
    assert.equal(writes,0,part+' não grava');
  }
  console.log('✓ toggles da Análise recusam partes físicas sem contadores');
  process.exit(f?1:0);
})().catch(error=>{console.error(error);process.exitCode=1;});
