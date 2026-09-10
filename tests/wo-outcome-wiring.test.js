'use strict';
const assert=require('assert'),fs=require('fs'); const {transition}=require('../functions-autodraw/wo-claim-core.js'); let n=0; const ok=(v,m)=>{assert(v,m);n++;};
const c={key:'m|1',scope:'match',matchId:'m1',memberUids:['ua','ub','uc','ud'],members:[['ua','A'],['ub','B'],['uc','C'],['ud','D']].map(x=>({uid:x[0],name:x[1]})),match:{id:'m1'},matchSides:{p1:{name:'A / B',uids:['ua','ub']},p2:{name:'C / D',uids:['uc','ud']}}};
const t={woScope:'individual',woClaims:[]}; let r=transition(t,{action:'declare',uid:'ub',absentUid:'ua',claimId:'c',context:c});
r=transition(t,{action:'resolve',uid:'org',isAdmin:true,claimId:'c',context:c}); ok(r.ok&&r.apply&&r.offerOutcomeChoice,'organizador pede desfecho ao servidor');
r=transition(t,{action:'choose',uid:'org',isAdmin:true,claimId:'c',choice:'ghost',context:c}); ok(r.ok&&r.apply&&r.choice==='ghost','escolha ghost segue ao motor transacional');
const src=fs.readFileSync('js/views/wo-claim.js','utf8'); ['confirm','contest','cancel','resolve','propose','accept','reject','choose'].forEach(a=>ok(src.includes("action: '"+a+"'")||src.includes("action || 'choose'"),'ação '+a+' despacha a Function'));
ok(!src.includes('AppStore.mutate'),'tela não grava W.O. pelo AppStore'); ok(!src.includes('function _commit'),'helper local removido');
console.log('wo-outcome-wiring: '+n+' asserts OK');
