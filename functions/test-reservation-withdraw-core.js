'use strict';

const assert = require('node:assert/strict');
const R = require('./reservation-withdraw-core');
const B = require('./canonical-registration-boundary-core');
const reservations = [
  { manualParticipantId: 'manual-a', displayName: 'Jogador 33', isPlaceholder: true },
  { manualParticipantId: 'manual-b', displayName: 'Jogador 34', isPlaceholder: true },
];
const historical = [{ manualParticipantId: 'manual-a', status: 'withdrawn' }];
const removed = R.plan(reservations, historical, 'manual-a');
assert.equal(removed.outcome, 'reservation');
assert.deepEqual(removed.reservationsAfter, [reservations[1]]);
assert.deepEqual(reservations.length, 2, 'a entrada original não é mutada');
assert.equal(R.plan(reservations, [], 'missing').outcome, 'notFound');
assert.equal(R.plan(reservations, [{ manualParticipantId: 'manual-a', status: 'confirmed' }], 'manual-b').outcome, 'reservation');
assert.throws(() => R.plan(reservations, [{ manualParticipantId: 'manual-a', status: 'confirmed' }], 'manual-a'), /duplicada/);
assert.throws(() => R.plan([reservations[0], reservations[0]], [], 'manual-a'), /ambígua/);
const pair = { p1ManualId: 'one', p2ManualId: 'two', p1Name: 'Um', p2Name: 'Dois' };
assert.throws(() => R.plan([pair], [], 'one'), /Desfaça a dupla/);
assert.throws(() => R.plan([pair], [], 'two'), /Desfaça a dupla/);
assert.deepEqual(pair, { p1ManualId: 'one', p2ManualId: 'two', p1Name: 'Um', p2Name: 'Dois' });
const tournament = { id: 't-reserve', canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 0 } };
const noOp = B.applyChanges(tournament, [], [], []);
assert.equal(noOp.tournament.canonicalRegistrationMigration.registrationCount, 0);
assert.deepEqual(noOp.participants, []);
console.log('✓ reserva individual removida sem atingir histórico, outros cards ou dupla; recibo vazio preservado');
