'use strict';
const assert = require('assert');
const { plan } = require('../scripts/claim-approved-manual-suggestions');
const { registrationId } = require('../functions/registration-core');

const tournamentId = 'tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
const categoryId = 'cat-c';
const category = 'Colágeno · Categoria C';
const registration = (i) => {
  const manualParticipantId = `manual-${i}`;
  return { registrationId: registrationId(`manual:${manualParticipantId}`, categoryId),
    tournamentId, categoryId, participantKey: `manual:${manualParticipantId}`,
    participantKind: 'manual', participantUid: null, manualParticipantId,
    manualDisplayName: `Pessoa ${i}`, status: 'confirmed', validationState: 'approved',
    fixedPairId: null, enrollSeq: i };
};
const registrations = Array.from({ length: 48 }, (_, index) => registration(index + 1));
const suggestions = registrations.slice(0, 18).map((item, index) => ({ data: {
  manualParticipantId: item.manualParticipantId, suggestedUid: `uid-${index + 1}`,
  source: 'organizer-confirmed-2026-11-27',
} }));
const profiles = new Map(suggestions.map(({ data }, index) =>
  [data.suggestedUid, { displayName: `Perfil ${index + 1}` }]));
const matches = Array.from({ length: 84 }, (_, index) => {
  const source = registrations[index < 18 ? index : 47];
  return { id: `game-${index + 1}`, data: { jogo: { id: `game-${index + 1}`,
    category, p1: `${source.manualDisplayName} / Pessoa 48`, p2: 'Outra / Pessoa',
    team1: [source.manualDisplayName, 'Pessoa 48'], team1Uids: [null, null],
    team1SlotIds: [source.participantKey, 'manual:manual-48'],
    team2: ['Outra', 'Pessoa'], team2Uids: [null, null], team2SlotIds: ['other-1', 'other-2'],
    groupLetterAssignments: [{ letter: 'A', name: source.manualDisplayName, uid: null }],
    scoreP1: null, scoreP2: null,
  } } };
});
const tournament = { id: tournamentId, status: 'active', testModeEnabled: false,
  organizerOnly: false, creatorUid: 'organizer', categoryDefinitions: [{ id: categoryId, label: category }],
  teamOrigins: { 'team:manual:manual-1|manual:manual-48': 'sorteada' },
  canonicalRegistrationMigration: { fingerprint: `native:${tournamentId}`, registrationCount: 48 } };
const result = plan(tournament, registrations, matches, suggestions, profiles, new Set());
assert.strictEqual(result.mappings.length, 18);
assert.strictEqual(result.matches.length, 18);
assert.strictEqual(result.migration.registrationCount, 66);
assert.strictEqual(result.memberUids.length, 19);
assert.strictEqual(result.teamOrigins['team:uid:uid-1|manual:manual-48'], 'sorteada');
for (let i = 0; i < 18; i++) {
  const game = result.matches[i].next.jogo;
  assert.strictEqual(game.team1SlotIds[0], `uid:uid-${i + 1}`);
  assert.strictEqual(game.team1Uids[0], `uid-${i + 1}`);
  assert.strictEqual(game.team1[0], `Perfil ${i + 1}`);
  assert.strictEqual(game.groupLetterAssignments[0].uid, `uid-${i + 1}`);
  assert.strictEqual(game.scoreP1, null);
}
const started = structuredClone(matches);
started[0].data.jogo.courtCalledAt = '2026-11-29T08:00:00Z';
assert.throws(() => plan(tournament, registrations, started, suggestions, profiles, new Set()), /jogo em andamento/);
console.log('claim-approved-manual-suggestions: ok');
