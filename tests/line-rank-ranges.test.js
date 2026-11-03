'use strict';
const assert = require('assert');
const E = require('../js/views/phases-engine.js');
const F = require('../functions-autodraw/draw-core.js')._window.FORMAT2;
const validate = require('../functions-autodraw/format-intent-validation-core.js').validateNewFormatIntent;

class FormatError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const groups = ['A', 'B'].map(group => ({ standings: [1, 2, 3, 4].map(rank => ({
  name: group + rank, uid: group + rank
})) }));
const mapping = [
  { dest: 'upper', rankFrom: 1, rankTo: 2, label: 'Céu' },
  { dest: 'lower', rankFrom: 3, rankTo: 4, label: 'Mar' }
];
const byDest = E.buildEntrantsByDest(groups, mapping, true, g => g.standings, 'top',
  { scope: 'per_group', lineAssignment: 'rank_ranges' });
assert.deepStrictEqual(byDest.upper.map(x => x.participants.map(m => m.name)), [['A1', 'A2'], ['B1', 'B2']]);
assert.deepStrictEqual(byDest.lower.map(x => x.participants.map(m => m.name)), [['A3', 'A4'], ['B3', 'B4']]);

const manyLines = { matches: Array.from({ length: 12 }, (_, i) => ({
  id: 'line-match-' + (i + 1), phaseIndex: 1, round: 1,
  bracket: i === 0 ? 'gold' : (i === 1 ? 'silver' : 'line' + (i + 1)),
  p1: 'Winner' + (i + 1), p2: 'Runner' + (i + 1), winner: 'Winner' + (i + 1)
})) };
const continued = E.bracketPhaseGroups(manyLines, 1);
assert.equal(continued.length, 12, 'a leitura da fase preserva inclusive line10 a line12');
assert.deepStrictEqual(continued.slice(-3).map(group => group.name), ['Chave 10', 'Chave 11', 'Chave 12']);
assert.equal(E.projectPhaseCfg({ kind: 'elimination', elimination: { bracketType: 'single' },
  _entrantsByDest: { main: [{ name: 'entrada injetada' }] } })._entrantsByDest, undefined,
  'plano de entradas persistido não substitui a seleção calculada');

const config = F.defaultConfig('Beach Tennis');
config.grupos = 2;
config.classificados = 4;
config.eliminatoria.linhas = 2;
config.eliminatoria.nomes = ['Céu', 'Mar'];
config.eliminatoria.lineAssignment = 'rank_ranges';
config.eliminatoria.lineRankRanges = [{ from: 1, to: 2 }, { from: 3, to: 4 }];
validate(config, FormatError);
const compiled = F.compileToPhases(config);
const source = compiled.phases[compiled.phases.length - 1].source;
assert.equal(source.lineAssignment, 'rank_ranges');
assert.deepStrictEqual(source.mapping.map(x => [x.dest, x.rankFrom, x.rankTo, x.label]),
  [['upper', 1, 2, 'Céu'], ['lower', 3, 4, 'Mar']]);

for (const invalid of [
  [{ from: 1, to: 2 }, { from: 2, to: 4 }],
  [{ from: 1, to: 2 }, { from: 4, to: 3 }]
]) {
  const broken = JSON.parse(JSON.stringify(config));
  broken.eliminatoria.lineRankRanges = invalid;
  assert.throws(() => validate(broken, FormatError), e => e.code === 'invalid-argument');
}
const missingRange = JSON.parse(JSON.stringify(config));
missingRange.eliminatoria.lineRankRanges.pop();
assert.throws(() => validate(missingRange, FormatError), e => e.code === 'invalid-argument',
  'a Function não aceita linha sem faixa explícita');
console.log('line-rank-ranges: OK');
