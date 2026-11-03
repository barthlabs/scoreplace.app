'use strict';
const assert = require('node:assert/strict');
const E = require('../js/views/phases-engine.js');
const F = require('../functions-autodraw/draw-core.js')._window.FORMAT2;
const validate = require('../functions-autodraw/format-intent-validation-core.js').validateNewFormatIntent;
class FormatError extends Error { constructor(code, message) { super(message); this.code = code; } }

const groups = [
  { name: 'A', third: { name: 'A3', uid: 'a3', points: 8, played: 4, wins: 2 } },
  { name: 'B', third: { name: 'B3', uid: 'b3', points: 9, played: 3, wins: 2 } },
  { name: 'C', third: { name: 'C3', uid: 'c3', points: 10, played: 5, wins: 3 } }
].map(g => ({ standings: [
  { name: g.name + '1', uid: g.name + '1', points: 15, played: 5 },
  { name: g.name + '2', uid: g.name + '2', points: 12, played: 5 },
  g.third
] }));
const mapping = [{ dest: 'main', rankFrom: 1, rankTo: 2 }];
const opts = { scope: 'per_group', bestNextByGroup: { count: 1, metric: 'points_per_game', dest: 'main' } };
let result = E.buildEntrantsByDest(groups, mapping, false, g => g.standings, 'top', opts);
assert.equal(result.main.length, 7);
assert.ok(result.main.some(x => x.p1Name === 'B3'), 'pontos por jogo: 9/3 supera 8/4 e 10/5');
assert.ok(!result.main.some(x => x.p1Name === 'A3' || x.p1Name === 'C3'));
assert.throws(() => E.buildEntrantsByDest(groups, mapping, false, g => g.standings, 'top', {
  scope: 'per_group', bestNextByGroup: { count: 1, metric: 'total_points', dest: 'main' }
}), /mesmo número de jogos/);

const cfg = F.defaultConfig('Beach Tennis');
cfg.disputa = 'individual'; cfg.grupos = 3; cfg.classifScope = 'per_group';
cfg.classificados = 2; cfg.eliminatoria.bestNextByGroup = { count: 1, metric: 'points_per_game', destIndex: 0 };
validate(cfg, FormatError);
const compiled = F.compileToPhases(cfg);
assert.deepEqual(compiled.phases[1].source.bestNextByGroup,
  { count: 1, metric: 'points_per_game', dest: 'main' });
cfg.eliminatoria.bestNextByGroup.count = 4;
assert.throws(() => validate(cfg, FormatError), { code: 'invalid-argument' });
console.log('best-next-by-group: OK');
