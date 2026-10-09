'use strict';

/*
 * Transições puras do elenco canônico.
 *
 * A Function decide autorização, janela de inscrição e elegibilidade antes de
 * chegar aqui. Este módulo só protege a forma dos registros e produz a próxima
 * fotografia da subcoleção `registrations`: não lê/grava Firestore e não
 * conhece nomes, e-mails, fotos, partidas ou a projeção legada `participants`.
 */

const crypto = require('crypto');
const { participantKey, registrationId } = require('./registration-core');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function clone(value) { return Object.assign({}, value || {}); }

function canonicalPairId(tournamentId, categoryId, registrationIds) {
  const ids = (Array.isArray(registrationIds) ? registrationIds : []).map(text).filter(Boolean).sort();
  if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('dupla exige duas inscrições diferentes');
  return 'pair-' + crypto.createHash('sha256')
    .update(text(tournamentId) + '\u0000' + text(categoryId) + '\u0000' + ids.join('\u0000'))
    .digest('hex').slice(0, 32);
}

function validateRegistration(tournamentId, registration) {
  const item = clone(registration);
  const tid = text(tournamentId);
  if (!tid || item.tournamentId !== tid) throw new Error('inscrição fora do torneio');
  const categoryId = text(item.categoryId);
  const key = participantKey({ uid: item.participantUid, manualParticipantId: item.manualParticipantId });
  const expectedId = registrationId(key, categoryId);
  if (!categoryId || item.registrationId !== expectedId || item.participantKey !== key) {
    throw new Error('inscrição canônica inválida');
  }
  return item;
}

function indexRegistrations(tournamentId, registrations) {
  const byId = new Map();
  const participantCategories = new Set();
  (Array.isArray(registrations) ? registrations : []).forEach((registration) => {
    const item = validateRegistration(tournamentId, registration);
    if (byId.has(item.registrationId)) throw new Error('inscrição duplicada');
    const categoryKey = item.participantKey + '\u0000' + item.categoryId;
    if (participantCategories.has(categoryKey)) throw new Error('participante duplicado na categoria');
    participantCategories.add(categoryKey);
    byId.set(item.registrationId, item);
  });
  return byId;
}

function statusCanPair(status) {
  return status === 'confirmed' || status === 'pending';
}

function pair(tournamentId, registrations, registrationIds) {
  const byId = indexRegistrations(tournamentId, registrations);
  const ids = (Array.isArray(registrationIds) ? registrationIds : []).map(text).filter(Boolean);
  if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('dupla exige duas inscrições diferentes');
  const entries = ids.map((id) => byId.get(id));
  if (entries.some((item) => !item)) throw new Error('inscrição não encontrada');
  if (entries[0].categoryId !== entries[1].categoryId) throw new Error('dupla exige a mesma categoria');
  if (entries.some((item) => !statusCanPair(item.status))) throw new Error('inscrição sem status elegível para dupla');
  if (entries.some((item) => item.fixedPairId)) throw new Error('inscrição já pertence a uma dupla');
  const fixedPairId = canonicalPairId(tournamentId, entries[0].categoryId, ids);
  const updates = entries.map((item) => Object.assign({}, item, { fixedPairId }));
  return { outcome: 'paired', fixedPairId, updates };
}

function split(tournamentId, registrations, registrationIds) {
  const byId = indexRegistrations(tournamentId, registrations);
  const ids = (Array.isArray(registrationIds) ? registrationIds : []).map(text).filter(Boolean);
  if (ids.length !== 2 || ids[0] === ids[1]) throw new Error('desfazer dupla exige duas inscrições diferentes');
  const entries = ids.map((id) => byId.get(id));
  if (entries.some((item) => !item)) throw new Error('inscrição não encontrada');
  if (!entries[0].fixedPairId || entries[0].fixedPairId !== entries[1].fixedPairId) {
    throw new Error('as inscrições não formam a mesma dupla');
  }
  return { outcome: 'split', updates: entries.map((item) => Object.assign({}, item, { fixedPairId: null })) };
}

function transitionStatus(tournamentId, registrations, participant, fromStatuses, toStatus) {
  const byId = indexRegistrations(tournamentId, registrations);
  const key = participantKey(participant || {});
  const accepted = new Set(fromStatuses || []);
  const updates = Array.from(byId.values())
    .filter((item) => item.participantKey === key && accepted.has(item.status))
    .map((item) => Object.assign({}, item, { status: toStatus, fixedPairId: null }));
  return { outcome: updates.length ? 'changed' : 'notFound', updates };
}

function withdraw(tournamentId, registrations, participant) {
  const byId = indexRegistrations(tournamentId, registrations);
  const key = participantKey(participant || {});
  const eligible = new Set(['pending', 'confirmed', 'waitlisted']);
  const mine = Array.from(byId.values()).filter((item) => item.participantKey === key && eligible.has(item.status));
  if (!mine.length) return { outcome: 'notFound', updates: [] };
  // Ao sair, uma pessoa não pode deixar o outro membro com `fixedPairId`
  // órfão. A dupla se dissolve, mas o parceiro continua inscrito com o mesmo
  // status. Isso é o equivalente canônico de a rota legada devolver o colega
  // como solo.
  const dissolvedPairIds = new Set(mine.map((item) => text(item.fixedPairId)).filter(Boolean));
  const updates = Array.from(byId.values()).filter((item) => {
    return mine.some((target) => target.registrationId === item.registrationId) ||
      (item.fixedPairId && dissolvedPairIds.has(item.fixedPairId));
  }).map((item) => {
    const leaving = mine.some((target) => target.registrationId === item.registrationId);
    return Object.assign({}, item, {
      status: leaving ? 'withdrawn' : item.status,
      fixedPairId: null,
    });
  });
  return { outcome: 'changed', updates };
}

function leaveWaitlist(tournamentId, registrations, participant) {
  return transitionStatus(tournamentId, registrations, participant, ['waitlisted'], 'withdrawn');
}

module.exports = {
  canonicalPairId,
  indexRegistrations,
  pair,
  split,
  withdraw,
  leaveWaitlist,
};
