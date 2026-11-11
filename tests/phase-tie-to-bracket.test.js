'use strict';
const assert = require('node:assert/strict');
global.window = global;
require('../js/views/format2.js');
const engine = require('../js/views/phases-engine.js');
const tie = require('../functions-autodraw/phase-tie-core');

const mapping = [
  { dest: 'line_a', rankFrom: 1, rankTo: 2 },
  { dest: 'line_b', rankFrom: 3, rankTo: 4 }
];
const nextPhase = { fixedPairs: true, pairingStrategy: 'top', source: { scope: 'per_group', mapping } };
const rows = ['A', 'B', 'C', 'D'].map((name, index) => ({ uid: name, name, wins: index ? 1 : 3 }));
const pool = [{ id: 'group-0', rows }];
const compare = () => {
  const cmp = (a, b) => b.wins - a.wins;
  cmp.originalOrder = { A: 0, B: 1, C: 2, D: 3 };
  return cmp;
};

function entrants(name, decision) {
  const group = { name, standings: decision.orderedPools[0].rows };
  return engine.buildEntrantsByDest([group], mapping, true, g => g.standings, 'top', { scope: 'per_group' });
}
function pairs(byDest, dest) {
  return (byDest[dest] || []).map(team => (team.participants || []).map(p => p.name).join('+'));
}

const tournamentDraw = {};
const direct = tie.resolvePhaseTies(tournamentDraw, 0, pool, nextPhase, compare, null, 1, true);
assert.equal(direct.status, 'ready');
const oldOrder = entrants('Qualquer nome 1', direct);
assert.deepEqual(pairs(oldOrder, 'line_a'), ['A+B']);
assert.deepEqual(pairs(oldOrder, 'line_b'), ['C+D']);

const tournamentTriangular = {};
let flow = tie.resolvePhaseTies(tournamentTriangular, 0, pool, nextPhase, compare, null, 1);
assert.equal(flow.status, 'choice');
flow = tie.resolvePhaseTies(tournamentTriangular, 0, pool, nextPhase, compare,
  { type: 'play', decisionId: flow.tie.decisionId }, 1);
for (const scores of [[4, 5], [4, 5]]) {
  const nextMatch = flow.decision.matches.find(match => !match.winnerKey);
  assert.ok(nextMatch, 'a próxima simples surge após o resultado anterior');
  flow = tie.resolvePhaseTies(tournamentTriangular, 0, pool, nextPhase, compare,
    { type: 'score', decisionId: flow.tie.decisionId,
      matchId: nextMatch.id, sets: [{ p1: scores[0], p2: scores[1] }] }, 1);
}
assert.equal(flow.status, 'review');
assert.equal(flow.decision.matches.length, 2, 'duas simples resolveram a vaga restante');
flow = tie.resolvePhaseTies(tournamentTriangular, 0, pool, nextPhase, compare,
  { type: 'confirm', decisionId: flow.tie.decisionId, at: '2026-11-03T12:00:00.000Z' }, 1);
assert.equal(flow.status, 'ready');
const afterPlay = entrants('Outro nome sem regra especial', flow);
assert.deepEqual(pairs(afterPlay, 'line_a'), ['A+D']);
assert.deepEqual(pairs(afterPlay, 'line_b'), ['C+B']);
console.log('phase-tie-to-bracket: ok');
