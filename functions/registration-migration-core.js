'use strict';

const { UNCATEGORIZED_CATEGORY_ID } = require('./registration-core');

/*
 * Materialização PURA da migração de inscrições.
 *
 * Este módulo não conhece Firestore: recebe o plano aprovado pelo censo e
 * decide somente creates/no-ops/conflitos. A Function que vier a gravá-lo deve
 * executar essa decisão na mesma transação em que relê o elenco dividido.
 */

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function migrationRoute(tournament, expectedFingerprint) {
  const receipt = tournament && tournament.canonicalRegistrationMigration || {};
  const fingerprint = receipt.fingerprint;
  if (!fingerprint) return 'legacy';
  if (expectedFingerprint === undefined) return 'already_canonical';
  return fingerprint === expectedFingerprint ? 'already_migrated' : 'canonical_divergent';
}

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

function isRetiredCategoryProjectionHistory(existing, desiredById) {
  const targetId = text(existing && existing.supersededByRegistrationId);
  const target = desiredById.get(targetId);
  return !!target &&
    text(existing && existing.status) === 'withdrawn' &&
    text(existing && existing.validationState) === 'superseded_legacy_category_projection' &&
    text(existing && existing.withdrawnReason) === 'category_projection_superseded' &&
    text(existing && existing.participantKey) === text(target.participantKey) &&
    (text(existing && existing.categoryId) === UNCATEGORIZED_CATEGORY_ID ||
      (text(existing && existing.categoryId) !== UNCATEGORIZED_CATEGORY_ID &&
        text(target.categoryId) === UNCATEGORIZED_CATEGORY_ID &&
        text(target.status) === 'confirmed')) &&
    !text(existing && existing.fixedPairId);
}

/* Uma única forma de legado pode ser aposentada sem perder história: a antiga
 * inscrição confirmada sem categoria, importada automaticamente, quando já
 * existe exatamente uma inscrição projetada para a mesma identidade. Qualquer
 * outra sobra permanece bloqueante; em especial, não deduzimos equivalência
 * entre duas categorias nem tocamos em duplas. */
function repairCandidate(existing, desired, alreadyIds) {
  if (!existing || text(existing.status) !== 'confirmed' ||
      text(existing.validationState) !== 'legacy_imported') return null;
  const key = text(existing.participantKey);
  const sourceUncategorized = text(existing.categoryId) === UNCATEGORIZED_CATEGORY_ID;
  const targets = desired.filter((item) => text(item.participantKey) === key &&
    (sourceUncategorized ? text(item.categoryId) !== UNCATEGORIZED_CATEGORY_ID :
      text(item.categoryId) === UNCATEGORIZED_CATEGORY_ID) &&
    alreadyIds.has(item.registrationId));
  if (targets.length !== 1) return null;
  const sourcePairId = text(existing.fixedPairId);
  const targetPairId = text(targets[0].fixedPairId);
  // Uma dupla não pode virar dois solos (nem o contrário) durante uma
  // aposentadoria automática. A coesão dos dois membros é validada abaixo.
  if (!!sourcePairId !== !!targetPairId) return null;
  return {
    registrationId: text(existing.registrationId),
    supersededByRegistrationId: targets[0].registrationId,
    sourcePairId: sourcePairId || null,
    targetPairId: targetPairId || null,
  };
}

function coherentRepairCandidates(candidates) {
  const sourceGroups = new Map();
  (candidates || []).forEach((candidate) => {
    const sourcePairId = text(candidate && candidate.sourcePairId);
    if (!sourcePairId) return;
    const group = sourceGroups.get(sourcePairId) || [];
    group.push(candidate);
    sourceGroups.set(sourcePairId, group);
  });
  return (candidates || []).filter((candidate) => {
    const sourcePairId = text(candidate && candidate.sourcePairId);
    if (!sourcePairId) return true;
    const group = sourceGroups.get(sourcePairId) || [];
    const targets = new Set(group.map((item) => text(item.targetPairId)).filter(Boolean));
    return group.length === 2 && targets.size === 1;
  }).map((candidate) => ({
    registrationId: candidate.registrationId,
    supersededByRegistrationId: candidate.supersededByRegistrationId,
  }));
}

/* Retorna operações idempotentes; conflito nunca é sobrescrito. */
function decideMaterialization(tournamentId, report, existingById) {
  const desired = desiredDocuments(tournamentId, report);
  const existing = existingById || {};
  const desiredIds = new Set(desired.map((document) => document.registrationId));
  const desiredById = new Map(desired.map((document) => [document.registrationId, document]));
  const creates = [];
  const already = [];
  const conflicts = [];
  desired.forEach((document) => {
    const before = existing[document.registrationId];
    if (!before) { creates.push(document); return; }
    if (sameRegistration(before, document)) { already.push(document.registrationId); return; }
    conflicts.push(document.registrationId);
  });
  // A migração é uma tradução integral do elenco legado, não uma autorização
  // para coexistir silenciosamente com inscrições que a fotografia atual não
  // explica. Mantemos a lista separada dos conflitos por ID: ela não pode ser
  // sobrescrita nem apagada automaticamente, mas precisa bloquear a aplicação
  // para investigação explícita.
  const alreadyIds = new Set(already);
  const historicalExisting = [];
  const rawCandidates = [];
  const unexpectedExisting = [];
  Object.keys(existing).sort().forEach((registrationId) => {
    if (desiredIds.has(registrationId)) return;
    const before = existing[registrationId];
    if (isRetiredCategoryProjectionHistory(before, desiredById)) {
      historicalExisting.push(registrationId);
      return;
    }
    const candidate = repairCandidate(before, desired, alreadyIds);
    if (candidate) rawCandidates.push(candidate);
    unexpectedExisting.push(registrationId);
  });
  const reconciliationCandidates = coherentRepairCandidates(rawCandidates);
  return {
    creates: creates,
    already: already,
    conflicts: conflicts,
    historicalExisting: historicalExisting,
    reconciliationCandidates: reconciliationCandidates,
    unexpectedExisting: unexpectedExisting,
    desired: desired,
  };
}

module.exports = { migrationRoute, participantFields, desiredDocuments, decideMaterialization };
