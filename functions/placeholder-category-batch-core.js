'use strict';

const registration = require('./registration-core');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function fail(code, message) { const error = new Error(message); error.code = code; throw error; }

/* Planeja a transição inteira antes de qualquer escrita. Reservas não são
 * inscrições; cada ID manual só pode se tornar um registro individual. */
function plan(tournamentId, fingerprint, reservations, registrations, manualIds, toCategoryId, opts = {}) {
  const ids = Array.isArray(manualIds) ? manualIds.map(text) : [];
  if (!text(tournamentId) || !text(fingerprint) || !text(toCategoryId) ||
      !ids.length || ids.length > 32 || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    fail('invalid-argument', 'lote de reservas inválido');
  }
  const source = Array.isArray(reservations) ? reservations : [];
  const roster = Array.isArray(registrations) ? registrations : [];
  const consumed = new Set();
  const creates = [];
  const remapped = {};
  const usedIds = new Set(source.map((item) => text(item && item.manualParticipantId))
    .concat(roster.map((item) => text(item && item.manualParticipantId)))
    .concat(Array.isArray(opts.occupiedManualIds) ? opts.occupiedManualIds.map(text) : []));
  let needsReclassification = false;
  let sentinelCount = 0;
  let existingCount = 0;
  ids.forEach((id) => {
    const key = registration.participantKey({ manualParticipantId: id });
    const matches = source.filter((item) => text(item && item.manualParticipantId) === id);
    if (matches.length > 1 || (matches.length === 1 && matches[0].isPlaceholder !== true)) {
      fail('invalid-argument', 'reserva duplicada ou ambígua');
    }
    const active = roster.filter((item) => item && item.participantKey === key && item.status !== 'withdrawn');
    if (active.length > 1) fail('already-exists', 'reserva já inscrita em outra categoria');
    if (active.length) {
      const current = active[0];
      const expected = registration.registrationId(key, current.categoryId);
      if (current.registrationId !== expected) fail('failed-precondition', 'inscrição canônica inválida');
      if (current.categoryId === registration.UNCATEGORIZED_CATEGORY_ID) {
        needsReclassification = true;
        sentinelCount++;
      } else if (current.categoryId !== toCategoryId) {
        fail('already-exists', 'reserva já inscrita em outra categoria');
      }
      existingCount++;
      if (matches.length) consumed.add(id);
      return;
    }
    if (matches.length !== 1) {
      if (roster.some((item) => item && item.participantKey === key))
        fail('already-exists', 'inscrição histórica não pode ser recriada por esta porta');
      fail('invalid-argument', 'reserva não encontrada');
    }
    const item = matches[0];
    const name = text(item.manualDisplayName || item.displayName || item.name);
    if (!name) fail('invalid-argument', 'reserva sem nome de apresentação');
    let targetId = id;
    if (roster.some((entry) => entry && entry.participantKey === key)) {
      if (opts.allowHistoricalReplacement !== true) {
        fail('already-exists', 'inscrição histórica não pode ser recriada por esta porta');
      }
      let generation = 1;
      do { targetId = id + '-g' + generation++; } while (usedIds.has(targetId));
      remapped[id] = targetId;
    }
    usedIds.add(targetId);
    const targetKey = registration.participantKey({ manualParticipantId: targetId });
    consumed.add(id);
    creates.push({
      registrationId: registration.registrationId(targetKey, toCategoryId),
      tournamentId: tournamentId, categoryId: toCategoryId, participantKey: targetKey,
      status: 'confirmed', validationState: 'approved',
      migrationFingerprint: fingerprint, fixedPairId: null,
      participantKind: 'manual', participantUid: null,
      manualParticipantId: targetId, manualDisplayName: name,
    });
  });
  // Nunca aplicar metade do lote se outra porta já formou uma dupla sentinela.
  if (needsReclassification && sentinelCount !== ids.length) {
    fail('failed-precondition', 'salve a categoria da dupla já formada separadamente');
  }
  const reservationsAfter = source.filter((item) => !consumed.has(text(item && item.manualParticipantId)));
  return {
    creates, reservationsAfter, removed: source.length - reservationsAfter.length,
    existingCount, needsReclassification, remapped,
  };
}

module.exports = { plan };
