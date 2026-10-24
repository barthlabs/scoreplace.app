'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { validateTeamTieDrawOrder, hasFrozenClassification } = require('../functions-autodraw/team-tie-draw-order-core');

const base = {
  status: 'in_progress',
  teamCompetition: { enabled: true, classificationUnit: 'team', tiebreakers: ['vitorias', 'games_vencidos', 'sorteio'] },
  competitionTeams: [{ id: 'eclipse' }, { id: 'panic' }, { id: 'venom' }]
};
const order = ['venom', 'eclipse', 'panic'];
assert.equal(validateTeamTieDrawOrder(base, order), null);
assert.equal(validateTeamTieDrawOrder({ ...base, teamCompetition: { ...base.teamCompetition, tieDrawOrder: order } }, order), null);
for (const candidate of [
  ['venom', 'eclipse'],
  ['venom', 'eclipse', 'eclipse'],
  ['venom', 'eclipse', 'unknown'],
  [1, 'eclipse', 'panic']
]) assert.equal(validateTeamTieDrawOrder(base, candidate).code, 'invalid-argument');
for (const changed of [
  { status: 'finished' },
  { finishedAt: '2026-10-24T00:00:00Z' },
  { currentPhaseIndex: 1 },
  { rounds: [{ groups: [{ classifCongelada: [] }] }] },
  { phases: [{ rounds: [{ monarchGroups: [{ classifCongeladaAt: '2026-10-24' }] }] }] }
]) assert.equal(validateTeamTieDrawOrder({ ...base, ...changed }, order).code, 'failed-precondition');
assert(hasFrozenClassification({ phaseRounds: [{ groups: [{ classifCongelada: [] }] }] }));
for (const config of [
  { enabled: false, tiebreakers: ['sorteio'] },
  { enabled: true, tiebreakers: ['vitorias'] },
  { enabled: true, classificationUnit: 'pair', tiebreakers: ['sorteio'] }
]) assert.equal(validateTeamTieDrawOrder({ ...base, teamCompetition: config }, order).code, 'failed-precondition');
assert.equal(validateTeamTieDrawOrder({ ...base, competitionTeams: [{ id: 'eclipse' }, { id: 'eclipse' }] }, ['eclipse', 'eclipse']).code, 'failed-precondition');

const index = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const start = index.indexOf('exports.setTeamTieDrawOrder =');
const end = index.indexOf('exports.resetTournamentCheckIn =', start);
assert(start > 0 && end > start);
const handler = index.slice(start, end);
for (const required of ['request.auth', '_assertSandboxDrawOwner', '_isTournamentAdmin', 'validateTeamTieDrawOrder', "'teamCompetition.tieDrawOrder'", 'tx.update']) {
  assert(handler.includes(required), `missing server guard: ${required}`);
}
assert(!handler.includes('_gravaTorneio'), 'draw-order registration must not rewrite matches or scores');
const ui = fs.readFileSync(path.join(__dirname, '../js/views/tournaments.js'), 'utf8');
assert(ui.includes("_callFn('setTeamTieDrawOrder'"));
assert(ui.includes('O app não realiza o sorteio'));
console.log('team-tie-draw-order: OK');
