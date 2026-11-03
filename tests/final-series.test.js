'use strict';
const assert = require('node:assert/strict');
const H = require('./headless.js');
H.load('chaves.js'); H.load('chaves-adapter.js'); H.load('bracket-logic.js');
const W = H.window;
const titles = require('../js/views/tournament-titles.js');
const format = require('../functions-autodraw/draw-core.js')._window.FORMAT2;
const cfg = format.defaultConfig('beach_tennis');
cfg.classifAtiva = false; cfg.eliminatoria.finalSeriesBestOf = 5;
const phase = format.compileToPhases(cfg, { sport: 'beach_tennis' }).phases[0];
assert.equal(phase.finalSeriesBestOf, 5);
const generated = H.E.generatePhase([
  { displayName: 'A', uid: 'uA' }, { displayName: 'B', uid: 'uB' }
], phase, { idPrefix: 'series-test', ordered: true });
assert.equal(generated.matches.filter(m => m.seriesBestOf === 5).length, 1);

function make(bestOf) {
  const final = W._chavesAdapter.build(2, 'simples', { participantes: [
    { displayName: 'A', uid: 'uA' }, { displayName: 'B', uid: 'uB' }
  ] }).matches[0];
  final.seriesBestOf = bestOf; final.seriesRootId = final.id; final.seriesGameNumber = 1;
  return { id: 'series', format: 'Eliminatórias Simples', status: 'active',
    phases: [{ kind: 'elimination', elimination: { bracketType: 'single' } }],
    currentPhaseIndex: 0, matches: [final] };
}
function result(t, side) {
  const m = t.matches.find(x => !x.winner);
  assert.ok(m);
  m.winner = m[side]; m.scoreP1 = side === 'p1' ? 6 : 3; m.scoreP2 = side === 'p2' ? 6 : 3;
  W._advanceWinner(t, m);
  return m;
}
const five = make(5);
for (const side of ['p1', 'p2', 'p1', 'p2']) {
  result(five, side);
  assert.equal(five.status, 'active');
}
const decisive = result(five, 'p1');
assert.equal(five.status, 'finished');
assert.equal(five.matches.length, 5);
assert.equal(titles.resolve(five, { engine: { phaseComplete: () => true } }).titles[0].sourceMatchId, decisive.id);
const sweep = make(3);
result(sweep, 'p1'); result(sweep, 'p1');
assert.equal(sweep.status, 'finished');
assert.equal(sweep.matches.length, 2);
console.log('✓ série final: partidas próprias, maioria para encerrar, título na partida decisiva');
