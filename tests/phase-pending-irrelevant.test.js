'use strict';
const assert = require('node:assert/strict');
const { E } = require('./headless.js');
const pendingDecision = require('../functions-autodraw/phase-pending-decision-core.js');

const match = (id, p1, p2, winner) => ({
  id, p1, p2, winner: winner || null, scoreP1: winner === p1 ? 6 : winner === p2 ? 2 : null,
  scoreP2: winner === p2 ? 6 : winner === p1 ? 2 : null
});
const tournament = {
  phases: [
    { kind: 'classification', classification: { structure: 'groups' }, gruposCount: 1 },
    { kind: 'elimination', source: { type: 'previous_phase', scope: 'per_group',
      mapping: [{ dest: 'main', rankFrom: 1, rankTo: 1 }] } }
  ],
  currentPhaseIndex: 0,
  groups: [{ name: 'A', players: ['A', 'B', 'C', 'D'], matches: [
    match('1', 'A', 'B', 'A'), match('2', 'A', 'C', 'A'), match('3', 'A', 'D', 'A'),
    match('4', 'B', 'C', 'B'), match('5', 'B', 'D', 'B'), match('6', 'C', 'D', null)
  ] }]
};
assert.equal(E.phaseComplete(tournament), false);
assert.equal(E.pendingMatches(tournament).length, 1);
assert.equal(E.pendingIrrelevantForAdvance(tournament), true,
  'jogo só entre eliminados não muda classificado nem sua posição');
assert.deepEqual(Array.from(pendingDecision.decide(tournament, false, E, null).ignoredPendingIds), ['6'],
  'servidor relê o jogo sem impacto e registra seu ID');
const decisive = structuredClone(tournament);
decisive.groups[0].matches[5] = match('6', 'A', 'D', null);
assert.equal(E.pendingIrrelevantForAdvance(decisive), false,
  'partida do classificado continua exigindo resultado');
const seeding = structuredClone(tournament);
seeding.groups[0].matches.push(match('7', 'A', 'D', null));
assert.equal(E.pendingIrrelevantForAdvance(seeding), false);
assert.deepEqual(Array.from(E.pendingSeedOnlyForAdvance(seeding)), ['6', '7'],
  'vagas já definidas com seeding ainda mutável exigem escolha explícita');
assert.equal(pendingDecision.decide(seeding, false, E, null).reason, 'seed-choice-required');
assert.equal(pendingDecision.decide(seeding, false, E, ['6']).reason, 'seed-choice-stale',
  'aceite parcial não libera um jogo sem escolha');
assert.equal(pendingDecision.decide(seeding, false, E, ['6', '7']).seedChoiceAccepted, true);
assert.equal(pendingDecision.decide(seeding, true, E, ['6', '7']).reason, 'seed-choice-stale',
  'aceite antigo não vale depois que a classificação muda');
assert.equal(pendingDecision.decide(seeding, false, E, ['6', '6']).reason, 'invalid-argument');
const reachable = structuredClone(tournament);
reachable.groups[0].matches[1].winner = null;
assert.equal(E.pendingIrrelevantForAdvance(reachable), false,
  'sem vantagem matemática suficiente não há liberação');
const team = structuredClone(tournament);
team.teamCompetition = { enabled: true };
assert.equal(E.pendingIrrelevantForAdvance(team), false,
  'pontuação agregada por times exige análise própria');
const customPoints = structuredClone(tournament);
customPoints.phases[0].advancedScoring = { enabled: true, winPoints: 5 };
assert.equal(E.pendingIrrelevantForAdvance(customPoints), false,
  'pontuação configurada na fase não usa o limite básico de três pontos');
const lines = structuredClone(tournament);
lines.phases[1].source.mapping.push({ dest: 'second', rankFrom: 2, rankTo: 4 });
assert.equal(E.pendingIrrelevantForAdvance(lines), false,
  'jogo que pode mudar o destino em outra linha não é dispensado');
console.log('✓ jogo pendente só é dispensado com prova estrita de irrelevância');
