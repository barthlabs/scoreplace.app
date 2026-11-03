'use strict';
const assert = require('node:assert/strict');
const draw = require('./draw-core.js');
const format = draw._window.FORMAT2;
const cfg = format.defaultConfig('beach_tennis');
cfg.parceria = 'super_eight'; cfg.eliminatoria.ativa = false;
const compiled = format.compileToPhases(cfg, { sport: 'beach_tennis' });
assert.equal(compiled.topLevel.superEight, true);
assert.equal(compiled.phases[0].superEight, true);
assert.equal(compiled.phases[0].rounds, 7);
assert.equal(compiled.phases.length, 1);
const t = {
  id: 'eight-cycle', name: 'Evento livre', format: 'Liga', status: 'open',
  ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', ligaDrawMode: 'standard',
  superEight: true, teamSize: 2, enrollmentMode: 'individual',
  participants: Array.from({ length: 8 }, (_, i) => ({
    uid: 'u' + i, displayName: 'Atleta ' + i, ligaActive: true
  })), rounds: [], standings: []
};
const pairs = new Set();
for (let round = 1; round <= 7; round++) {
  const result = draw.generateLigaRound(t, new Date('2026-11-03T12:00:00Z'));
  assert.equal(result.ok, true, 'rodada ' + round + ': ' + result.reason);
  const col = t.rounds[round - 1];
  assert.equal(col.monarchGroups.length, 2);
  assert.equal(col.matches.length, 2);
  assert.deepEqual(col.matches.flatMap(m => m.team1Uids.concat(m.team2Uids)).sort(),
    t.participants.map(p => p.uid).sort());
  col.matches.forEach(m => {
    pairs.add(m.team1Uids.slice().sort().join(':'));
    pairs.add(m.team2Uids.slice().sort().join(':'));
    m.winner = m.p1; m.winnerUids = m.team1Uids.slice(); m.scoreP1 = 6; m.scoreP2 = 3;
  });
}
assert.equal(pairs.size, 28);
assert.equal(t.superEightOrders._default_.length, 8);
const bad = { ...t, rounds: [], participants: t.participants.slice(0, 7), superEightOrders: null };
assert.throws(() => draw._window._generateReiRainhaRoundForPlayers(bad, null, 1), /exatamente oito/);
console.log('✓ servidor gera sete rodadas com 14 partidas e 28 parcerias únicas');
