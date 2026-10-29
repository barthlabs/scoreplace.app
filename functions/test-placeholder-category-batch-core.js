'use strict';

const assert = require('node:assert/strict');
const { plan } = require('./placeholder-category-batch-core');
const { registrationId } = require('./registration-core');
const TID = 'tour_1234567890123_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const reservation = (id) => ({ isPlaceholder: true, manualParticipantId: id, displayName: 'Jogador ' + id });
const existing = (id, categoryId, status = 'confirmed') => ({
  tournamentId: TID, participantKey: 'manual:' + id,
  registrationId: registrationId('manual:' + id, categoryId),
  categoryId, status, participantKind: 'manual', manualParticipantId: id,
});
function rejects(code, fn) { assert.throws(fn, (error) => error.code === code); }

const reservations = Array.from({ length: 16 }, (_, i) => reservation(String(i + 1)));
const first = plan(TID, 'fingerprint', reservations, [], reservations.map((r) => r.manualParticipantId), 'retinal');
assert.equal(first.creates.length, 16);
assert.equal(first.reservationsAfter.length, 0);
assert.ok(first.creates.every((item) => item.categoryId === 'retinal' && item.fixedPairId === null));
assert.equal(new Set(first.creates.map((item) => item.registrationId)).size, 16);
const retry = plan(TID, 'fingerprint', [], first.creates, ['1', '2'], 'retinal');
assert.equal(retry.creates.length, 0);
assert.equal(retry.removed, 0);
const residual = plan(TID, 'fingerprint', [reservation('1'), reservation('3')], [existing('1', 'retinal')], ['1'], 'retinal');
assert.equal(residual.creates.length, 0);
assert.deepEqual(residual.reservationsAfter.map((r) => r.manualParticipantId), ['3']);
assert.equal(residual.removed, 1);
const sentinel = plan(TID, 'fingerprint', [reservation('1')], [existing('1', '__uncategorized__')], ['1'], 'retinal');
assert.equal(sentinel.needsReclassification, true);
assert.equal(sentinel.creates.length, 0);
assert.equal(sentinel.removed, 1);
rejects('failed-precondition', () => plan(TID, 'fingerprint', [reservation('1'), reservation('2')],
  [existing('1', '__uncategorized__')], ['1', '2'], 'retinal'));
rejects('already-exists', () => plan(TID, 'fingerprint', [reservation('1')], [existing('1', 'other')], ['1'], 'retinal'));
rejects('already-exists', () => plan(TID, 'fingerprint', [reservation('1')], [existing('1', 'other', 'withdrawn')], ['1'], 'retinal'));
rejects('invalid-argument', () => plan(TID, 'fingerprint', [], [], ['1'], 'retinal'));
rejects('invalid-argument', () => plan(TID, 'fingerprint', [reservation('1'), reservation('1')], [], ['1'], 'retinal'));
rejects('invalid-argument', () => plan(TID, 'fingerprint', reservations, [], ['1', '1'], 'retinal'));
rejects('invalid-argument', () => plan(TID, 'fingerprint', reservations, [], Array.from({ length: 33 }, (_, i) => String(i + 1)), 'retinal'));
console.log('✓ lote de reservas individuais: 16 inscrições, retry, sentinela e conflitos');
