'use strict';

/*
 * Materialização PURA da migração de inscrições.
 *
 * Este módulo não conhece Firestore: recebe o plano aprovado pelo censo e
 * decide somente creates/no-ops/conflitos. A Function que vier a gravá-lo deve
 * executar essa decisão na mesma transação em que relê o elenco dividido.
 */

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function participantFields(participantKey) {
  const key = text(participantKey);
  if (key.indexOf('uid:') === 0 && key.slice(4)) {
    return { participantKind: 'account', participantUid: key.slice(4), manualParticipantId: null };
  }
  if (key.indexOf('manual:') === 0 && key.slice(7)) {
    return { participantKind: 'manual', participantUid: null, manualParticipantId: key.slice(7) };
  }
  throw new Error('participantKey canônica inválida');
}

function pairIndex(report) {
  const map = new Map();
  (report.formedPairs || []).forEach((pair) => {
    const pairId = text(pair && pair.pairId);
    const members = Array.isArray(pair && pair.memberKeys) ? pair.memberKeys.map(text).filter(Boolean) : [];
    const categories = Array.isArray(pair && pair.categoryIds) ? pair.categoryIds.map(text).filter(Boolean) : [];
    if (!pairId || members.length !== 2 || categories.length === 0) throw new Error('vínculo de dupla inválido');
    categories.forEach((categoryId) => members.forEach((memberKey) => {
      const key = memberKey + '\u0000' + categoryId;
      if (map.has(key) && map.get(key) !== pairId) throw new Error('participante ligado a duas duplas na mesma categoria');
      map.set(key, pairId);
    }));
  });
  return map;
}

function manualNamesByKey(report) {
  const names = new Map();
  (report.registrations || []).forEach((registration) => {
    const key = text(registration && registration.participantKey);
    const name = text(registration && registration.manualDisplayName);
    if (!key || !name) return;
    if (names.has(key) && names.get(key) !== name) throw new Error('convidado manual com rótulos divergentes');
    names.set(key, name);
  });
  return names;
}

function desiredDocuments(tournamentId, report) {
  const tid = text(tournamentId);
  if (!tid) throw new Error('tournamentId obrigatório');
  if (!report || !text(report.fingerprint)) throw new Error('plano sem fingerprint');
  if ((report.conflicts || []).length || (report.unsupported || []).length) {
    throw new Error('plano de migração ainda contém exceções');
  }
  const pairs = pairIndex(report);
  const manualNames = manualNamesByKey(report);
  const seen = new Set();
  return (report.registrations || []).map((registration) => {
    if (!registration || registration.tournamentId !== tid) throw new Error('registro fora do torneio');
    const registrationId = text(registration.registrationId);
    const categoryId = text(registration.categoryId);
    const participantKey = text(registration.participantKey);
    if (!registrationId || !categoryId || !participantKey || seen.has(registrationId)) {
      throw new Error('registro canônico inválido ou duplicado');
    }
    seen.add(registrationId);
    const participant = participantFields(participantKey);
    const fixedPairId = pairs.get(participantKey + '\u0000' + categoryId) || null;
    const document = Object.assign({
      registrationId: registrationId,
      tournamentId: tid,
      categoryId: categoryId,
      participantKey: participantKey,
      status: 'confirmed',
      validationState: 'legacy_imported',
      migrationFingerprint: report.fingerprint,
      fixedPairId: fixedPairId,
    }, participant);
    if (participant.participantKind === 'manual') document.manualDisplayName = manualNames.get(participantKey) || null;
    return document;
  });
}

function sameRegistration(existing, desired) {
  return existing && [
    'registrationId', 'tournamentId', 'categoryId', 'participantKey', 'participantKind',
    'participantUid', 'manualParticipantId', 'manualDisplayName', 'status', 'validationState', 'fixedPairId',
  ].every((key) => (existing[key] == null ? null : existing[key]) === (desired[key] == null ? null : desired[key]));
}

/* Retorna operações idempotentes; conflito nunca é sobrescrito. */
function decideMaterialization(tournamentId, report, existingById) {
  const desired = desiredDocuments(tournamentId, report);
  const existing = existingById || {};
  const creates = [];
  const already = [];
  const conflicts = [];
  desired.forEach((document) => {
    const before = existing[document.registrationId];
    if (!before) { creates.push(document); return; }
    if (sameRegistration(before, document)) { already.push(document.registrationId); return; }
    conflicts.push(document.registrationId);
  });
  return { creates: creates, already: already, conflicts: conflicts, desired: desired };
}

module.exports = { participantFields, desiredDocuments, decideMaterialization };
