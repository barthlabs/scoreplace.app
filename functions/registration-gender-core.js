'use strict';

// Ausência significa preservar; string vazia é uma limpeza explícita.
function normalize(value) {
  if (value !== '' && value !== 'feminino' && value !== 'masculino') {
    throw new Error('Gênero inválido para inscrição.');
  }
  return value;
}

function identity(item) {
  const uid = String(item && item.userUid || '').trim();
  const manualId = String(item && item.manualParticipantId || '').trim();
  if (!!uid === !!manualId) throw new Error('Identidade individual inválida para gênero.');
  return uid ? 'uid:' + uid : 'manual:' + manualId;
}

function normalizeAssignments(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 2) throw new Error('Atribuições de gênero inválidas.');
  const seen = new Set();
  return raw.map((item) => {
    const participantKey = identity(item);
    if (seen.has(participantKey)) throw new Error('Pessoa repetida na atribuição de gênero.');
    seen.add(participantKey);
    return { participantKey, gender: normalize(item && item.gender) };
  });
}

function apply(registration, gender) {
  const value = normalize(gender);
  const nextGender = value || null;
  const nextSource = value ? 'organizador' : null;
  if ((registration.gender || null) === nextGender &&
      (registration.genderSource || null) === nextSource) return null;
  return Object.assign({}, registration, { gender: nextGender, genderSource: nextSource });
}

module.exports = { normalize, identity, normalizeAssignments, apply };
