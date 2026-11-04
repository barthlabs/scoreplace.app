'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const tieCore = require('../functions-autodraw/phase-tie-core');
const titles = require('../js/views/tournament-titles.js');

// Executa a função real do callable em isolamento: importar index.js registraria
// Functions e segredos; copiar sua regra para o teste faria o teste ficar verde
// mesmo que o servidor mudasse.
const source = fs.readFileSync(require.resolve('../functions-autodraw/index.js'), 'utf8');
const start = source.indexOf('function _resolveFinalClassificationTie(');
const end = source.indexOf('\nexports.finishTournament =', start);
assert(start >= 0 && end > start);
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const games = [{ match: { id: 'm93', p1: 'A', p2: 'B', p1Uid: 'A', p2Uid: 'B', _gameNum: 93 } }];
const engine = {
  phaseGames: t => t.matches ? t.matches.map(match => ({ match })) : games,
  prevPhaseGroups: t => t.groups || [],
  groupTeamStandings: g => g.standings
};
const drawWindow = {
  _phasesEngine: engine,
  _computeStandings: t => t.standings,
  _standingsCompareConfig: (a, b) => b.wins - a.wins,
  _standingsCompare: (a, b) => b.wins - a.wins,
  _standingsOrdemChave: matches => Object.fromEntries(matches.flatMap((match, index) =>
    [[String(match.p1Uid || match.p1), index * 2], [String(match.p2Uid || match.p2), index * 2 + 1]])),
  _standingsBuildH2H: () => ({}),
  _slotUids: (match, side) => [match[side + 'Uid']],
  _assignGlobalGameNumbers: () => {}
};
const context = { HttpsError, drawWindow, phaseCompleteFn: () => true,
  _phaseTieCore: tieCore, _courtOccupancy: { occupiesCourt: () => false } };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const resolveTie = context._resolveFinalClassificationTie;
const tournament = () => ({
  phases: [{ kind: 'classification', classification: { structure: 'round_robin' },
    scoring: { setsToWin: 1 } }],
  currentPhaseIndex: 0, fmt2: { tieResolution: 'singles_then_draw' },
  tiebreakers: ['vitorias', 'sorteio'], courtNames: ['Quadra 1'],
  standings: [{ uid: 'A', name: 'A', wins: 1 }, { uid: 'B', name: 'B', wins: 1 }]
});
const now = '2026-11-03T12:00:00.000Z';
let t = tournament();
let flow = resolveTie(t, null, now);
assert.equal(flow.status, 'choice');
assert.equal(flow.tie.firstExtraGameNumber, '93A');
flow = resolveTie(t, { type: 'play', decisionId: flow.tie.decisionId }, now);
assert.equal(flow.status, 'pending');
assert.equal(flow.changed, true);
t = structuredClone(t); // a callable persiste a decisão; a próxima chamada relê o documento
assert.equal(flow.decision.matches[0].displayGameNumber, '93A');
const matchId = flow.decision.matches[0].id;
flow = resolveTie(t, { type: 'court', decisionId: flow.tie.decisionId,
  matchId, court: 'Quadra 1' }, now);
assert.equal(flow.decision.matches[0].court, 'Quadra 1');
flow = resolveTie(t, { type: 'score', decisionId: flow.tie.decisionId,
  matchId, sets: [{ p1: 4, p2: 6 }] }, now);
assert.equal(flow.status, 'review');
assert.equal(flow.changed, true);
t = structuredClone(t); // o placar extra precisa sobreviver à próxima transação
assert.equal(t.phaseTieDecisions['0'][flow.tie.decisionId].matches[0].winnerKey, 'uid:B');
flow = resolveTie(t, { type: 'confirm', decisionId: flow.tie.decisionId }, now);
assert.equal(flow.status, 'ready');
assert.equal(flow.changed, true);
assert.equal(titles.resolve(t, { engine: { phaseComplete: () => true },
  standings: () => t.standings }).titles[0].winnerName, 'B');

const automatic = tournament();
automatic.fmt2.tieResolution = 'draw_order';
assert.equal(resolveTie(automatic, null, now).status, 'ready');
assert.equal(titles.resolve(automatic, { engine: { phaseComplete: () => true },
  standings: () => automatic.standings }).titles[0].winnerName, 'A');
const untied = tournament();
untied.standings[0].wins = 2;
assert.equal(resolveTie(untied, null, now).status, 'ready');
assert.equal(untied.phaseTieDecisions, undefined);
const manualAthletes = tournament();
manualAthletes.standings.forEach(row => { delete row.uid; });
assert.equal(resolveTie(manualAthletes, null, now).status, 'choice');
assert.throws(() => resolveTie(tournament(), { type: 'score', decisionId: 'forged',
  matchId: 'm93', sets: [{ p1: 6, p2: 4 }] }, now), /desatualizada/);
const grouped = tournament();
grouped.phases[0].classification.structure = 'groups';
grouped.phases[0].gruposCount = 2;
grouped.groups = [
  { name: 'Leste', matches: [{ id: 'g93', p1: 'A', p2: 'B', p1Uid: 'A', p2Uid: 'B', _gameNum: 93 }],
    standings: [{ uid: 'A', name: 'A', wins: 1 }, { uid: 'B', name: 'B', wins: 1 }] },
  { name: 'Oeste', matches: [{ id: 'g94', p1: 'C', p2: 'D', p1Uid: 'C', p2Uid: 'D', _gameNum: 94 }],
    standings: [{ uid: 'C', name: 'C', wins: 2 }, { uid: 'D', name: 'D', wins: 1 }] }
];
grouped.matches = grouped.groups.flatMap(group => group.matches);
let groupFlow = resolveTie(grouped, null, now);
assert.equal(groupFlow.tie.decisionId, 'group-0:0:1');
groupFlow = resolveTie(grouped, { type: 'draw', decisionId: groupFlow.tie.decisionId }, now);
assert.equal(groupFlow.status, 'ready');
assert.deepEqual(titles.resolve(grouped, { engine: { ...engine, phaseComplete: () => true } })
  .titles.map(title => title.winnerName), ['A', 'C']);
console.log('✓ encerramento: empate, simples, placar, confirmação e título pelo resultado');
