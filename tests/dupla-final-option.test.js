'use strict';
const assert = require('node:assert/strict');
const H = require('./headless.js');
H.load('chaves.js'); H.load('chaves-adapter.js'); H.load('bracket-logic.js');
const W = H.window;
const titles = require('../js/views/tournament-titles.js');
const format = require('../functions-autodraw/draw-core.js')._window.FORMAT2;
const cfg = format.defaultConfig('beach_tennis');
cfg.classifAtiva = false; cfg.eliminatoria.dupla = true; cfg.eliminatoria.grandFinal = false;
let phase = format.compileToPhases(cfg, { sport: 'beach_tennis' }).phases[0];
assert.equal(phase.grandFinalPolicy, 'separate');
assert.equal(phase.grandFinal, false);
cfg.eliminatoria.grandFinal = true; cfg.eliminatoria.grandFinalReset = true;
phase = format.compileToPhases(cfg, { sport: 'beach_tennis' }).phases[0];
assert.equal(phase.grandFinalPolicy, 'play');
assert.equal(phase.grandFinalReset, true);
const people = Array.from({ length: 4 }, (_, i) => ({ displayName: 'P' + i, uid: 'u' + i }));
function tournament(grandFinal, reset) {
  const built = W._chavesAdapter.build(4, 'dupla', {
    participantes: people, grandFinal, grandFinalReset: reset
  });
  return { id: 'test', format: 'Dupla Eliminatória', status: 'active',
    phases: [{ kind: 'elimination', elimination: { bracketType: 'double' },
      grandFinalPolicy: grandFinal ? 'play' : 'separate', grandFinalReset: reset }],
    currentPhaseIndex: 0, matches: built.matches };
}
function play(t, lowerWinsFirstFinal) {
  for (let i = 0; i < 20; i++) {
    const m = t.matches.find(x => !x.winner && x.p1 && x.p1 !== 'TBD' && x.p2 && x.p2 !== 'TBD' && !x.isBye);
    if (!m) break;
    m.winner = m.bracket === 'grand' && !m.isExtra && lowerWinsFirstFinal ? m.p2 : m.p1;
    m.scoreP1 = m.winner === m.p1 ? 6 : 3;
    m.scoreP2 = m.winner === m.p2 ? 6 : 3;
    W._advanceWinner(t, m);
  }
  assert.equal(t.status, 'finished');
}
const separate = tournament(false, false);
assert.equal(separate.matches.some(m => m.bracket === 'grand'), false);
play(separate);
const separateTitles = titles.resolve(separate, { engine: { phaseComplete: () => true } });
assert.deepEqual(separateTitles.titles.map(a => a.label), ['Chave superior', 'Chave inferior']);
const one = tournament(true, false);
assert.equal(one.matches.filter(m => m.bracket === 'grand').length, 1);
play(one, true);
assert.equal(one.matches.some(m => m.isExtra), false);
const reset = tournament(true, true);
play(reset, true);
assert.equal(reset.matches.filter(m => m.isExtra && m.winner).length, 1);
assert.equal(titles.resolve(reset, { engine: { phaseComplete: () => true } }).titles[0].sourceMatchId, 'GF-EXTRA');
console.log('✓ dupla eliminatória: títulos separados, final única ou reinício escolhido');
