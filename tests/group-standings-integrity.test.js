'use strict';

const assert = require('assert');
const E = require('../js/views/phases-engine.js');

const first = { id: 'j1', p1: 'Ana', p2: 'Bia', p1Uid: 'u-ana', p2Uid: 'u-bia',
  scoreP1: 6, scoreP2: 3, winner: 'Ana' };
const group = { players: [{ name: 'Ana', uid: 'u-ana' }, { name: 'Bia', uid: 'u-bia' }],
  matches: [first], rounds: [{ matches: [Object.assign({}, first)] }] };
const rows = E.groupTeamStandings(group);
assert.strictEqual(rows.length, 2);
assert.strictEqual(rows.find(row => row.uid === 'u-ana').played, 1,
  'jogo presente no grupo e na rodada conta uma única vez');
assert.strictEqual(rows.find(row => row.uid === 'u-ana').points, 3);

console.log('✅ group-standings-integrity');
