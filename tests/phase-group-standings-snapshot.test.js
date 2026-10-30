'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.window;
const E = W._phasesEngine;
const A = require('../functions-autodraw/advance-core.js');
const Split = require('../js/views/tournament-split-core.js');
const WritePlan = require('../functions-autodraw/write-plan.js');

const matches = [
  { id: 'g1', p1: 'A', p2: 'B', p1Uid: 'uA', p2Uid: 'uB', winner: 'A', scoreP1: 6, scoreP2: 4 },
  { id: 'g2', p1: 'C', p2: 'D', p1Uid: 'uC', p2Uid: 'uD', winner: 'C', scoreP1: 6, scoreP2: 4 }
];
const t = { id: 'snapshot-test', currentPhaseIndex: 0, rankingPrimary: 'points',
  phases: [{ name: 'Classificatória', advancedScoring: { enabled: false } }],
  groups: [{ name: 'Grupo A', players: ['A', 'B', 'C', 'D'],
    matches: matches.slice(), rounds: [{ matches: matches.slice() }] }] };
const calculate = group => E.standingsDaFaseAnterior(group, t, {
  tiebreakers: ['vitorias', 'sorteio'], rankingPrimary: t.rankingPrimary
}, false);
const captured = E.capturePhaseGroupStandings(t, calculate, '2026-10-30T00:00:00.000Z');
const published = captured.snapshot.groups[0];
assert.strictEqual(captured.snapshot.phaseIndex, 0);
assert.strictEqual(published.groupName, 'Grupo A');
assert.deepStrictEqual(Array.from(published.phaseGroupRankingRows, row => row.name),
  Array.from(captured.standingsForGroup(t.groups[0]), row => row.name),
  'o retrato grava a ordem entregue ao gerador da fase seguinte');
assert.strictEqual(published.phaseGroupRankingRows.find(row => row.name === 'A').played, 1,
  'jogo duplicado em matches e rounds não duplica estatística');
assert.deepStrictEqual(Array.from(published.phaseGroupRankingRows, row => row.rank), [1, 2, 3, 4]);

