'use strict';

const assert = require('assert');
const P = require('../js/views/bracket-policy.js');
const scope = { phaseIndex: 1, category: 'Fem Light', line: 'ouro', bracket: 'main', round: 3 };
assert.strictEqual(P.surplusEntryIdentity({ manualParticipantId: 'm1', name: 'Jogador 97' }), 'manual:m1');
assert.strictEqual(P.surplusEntryIdentity({ p1Uid: 'b', p2Uid: 'a' }), 'uid:a+b');
assert.strictEqual(P.surplusEntryIdentity({ name: 'Pessoa sem ID' }), '', 'nome não vira UID fictício');
const eligible = [
  { sourceId: 'winner:r2-a', identity: 'manual:m1' },
  { sourceId: 'winner:r2-b', identity: 'uid:u2' },
  { sourceId: 'winner:r2-c', identity: 'uid:u3' }
];
const first = P.prepareSurplusDecision({}, scope, eligible, ['manual:m1']);
assert.strictEqual(first.decision.recipientSourceId, 'winner:r2-b', 'alternância prefere quem não folgou');
assert.strictEqual(first.decision.recipientIdentity, 'uid:u2');
const retry = P.prepareSurplusDecision({ [first.key]: first.decision }, scope, eligible, []);
assert.strictEqual(retry.reused, true, 'retry não reescolhe por outro histórico');
assert.deepStrictEqual(retry.decision, first.decision);
assert.notStrictEqual(P.surplusDecisionKey({ ...scope, category: 'Masc Light' }), first.key,
  'categorias não compartilham decisão');
assert.notStrictEqual(P.surplusDecisionKey({ ...scope, phaseIndex: 0 }), first.key,
  'fases não compartilham decisão');
assert.throws(() => P.prepareSurplusDecision({ [first.key]: first.decision }, scope,
  [eligible[0], eligible[1], { sourceId: 'winner:r2-c', identity: 'uid:outro' }], []),
  /obsoleta/, 'vencedor substituído não reutiliza decisão velha');
assert.throws(() => P.prepareSurplusDecision({}, scope,
  [eligible[0], eligible[0], eligible[2]], []), /únicas/,
  'identidades duplicadas falham fechado');
console.log('✓ recibo da sobra usa identidade real, escopo completo e retry idempotente');
