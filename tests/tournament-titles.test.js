'use strict';
const assert = require('node:assert/strict');
global.window = global;
const titles = require('../js/views/tournament-titles.js');
const teamCore = require('../js/domain/team-competition.js');
const realEngine = require('../js/views/phases-engine.js');
const engine = { phaseComplete: () => true, prevPhaseGroups: t => t.groups || [], groupTeamStandings: g => g.standings };
const resolve = (t, overrides = {}) => titles.resolve(t, { engine, teamCore, standings: () => t.standings || [], ...overrides });

const gf = { id: 'final', phaseIndex: 1, bracket: 'grandfinal', p1: 'A', p2: 'B',
  p1Uid: 'uA', p2Uid: 'uB', winner: 'A' };
const elimination = { phases: [{ kind: 'classification' }, { kind: 'elimination' }],
  currentPhaseIndex: 1, matches: [gf] };
assert.deepEqual(resolve(elimination).titles.map(x => [x.scope, x.winnerName, x.winnerUids]),
  [['overall', 'A', ['uA']]]);
assert.deepEqual(resolve({ ...elimination, matches: [{ ...gf, p1: 'Mesmo nome', p2: 'Mesmo nome',
  winner: 'Mesmo nome', winnerUid: 'uB', winnerUids: ['uB'] }] }).titles.map(x => x.winnerUids), [['uB']]);
assert.equal(resolve({ ...elimination, currentPhaseIndex: 0 }).reason, 'more-phases');
assert.equal(resolve({ ...elimination, matches: [{ ...gf, winner: null }] },
  { engine: { phaseComplete: () => false } }).reason, 'phase-incomplete');

const independent = { phases: [{ kind: 'elimination' }], currentPhaseIndex: 0, matches: [
  { id: 'a', bracket: 'gold', tierLabel: 'Mar', p1: 'A', p2: 'B', winner: 'A', p1Uid: 'uA' },
  { id: 'b', bracket: 'silver', tierLabel: 'Serra', p1: 'C', p2: 'D', winner: 'D', p2Uid: 'uD' }
] };
assert.deepEqual(resolve(independent).titles.map(x => [x.scope, x.label, x.winnerName]),
  [['line', 'Mar', 'A'], ['line', 'Serra', 'D']]);
assert.deepEqual(resolve({ ...independent, matches: [independent.matches[0], {
  id: 'c-bye', bracket: 'line3', tierLabel: 'Vale', p1: 'E', p2: 'BYE (Avança Direto)',
  winner: 'E', isBye: true, p1Uid: 'uE'
}] }).titles.map(x => x.winnerName), ['A', 'E']);

const groups = { phases: [{ kind: 'classification', classification: { structure: 'groups' }, gruposCount: 2 }],
  currentPhaseIndex: 0, groups: [
    { name: 'Grupo Leste', standings: [{ name: 'L1', uid: 'uL1' }] },
    { name: 'Grupo Oeste', standings: [{ name: 'O1', uid: 'uO1' }] }
  ] };
assert.deepEqual(resolve(groups).titles.map(x => [x.scope, x.label, x.winnerName]),
  [['group', 'Grupo Leste', 'L1'], ['group', 'Grupo Oeste', 'O1']]);
assert.equal(titles.resolve(groups, { engine: { phaseComplete: () => true } }).reason,
  'standings-unavailable', 'sem motor de tabela a resolução retorna erro controlado');
const playedGroups = { phases: groups.phases, currentPhaseIndex: 0, groups: [
  { name: 'A', players: ['A1', 'A2'], matches: [{ id: 'a', p1: 'A1', p2: 'A2', winner: 'A1', scoreP1: 6, scoreP2: 4 }] },
  { name: 'B', players: ['B1', 'B2'], matches: [{ id: 'b', p1: 'B1', p2: 'B2', winner: 'B2', scoreP1: 3, scoreP2: 6 }] }
] };
assert.equal(realEngine.phaseComplete(playedGroups), true);
assert.deepEqual(resolve(playedGroups, { engine: realEngine }).titles.map(x => x.winnerName), ['A1', 'B2']);
assert.deepEqual(resolve({ phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }],
  currentPhaseIndex: 0, standings: [{ name: 'Líder', uid: 'u1' }] }).titles.map(x => x.winnerName), ['Líder']);
