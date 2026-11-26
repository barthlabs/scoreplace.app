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
const fiveRounds = core.build(people, 5);
assert.equal(fiveRounds.rounds.length, 5);
const fiveRoundPartners = new Set(), appearances = new Map(people.map((id) => [id, 0]));
for (const round of fiveRounds.rounds) {
  assert.equal(round.length, 2);
  assert.deepEqual(round.flat(2).slice().sort(), people);
  for (const [left, right] of round) {
    for (const player of left.concat(right)) appearances.set(player, appearances.get(player) + 1);
    for (const side of [left, right]) {
      const key = side.slice().sort().join(':');
      assert.equal(fiveRoundPartners.has(key), false);
      fiveRoundPartners.add(key);
    }
  }
}
assert.deepEqual(Array.from(appearances.values()), Array(8).fill(5));
assert.equal(fiveRoundPartners.size, 20);
console.log('✓ oito atletas, sete rodadas, 28 parcerias únicas e escolha de confrontos calculada');
console.log('✓ cinco rodadas: todos jogam cinco vezes e nenhum parceiro se repete');

assert.equal(core.gamesRate({gamesWon:4,gamesLost:3}),4/7);
assert.equal(core.gamesRate({gamesWon:3,gamesLost:4}),3/7);
assert.equal(core.gamesRate({gamesWon:7,gamesLost:0}),1);
assert.equal(core.gamesRate({gamesWon:13,gamesLost:8}),13/21);
assert.equal(core.gamesRate({gamesWon:0,gamesLost:0}),0);
assert.equal(core.gamesRate({gamesWon:NaN,gamesLost:Infinity}),0);
console.log('✓ percentual usa games ganhos sobre games disputados, inclusive placar zerado');
