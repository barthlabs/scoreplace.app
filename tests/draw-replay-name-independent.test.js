'use strict';
const assert = require('node:assert/strict');
const core = require('../functions-autodraw/draw-core.js');
const { withSeed } = require('../functions-autodraw/draw-seed-core.js');
function tournament(name) {
  return { id: 'same-input', name, sport: 'Beach Tennis', format: 'Eliminatórias Simples',
    status: 'open', rulesContractVersion: 2, creatorUid: 'org',
    participants: Array.from({ length: 8 }, (_, i) => ({ uid: 'u' + i, name: 'P' + i, displayName: 'P' + i })) };
}
function draw(name, seed) {
  const t = tournament(name);
  const result = withSeed(seed, () => core.drawInitial(t, { idStamp: 12345 }));
  assert.equal(result.ok, true, result.reason);
  return (t.matches || []).map(m => [m.id, m.p1, m.p2, m.nextMatchId || null]);
}
assert.deepEqual(draw('Exemplo A', 'seed-1'), draw('Outro nome', 'seed-1'));
console.log('draw-replay-name-independent: OK');
