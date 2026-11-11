'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const tieCore = require('../functions-autodraw/phase-tie-core');
const standingsAdapter = require('../functions-autodraw/vendor/standings-core.js');

const source = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const from = source.indexOf('function _buildPhaseTieRuntime(');
const to = source.indexOf('exports.advanceTournamentPhase = onCall', from);
assert(from > 0 && to > from, 'o resolvedor de placar e avanço é compartilhado');
const group = { name: 'Diamante · Grupo 1', rows: [
  { uid: 'A', name: 'A', wins: 3 }, { uid: 'B', name: 'B', wins: 2 },
  { uid: 'C', name: 'C', wins: 2 }, { uid: 'D', name: 'D', wins: 0 }
], matches: [
  { id: 'm1', winner: 'A', groupIdx: 0, isMonarch: true, team1: ['A', 'B'], team2: ['C', 'D'] },
  { id: 'm2', winner: 'B', groupIdx: 0, isMonarch: true, team1: ['A', 'C'], team2: ['B', 'D'] },
  { id: 'm3', groupIdx: 0, isMonarch: true, team1: ['A', 'D'], team2: ['B', 'C'] }
] };
const tournament = { fmt2: { tieResolution: 'singles_then_draw', tieSinglesPoints: 5,
  tieSinglesMargin: 1 }, phases: [{ kind: 'classification' }, { kind: 'elimination' }],
currentPhaseIndex: 0, groups: [group], rounds: [] };
const phaseEngine = {
  projectPhaseCfg: (phase, t, index) => phase.kind === 'classification' ? { kind: 'classification' }
    : { kind: 'elimination', source: { type: 'previous_phase', scope: t.overall ? 'overall' : 'per_group',
      mapping: [{ dest: 'next', rankFrom: 1, rankTo: 2 }] } },
  phaseGames: (t, index) => t.rounds.some(r => r.monarchGroups && r.monarchGroups.length)
    ? t.rounds.flatMap(r => (r.monarchGroups || []).flatMap((g, groupIdx) =>
      g.matches.map(match => ({ match, groupIdx }))))
    : t.groups.flatMap((g, groupIdx) => g.matches.map(match => ({ match,
      groupIdx: index > 0 ? undefined : groupIdx }))),
  prevPhaseGroups: t => t.rounds.some(r => r.monarchGroups && r.monarchGroups.length)
    ? t.rounds.filter(r => r.monarchGroups && r.monarchGroups.length).at(-1).monarchGroups : t.groups,
  bracketPhaseGroups: t => t.groups,
  ehReiRainhaRodadaUnica: () => true,
  usaRankingGeral: scope => scope === 'overall',
  globalStandings: (groups, calculate) => groups.flatMap(calculate),
  effectiveAdvancedScoring: () => ({ enabled: false })
};
const drawWindow = {
  _phasesEngine: phaseEngine,
  _assignGlobalGameNumbers: t => phaseEngine.phaseGames(t, 0).forEach((entry, index) => {
    entry.match._gameNum = index + 1;
  }),
  _standingsOrdemChave: () => ({ A: 0, B: 1, C: 2, D: 3 }),
  _standingsCompare: (a, b) => b.wins - a.wins
};
const refresh = vm.runInNewContext(source.slice(from, to) + '\n_refreshAutomaticPhaseTies;', {
  drawWindow, _standingsAdapter:standingsAdapter, _phaseTieCore: tieCore,
  phaseStandingsFn: g => g.rows,
  phaseCompleteFn: t => phaseEngine.phaseGames(t, 0).every(entry => !!entry.match.winner),
  HttpsError: class extends Error {}
});

refresh(tournament, 'm2', '2026-11-07T15:00:00Z');
assert(!tournament.phaseTieDecisions, 'placar antes do fechamento não cria simples');
group.matches[2].winner = 'A';
refresh(tournament, 'm3', '2026-11-07T15:01:00Z');
const decisions = tournament.phaseTieDecisions && tournament.phaseTieDecisions['0'];
assert(decisions, 'a simples é gravada com o terceiro resultado');
const decision = decisions['group-0:1:2'];
assert(decision && decision.status === 'pending');
assert.deepStrictEqual(decision.matches.map(m => m.displayGameNumber), ['3A']);
assert.equal(decision.matches[0].court, undefined, 'a quadra não é bloqueada antecipadamente');
const originalCompare = drawWindow._standingsCompare;
delete drawWindow._standingsCompare;
refresh(tournament, 'm3', '2026-11-07T15:01:30Z');
assert.equal(tournament.phaseTieAutoError, undefined,
  'a ausência do alias global de comparação não interrompe o desempate');
drawWindow._standingsCompare = originalCompare;
refresh(tournament, 'm3', '2026-11-07T15:02:00Z');
assert.equal(tournament.phaseTieDecisions['0']['group-0:1:2'].matches[0].id,
  decision.matches[0].id, 'repetir a confirmação não duplica a simples');
delete group.matches[2].winner;
refresh(tournament, 'm3', '2026-11-07T15:03:00Z');
assert.equal(tournament.phaseTieDecisions['0']['group-0:1:2'], undefined,
  'reabrir o último resultado retira a simples ativa');
