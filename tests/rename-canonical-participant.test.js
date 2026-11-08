'use strict';
const assert = require('node:assert/strict');
const core = require('../functions/rename-canonical-participant-core');
const { registrationId } = require('../functions/registration-core');

function manual(id, name, categoryId = 'cat-a') {
  const key = 'manual:' + id;
  return { registrationId: registrationId(key, categoryId), tournamentId: 't1', categoryId,
    participantKey: key, participantKind: 'manual', participantUid: null, manualParticipantId: id,
    manualDisplayName: name, status: 'confirmed', validationState: 'approved', fixedPairId: null };
}
const roster = [manual('m1', 'Kelly Cristina'), manual('m2', 'Ana', 'cat-b')];
const tournament = { id: 't1', participants: [], canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 2 } };
const input = { manualParticipantId: 'm1', oldName: 'Kelly Cristina', newName: 'Kelly Barth' };
const game = { id: 'game-1', p1: 'Kelly Cristina / Ana', team1Obj: {
  p1ManualId: 'm1', p1Name: 'Kelly Cristina', p2ManualId: 'm2', p2Name: 'Ana' },
  team2Obj: { p1ManualId: 'm3', p1Name: 'Outra' } };
const result = core.plan(tournament, roster, input, [], [{ ref: 'game-1', data: { jogo: game } }]);
assert.equal(result.target.registrationId, roster[0].registrationId);
assert.equal(result.documents[0].data.jogo.team1Obj.p1Name, 'Kelly Barth');
assert.equal(result.documents[0].data.jogo.team1Obj.p2Name, 'Ana');
assert.equal(result.documents[0].data.jogo.p1, 'Kelly Barth / Ana');
assert.deepEqual(tournament.participants, []);
assert.equal(roster[0].manualDisplayName, 'Kelly Cristina');
assert.throws(() => core.plan({ id: 't1' }, roster, input, [], []), /canônicas/);
assert.throws(() => core.plan({ id: 't1', canonicalRegistrationMigration: { fingerprint: 'fp' } }, roster, input, [], []), /inválido/);
assert.throws(() => core.plan(tournament, roster, { ...input, newName: 'Ána' }, [], []), /já há inscrito/);
assert.throws(() => core.plan(tournament, roster, input, ['Kelly Cristina'], []), /ambíguo/);
assert.throws(() => core.plan(tournament, roster, input, ['Kelly Barth'], []), /conta/);
assert.equal(core.plan(tournament, roster, input, [], [{ ref: 'game-1', data: { jogo: { p1: 'Kelly Cristina' } } }])
  .documents[0].data.jogo.p1, 'Kelly Barth');
assert.equal(core.plan({ ...tournament, absent: { 'Kelly Cristina': true } }, roster, input, [], [])
  .rootPatch.absent['Kelly Barth'], true);
console.log('✓ rename-canonical-participant');
