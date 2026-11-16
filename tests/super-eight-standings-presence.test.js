'use strict';
const assert = require('node:assert/strict');
const draw = require('../functions-autodraw/draw-core.js');
const w = draw._window;

const uid = 'kelly-uid';
const names = ['Kelly Barth', 'Jogador 02', 'Jogador 03', 'Jogador 04',
  'Jogador 05', 'Jogador 06', 'Jogador 07', 'Jogador 08'];
const match = {
  id: 'round-2-match', phaseIndex: 0, round: 2, isMonarch: true,
  p1: 'Jogador 04 / Jogador 03', p2: 'Kelly Barth / Jogador 06',
  team1: ['Jogador 04', 'Jogador 03'], team1Uids: [null, null],
  team2: ['Kelly Barth', 'Jogador 06'], team2Uids: [uid, null],
  scoreP1: 3, scoreP2: 6, sets: [{ gamesP1: 3, gamesP2: 6 }],
  winner: 'Kelly Barth / Jogador 06', resultAt: Date.now()
};
const tournament = {
  id: 'super-eight-canonical', superEight: true, superEightDrawMode: 'single',
  rankingPrimary: 'games_diff', rounds: [],
  matches: [match, ...Array.from({ length: 13 }, (_, i) => ({
    id: 'pending-' + i, phaseIndex: 0, isMonarch: true, winner: null
  }))],
  // A inscrição da Kelly no storage canônico contém só UID. Um rótulo legado
  // que não aparece no sorteio não pode criar uma nona linha na classificação.
  participants: [{ uid }, { name: 'Jogador 01' }, ...names.slice(1).map(name => ({ name }))],
  superEightOrders: { _default_: names.map(name => ({ name, uid: name === 'Kelly Barth' ? uid : null })) },
  checkedIn: {}, absent: { [uid]: Date.now() }
};

const overall = w._computeStandings(tournament);
assert.equal(overall.length, 8);
assert.deepEqual(overall.filter(s => s.wins).map(s => [s.name, s.gamesDiff]).sort(),
  [['Jogador 06', 3], ['Kelly Barth', 3]]);
assert.deepEqual(overall.filter(s => s.losses).map(s => [s.name, s.gamesDiff]).sort(),
  [['Jogador 03', -3], ['Jogador 04', -3]]);
assert.equal(overall.some(s => s.name === 'Jogador 01'), false);

const group = w._computeMonarchStandings({
  players: names, playersUids: names.map(name => name === 'Kelly Barth' ? uid : null),
  matches: tournament.matches
}, tournament);
assert.equal(group.find(s => s.uid === uid).gamesWon, 6);
assert.equal(group.find(s => s.uid === uid).gamesLost, 3);
assert.equal(group.find(s => s.name === 'Jogador 04').losses, 1);

w._checkInScoredMatch(tournament, match, match.resultAt);
assert.equal(tournament.checkedIn[uid], match.resultAt);
assert.equal(tournament.absent[uid], undefined);
assert.equal(Object.keys(tournament.checkedIn).length, 4);
console.log('✓ Super 8 canônico: saldo cumulativo e presença dos quatro atletas');
