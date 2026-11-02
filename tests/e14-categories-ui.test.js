'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const categories=fs.readFileSync('js/views/tournaments-categories.js','utf8');
const getterStart=categories.indexOf('window._getTournamentCategories = function(t) {');
const getterEnd=categories.indexOf('window._displayTournamentCategory',getterStart);
assert(getterStart>=0&&getterEnd>getterStart);
const categoryWindow={};
vm.runInNewContext(categories.slice(getterStart,getterEnd),{window:categoryWindow});
const canonical={canonicalRegistrationMigration:{fingerprint:'fp'},categoryDefinitions:[],
  combinedCategories:['Removida'],genderCategories:['Removida']};
assert.deepEqual(Array.from(categoryWindow._getTournamentCategories(canonical)),[],
  'lista tipada vazia não recupera rótulo excluído');
delete canonical.categoryDefinitions;
assert.deepEqual(Array.from(categoryWindow._getTournamentCategories(canonical)),[],
  'definições ausentes em roster canônico falham fechadas');
assert.deepEqual(Array.from(categoryWindow._getTournamentCategories({combinedCategories:['Legada']})),['Legada'],
  'roster legado conserva seus rótulos');

const report=fs.readFileSync('js/views/tournaments-enrollment-report.js','utf8');
const instrumented=report.replace(/\}\)\(\);\s*$/,
  'window.__e14SetState=function(state){_liveState=state;};\n})();');
assert.notEqual(instrumented,report);
const tournament={id:'e14',genderCategories:[],skillCategories:['Light'],combinedCategories:['Light']};
const notices=[];
const window={AppStore:{tournaments:[tournament]},_callCF:()=>Promise.reject(new Error('servidor recusou'))};
vm.runInNewContext(instrumented,{window,document:{getElementById:()=>null},Promise,Date,Math,JSON,
  setTimeout:()=>0,clearTimeout:()=>{},showNotification:(...args)=>notices.push(args),console});
window.__e14SetState({isOrg:true,t:tournament,rows:[]});
window._erRenderMatrix=()=>{};
(async()=>{
  window._erToggleGender('e14',null);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(Array.from(tournament.genderCategories),[], 'recusa restaura eixo confirmado');
  assert.deepEqual(Array.from(tournament.combinedCategories),['Light'], 'recusa restaura rótulo confirmado');
  assert.equal(notices.length,1);
  window._callCF=undefined;
  window._erToggleGender('e14',null);
  assert.deepEqual(Array.from(tournament.genderCategories),[], 'offline restaura eixo confirmado');
  assert.deepEqual(Array.from(tournament.combinedCategories),['Light'], 'offline restaura rótulo confirmado');
  assert.equal(notices.length,2);
  const payloads=[];
  tournament.canonicalRegistrationMigration={fingerprint:'fp'};
  tournament.categoryDefinitions=[];
  tournament.genderCategories=['Removida'];
  tournament.skillCategories=[];
  tournament.combinedCategories=['Removida'];
  window._getTournamentCategories=categoryWindow._getTournamentCategories;
  window._callCF=(_name,payload)=>{payloads.push(payload);return Promise.resolve({ok:true});};
  window._erToggleGender('e14',null);
  assert.deepEqual(Array.from(payloads[0].genderCategories),['Fem','Masc']);
  assert.deepEqual(Array.from(payloads[0].skillCategories),[]);
  assert.deepEqual(Array.from(payloads[0].expectedCategoryDefinitions),[],
    'configuração envia a versão tipada para CAS no servidor');
  assert.deepEqual(Array.from(tournament.combinedCategories),['Fem','Masc'],
    'toggle canônico não recria rótulo retirado de eixo antigo');
  console.log('✓ E14 UI: categoria removida não reaparece e toggle recusado/offline reverte');
})().catch(error=>{console.error(error);process.exitCode=1;});
