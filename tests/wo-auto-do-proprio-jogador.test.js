'use strict';
const assert = require('assert'); const fs=require('fs'); const {transition}=require('../functions-autodraw/wo-claim-core.js');
const c={key:'m|1',scope:'match',matchId:'m1',memberUids:['ua','ub','uc','ud'],members:[['ua','A'],['ub','B'],['uc','C'],['ud','D']].map(x=>({uid:x[0],name:x[1]})),match:{id:'m1'},matchSides:{p1:{name:'A / B',uids:['ua','ub']},p2:{name:'C / D',uids:['uc','ud']}}};
const t={woScope:'individual',woClaims:[]}; const r=transition(t,{action:'declare',uid:'ua',absentUid:'ua',claimId:'self',context:c});
assert(r.ok && r.claim.selfDeclared && r.claim.factConfirmed,'auto-W.O. confirma o fato no servidor');
assert(r.claim.outcomeStage==='awaiting-proposal' && r.claim.outcomePartnerUid==='ub','dupla preserva proposta do parceiro');
const src=fs.readFileSync('js/views/wo-claim.js','utf8'); assert(src.includes("_claimServer(tId, {\n      action: 'declare'"),'tela só dispara a Function'); assert(!src.includes('function _applyClaimViaGate'),'aplicação local foi removida');
console.log('wo-auto-do-proprio-jogador: 4 asserts OK');
