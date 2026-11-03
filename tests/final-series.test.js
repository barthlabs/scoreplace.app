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
const precreated = make(3);
const seriesRoot = precreated.matches[0];
for (const gameNumber of [2, 3]) {
  precreated.matches.push({ ...seriesRoot, id: seriesRoot.id + '-S' + gameNumber,
    seriesGameNumber: gameNumber, winner: null });
}
result(precreated, 'p1');
assert.equal(precreated.matches.length, 3, 'partidas pré-criadas continuam disponíveis antes da maioria');
result(precreated, 'p1');
assert.equal(precreated.status, 'finished');
assert.equal(precreated.matches.length, 2, 'partida pré-criada excedente sai após a maioria');
const routed = make(3);
routed.format = 'Dupla Eliminatória';
routed.phases[0].elimination.bracketType = 'double';
const routedRoot = routed.matches[0];
routed.matches.push({ ...routedRoot, id: routedRoot.id + '-S2',
  seriesGameNumber: 2, winner: null });
routed.matches.push({ ...routedRoot, id: routedRoot.id + '-S3',
  seriesGameNumber: 3, winner: null, nextMatchId: 'after', nextSlot: 'p1',
  loserMatchId: 'third', loserSlot: 'p2' });
routed.matches.push({ id: 'after', p1: 'TBD', p2: 'Outro', winner: null });
routed.matches.push({ id: 'third', p1: 'Outro', p2: 'TBD', winner: null });
result(routed, 'p1');
const routedDecisive = result(routed, 'p1');
assert.ok(!routed.matches.some(m => m.id === routedRoot.id + '-S3'));
assert.equal(routedDecisive.nextMatchId, 'after');
assert.equal(routedDecisive.loserMatchId, 'third');
assert.equal(routed.matches.find(m => m.id === 'after').p1, 'A');
assert.equal(routed.matches.find(m => m.id === 'third').p2, 'B');

// Na dupla eliminatória com títulos separados, o perdedor da final superior
// só desce depois da maioria da série, nunca depois do primeiro jogo físico.
const doubleCfg = format.defaultConfig('beach_tennis');
doubleCfg.classifAtiva = false;
doubleCfg.eliminatoria.dupla = true;
doubleCfg.eliminatoria.grandFinal = false;
doubleCfg.eliminatoria.finalSeriesBestOf = 3;
const doublePhase = format.compileToPhases(doubleCfg, { sport: 'beach_tennis' }).phases[0];
const doubleBuilt = H.E.generatePhase(Array.from({ length: 4 }, (_, i) =>
  ({ displayName: 'D' + i, uid: 'd' + i })), doublePhase, { idPrefix: 'double-series', ordered: true });
const double = { id: 'double-series', format: 'Dupla Eliminatória', status: 'active',
  rulesContractVersion: 2, currentPhaseIndex: 0, phases: [doublePhase], matches: doubleBuilt.matches };
function scoreDouble(m, side) {
  m.winner = m[side]; m.scoreP1 = side === 'p1' ? 6 : 3; m.scoreP2 = side === 'p2' ? 6 : 3;
  W._advanceWinner(double, m);
}
const upperFirst = double.matches.filter(m => m.bracket === 'upper' && m.round === 1);
upperFirst.forEach(m => scoreDouble(m, 'p1'));
const lowerFirst = double.matches.find(m => m.bracket === 'lower' && m.round === 1);
scoreDouble(lowerFirst, 'p1');
const upperFinal = double.matches.find(m => m.bracket === 'upper' && m.round === 2);
const lowerFinal = double.matches.find(m => m.bracket === 'lower' && m.round === 2);
assert.equal(lowerFinal.p2, 'TBD');
scoreDouble(upperFinal, 'p1');
assert.equal(lowerFinal.p2, 'TBD', 'a primeira partida da final superior não rebaixa o perdedor');
const upperSecond = double.matches.find(m => m.seriesRootId === upperFinal.id && m.seriesGameNumber === 2);
assert.ok(upperSecond && upperSecond.loserMatchId === lowerFinal.id);
scoreDouble(upperSecond, 'p1');
assert.equal(lowerFinal.p2, upperFinal.p2, 'a maioria da série rebaixa o perdedor uma vez');
assert.equal(double.status, 'active', 'a linha inferior ainda precisa decidir o próprio título');
console.log('✓ série final: partidas próprias, maioria para encerrar, título na partida decisiva');
