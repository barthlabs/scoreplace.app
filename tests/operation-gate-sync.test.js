'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normals, recovery, one, functionRunName } = require('../scripts/sync-operation-gate-current');

test('gate atual cobre somente seis Functions e quatro recovery conhecidas', () => {
  assert.deepEqual(normals.map(([name]) => name), [
    'setTournamentPresence', 'applyMatchResult', 'applyQueuedResult', 'assignMatchCourt',
    'setTournamentPresenceWithWOSubstitution', 'endMatchOnCourt',
  ]);
  assert.deepEqual(recovery.map(([name]) => name), [
    'assignmatchcourt-run-recovery', 'applymatchresult-run-recovery',
    'settournamentpresence-run-recovery', 'presencwo-run-recovery',
  ]);
  assert.equal(one([{ name: 'a' }], 'a').name, 'a');
  assert.throws(() => one([{ name: 'a' }, { name: 'a' }], 'a'), /duplicada/);
  assert.throws(() => one([], 'a'), /ausente/);
  assert.equal(functionRunName({ serviceConfig: { service: 'projects/scoreplace-app/locations/us-central1/services/applymatchresult' } }), 'applymatchresult');
  assert.throws(() => functionRunName({ serviceConfig: { service: 'projects/other/locations/us-central1/services/applymatchresult' } }), /inesperado/);
});