const titleTie = { phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }],
  currentPhaseIndex: 0, standings: [{ name: 'Líder', uid: 'u1' }],
  phaseTieDecisions: { 0: { extra: { status: 'review' } } } };
assert.equal(resolve(titleTie).reason, 'tie-pending',
  'encerramento não atribui título antes de confirmar o desempate extra');
assert.deepEqual(resolve({ ...titleTie, phaseTieDecisions: { 0: { extra: { status: 'complete' } } } })
  .titles.map(x => x.winnerName), ['Líder']);

const teamBase = { phases: [{ kind: 'classification', classification: { structure: 'groups' }, gruposCount: 1 }],
  currentPhaseIndex: 0, competitionTeams: [{ id: 't1', name: 'Time Um' }, { id: 't2', name: 'Time Dois' }],
  teamCompetition: { enabled: true, classificationUnit: 'team', aggregation: 'overall' },
  matches: [
    { id: 'f', bracket: 'group', category: 'Feminino', p1: 'F1', p2: 'F2', p1CompetitionTeamId: 't1', p2CompetitionTeamId: 't2', winner: 'F1' },
    { id: 'm', bracket: 'group', category: 'Masculino', p1: 'M1', p2: 'M2', p1CompetitionTeamId: 't2', p2CompetitionTeamId: 't1', winner: 'M1' },
    { id: 'f2', bracket: 'group', category: 'Feminino', p1: 'F3', p2: 'F4', p1CompetitionTeamId: 't1', p2CompetitionTeamId: 't2', winner: 'F3' }
  ] };
assert.deepEqual(resolve(teamBase).titles.map(x => [x.scope, x.winnerId]), [['overall', 't1']]);
const categoryTeams = { ...teamBase, teamCompetition: { ...teamBase.teamCompetition, aggregation: 'per_category' } };
assert.deepEqual(resolve(categoryTeams).titles.map(x => [x.scope, x.label, x.winnerId]),
  [['category', 'Feminino', 't1'], ['category', 'Masculino', 't2']]);
const teamGroups = { ...teamBase, phases: [{ kind: 'classification', classification: { structure: 'groups' }, gruposCount: 2 }], competitionTeams: [
  { id: 't1', name: 'Time Um' }, { id: 't2', name: 'Time Dois' },
  { id: 't3', name: 'Time Três' }, { id: 't4', name: 'Time Quatro' }
], groups: [
  { name: 'Praia', matches: [
    { id: 'g1f', category: 'Feminino', p1: 'A / B', p2: 'C / D',
      p1CompetitionTeamId: 't1', p2CompetitionTeamId: 't2', winner: 'A / B' },
    { id: 'g1m', category: 'Masculino', p1: 'E / F', p2: 'G / H',
      p1CompetitionTeamId: 't1', p2CompetitionTeamId: 't2', winner: 'E / F' }
  ] },
  { name: 'Serra', matches: [
    { id: 'g2f', category: 'Feminino', p1: 'I / J', p2: 'K / L',
      p1CompetitionTeamId: 't3', p2CompetitionTeamId: 't4', winner: 'I / J' },
    { id: 'g2f2', category: 'Feminino', p1: 'Q / R', p2: 'S / T',
      p1CompetitionTeamId: 't3', p2CompetitionTeamId: 't4', winner: 'Q / R' },
    { id: 'g2m', category: 'Masculino', p1: 'M / N', p2: 'O / P',
      p1CompetitionTeamId: 't3', p2CompetitionTeamId: 't4', winner: 'O / P' }
  ] }
] };
assert.deepEqual(resolve(teamGroups).titles.map(x => [x.scope, x.label, x.winnerId]),
  [['group', 'Praia', 't1'], ['group', 'Serra', 't3']],
  'times de grupos independentes recebem campeões por grupo, sem campeão geral');
