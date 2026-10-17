'use strict';

const active = (item) => ['pending', 'confirmed', 'waitlisted'].includes(item && item.status);
const normalizeName = (value) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

function matchesName(profileName, manualName) {
  const a = normalizeName(profileName).split(' ').filter(Boolean);
  const b = normalizeName(manualName).split(' ').filter(Boolean);
  if (a.length < 2 || b.length < 2) return false;
  return a.join(' ') === b.join(' ') || (a[0] === b[0] && a[a.length - 1] === b[b.length - 1]);
}

function findPair(registrations, entry) {
  if (!entry || !entry.fixedPairId) throw new Error('vaga sem dupla fixa');
  const pair = registrations.filter((item) => active(item) && item.fixedPairId === entry.fixedPairId);
  if (pair.length !== 2 || pair.some((item) => item.categoryId !== entry.categoryId)) throw new Error('dupla canônica inconsistente');
  return { entry, partner: pair.find((item) => item.registrationId !== entry.registrationId) };
}

function suggestions(registrations, profileName) {
  return registrations.filter((item) => active(item) && item.participantKind === 'manual' &&
    matchesName(profileName, item.manualDisplayName)).map((item) => findPair(registrations, item));
}

function existingPair(registrations, uid) {
  const entries = registrations.filter((item) => active(item) && item.participantKind === 'account' && item.participantUid === uid);
  if (entries.length > 1) throw new Error('conta em múltiplas vagas ativas');
  return entries.length ? findPair(registrations, entries[0]) : null;
}

function replaceDraftIdentity(draft, manualId, oldPairId, newPairId, uid) {
  if (!draft || !Array.isArray(draft.participants) || !Array.isArray(draft.matches) ||
      !Array.isArray(draft.competitionPairAssignments)) throw new Error('rascunho incompleto');
  const next = JSON.parse(JSON.stringify(draft));
  let participantCount = 0, matchCount = 0, assignmentCount = 0;
  function replaceSide(side) {
    if (!side || typeof side !== 'object') return false;
    const slots = ['p1', 'p2'].filter((slot) => side[slot + 'ManualId'] === manualId);
    if (!slots.length) return false;
    if (slots.length !== 1 || side.fixedPairId !== oldPairId) throw new Error('referência ambígua no rascunho');
    const slot = slots[0];
    if (side[slot + 'Uid']) throw new Error('vaga já tem UID no rascunho');
    delete side[slot + 'ManualId'];
    side[slot + 'Uid'] = uid;
    side.fixedPairId = newPairId;
    return true;
  }
  next.participants.forEach((side) => { if (replaceSide(side)) participantCount++; });
  next.matches.forEach((match) => {
    ['team1Obj', 'team2Obj'].forEach((key, i) => {
      const side = match[key];
      if (!replaceSide(side)) return;
      matchCount++;
      const n = i + 1;
      match['team' + n + 'Uids'] = [side.p1Uid, side.p2Uid].filter(Boolean);
      match['p' + n + 'Uid'] = match['team' + n + 'Uids'].length === 1 ? match['team' + n + 'Uids'][0] : null;
    });
  });
  next.competitionPairAssignments.forEach((assignment) => {
    if (assignment && assignment.fixedPairId === oldPairId) { assignment.fixedPairId = newPairId; assignmentCount++; }
  });
  if (participantCount !== 1 || matchCount < 1 || assignmentCount !== 1) throw new Error('referências incompletas no rascunho');
  function hasStaleIdentity(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some((key) => {
      const field = value[key];
      if ((/ManualId$/.test(key) || key === 'manualParticipantId') && field === manualId) return true;
      if (key === 'fixedPairId' && field === oldPairId) return true;
      return hasStaleIdentity(field);
    });
  }
  if (hasStaleIdentity(next)) throw new Error('referência antiga restante no rascunho');
  return next;
}

module.exports = { active, normalizeName, matchesName, findPair, suggestions, existingPair, replaceDraftIdentity };
