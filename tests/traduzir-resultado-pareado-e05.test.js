'use strict';

const assert = require('node:assert/strict');
const core = require('../scripts/traduzir-resultado-pareado-e05-core.js');

const tournament = { id: 'private-tournament', name: 'private tournament name',
  participants: [{ displayName: 'private player one', uid: 'private-uid-one' },
    { displayName: 'private player two', uid: 'private-uid-two' }] };
const game = () => ({ id: 'private-match', p1: 'private player one', p2: 'private player two' });
const match = (extra = {}, gameExtra = {}) => ({ jogo: { ...game(), ...gameExtra }, ...extra });
const result = (extra = {}) => ({ matchId: 'private-match', ...extra });
const pair = (m, r) => core.translatePair(tournament, 'private-match', m, 'private-match', r);

{
  const source = match({}, { scoreP1: 6, scoreP2: 4 });
  const got = pair(source, result({ scoreP1: 6, scoreP2: 4,
    pendingResult: { at: 1 }, replay: { points: [{ side: 1 }] },
    playerUids: ['private-uid-two', 'private-uid-one'] }));
  assert.equal(got.status, 'ready');
  assert.equal(got.copied, 2);
  assert.equal(got.proposed.jogo.scoreP1, 6);
  assert.deepEqual(got.proposed.jogo.pendingResult, { at: 1 });
  assert.deepEqual(got.proposed.jogo.replay, { points: [{ side: 1 }] });
  assert.deepEqual(new Set(got.proposed.playerUids), new Set(['private-uid-one', 'private-uid-two']));
  assert.equal(source.jogo.replay, undefined);
}
{
  const got = pair(match({}, { sets: { b: [1, 2], a: { x: 1, y: 2 } } }),
    result({ sets: { a: { y: 2, x: 1 }, b: [1, 2] } }));
  assert.equal(got.status, 'ready');
  assert.equal(got.copied, 0);
}
{
  const got = pair(match({}, { winnerUids: ['private-uid-one'] }),
    result({ winnerUids: ['private-uid-one'], winnerUid: 'private-uid-one' }));
  assert.equal(got.status, 'ready');
  assert.equal(got.copied, 1);
  assert.deepEqual(got.proposed.jogo.winnerUids, ['private-uid-one']);
  assert.equal(got.proposed.jogo.winnerUid, 'private-uid-one');
  assert.equal(pair(match({}, { winnerUids: ['private-uid-one'] }),
    result({ winnerUids: ['private-uid-two'] })).reason, core.REASONS.resultConflict);
}
for (const value of [null, '', [], {}]) {
  const got = pair(match({}, { pendingResult: value }), result({ pendingResult: 'different' }));
  assert.equal(got.reason, core.REASONS.resultConflict);
}
{
  const got = pair(match({}, { scoreP1: 5, replay: { points: [1] } }),
    result({ scoreP1: 6, replay: { points: [2] } }));
  assert.equal(got.reason, core.REASONS.resultConflict);
  assert.deepEqual(got.conflictKinds, ['replay', 'scoreDiff']);
}
{
  const got = pair(match({}, { p1: 'current display' }),
    result({ p1: 'old display', tournamentName: 'old name', roundLabel: 'old round' }));
  assert.equal(got.status, 'ready');
  assert.equal(got.displayDifferences, 3);
  assert.equal(got.proposed.jogo.p1, 'current display');
}
assert.equal(pair(match(), result({ playerUids: ['wrong-uid'] })).reason, core.REASONS.uidConflict);
assert.equal(pair(match({ playerUids: ['wrong-uid'] }), result()).reason, core.REASONS.uidConflict);
assert.equal(pair(match(), result({ playerUids: 'bad' })).reason, core.REASONS.invalidUid);
assert.equal(pair(match(), result({ unexpected: 'secret' })).reason, core.REASONS.unknownField);
assert.equal(pair(match(), result({ matchId: 'different' })).reason, core.REASONS.invalidPair);
assert.equal(pair(match(), result({ tournamentId: 'different' })).reason, core.REASONS.invalidPair);
assert.equal(core.translatePair(tournament, 'private-match', match(), 'different', result()).reason,
  core.REASONS.invalidPair);
{
  const guestGame = { id: 'private-match', p1: 'unregistered guest' };
  const got = pair({ jogo: guestGame }, result());
  assert.equal(got.status, 'ready');
  assert.equal(got.proposed.playerUids, undefined);
  assert.equal(pair({ jogo: guestGame }, result({ playerUids: ['wrong-uid'] })).reason,
    core.REASONS.uidConflict);
}
{
  const source = [{ id: 'private-match', data: match() }];
  const duplicates = [{ id: 'private-match', data: result() }, { id: 'private-match', data: result() }];
  const got = core.translateCollection(tournament, source, duplicates);
  assert.equal(got.proposals.size, 0);
  assert.equal(got.report.reasons.duplicate_result, 1);
}
{
  const got = core.translateCollection(tournament, [], [{ id: 'private-match', data: result() }]);
  assert.equal(got.report.orphanResults, 1);
  assert.equal(got.proposals.size, 0);
}
{
  const got = core.translateCollection(tournament,
    [{ id: 'private-match', data: match() }],
    [{ id: 'private-match', data: result({ scoreP1: 6, replay: { notes: 'private score' } }) }]);
  const serialized = JSON.stringify(got.report);
  for (const secret of ['private-tournament', 'private-match', 'private player one',
    'private-uid-one', 'private score']) assert.equal(serialized.includes(secret), false);
  assert.equal(got.report.pairedReady, 1);
}

console.log('✓ E05 tradução pareada pura');
