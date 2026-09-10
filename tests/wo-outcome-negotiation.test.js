'use strict';
const assert = require('assert');
const { transition } = require('../functions-autodraw/wo-claim-core.js');
let n=0; const ok=(v,m)=>{assert(v,m);n++;};
function fixture(scope) { const c={key:'m|1',scope:scope||'match',matchId:'m1',memberUids:['ua','ub','uc','ud'],members:[['ua','A'],['ub','B'],['uc','C'],['ud','D']].map(x=>({uid:x[0],name:x[1]})),match:{id:'m1'},matchSides:{p1:{name:'A / B',uids:['ua','ub']},p2:{name:'C / D',uids:['uc','ud']}}}; return {t:{woScope:'individual',woClaims:[]},c}; }
let x=fixture(); let r=transition(x.t,{action:'declare',uid:'ub',absentUid:'ua',claimId:'c',context:x.c});
ok(r.ok && r.claim.status==='pending','apontamento nasce no servidor');
r=transition(x.t,{action:'confirm',uid:'uc',claimId:'c',context:x.c});
ok(r.ok && r.claim.outcomeStage==='awaiting-proposal','confirmação abre negociação');
ok(r.claim.outcomePartnerUid==='ub' && r.claim.outcomeOppUids.includes('uc'),'servidor deriva parceiros e adversários');
r=transition(x.t,{action:'propose',uid:'ub',claimId:'c',choice:'advance',context:x.c});
ok(r.ok && r.claim.outcomeStage==='proposed','parceiro propõe');
r=transition(x.t,{action:'accept',uid:'uc',claimId:'c',context:x.c});
ok(r.ok && r.apply && r.choice==='advance','adversário aceita e pede aplicação atômica');
x=fixture(); r=transition(x.t,{action:'declare',uid:'ub',absentUid:'ua',claimId:'c',context:x.c}); r=transition(x.t,{action:'confirm',uid:'uc',claimId:'c',context:x.c}); r=transition(x.t,{action:'propose',uid:'ub',claimId:'c',choice:'ghost',context:x.c}); r=transition(x.t,{action:'reject',uid:'uc',claimId:'c',context:x.c});
ok(r.ok && r.claim.outcomeStage==='escalated','rejeição escala ao organizador');
r=transition(x.t,{action:'choose',uid:'org',isAdmin:true,claimId:'c',choice:'ghost',context:x.c});
ok(r.ok && r.apply && r.choice==='ghost','organizador escolhe no servidor');
console.log('wo-outcome-negotiation: '+n+' asserts OK');