t.phaseGroupStandings = { '0': captured.snapshot };
const historicalNames = () => {
  const html = W.renderGroupStage(t, false, false, { historicalPhase: true, suppressAutoAdvance: true });
  const body = (html.match(/<tbody>([\s\S]*?)<\/tbody>/) || [, ''])[1];
  return [...body.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map(row => {
    const cells = [...row[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)];
    return cells[1][1].replace(/<[^>]*>/g, '').trim();
  });
};
const originalOrder = historicalNames();
matches[0].winner = 'B';
matches[0].scoreP1 = 1;
matches[0].scoreP2 = 6;
assert.deepStrictEqual(historicalNames(), originalOrder,
  'a fase histórica não recalcula após mudar um resultado em memória');
assert.deepStrictEqual(originalOrder, Array.from(published.phaseGroupRankingRows, row => row.name));
const historicalScreen = W._renderPhase0ReadOnly(Object.assign({}, t, { currentPhaseIndex: 1 }));
assert(historicalScreen.includes('Grupo A') && historicalScreen.includes('A'),
  'a rota real da fase encerrada exibe o grupo gravado');

const withPublishedOrder = { id: 'published-order', currentPhaseIndex: 0,
  phases: [{ name: 'Classificatória' }], groups: [{ name: 'Grupo A',
    players: ['A', 'B'], classifCongelada: ['B', 'A'], matches: [
      { id: 'p', p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 2 }
    ] }] };
const alreadyPublished = E.capturePhaseGroupStandings(withPublishedOrder,
  group => E.standingsDaFaseAnterior(group, withPublishedOrder, {}, false), 'fixed');
assert.deepStrictEqual(Array.from(alreadyPublished.snapshot.groups[0].phaseGroupRankingRows, row => row.name), ['B', 'A'],
  'ordem previamente publicada prevalece sobre recálculo');
assert.deepStrictEqual(Array.from(alreadyPublished.standingsForGroup(withPublishedOrder.groups[0]), row => row.name), ['B', 'A'],
  'o gerador também recebe a ordem previamente publicada');

const tagged = { id: 'tagged', currentPhaseIndex: 0, phases: [{ name: 'Grupos' }], groups: [],
  matches: [{ id: 't1', phaseIndex: 0, bracket: 'group', groupIdx: 0, groupName: 'Grupo A',
    p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 4 }] };
const taggedSnapshot = E.capturePhaseGroupStandings(tagged,
  group => E.standingsDaFaseAnterior(group, tagged, {}, false), 'fixed');
assert.deepStrictEqual(Array.from(taggedSnapshot.snapshot.groups[0].phaseGroupRankingRows, row => row.name), ['A', 'B'],
  'grupo derivado dos jogos taggeados recebe retrato');
assert.throws(() => E.capturePhaseGroupStandings(tagged, () => [], 'fixed', [], 1), /nenhum grupo/,
  'fonte explicitamente vazia não volta aos grupos da fase inicial');
assert.throws(() => E.capturePhaseGroupStandings(tagged, () => [], 'fixed',
  [{ name: 'Grupo A' }], 1), /grupo sem classificação/,
  'grupo sem classificação não gera retrato vazio nem avança');
assert.throws(() => E.capturePhaseGroupStandings(tagged, () => [{ name: 'A', uid: 'same' },
  { name: 'B', uid: 'same' }], 'fixed', [{ name: 'Grupo A' }], 1), /identidade ausente ou repetida/,
  'identidade repetida impede consolidar a fase');
assert.throws(() => E.capturePhaseGroupStandings(tagged, () => [{ name: 'A' }], 'fixed',
  [{ name: 'Grupo A' }, { name: 'Grupo A' }], 1), /nomes de grupo repetidos/,
  'grupos com o mesmo nome não podem gerar retrato ambíguo');
const sparse = { id: 'sparse', currentPhaseIndex: 0, groups: [{ name: 'Grupo H',
  players: ['A', 'B'], matches: tagged.matches.slice(), rounds: [{ matches: tagged.matches.slice() }] }],
  phaseGroupStandings: { '0': { groups: [{ groupIdx: 7, groupName: 'Grupo H',
    phaseGroupRankingRows: taggedSnapshot.snapshot.groups[0].phaseGroupRankingRows }] } } };
assert(W.renderGroupStage(sparse, false, false, { historicalPhase: true, suppressAutoAdvance: true }).includes('Grupo H'),
  'grupo esparso é encontrado pelo nome publicado, não pela posição visual');
const missingSnapshotGroup = Object.assign({}, sparse, { phaseGroupStandings: { '0': {
  groups: [{ groupName: 'Outro grupo', phaseGroupRankingRows: [] }] } } });
assert(W.renderGroupStage(missingSnapshotGroup, false, false,
  { historicalPhase: true, suppressAutoAdvance: true }).includes('Classificação consolidada indisponível'),
  'retrato divergente mostra aviso, sem tela em branco nem recálculo');

const old = { t: { id: 'old', groups: [{ name: 'Grupo A' }] }, nameByUid: {} };
assert.strictEqual(A.revisionOf(old), A.revisionOf(old, {
  positionalArrays: A.ARRAYS_POSICIONAIS.filter(key => key !== 'phaseGroupRankingRows')
}), 'torneio sem retrato mantém a revisão anterior');
const ordered = { t: { phaseGroupStandings: { '0': { groups: [{ phaseGroupRankingRows: [
  { uid: 'uZ', rank: 1 }, { uid: 'uA', rank: 2 }
] }] } } } };
const reversed = JSON.parse(JSON.stringify(ordered));
reversed.t.phaseGroupStandings['0'].groups[0].phaseGroupRankingRows.reverse();
assert.notStrictEqual(A.revisionOf(ordered), A.revisionOf(reversed),
  'inverter posições congeladas muda o hash de revisão');

const phase0 = { name: 'Grupos', format: 'Fase de Grupos + Eliminatórias',
  formatCode: 'grupos_mata', gruposCount: 2, gruposClassified: 1, source: { type: 'enrollment' } };
const phase1 = { name: 'Eliminatória', format: 'Eliminatórias Simples',
  formatCode: 'elim_simples', bracketResolution: 'bye',
  source: { type: 'previous', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 1 }] } };
const live = { id: 'snapshot-transition', phases: [phase0, phase1], currentPhaseIndex: 0,
  participants: Array.from({ length: 8 }, (_, i) => ({ name: 'J' + (i + 1), displayName: 'J' + (i + 1) })) };
const built = E.generatePhase(live.participants, phase0, { t: live, phaseIndex: 0, idPrefix: 'p0' });
E.storePhase(live, 0, built);
live.matches.filter(m => (m.phaseIndex || 0) === 0 && !m.isBye && !m.isSitOut)
  .forEach(m => { m.winner = m.p1; });
assert.strictEqual(E.phaseIsGroups(E.projectPhaseCfg(phase0, live, 0)), true,
  'a configuração efetiva da fase é reconhecida como grupos');
