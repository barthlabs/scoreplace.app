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
assert.equal(draw._window._requiresMonarchPreDrawReview({ superEight:true, phases:compiled.phases,
  scheduleWindow:{ mode:'organizer', days:[] } }), false,
  'Super 8 não exige grade de horários nem categorias para abrir o sorteio');
cfg.superEightDrawMode = 'single';
const single = format.compileToPhases(cfg, { sport: 'beach_tennis' });
assert.equal(single.topLevel.superEightDrawMode, 'single');
assert.equal(single.phases[0].superEightDrawMode, 'single');
assert.equal(single.topLevel.drawIntervalDays, undefined);
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
const placeholders = { ...t, id:'eight-with-placeholders', rounds:[], standings:[], superEightOrders:null,
  participants:[{ uid:'kelly', displayName:'Kelly', ligaActive:true }, ...Array.from({ length:7 }, (_, i) => ({
    manualParticipantId:'manual-' + (i + 1), name:'Jogador ' + String(i + 1).padStart(2, '0'),
    displayName:'Jogador ' + String(i + 1).padStart(2, '0'), isPlaceholder:true, genericPlaceholderReservation:true, ligaActive:true
  }))] };
assert.equal(draw.generateLigaRound(placeholders, new Date('2026-11-21T09:00:00Z')).ok, true);
const namedPlayers = placeholders.rounds[0].matches.flatMap(m => m.team1.concat(m.team2)).sort();
assert.deepEqual(namedPlayers, ['Kelly', ...Array.from({ length:7 }, (_, i) =>
  'Jogador ' + String(i + 2).padStart(2, '0'))].sort(),
  'confrontos usam a sequência real das inscrições, inclusive reservas já existentes');
const initialWithReservations = { ...placeholders, id:'eight-initial-reservations',
  phases:compiled.phases, storageCanonico:true, rulesContractVersion:2,
  rounds:[], matches:[], standings:[], superEightOrders:null };
assert.equal(draw._window._buildPhase0Pool(initialWithReservations, true, 1).length, 8,
  'reservas genéricas participam do pool do sorteio inicial');
const initialResult = draw.drawInitial(initialWithReservations, { idStamp: 1795251600000 });
assert.equal(initialResult.ok, true, 'sorteio inicial aceita placeholders reservados: ' + initialResult.reason);
assert.equal(initialResult.matchCount, 2, 'primeira rodada do Super 8 tem dois confrontos');
assert.deepEqual(initialWithReservations.matches.flatMap(m => m.team1.concat(m.team2)).sort(), namedPlayers,
  'o sorteio inicial inclui Kelly e as sete reservas genéricas');
const reservedCycle = { ...t, id:'eight-reserved-cycle',
  participants:placeholders.participants.map(p => ({ ...p })), rounds:[], standings:[], superEightOrders:null };
const reservedPairs = new Set();
for (let round = 1; round <= 7; round++) {
  const result = draw.generateLigaRound(reservedCycle, new Date('2026-11-21T09:00:00Z'));
  assert.equal(result.ok, true, 'placeholder segue ativo na rodada ' + round + ': ' + result.reason);
  const matches = reservedCycle.rounds[round - 1].matches;
  assert.deepEqual(matches.flatMap(m => m.team1.concat(m.team2)).sort(), namedPlayers,
    'as oito vagas participam da rodada ' + round);
  matches.forEach(m => {
    reservedPairs.add(m.team1.slice().sort().join(':'));
    reservedPairs.add(m.team2.slice().sort().join(':'));
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
  });
}
assert.equal(reservedPairs.size, 28, 'cada placeholder faz parceria com todos uma vez');
const shuffled = { ...t, id:'eight-seeded', superEightDrawMode:'single',
  rounds:[], standings:[], superEightOrders:null };
draw._window._generateReiRainhaRoundForPlayers(shuffled, null, 1, { rnd: () => 0 });
assert.notDeepEqual(shuffled.superEightOrders._default_.map(p => p.uid),
  t.superEightOrders._default_.map(p => p.uid), 'sorteio inicial embaralha os oito atletas');
const successive = { ...t, id:'eight-successive', superEightDrawMode:'rounds',
  rounds:[], standings:[], superEightOrders:null, superEightRoundOrder:null };
const successivePairs = new Set();
for (let round = 1; round <= 7; round++) {
  const result = draw.generateLigaRound(successive, new Date('2026-11-03T12:00:00Z'));
  assert.equal(result.ok, true);
  successive.rounds[round - 1].matches.forEach(m => {
    successivePairs.add(m.team1Uids.slice().sort().join(':'));
    successivePairs.add(m.team2Uids.slice().sort().join(':'));
  });
}
assert.equal(successivePairs.size, 28);
assert.deepEqual(successive.superEightRoundOrder._default_.slice().sort(), [0,1,2,3,4,5,6]);
const oneDraw = { ...t, id:'eight-single', superEightDrawMode:'single', drawManual:false,
  drawFirstDate:'2026-11-21', drawFirstTime:'10:00', drawIntervalDays:null,
  phases:[{ ...single.phases[0], drawManual:false, drawFirstDate:'2026-11-21', drawFirstTime:'10:00' }],
  rounds:[], standings:[], superEightOrders:null };
assert.equal(draw._window._isLigaAutoDraw(oneDraw), true);
assert.equal(draw.generateLigaRound(oneDraw, new Date('2026-11-21T10:00:00Z')).ok, true);
assert.equal(draw._window._nextOwedDrawMs(oneDraw), null, 'sorteio único não agenda novo sorteio');
oneDraw.rounds[0].matches.forEach(m => { m.winner = m.p1; m.winnerUids = m.team1Uids.slice(); m.scoreP1 = 6; m.scoreP2 = 3; });
const closed = draw.closeRoundCore(oneDraw, 0);
assert.equal(closed.ok, true);
assert.equal(closed.branch, 'nextRound');
assert.equal(oneDraw.rounds.length, 2, 'sorteio único libera a próxima rodada ao concluir a anterior');
const bad = { ...t, rounds: [], participants: t.participants.slice(0, 7), superEightOrders: null };
assert.throws(() => draw._window._generateReiRainhaRoundForPlayers(bad, null, 1), /exatamente oito/);
console.log('✓ servidor gera sete rodadas com 14 partidas e 28 parcerias únicas');
