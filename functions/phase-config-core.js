'use strict';

/*
 * Contrato puro da configuração de uma fase nova.
 *
 * Não adapta `formatCode`, nem grava Firestore. Essa fronteira é deliberada:
 * formatos legados continuam sendo lidos pelo adaptador até que os planejadores
 * tenham fixtures de paridade. O normalizador recusa, em vez de corrigir, uma
 * combinação que alteraria silenciosamente o torneio do organizador.
 */

const KINDS = new Set(['classification', 'elimination']);
const DRAW_MODALITIES = new Set(['standard', 'monarch']);
const TEAM_FORMATIONS = new Set(['none', 'participant', 'organizer', 'random']);
const PAIR_PERSISTENCE = new Set(['phase', 'round']);
const PAIRINGS = new Set(['random', 'performance', 'balance']);
const SCHEDULE_MODES = new Set(['manual', 'automatic']);
const LATE_ENROLLMENT = new Set(['closed', 'waitlist', 'expand_before_play']);
const CLASSIFICATION_STRUCTURES = new Set(['round_robin', 'groups', 'swiss']);
const BRACKET_POLICIES = new Set(['repescagem', 'bye', 'sobra_unica']);

function fail(message) { throw new Error(message); }
function object(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(message);
  return value;
}
function only(value, allowed, message) {
  if (Object.keys(value).some((key) => !allowed.has(key))) fail(message);
}
function member(value, values, message) {
  if (!values.has(value)) fail(message);
  return value;
}
function optionalIso(value, message) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) fail(message);
  return value;
}

