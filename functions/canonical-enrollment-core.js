'use strict';

/* Decisão pura da nova inscrição depois da materialização. A Function fornece
 * autenticação, perfil e transação; este módulo não conhece Firestore nem
 * rótulos visíveis. */
const eligibility = require('./category-eligibility-core');
const categoryBridge = require('./registration-category-bridge-core');
const mutations = require('./registration-mutations-core');
const registration = require('./registration-core');
const enrollCore = require('./enroll-core');

function decide(input) {
  const value = input || {};
  const tournament = value.tournament || {};
  const registrations = Array.isArray(value.registrations) ? value.registrations : [];
  const participant = value.participant || {};
  if (participant.p1Uid || participant.p2Uid) throw new Error('dupla deve usar a porta canônica de formar dupla');
  const organizerManual = value.organizerManual === true && tournament.status !== 'finished';
  const window = enrollCore.enrollmentOpen(tournament, value.nowMs);
  if (!window.open && !organizerManual) return { outcome: window.notOpenYet ? 'notOpenYet' : 'closed' };
  const definitions = eligibility.normalizeCategoryDefinitions(tournament.categoryDefinitions);
  // Inclusão manual da organização pode ficar sem categoria até a Análise.
  // A sentinela já é o contrato canônico usado pelas reservas migradas.
  const categoryIds = organizerManual && (!Array.isArray(participant.categoryIds) || !participant.categoryIds.length)
    ? [registration.UNCATEGORIZED_CATEGORY_ID]
    : categoryBridge.categoryIdsFromTypedIds(definitions, participant.categoryIds);
  const existingCategoryIds = registrations
    .filter((registration) => registration && registration.participantKey === (participant.uid ? 'uid:' + participant.uid : 'manual:' + participant.manualParticipantId))
    .filter((registration) => registration.status !== 'withdrawn')
    .map((registration) => String(registration.categoryId || ''));
  const eligibilityDecision = categoryIds[0] === registration.UNCATEGORIZED_CATEGORY_ID && organizerManual
    ? { outcome: 'accepted', validationState: 'approved', reasons: [] }
    : eligibility.decideEnrollment({
    definitions,
    rigor: tournament.enrollmentRigor || 'casual',
    categoryIds,
    existingCategoryIds,
    profile: value.profile || {},
    sport: tournament.sport,
    now: value.now || new Date(value.nowMs || Date.now()),
  });
  if (eligibilityDecision.outcome !== 'accepted') return eligibilityDecision;
  const drawn = enrollCore.phaseDrawDone(tournament);
  const waitlistCapacity = Number.parseInt(tournament.waitlistCapacity, 10) || 0;
  const requestKey = participant.uid ? 'uid:' + participant.uid : 'manual:' + participant.manualParticipantId;
  const activeParticipantKeys = new Set(registrations
    .filter(item => item && ['confirmed', 'pending'].includes(item.status))
    .map(item => item.participantKey));
  const occupiedWaitlist = new Set(registrations
    .filter(item => item && item.status === 'waitlisted')
    .map(item => item.participantKey));
  const cap = Number.parseInt(tournament.maxParticipants, 10);
  const capReached = !organizerManual && !drawn && tournament.enrollmentLimitMode !== 'draw' &&
    Number.isFinite(cap) && cap > 0 && !activeParticipantKeys.has(requestKey) && activeParticipantKeys.size >= cap;
  const labels = new Map(definitions.map(definition => [definition.id, definition.label]));
  const byName = tournament.maxParticipantsByCategory || {};
  const general = Number(tournament.maxParticipantsPerCategory);
  const categoryReached = !organizerManual && !drawn && tournament.enrollmentLimitMode !== 'draw' && categoryIds.some(categoryId => {
    const label = labels.get(categoryId);
    const limit = Object.prototype.hasOwnProperty.call(byName, label) ? Number(byName[label]) : general;
    if (!Number.isSafeInteger(limit) || limit <= 0) return false;
    const occupied = registrations.filter(item => item && item.categoryId === categoryId && ['confirmed', 'pending'].includes(item.status)).length;
    return occupied >= limit;
  });
  const mustWait = !organizerManual && (drawn || (waitlistCapacity > 0 && (capReached || categoryReached)));
  const status = mustWait ? 'waitlisted' : (eligibilityDecision.validationState === 'pending_review' ? 'pending' : 'confirmed');
  const enrollment = mutations.enroll(tournament.id || tournament.tournamentId, registrations, participant, categoryIds, {
    status,
    validationState: eligibilityDecision.validationState,
    manualDisplayName: participant.manualParticipantId ? (participant.displayName || participant.name || '') : '',
  });
  // Repetir exatamente a mesma inscrição é sempre uma consulta idempotente:
  // não pode virar "lotado" ou "em espera" só porque o torneio mudou entre
  // os dois cliques.
  if (!enrollment.creates.length && !enrollment.updates.length) {
    return Object.assign({}, eligibilityDecision, { outcome: enrollment.outcome, enrollment, categoryIds });
  }
  if (mustWait && waitlistCapacity > 0 && !occupiedWaitlist.has(requestKey) && occupiedWaitlist.size >= waitlistCapacity) {
    return { outcome:'capacityFull' };
  }
  if (!mustWait && !organizerManual && !drawn && tournament.enrollmentLimitMode !== 'draw') {
    const byName = tournament.maxParticipantsByCategory || {};
    const general = Number(tournament.maxParticipantsPerCategory);
    const labels = new Map(definitions.map(definition => [definition.id, definition.label]));
    for (const categoryId of categoryIds) {
      const label = labels.get(categoryId);
      const limit = Object.prototype.hasOwnProperty.call(byName, label) ? Number(byName[label]) : general;
      if (!Number.isSafeInteger(limit) || limit <= 0) continue;
      const occupied = registrations.filter(registration => registration && registration.categoryId === categoryId &&
        ['confirmed', 'pending'].includes(registration.status)).length;
      const incoming = enrollment.creates.filter(registration => registration.categoryId === categoryId).length +
        enrollment.updates.filter(registration => registration.categoryId === categoryId).length;
      if (occupied + incoming > limit) return { outcome: 'capacityFull', categoryId };
    }
  }
  if (!mustWait && !organizerManual && !drawn && tournament.enrollmentLimitMode !== 'draw' && Number.isFinite(cap) && cap > 0) {
    const activeParticipantKeys = new Set(registrations
      .filter((registration) => registration && ['confirmed', 'pending'].includes(registration.status))
      .map((registration) => registration.participantKey));
    // A mesma pessoa pode adicionar categoria sem consumir outra vaga geral.
    const requestKey = (enrollment.creates[0] || enrollment.updates[0]).participantKey;
    if (!activeParticipantKeys.has(requestKey) && activeParticipantKeys.size >= cap) return { outcome: 'capacityFull' };
  }
  // A elegibilidade aprovada é um dado da decisão, não seu resultado final.
  // Preserve `enrolled` / `waitlisted` / `alreadyRegistered`, que a callable
  // expõe ao cliente para manter a mesma semântica do caminho legado.
  return Object.assign({}, eligibilityDecision, {
    outcome: status === 'waitlisted' ? 'waitlisted' : enrollment.outcome,
    enrollment,
    categoryIds,
  });
}

module.exports = { decide };
