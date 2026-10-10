'use strict';

/* Decisão pura da nova inscrição depois da materialização. A Function fornece
 * autenticação, perfil e transação; este módulo não conhece Firestore nem
 * rótulos visíveis. */
const eligibility = require('./category-eligibility-core');
const categoryBridge = require('./registration-category-bridge-core');
const mutations = require('./registration-mutations-core');
const enrollCore = require('./enroll-core');

function decide(input) {
  const value = input || {};
  const tournament = value.tournament || {};
  const registrations = Array.isArray(value.registrations) ? value.registrations : [];
  const participant = value.participant || {};
  if (participant.p1Uid || participant.p2Uid) throw new Error('dupla deve usar a porta canônica de formar dupla');
  const window = enrollCore.enrollmentOpen(tournament, value.nowMs);
  if (!window.open) return { outcome: window.notOpenYet ? 'notOpenYet' : 'closed' };
  const definitions = eligibility.normalizeCategoryDefinitions(tournament.categoryDefinitions);
  const categoryIds = categoryBridge.categoryIdsFromTypedIds(definitions, participant.categoryIds);
  const existingCategoryIds = registrations
    .filter((registration) => registration && registration.participantKey === (participant.uid ? 'uid:' + participant.uid : 'manual:' + participant.manualParticipantId))
    .filter((registration) => registration.status !== 'withdrawn')
    .map((registration) => String(registration.categoryId || ''));
  const eligibilityDecision = eligibility.decideEnrollment({
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
  const status = drawn ? 'waitlisted' : (eligibilityDecision.validationState === 'pending_review' ? 'pending' : 'confirmed');
  const enrollment = mutations.enroll(tournament.id || tournament.tournamentId, registrations, participant, categoryIds, {
    status,
    validationState: eligibilityDecision.validationState,
    manualDisplayName: participant.manualParticipantId ? (participant.displayName || participant.name || '') : '',
  });
  // Repetir exatamente a mesma inscrição é sempre uma consulta idempotente:
  // não pode virar "lotado" ou "em espera" só porque o torneio mudou entre
  // os dois cliques.
  if (!enrollment.creates.length) {
    return Object.assign({}, eligibilityDecision, { outcome: enrollment.outcome, enrollment, categoryIds });
  }
  const cap = Number.parseInt(tournament.maxParticipants, 10);
  if (!drawn && tournament.enrollmentLimitMode !== 'draw' && Number.isFinite(cap) && cap > 0) {
    const active = registrations.filter((registration) => registration && ['confirmed', 'pending'].includes(registration.status)).length;
    if (active >= cap) return { outcome: 'capacityFull' };
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
