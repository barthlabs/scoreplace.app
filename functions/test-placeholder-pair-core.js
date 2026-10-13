'use strict';

const assert = require('assert');
const R = require('./registration-core');
const B = require('./canonical-registration-boundary-core');
const M = require('./registration-mutations-core');

const tid = 't-placeholder';
const categoryId = R.UNCATEGORIZED_CATEGORY_ID;
assert.strictEqual(categoryId, '__uncategorized__');
const a = { participantKey: 'manual:placeholder-a', manualParticipantId: 'placeholder-a' };
const b = { participantKey: 'manual:placeholder-b', manualParticipantId: 'placeholder-b' };
const idA = R.registrationId(a.participantKey, categoryId);
const idB = R.registrationId(b.participantKey, categoryId);
const pairId = M.canonicalPairId(tid, categoryId, [idA, idB]);
const tournament = { id: tid, canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 0 } };
const creates = [
  { registrationId: idA, tournamentId: tid, categoryId, participantKey: a.participantKey, participantKind: 'manual', participantUid: null, manualParticipantId: a.manualParticipantId, manualDisplayName: 'Jogador 01', status: 'confirmed', validationState: 'approved', fixedPairId: pairId },
  { registrationId: idB, tournamentId: tid, categoryId, participantKey: b.participantKey, participantKind: 'manual', participantUid: null, manualParticipantId: b.manualParticipantId, manualDisplayName: 'Jogador 02', status: 'confirmed', validationState: 'approved', fixedPairId: pairId },
];
const out = B.applyCreates(tournament, [], creates);
assert.strictEqual(out.tournament.canonicalRegistrationMigration.registrationCount, 2);
assert.strictEqual(out.registrations.length, 2);
assert.deepStrictEqual(out.registrations.map((x) => x.fixedPairId), [pairId, pairId]);
console.log('✓ placeholders sem categoria formam uma dupla canônica com a sentinela estrutural');