assert.strictEqual(E.phaseComplete(live), true, 'o fixture terminou a classificatória');
const liveCapture = E.capturePhaseGroupStandings(live,
  group => E.standingsDaFaseAnterior(group, live, {}, false), 'fixed');
const qualified = liveCapture.snapshot.groups.map(group => group.phaseGroupRankingRows[0].name).sort();
const next = E.materializeNextPhase(live, liveCapture.standingsForGroup, 'ph1');
assert.strictEqual(next.ok, true, 'a fase seguinte foi materializada com a classificação capturada');
const entrantNames = live.matches.filter(m => m.phaseIndex === 1)
  .flatMap(m => [m.p1, m.p2]).filter(name => name && name !== 'BYE').sort();
assert.strictEqual(JSON.stringify(Array.from(new Set(entrantNames))), JSON.stringify(qualified),
  'os entrantes da eliminatória são os primeiros colocados gravados em cada grupo');

const later = { id: 'later-groups', currentPhaseIndex: 0, rankingPrimary: 'games_diff',
  phases: [phase0, Object.assign({}, phase0, { name: 'Segunda classificatória', source: {
    type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 4 }] } }), phase1],
  groups: [{ name: 'Grupo A', players: Array.from({ length: 8 }, (_, i) => ({ name: 'L' + i, displayName: 'L' + i })) }] };
assert.strictEqual(E.materializeNextPhase(later, group => group.players, 'later-1').ok, true,
  'a segunda classificatória pode ser materializada');
later.currentPhaseIndex = 1;
const laterMatches = later.matches.filter(match => match.phaseIndex === 1 && match.bracket === 'group');
assert(laterMatches.length > 0, 'há jogos da fase posterior de grupos');
laterMatches.forEach(match => {
  if (match.isBye || match.isSitOut) return;
  match.winner = match.p1;
  match.scoreP1 = 6;
  match.scoreP2 = 4;
});
const laterGroups = E.bracketPhaseGroups(later, 1);
assert(laterGroups.every(group => group.rankingRows.length === group.standings.length),
  'a classificação posterior preserva linhas completas e equipes para o avanço');
const plainPoints = laterGroups.flatMap(group => group.rankingRows.map(row => row.points));
later.phases[1].advancedScoring = { enabled: true, categories: { match_won: { enabled: true, value: 10 } } };
const advancedGroups = E.bracketPhaseGroups(later, 1);
assert(advancedGroups.some(group => group.rankingRows.some(row => row.advancedPoints !== undefined)),
  'Pontuação Avançada habilitada na fase posterior entra nas linhas de classificação');
assert.notDeepStrictEqual(advancedGroups.flatMap(group => group.rankingRows.map(row => row.points)), plainPoints,
  'a pontuação da fase posterior não é recalculada como pontuação simples');
later.phases[1].advancedScoring = { enabled: false };
assert(E.bracketPhaseGroups(later, 1).every(group => group.rankingRows.every(row =>
  row.advancedPoints === undefined)), 'desligar Pontuação Avançada na fase posterior prevalece');
const laterCapture = E.capturePhaseGroupStandings(later, group => group.rankingRows, 'fixed', laterGroups, 1);
assert.strictEqual(laterCapture.snapshot.phaseIndex, 1, 'o retrato pertence à fase posterior');
assert.strictEqual(laterCapture.snapshot.phaseName, 'Segunda classificatória');
assert(laterCapture.snapshot.groups.every(group => group.phaseGroupRankingRows.every(row =>
  Number.isInteger(row.points) && Number.isInteger(row.played))),
  'o retrato posterior guarda pontos e jogos, não apenas a ordem dos times');
const historicalLater = Object.assign({}, later, { groups: laterGroups.map(group => ({
  name: group.name, players: group.rankingRows.map(row => row.name), matches: group.matches,
  rounds: [{ matches: group.matches }]
})), phaseGroupStandings: { '1': laterCapture.snapshot } });
const laterHistoricalHtml = W.renderGroupStage(historicalLater, false, false,
  { historicalPhase: true, suppressAutoAdvance: true });
assert(laterCapture.snapshot.groups.every(group => laterHistoricalHtml.includes(group.groupName)),
  'a leitura histórica da fase posterior apresenta todos os grupos consolidados');
