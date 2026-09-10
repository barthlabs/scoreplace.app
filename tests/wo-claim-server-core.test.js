'use strict';
const assert = require('assert');
const { transition } = require('../functions-autodraw/wo-claim-core.js');

function fixture() {
  const t = { woScope: 'individual', woClaims: [] };
  const context = {
    key: 'm|m1', scope: 'match', matchId: 'm1', memberUids: ['ua','ub','uc','ud'],
    members: [{uid:'ua',name:'A'},{uid:'ub',name:'B'},{uid:'uc',name:'C'},{uid:'ud',name:'D'}],
    match: { id: 'm1' }, matchSides: { p1: { name:'A / B', uids:['ua','ub'] }, p2: { name:'C / D', uids:['uc','ud'] } }
  };
  return { t, context };
}
let pass = 0;
function ok(v, m) { assert(v, m); pass++; }
const declared = fixture();
let r = transition(declared.t, { action:'declare', uid:'ub', absentUid:'ua', byName:'B', claimId:'c1', context:declared.context, now:'2026-09-10T12:00:00Z' });
ok(r.ok && r.claim.status === 'pending', 'participante cria apontamento no contexto fresco');
r = transition(declared.t, { action:'confirm', uid:'uc', claimId:'c1', context:declared.context });
ok(r.ok && !r.apply && r.claim.outcomeStage === 'awaiting-proposal', 'adversário confirma falta individual de dupla sem decidir o jogo');
r = transition(declared.t, { action:'propose', uid:'ub', claimId:'c1', choice:'advance', context:declared.context });
ok(r.ok && r.claim.outcomeStage === 'proposed', 'parceiro propõe o desfecho');
r = transition(declared.t, { action:'accept', uid:'uc', claimId:'c1', context:declared.context });
ok(r.ok && r.apply && r.choice === 'advance', 'adversário aceita e pede aplicação atômica');
const self = fixture();
r = transition(self.t, { action:'declare', uid:'ua', absentUid:'ua', byName:'A', claimId:'self', context:self.context });
ok(r.ok && !r.apply && r.claim.outcomeStage === 'awaiting-proposal', 'auto-W.O. de dupla preserva negociação do desfecho');
const denied = fixture();
r = transition(denied.t, { action:'declare', uid:'outsider', absentUid:'ua', byName:'X', claimId:'bad', context:denied.context });
ok(!r.ok && r.reason === 'permission-denied', 'estranho não cria apontamento');
const guest = fixture();
guest.context.members.push({ uid:'', name:'Convidado' });
r = transition(guest.t, { action:'declare', uid:'ub', absentName:'Convidado', byName:'B', claimId:'guest', context:guest.context });
ok(r.ok && r.claim.absentName === 'Convidado' && !r.claim.absentUids.length, 'convidado legado mantém a identidade por nome');
console.log('wo-claim-server-core: ' + pass + ' asserts OK');
