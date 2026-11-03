'use strict';
const assert = require('node:assert/strict');
const { nextPhaseLateEnrollment } = require('../functions-autodraw/phase-late-enrollment-core.js');
const server = require('../functions-autodraw/draw-core.js')._window;
const client = require('./render-harness').window;

assert.deepEqual(nextPhaseLateEnrollment('closed'),
  { lateEnrollment: 'closed', newMatchups: false },
  'fechar inscrições desliga novos confrontos');
assert.deepEqual(nextPhaseLateEnrollment('expand'),
  { lateEnrollment: 'expand', newMatchups: true });
assert.deepEqual(nextPhaseLateEnrollment('standby'),
  { lateEnrollment: 'standby', newMatchups: false });
assert.equal(server._allowsNewMatchups({ lateEnrollment:'closed', newMatchups:true }), true,
  'torneio legado mantém a escolha explícita de novos confrontos');
assert.equal(server._allowsNewMatchups({ lateEnrollment:'closed', newMatchups:false,
  phases:[{ newMatchups:true }], currentPhaseIndex:0 }), true,
  'escolha da fase legada prevalece sobre o topo');
assert.equal(server._allowsNewMatchups({ rulesContractVersion:2, lateEnrollment:'closed', newMatchups:true }), false,
  'contrato novo exige inscrições abertas');
assert.equal(server._allowsNewMatchups({ rulesContractVersion:2, lateEnrollment:'standby', newMatchups:true }), true,
  'com inscrições abertas a organização pode ligar novos confrontos');
for (const tournament of [
  { lateEnrollment:'closed', newMatchups:true },
  { rulesContractVersion:2, lateEnrollment:'closed', newMatchups:true },
  { lateEnrollment:'closed', newMatchups:false, phases:[{ newMatchups:true }], currentPhaseIndex:0 }
]) {
  assert.equal(client._allowsNewMatchups(tournament), server._allowsNewMatchups(tournament),
    'cliente e Function concordam para o mesmo documento de inscrição tardia');
}
console.log('Entrada tardia: novos confrontos dependem de inscrições abertas OK');
