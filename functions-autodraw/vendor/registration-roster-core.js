'use strict';

/*
 * Adaptador de LEITURA do registro canônico para o formato que o motor de
 * sorteio já entende. É a única ponte autorizada: conta entra por UID; o único
 * nome persistido é o do convidado manual do próprio torneio.
 */

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function active(doc) {
  return doc && doc.status === 'confirmed';
}

function member(doc) {
  const kind = text(doc && doc.participantKind);
  if (kind === 'account' && text(doc.participantUid) && !text(doc.manualParticipantId)) {
    return { key: 'uid:' + text(doc.participantUid), uid: text(doc.participantUid), manualParticipantId: null, name: '' };
  }
  if (kind === 'manual' && text(doc.manualParticipantId) && !text(doc.participantUid)) {
    const name = text(doc.manualDisplayName);
    if (!name) throw new Error('convidado manual sem nome de exibição');
    return { key: 'manual:' + text(doc.manualParticipantId), uid: null, manualParticipantId: text(doc.manualParticipantId), name: name };
  }
  throw new Error('registro de participante inválido');
}

function soloEntry(registration, person) {
  const entry = { category: text(registration.categoryId), categories: [text(registration.categoryId)] };
  if (person.uid) entry.uid = person.uid;
  else {
    entry.manualParticipantId = person.manualParticipantId;
    entry.displayName = person.name;
    entry.name = person.name;
  }
  return entry;
}

function pairEntry(categoryId, first, second) {
  const entry = {
    category: categoryId,
    categories: [categoryId],
    fixedPair: true,
    p1Uid: first.uid || undefined,
    p2Uid: second.uid || undefined,
    p1ManualId: first.manualParticipantId || undefined,
    p2ManualId: second.manualParticipantId || undefined,
    p1Name: first.name || undefined,
    p2Name: second.name || undefined,
  };
  return entry;
}

function rosterFromRegistrations(registrations) {
  const pairs = new Map();
  const entries = [];
  const seen = new Set();
  (Array.isArray(registrations) ? registrations : []).filter(active).forEach((registration) => {
    const id = text(registration.registrationId);
    const categoryId = text(registration.categoryId);
    if (!id || !categoryId || seen.has(id)) throw new Error('registro canônico duplicado ou inválido');
    seen.add(id);
    const person = member(registration);
    const pairId = text(registration.fixedPairId);
    if (!pairId) { entries.push(soloEntry(registration, person)); return; }
    const key = pairId + '\u0000' + categoryId;
    const group = pairs.get(key) || { categoryId: categoryId, people: [] };
    group.people.push(person);
    pairs.set(key, group);
  });
  pairs.forEach((group) => {
    if (group.people.length !== 2 || group.people[0].key === group.people[1].key) {
      throw new Error('dupla canônica incompleta ou inválida');
    }
    group.people.sort((a, b) => a.key.localeCompare(b.key));
    entries.push(pairEntry(group.categoryId, group.people[0], group.people[1]));
  });
  return entries;
}

module.exports = { rosterFromRegistrations };
