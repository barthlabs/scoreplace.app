'use strict';
const assert = require('node:assert/strict');
const split = require('../js/views/tournament-split-core');
const plan = require('../functions-autodraw/write-plan');

const before = { id: 't', name: 'T', isPublic: true, organizerOnly: false,
  matches: [{ id: 'm', p1: 'Ana', p2: 'Bia', winner: 'Ana', score1: 6, score2: 4 }], participants: [] };
const hidden = { ...before, isPublic: false, organizerOnly: true };
const ctx = (extra = {}) => ({ split, boundary: t => ({ persist: t }),
  agoraIso: '2026-11-02T00:00:00.000Z', ...extra });

for (const [oldValue, newValue] of [[before, hidden], [hidden, before]]) {
  const p = plan.planWrites(oldValue, newValue, ctx());
  assert.equal(p.ops.filter(op => op.colecao === null).length, 1, 'visibilidade muda na raiz');
  assert.equal(p.ops.filter(op => op.colecao === 'matches').length, 0, 'placar físico não muda');
  assert.equal(p.ops.filter(op => ['results', 'resultsSandbox', 'resultVisibilityFence'].includes(op.colecao)).length, 0,
    'nenhum espelho ou fence é escrito');
}
assert.equal(plan.COLECOES_FIXAS.includes('results'), false, 'executor não aceita results');
assert.equal(plan.COLECOES_FIXAS.includes('resultsSandbox'), false, 'executor não aceita resultsSandbox');
assert.equal(plan.COLECOES_FIXAS.includes('resultVisibilityFence'), false, 'executor não aceita fence legado');
assert.throws(() => plan.planWrites(before, hidden, ctx({ visibilityResults: { mode: 'hide', entries: [] } })),
  /transição obsoleta/, 'chamador legado é recusado antes de qualquer escrita');
assert.throws(() => plan.planWrites(before, hidden, ctx({ resultCollection: 'results' })),
  /transição obsoleta/, 'coleção de resultado legada é recusada');
console.log('E05: visibilidade usa somente raiz e jogos físicos; plano recusa results');