function normalizePhaseConfig(input) {
  const raw = object(input, 'phaseConfig inválido');
  only(raw, new Set(['schemaVersion', 'kind', 'entrants', 'competition', 'draw', 'schedule', 'lateEnrollment', 'structure', 'seeding', 'bracketPolicy']), 'campo de phaseConfig não permitido');
  if (raw.schemaVersion !== 1) fail('schemaVersion inválido');
  const kind = member(raw.kind, KINDS, 'kind de fase inválido');

  const entrants = object(raw.entrants, 'entrants inválido');
  only(entrants, new Set(['source', 'categoryIds']), 'campo de entrants não permitido');
  if (!['enrollments', 'previous_phase'].includes(entrants.source)) fail('origem de entrants inválida');
  if (!Array.isArray(entrants.categoryIds) || entrants.categoryIds.some((id) => typeof id !== 'string' || !id.trim()) || new Set(entrants.categoryIds).size !== entrants.categoryIds.length) fail('categoryIds inválidos');

  const competition = object(raw.competition, 'competition inválida');
  only(competition, new Set(['teamSize']), 'campo de competition não permitido');
  if (![1, 2].includes(competition.teamSize)) fail('teamSize inválido');

  const draw = object(raw.draw, 'draw inválido');
  only(draw, new Set(['modality', 'teamFormation', 'pairPersistence', 'pairing', 'antiRepeat']), 'campo de draw não permitido');
  if (raw.draw.modality === 'super8') fail('super8 ainda não está definido para uso');
  const modality = member(draw.modality, DRAW_MODALITIES, 'modalidade de sorteio inválida');
  const teamFormation = member(draw.teamFormation, TEAM_FORMATIONS, 'formação de equipe inválida');
  const pairPersistence = member(draw.pairPersistence, PAIR_PERSISTENCE, 'persistência de dupla inválida');
  const pairing = member(draw.pairing, PAIRINGS, 'pareamento inválido');
  const antiRepeat = object(draw.antiRepeat, 'antiRepeat inválido');
  only(antiRepeat, new Set(['partners', 'opponents', 'sitOuts']), 'campo de antiRepeat não permitido');
  ['partners', 'opponents', 'sitOuts'].forEach((key) => { if (typeof antiRepeat[key] !== 'boolean') fail('antiRepeat inválido'); });
  if (competition.teamSize === 1 && teamFormation !== 'none') fail('single não forma dupla');
  if (competition.teamSize === 2 && teamFormation === 'none') fail('dupla exige formação');
  if (modality === 'monarch' && (competition.teamSize !== 2 || teamFormation !== 'random' || pairPersistence !== 'round')) fail('monarch exige dupla aleatória por rodada');

  const schedule = object(raw.schedule, 'schedule inválido');
  only(schedule, new Set(['mode', 'firstAt', 'intervalDays', 'rounds']), 'campo de schedule não permitido');
  const scheduleMode = member(schedule.mode, SCHEDULE_MODES, 'modo de schedule inválido');
  const firstAt = optionalIso(schedule.firstAt, 'firstAt inválido');
  if (scheduleMode === 'automatic' && !firstAt) fail('schedule automático exige firstAt');
  if (!Number.isInteger(schedule.rounds) || schedule.rounds < 1) fail('rounds inválido');
  if (schedule.intervalDays != null && (!Number.isInteger(schedule.intervalDays) || schedule.intervalDays < 1)) fail('intervalDays inválido');
  const lateEnrollment = member(raw.lateEnrollment, LATE_ENROLLMENT, 'lateEnrollment inválido');

  if (kind === 'classification') {
    if (raw.seeding !== undefined || raw.bracketPolicy !== undefined) fail('classificatória não tem chave eliminatória');
    const structure = member(raw.structure, CLASSIFICATION_STRUCTURES, 'estrutura classificatória inválida');
    return { schemaVersion: 1, kind, entrants: { source: entrants.source, categoryIds: entrants.categoryIds.slice() }, competition: { teamSize: competition.teamSize }, draw: { modality, teamFormation, pairPersistence, pairing, antiRepeat: Object.assign({}, antiRepeat) }, schedule: { mode: scheduleMode, firstAt, intervalDays: schedule.intervalDays == null ? null : schedule.intervalDays, rounds: schedule.rounds }, lateEnrollment, structure };
  }
  if (raw.structure !== undefined) fail('eliminatória não tem estrutura classificatória');
  if (modality !== 'standard') fail('eliminatória só aceita sorteio standard');
  const seeding = member(raw.seeding, new Set(['performance', 'balance']), 'seeding eliminatório inválido');
  const bracketPolicy = member(raw.bracketPolicy, BRACKET_POLICIES, 'política de chave inválida');
  return { schemaVersion: 1, kind, entrants: { source: entrants.source, categoryIds: entrants.categoryIds.slice() }, competition: { teamSize: competition.teamSize }, draw: { modality, teamFormation, pairPersistence, pairing, antiRepeat: Object.assign({}, antiRepeat) }, schedule: { mode: scheduleMode, firstAt, intervalDays: schedule.intervalDays == null ? null : schedule.intervalDays, rounds: schedule.rounds }, lateEnrollment, seeding, bracketPolicy };
}

// Um torneio é um plano ordenado, não uma fase solta. Mantemos o normalizador
// unitário para a UI por fase, mas a persistência canônica usa este envelope.
function normalizePhasePlan(input) {
  const raw = object(input, 'phasePlan inválido');
  only(raw, new Set(['schemaVersion', 'phases']), 'campo de phasePlan não permitido');
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.phases) || raw.phases.length < 1) fail('phases inválidas');
  const phases = raw.phases.map((phase) => normalizePhaseConfig(phase));
  if (phases[0].entrants.source !== 'enrollments') fail('primeira fase deve partir das inscrições');
  for (let i = 1; i < phases.length; i++) {
    if (phases[i].entrants.source !== 'previous_phase') fail('fase posterior deve partir da fase anterior');
  }
  return { schemaVersion: 1, phases };
}

module.exports = { KINDS, DRAW_MODALITIES, BRACKET_POLICIES, normalizePhaseConfig, normalizePhasePlan };