assert(tournament.history.some(item => item.phaseTieDecision), 'a decisão anterior fica auditável');

// Um quarteto fechado deve poder pedir desempate enquanto outro ainda joga.
const other = { name: 'Ouro · Grupo 2', rows: [
  { uid: 'E', name: 'E', wins: 3 }, { uid: 'F', name: 'F', wins: 2 },
  { uid: 'G', name: 'G', wins: 1 }, { uid: 'H', name: 'H', wins: 0 }
], matches: [{ id: 'm4', winner: 'E' }, { id: 'm5', winner: 'F' }, { id: 'm6' }] };
const several = { fmt2: tournament.fmt2, phases: tournament.phases, currentPhaseIndex: 0,
  groups: [group, other], rounds: [] };
group.matches[2].winner = 'A';
refresh(several, 'm3', '2026-11-07T15:04:00Z');
assert(several.phaseTieDecisions['0']['group-0:1:2'],
  'o desempate do grupo fechado surge sem esperar os demais grupos');
assert(!several.phaseTieDecisions['0']['group-1:1:2'],
  'outro grupo ainda em jogo não recebe decisão');
const publishedDraw = { fmt2: tournament.fmt2, phases: tournament.phases,
  currentPhaseIndex: 0, groups: [group], rounds: [], phaseTieDecisions: { '0': {
    'group-0:1:2': { contenders: ['uid:B', 'uid:C'], choice: 'draw',
      status: 'complete', order: ['uid:B', 'uid:C'], matches: [] }
  } } };
delete group.matches[2].winner;
refresh(publishedDraw, 'm3', '2026-11-07T15:05:00Z');
assert.equal(publishedDraw.phaseTieDecisions['0']['group-0:1:2'].choice, 'draw',
  'reabrir um jogo não apaga decisão já publicada');
group.matches[2].winner = 'A';
refresh(publishedDraw, 'm3', '2026-11-07T15:06:00Z');
assert.equal(publishedDraw.phaseTieDecisions['0']['group-0:1:2'].status, 'complete',
  'fechar o jogo sem alterar a fronteira preserva a decisão publicada');
const firstRound = { monarchGroups: [
  { name: 'Grupo 1', matches: [{ id: 'r1a', winner: 'A' }] },
  { name: 'Grupo 2', matches: [{ id: 'r1b', winner: 'E' }] }
] };
const secondRound = { monarchGroups: [
  { name: 'Grupo 1', rows: group.rows, matches: [{ id: 'r2a', winner: 'A' }] },
  { name: 'Grupo 2', rows: other.rows, matches: [{ id: 'r2b' }] }
] };
const multi = { fmt2: tournament.fmt2, phases: [{ kind: 'classification', rounds: 2 },
  tournament.phases[1]], currentPhaseIndex: 0, rounds: [firstRound, secondRound] };
refresh(multi, 'r2a', '2026-11-07T15:07:00Z');
assert(multi.phaseTieDecisions['0']['group-0:1:2'],
  'na última rodada, o grupo completo recebe a simples antes de outros grupos');
const laterGroup = { name: 'Ouro · Grupo 1', matches: group.matches,
  rankingRows: group.rows };
const later = { fmt2: tournament.fmt2, phases: [
  { kind: 'elimination' }, { kind: 'classification' }, { kind: 'elimination' }
], currentPhaseIndex: 1, rounds: [], groups: [laterGroup] };
refresh(later, 'm3', '2026-11-07T15:07:30Z');
assert(later.phaseTieDecisions['1']['group-0:1:2'],
  'desempate também surge numa classificatória posterior à primeira fase');
const overall = { fmt2: tournament.fmt2, phases: tournament.phases,
  currentPhaseIndex: 0, groups: [group, other], rounds: [], overall: true,
  phaseTieAutoError: { phaseIndex: 0, message: 'falha anterior' },
  phaseTieDecisions: { '0': { 'overall:1:2': { status: 'pending',
    contenders: ['uid:B', 'uid:C'], matches: [] } } } };
delete other.matches[2].winner;
refresh(overall, 'm6', '2026-11-07T15:08:00Z');
assert.equal(overall.phaseTieDecisions['0']['overall:1:2'], undefined,
  'reabertura de pool geral retira somente disputa ainda pendente');
assert.equal(overall.phaseTieAutoError, undefined, 'erro antigo some após reavaliação sem falha');
const ungeneratedOverall = { fmt2: tournament.fmt2,
  phases: [{ kind: 'classification', rounds: 2 }, tournament.phases[1]],
  currentPhaseIndex: 0, rounds: [firstRound], overall: true,
  phaseTieDecisions: { '0': { 'overall:1:2': { status: 'pending',
    contenders: ['uid:B', 'uid:C'], matches: [] } } } };
refresh(ungeneratedOverall, 'r1a', '2026-11-07T15:09:00Z');
assert.equal(ungeneratedOverall.phaseTieDecisions['0']['overall:1:2'], undefined,
  'pool geral pendente é arquivado quando falta gerar rodada planejada');
console.log('automatic-phase-tie-after-score: ok');
