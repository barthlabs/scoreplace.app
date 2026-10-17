'use strict';

const assert = require('node:assert/strict');
const core = require('../functions/manual-claim-link-core');

assert.equal(core.matchesName('José da Silva', 'Jose Silva'), true);
assert.equal(core.matchesName('Ana', 'Ana Maria'), false);
assert.equal(core.matchesName('Maria Oliveira', 'Maria Costa'), false);

const registrations = [
  { registrationId: 'manual-a', participantKind: 'manual', manualParticipantId: 'a', manualDisplayName: 'Ana Costa', categoryId: 'fem-light', fixedPairId: 'old', status: 'confirmed' },
  { registrationId: 'manual-b', participantKind: 'manual', manualParticipantId: 'b', manualDisplayName: 'Bia Lima', categoryId: 'fem-light', fixedPairId: 'old', status: 'confirmed' },
];
assert.equal(core.suggestions(registrations, 'Ana Costa').length, 1);
assert.equal(core.existingPair(registrations, 'uid-a'), null);
const account = Object.assign({}, registrations[0], { registrationId: 'uid-a', participantKind: 'account', participantUid: 'uid-a' });
assert.equal(core.existingPair([account, registrations[1]], 'uid-a').partner.manualDisplayName, 'Bia Lima');

const side = { p1ManualId: 'a', p2ManualId: 'b', p1Name: 'Ana Costa', p2Name: 'Bia Lima', fixedPairId: 'old' };
const draft = { participants: [side], competitionPairAssignments: [{ fixedPairId: 'old' }],
  matches: [1, 2, 3].map((id) => ({ id, team1Obj: side, team1Uids: [], p1Uid: null, team2Obj: { p1Uid: 'x', p2Uid: 'y', fixedPairId: 'other' } })) };
const next = core.replaceDraftIdentity(draft, 'a', 'old', 'new', 'uid-a');
assert.equal(next.participants[0].p1Uid, 'uid-a');
assert.equal(next.matches.length, 3);
assert.deepEqual(next.matches[0].team1Uids, ['uid-a']);
assert.equal(next.competitionPairAssignments[0].fixedPairId, 'new');
assert.equal(draft.participants[0].p1ManualId, 'a');
assert.throws(() => core.replaceDraftIdentity(Object.assign({}, draft, { matches: [] }), 'a', 'old', 'new', 'uid-a'));
assert.throws(() => core.replaceDraftIdentity(Object.assign({}, draft, { participants: [side, side] }), 'a', 'old', 'new', 'uid-a'));
console.log('✓ vínculo compartilhado: nome, dupla existente e substituição do rascunho');
