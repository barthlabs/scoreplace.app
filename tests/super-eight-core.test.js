'use strict';
const assert = require('node:assert/strict');
const core = require('../js/views/super-eight-core.js');
const people = Array.from({ length: 8 }, (_, i) => 'u' + i);
const plan = core.build(people);
assert.equal(plan.rounds.length, 7);
const partners = new Set(), opponents = new Map();
for (const round of plan.rounds) {
  assert.equal(round.length, 2);
  assert.deepEqual(round.flat(2).slice().sort(), people);
  for (const [left, right] of round) {
    for (const side of [left, right]) {
      assert.equal(side.length, 2);
      partners.add(side.slice().sort().join(':'));
    }
    for (const a of left) for (const b of right) {
      const key = [a, b].sort().join(':'); opponents.set(key, (opponents.get(key) || 0) + 1);
    }
  }
}
assert.equal(partners.size, 28);
assert.equal(opponents.size, 27);
assert.equal(plan.opponentRepeatScore, 28);
assert.equal(Math.max(...opponents.values()), plan.maxOpponents);
assert.throws(() => core.build(people.slice(0, 7)));
console.log('✓ oito atletas, sete rodadas, 28 parcerias únicas e escolha de confrontos calculada');