const entrants = group => {
  const byName = new Map(group.standings.map(team => [team.displayName || team.name, team]));
  return laterCapture.standingsForGroup(group).map(row => byName.get(row.name));
};
const laterNext = E.materializeNextPhase(later, entrants, 'later-2', undefined, {
  usarClassificacaoCongelada: true, sourceGroups: laterGroups, standingsForGroup: entrants
});
assert.strictEqual(laterNext.ok, true, 'a fase seguinte usa a classificação consolidada');
assert.deepStrictEqual(Array.from(laterCapture.snapshot.groups, group => group.phaseGroupRankingRows[0].name).sort(),
  [...new Set(later.matches.filter(match => match.phaseIndex === 2)
    .flatMap(match => [match.p1, match.p2]).filter(name => name && name !== 'BYE'))].sort(),
  'os classificados do retrato são os mesmos colocados na eliminatória');

const league = { id: 'league-not-group', currentPhaseIndex: 1, rankingPrimary: 'games_diff',
  phases: [phase0, { name: 'Liga', formatCode: 'liga', advancedScoring: { enabled: false } }, phase1],
  matches: [
    { id: 'l1', phaseIndex: 1, bracket: 'league', p1: 'A', p2: 'C', winner: 'A', scoreP1: 6, scoreP2: 5 },
    { id: 'l2', phaseIndex: 1, bracket: 'league', p1: 'A', p2: 'D', winner: 'A', scoreP1: 6, scoreP2: 5 },
    { id: 'l3', phaseIndex: 1, bracket: 'league', p1: 'B', p2: 'C', winner: 'B', scoreP1: 6, scoreP2: 0 }
  ] };
league.matches.forEach(match => {
  match.team1Obj = { name: match.p1, displayName: match.p1, uid: 'u' + match.p1 };
  match.team2Obj = { name: match.p2, displayName: match.p2, uid: 'u' + match.p2 };
});
assert.strictEqual(E.bracketPhaseGroups(league, 1)[0].standings[0].name, 'B',
  'Liga posterior obedece ao critério principal escolhido sem virar grupo comum');
const leagueRows = () => E.standingsDaFaseAnterior({ matches: league.matches,
  players: ['A', 'B', 'C', 'D'] }, league,
  { rankingPrimary: league.rankingPrimary }, false, 1);
assert(leagueRows().every(row => row.advancedPoints === undefined),
  'Liga posterior com PA desligada usa somente a pontuação comum');
league.phases[1].advancedScoring = { enabled: true,
  categories: { match_won: { enabled: true, value: 10 } } };
assert(leagueRows().some(row => row.advancedPoints !== undefined),
  'Liga posterior com PA ligada usa a configuração da própria fase');
league.phases[1].advancedScoring = { enabled: false };
assert.strictEqual(E.isMonarchDraw(E.projectPhaseCfg(league.phases[1], league, 1)), false,
  'Liga simples não herda o modo Rei/Rainha');
assert.strictEqual(E.isMonarchDraw(E.projectPhaseCfg(Object.assign({}, league.phases[1],
  { reiRainha: true }), league, 1)), true, 'Rei/Rainha continua um modo explícito');

const root = path.join(__dirname, '..');
const splitSource = fs.readFileSync(path.join(root, 'js/views/tournament-split-core.js'), 'utf8');
['functions/vendor/tournament-split-core.js', 'functions-autodraw/vendor/tournament-split-core.js']
  .forEach(file => assert.strictEqual(fs.readFileSync(path.join(root, file), 'utf8'), splitSource,
    'as três cópias do tradutor de partes devem ter o mesmo contrato'));
const stored = { id: 'snapshot-storage', currentPhaseIndex: 1, _semPesados: ['matches'], matches: [],
  phaseGroupStandings: { '0': captured.snapshot } };
const parts = Split.dividir(stored);
assert.strictEqual(JSON.stringify(Split.remontar(parts).phaseGroupStandings), JSON.stringify(stored.phaseGroupStandings),
  'o retrato sobrevive à divisão/remontagem');
const plan = WritePlan.planWrites(null, stored, {
  split: Split, boundary: value => ({ persist: JSON.parse(JSON.stringify(value)) }),
  agoraIso: '2026-10-30T00:00:00.000Z', tournamentId: stored.id
});
const rootWrite = plan.ops.find(op => op.colecao === null);
assert.strictEqual(JSON.stringify(rootWrite.doc.phaseGroupStandings), JSON.stringify(stored.phaseGroupStandings),
  'o mesmo write-plan do avanço grava o retrato no documento raiz');

Split.montarDoBanco(rootWrite.doc, () => []).then(reloaded => {
  assert.strictEqual(JSON.stringify(reloaded.phaseGroupStandings), JSON.stringify(stored.phaseGroupStandings),
    'uma leitura fresca do banco mantém o retrato sem recalcular');
  console.log('✅ phase-group-standings-snapshot');
}).catch(error => { console.error(error); process.exitCode = 1; });
