'use strict';

/* Nomes digitados e placeholders são rótulos humanos dentro de um torneio.
 * Eles não são identidade (a identidade continua sendo UID/manualParticipantId),
 * mas o rótulo precisa ser único para não criar dois homônimos indistinguíveis. */
function normalizeName(value) {
  return String(value == null ? '' : value)
    .normalize('NFKC')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function collectNames(value, out) {
  if (!value) return out;
  if (Array.isArray(value)) { value.forEach((item) => collectNames(item, out)); return out; }
  if (typeof value !== 'object') return out;
  ['displayName', 'name', 'manualDisplayName', 'p1Name', 'p2Name'].forEach((key) => {
    const keyName = normalizeName(value[key]);
    if (keyName) out.add(keyName);
  });
  ['participants', 'standbyParticipants', 'waitlist', 'placeholderReservations', 'monarchWaitlist']
    .forEach((key) => collectNames(value[key], out));
  return out;
}

function duplicateManualName(tournament, participant) {
  if (participant && participant.uid) return null;
  const wanted = normalizeName(participant && (participant.displayName || participant.name));
  if (!wanted) return null;
  const names = collectNames(tournament, new Set());
  return names.has(wanted) ? wanted : null;
}

module.exports = { normalizeName, collectNames, duplicateManualName };