const objectTeams = { ...teamGroups, groups: teamGroups.groups.map(g => ({ ...g,
  matches: g.matches.map(m => ({ ...m, team1Obj: { competitionTeamId: m.p1CompetitionTeamId },
    team2Obj: { competitionTeamId: m.p2CompetitionTeamId },
    p1CompetitionTeamId: undefined, p2CompetitionTeamId: undefined })) })) };
assert.deepEqual(resolve(objectTeams).titles.map(x => x.winnerId), ['t1', 't3'],
  'times identificados só pelos objetos das partidas ainda disputam os títulos por grupo');
const unknownTeam = { ...teamGroups, groups: [teamGroups.groups[0], {
  ...teamGroups.groups[1], matches: teamGroups.groups[1].matches.map(m => ({ ...m,
    p1CompetitionTeamId: undefined, team1Obj: undefined }))
}] };
assert.equal(resolve(unknownTeam).reason, 'standings-unavailable',
  'identidade ausente em um grupo impede a publicação parcial de campeões');
assert.equal(realEngine.phaseComplete(teamGroups), true);
assert.deepEqual(resolve(teamGroups, { engine: realEngine }).titles.map(x => [x.scope, x.label, x.winnerId]),
  [['group', 'Praia', 't1'], ['group', 'Serra', 't3']],
  'o resolvedor usa os grupos do motor real, não uma tabela de teste');
assert.equal(resolve({ ...teamGroups, groups: [teamGroups.groups[0]] }).reason,
  'standings-unavailable', 'grupo ausente impede título parcial');
assert.deepEqual(resolve({ ...teamGroups, teamCompetition: {
  ...teamGroups.teamCompetition, aggregation: 'per_category'
} }).titles.map(x => [x.scope, x.label, x.winnerId]), [
  ['group', 'Praia · Feminino', 't1'], ['group', 'Praia · Masculino', 't1'],
  ['group', 'Serra · Feminino', 't3'], ['group', 'Serra · Masculino', 't4']
], 'categoria escolhida pela organização não mistura grupos independentes');
const pairGroups = { ...teamGroups, competitionPairs: [{ id: 'ghost', name: 'AAA / BBB' }],
  teamCompetition: { ...teamGroups.teamCompetition, classificationUnit: 'pair',
    scoring: { win: -1, draw: -1, loss: 0 } } };
assert.deepEqual(resolve(pairGroups).titles.map(x => x.winnerName), ['C / D', 'K / L'],
  'dupla inscrita fora do grupo não entra na tabela daquele grupo, mesmo com pontuação negativa');
const realPairs = { ...teamGroups, competitionPairs: [
  { id: 'a', name: 'A / B' }, { id: 'b', name: 'C / D' },
  { id: 'c', name: 'I / J' }, { id: 'd', name: 'K / L' },
  { id: 'ghost', name: 'AAA / BBB' }
], teamCompetition: { ...teamGroups.teamCompetition, classificationUnit: 'pair' },
groups: teamGroups.groups.map((g, gi) => ({ ...g, matches: [
  { ...g.matches[0], p1PairId: gi ? 'c' : 'a', p2PairId: gi ? 'd' : 'b' }
] })) };
assert.deepEqual(resolve(realPairs).titles.map(x => [x.label, x.winnerId]),
  [['Praia', 'a'], ['Serra', 'c']],
  'duplas reais são pontuadas pelos jogos do próprio grupo e mantêm seus IDs');
console.log('✓ títulos resolvidos por final, linha, grupo, ranking e time/categoria');
