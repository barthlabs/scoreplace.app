/* A ordem e os números da tabela de grupos ativos vêm da porta REAL do avanço. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');
const W = H.window;
const E = W._phasesEngine;

assert.strictEqual(typeof E.standingsDaFaseAnterior, 'function');
function fixture(matches, extra) {
  const players = ['A', 'B', 'C', 'D'];
  return Object.assign({ id: 't-paridade', groups: [{ name: 'Grupo A', players,
    rounds: [{ matches }] }], currentPhaseIndex: 0, rankingPrimary: 'points' }, extra || {});
}
function table(t, opts) {
  const html = W.renderGroupStage(t, false, false, opts || {});
  const body = (html.match(/<tbody>([\s\S]*?)<\/tbody>/) || [,''])[1];
  return [...body.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((m) => {
    const cells = [...m[0].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)]
      .map((c) => c[1].replace(/<[^>]*>/g, '').trim());
    return { name: cells[1], points: Number(cells[2]), wins: Number(cells[3]),
      losses: Number(cells[cells.length - 2]), pointsDiff: Number(cells[cells.length - 1]) };
  });
}
function engine(t) {
  const g = t.groups[0];
  const seen = new Set();
  const matches = [...(g.matches || []), ...g.rounds.flatMap((r) => r.matches || [])].filter((m) => {
    const key = m.id == null ? m : String(m.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const tbOpts = { tiebreakers: t.tiebreakers, rankingPrimary: t.rankingPrimary,
    birthByName: typeof W._tbBirthByName === 'function' ? W._tbBirthByName(t) : {} };
  return E.standingsDaFaseAnterior({ players: g.players, matches }, t, tbOpts, false);
}
function parity(t, label) {
  const expected = engine(t);
  expected.forEach((s) => ['name', 'points', 'wins', 'losses', 'draws', 'pointsDiff', 'played']
    .forEach((key) => assert.ok(Object.hasOwn(s, key), label + ': motor sem ' + key)));
  const got = table(t);
  assert.deepStrictEqual(got.map((x) => x.name), Array.from(expected, (x) => x.name), label + ': ordem');
  got.forEach((row, i) => {
    ['points', 'wins', 'losses', 'pointsDiff'].forEach((key) =>
      assert.strictEqual(row[key], expected[i][key], label + ': ' + row.name + '.' + key));
  });
}
const regular = [
  { id: 'm1', p1: 'A', p2: 'C', winner: 'A', scoreP1: 6, scoreP2: 5 },
  { id: 'm2', p1: 'A', p2: 'D', winner: 'A', scoreP1: 6, scoreP2: 5 },
  { id: 'm3', p1: 'B', p2: 'C', winner: 'B', scoreP1: 6, scoreP2: 0 },
  { id: 'm4', p1: 'D', p2: 'B' }
];
assert.strictEqual(engine(fixture(regular, { rankingPrimary: 'games_diff' }))[0].name, 'B',
  'saldo principal põe B à frente de A apesar de A ter mais vitórias');
parity(fixture(regular, { rankingPrimary: 'games_diff' }), 'saldo principal e jogo pendente');
parity(fixture(regular, { tiebreakers: ['saldo_pontos', 'vitorias', 'sorteio'] }), 'desempate configurado');
parity(fixture([], { tiebreakers: ['sorteio'] }), 'empate total e ordem da chave');
parity(fixture(regular, { scoring: { type: 'sets' } }), 'sets configurados sem sets gravados');
parity(fixture(regular.map((m) => m.winner ? Object.assign({}, m, { sets: [{ gamesP1: m.scoreP1, gamesP2: m.scoreP2 }] }) : m),
  { scoring: { type: 'sets' } }), 'sets e games preenchidos');
parity(fixture([{ id: 'bye', p1: 'A', p2: 'B', winner: 'A', isBye: true, scoreP1: 6, scoreP2: 0 },
  { id: 'sit', p1: 'C', p2: 'D', winner: 'C', isSitOut: true, scoreP1: 6, scoreP2: 0 },
  { id: 'bye2', p1: 'A', p2: 'C', isBye: true },
  { id: 'sit2', p1: 'B', p2: 'D', isSitOut: true }]), 'BYE/sit-out com e sem vencedor');
parity(fixture([{ id: 'draw', p1: 'A', p2: 'B', winner: 'draw', draw: true, scoreP1: 3, scoreP2: 3 }]), 'empate');

const bothSources = fixture(regular);
bothSources.groups[0].matches = regular;
parity(bothSources, 'matches e rounds coexistem sem dupla contagem');
const partialSource = fixture(regular);
partialSource.groups[0].matches = [regular[0]];
parity(partialSource, 'matches parcial preserva jogos restantes das rodadas');

const oldAdapter = W._getUnifiedRounds;
try {
  W._getUnifiedRounds = function() { return { columns: [{ phase: 'groups', subgroups: [
    { name: 'Grupo A', players: ['A', 'B', 'C', 'D'] }
  ] }] }; };
  parity(fixture(regular, { rankingPrimary: 'games_diff' }), 'adaptador sem rounds usa grupos legados');
  W._getUnifiedRounds = function() { return { columns: [{ phase: 'groups', subgroups: [
    { name: 'Grupo A', players: ['A', 'B', 'C', 'D'], matches: [regular[0]] }
  ] }] }; };
  parity(fixture(regular, { rankingPrimary: 'games_diff' }), 'adaptador parcial inclui rodadas legadas');
} finally {
  W._getUnifiedRounds = oldAdapter;
}

const oldEngine = W._phasesEngine;
const noEngine = fixture(regular, { rankingPrimary: 'games_diff' });
const oldWarn = console.warn;
let warning = '';
try {
  console.warn = function(message) { warning += message; };
  W._phasesEngine = null;
  assert.strictEqual(table(noEngine)[0].name, 'A', 'sem motor mantém ordem antiga');
} finally {
  W._phasesEngine = oldEngine;
  console.warn = oldWarn;
}
assert.match(warning, /motor\/comparador indisponível/, 'fallback emite diagnóstico');
assert.strictEqual(table(fixture(regular, { rankingPrimary: 'games_diff', advancedScoring: { enabled: true } }))[0].name,
  'B', 'pontuação avançada usa a mesma ordem do avanço');
const advanced = { enabled: true, categories: { match_won: { enabled: true, value: 10 } } };
const withPhaseAdvanced = fixture(regular, { phases: [{ advancedScoring: advanced }],
  advancedScoring: { enabled: false }, rankingPrimary: 'points' });
parity(withPhaseAdvanced, 'pontuação avançada efetiva da fase');
assert.strictEqual(engine(withPhaseAdvanced)[0].points, 20,
  'PA da fase substitui os pontos comuns na ordem de avanço');
const phaseDisablesAdvanced = fixture(regular, { phases: [{ advancedScoring: { enabled: false } }],
  advancedScoring: advanced });
parity(phaseDisablesAdvanced, 'fase desliga PA mesmo com topo ligado');
assert.ok(engine(phaseDisablesAdvanced).every((row) => !Object.hasOwn(row, 'advancedPoints')),
  'PA desligada na fase não vaza do topo');
const phaseWithoutAdvanced = fixture(regular, { phases: [{}], advancedScoring: advanced });
assert.ok(engine(phaseWithoutAdvanced).every((row) => !Object.hasOwn(row, 'advancedPoints')),
  'fase sem configuração de PA não herda o topo');
for (const t of [withPhaseAdvanced, phaseDisablesAdvanced, phaseWithoutAdvanced,
  fixture(regular, { advancedScoring: advanced })]) {
  assert.deepStrictEqual(E.effectiveAdvancedScoring(t, 0), W._effectiveAdvScoring(t, 0),
    'projeção da Function e leitor web escolhem a mesma configuração');
}
assert.strictEqual(table(fixture(regular, { rankingPrimary: 'games_diff' }), { historicalPhase: true })[0].name,
  'A', 'fase histórica não troca a classificação publicada');

const bracketSrc = fs.readFileSync(path.join(__dirname, '../js/views/bracket.js'), 'utf8');
assert.match(bracketSrc, /var _gFaux = \{[\s\S]{0,240}tiebreakers: t\.tiebreakers, rankingPrimary: t\.rankingPrimary/,
  'fase posterior preserva o critério principal do torneio');

const serverSrc = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const advanceSrc = serverSrc.slice(serverSrc.indexOf('exports.advanceTournamentPhase = onCall('),
  serverSrc.indexOf('async function _notifyAdvancedPhase(', serverSrc.indexOf('exports.advanceTournamentPhase = onCall(')));
assert.match(advanceSrc, /const tbOpts = \{[^}]*rankingPrimary:\s*t\.rankingPrimary/,
  'a Function que forma a fase seguinte repassa o mesmo critério principal da tabela');

console.log('✓ tabela de grupos igual à porta real do avanço');
