'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/views/tournaments-enrollment-report.js','utf8');
const instrumented=source.replace(/\}\)\(\);\s*$/,
  'window.__e13SetState=function(state,pending){_liveState=state;_pendingEdits=pending;};\n'+
  'window.__e13Pending=function(){return _pendingEdits;};\n})();');
assert.notEqual(instrumented,source);
const requests=[],notices=[];
const window={
  _isCanonicalCategoryRoster:()=>true,
  _canonicalCategoryIdForDisplay:(_t,value)=>({A:'a',B:'b',a:'a',b:'b'}[value]||''),
  FirestoreDB:{_callFn:(name,payload)=>new Promise((resolve,reject)=>requests.push({name,payload,resolve,reject}))},
  _erUpdateSaveBar:()=>{},
};
const context={window,document:{getElementById:()=>null},Promise,Date,Math,JSON,
  setTimeout:()=>0,clearTimeout:()=>{},showNotification:(...args)=>notices.push(args),console};
vm.runInNewContext(instrumented,context);
const state={isOrg:true,t:{id:'tour_e13',canonicalRegistrationMigration:{fingerprint:'fp'},
  categoryDefinitions:[{id:'a',label:'A'},{id:'b',label:'B'}]},
  rows:[{order:1,uid:'alice',manualId:'',categoryId:'a',assigned:['A']}]};
(async()=>{
  window.__e13SetState(state,{'1':{category:'B'}});
  const first=window._erSaveEdits('tour_e13','Beach Tennis');
  await Promise.resolve();
  assert.equal(requests.length,1);
  assert.equal(window._erSaveEdits('tour_e13','Beach Tennis'),undefined,'clique duplo não envia outra chamada');
  requests[0].resolve({data:{ok:true,changed:1}});
  await first;
  assert.equal(Object.keys(window.__e13Pending()).length,1,'resposta desconhecida conserva staged');
  assert.equal(notices.filter((item)=>item[2]==='success').length,0,'sem sucesso falso');
  const retry=window._erSaveEdits('tour_e13','Beach Tennis');
  await Promise.resolve();
  assert.equal(requests.length,2);
  assert.equal(requests[1].payload.operationId,requests[0].payload.operationId,'retry conserva operationId');
  requests[1].reject(new Error('rede indisponível'));
  await retry;
  assert.equal(Object.keys(window.__e13Pending()).length,1,'erro de rede conserva staged');
  const final=window._erSaveEdits('tour_e13','Beach Tennis');
  await Promise.resolve();
  requests[2].resolve({data:{ok:true,outcome:'assigned',changed:1,resolvedEntries:1,
    operationId:requests[2].payload.operationId}});
  await final;
  assert.equal(Object.keys(window.__e13Pending()).length,0,'somente recibo confirmado limpa staged');
  assert.equal(notices.filter((item)=>item[2]==='success').length,1);
  console.log('✓ E13 UI: clique duplo, resposta desconhecida, erro e retry conservam staged');
})().catch((error)=>{console.error(error);process.exitCode=1;});
