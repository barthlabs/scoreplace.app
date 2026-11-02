'use strict';

const assert = require('node:assert/strict');
const R = require('./registration-core');
const B = require('./canonical-registration-boundary-core');

const tid = 't-placeholder';
const reservations = [
  { manualParticipantId: 'placeholder-a', displayName: 'Jogador 01', isPlaceholder: true },
  { manualParticipantId: 'placeholder-b', displayName: 'Jogador 02', isPlaceholder: true },
];
const tournament = { id: tid, placeholderReservations: reservations,
  canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 0 } };
const empty = B.verifiedRoster(tournament, []);
assert.deepEqual(empty.participants, [], 'reservas sem categoria não são elenco inscrito');
assert.equal(empty.migration.expectedCount, 0, 'reservas não avançam o recibo');
assert.deepEqual(tournament.placeholderReservations, reservations, 'reservas continuam separadas');

const real = { registrationId: R.registrationId('manual:real-a', 'a'), tournamentId: tid,
  categoryId: 'a', participantKey: 'manual:real-a', participantKind: 'manual',
  manualParticipantId: 'real-a', manualDisplayName: 'Inscrito manual',
  status: 'confirmed', validationState: 'approved', fixedPairId: null };
const added = B.applyCreates(tournament, [], [real]);
assert.equal(added.registrations.length, 1, 'inscrição manual real recebe documento próprio');
assert.equal(added.tournament.canonicalRegistrationMigration.registrationCount, 1);
assert.equal(added.participants.length, 1);
assert.deepEqual(added.tournament.placeholderReservations, reservations,
  'inscrição real não altera reservas existentes');
console.log('✓ reserva permanece fora de registrations e da projeção; inclusão real avança recibo');
