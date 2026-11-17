'use strict';
const assert = require('node:assert/strict');
const policy = require('../functions/test-mode-core');

const dev = policy.DEVELOPER_UID;
const live = { testModeEnabled:false };
const test = { testModeEnabled:true };
assert.equal(policy.active(live), false);
assert.equal(policy.active(test), true);
assert.deepEqual(policy.memberUids(test, ['athlete', dev]), [dev]);
assert.deepEqual(policy.refereeUids(test, ['referee']), []);
assert.deepEqual(policy.memberUids(live, ['athlete']), ['athlete']);
assert.equal(policy.canAccess(test, dev), true);
assert.equal(policy.canAccess(test, 'athlete'), false);
assert.equal(policy.canAccess(live, 'athlete'), true);
assert.equal(policy.notificationTournamentId({ tournamentId:' tour_1 ' }), 'tour_1');
assert.equal(policy.notificationTournamentId({ tournamentUrl:'https://scoreplace.app/#tournaments/tour_2' }), 'tour_2');
assert.equal(policy.notificationTournamentId({ ctaUrl:'https://scoreplace.app/#bracket/tour_3?tab=games' }), 'tour_3');
console.log('✓ modo Teste: acesso, índices e vínculo dos e-mails');
