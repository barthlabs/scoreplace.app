'use strict';
const assert = require('node:assert/strict');
const grid = require('../js/domain/phase-grid-plan.js');
const fixture = require('./fixtures/camis-interleaved-plan.js');
const tournament = { gameDuration:30, callTime:5, warmupTime:5 };
const firstDay = { day:'2026-11-13', startTime:'08:00', endTime:'21:00' };
const secondDay = { day:'2026-11-14', startTime:'08:00', endTime:'21:00' };
const laterDay = { day:'2027-02-14', startTime:'08:00', endTime:'21:00' };
const tiles = grid.expand(fixture, tournament);
assert.equal(tiles.length, 72);
assert.equal(grid.validate(tiles, fixture, [firstDay]), null);
assert.equal(new Set(Object.values(grid.numbered(tiles, fixture))).size, tiles.length);
assert.equal(Math.max(...Object.values(grid.numbered(tiles, fixture))), 144);
const eliminationNames = grid.eliminationLabels(tiles);
const named = (category, round, court) => eliminationNames[tiles.find(tile =>
  tile.kind === 'elimination' && tile.category === category && tile.round === round && tile.court === court).id];
assert.equal(named('Fem Diamante', 1, 1), 'Quartas de final');
assert.equal(named('Fem Diamante', 2, 1), 'Semifinais');
assert.equal(named('Fem Diamante', 3, 1), 'Final');
assert.equal(named('Fem Diamante', 3, 2), '3º lugar');
assert.equal(named('Fem Ouro', 1, 5), 'Oitavas de final');
assert.equal(named('Fem Ouro', 2, 3), 'Quartas de final');
assert.equal(named('Fem Prata', 1, 1), 'Oitavas de final');
assert.equal(named('Fem Prata', 2, 1), 'Quartas de final');
assert.deepEqual(grid.gameStarts(tiles[0], tournament).map(grid.clock), ['08:00', '08:40', '09:10']);
assert.deepEqual(grid.gameStarts(tiles.find(tile => tile.kind === 'elimination'), tournament).map(grid.clock), ['13:00']);
const shifted = grid.move(tiles, tiles.find(tile => tile.kind === 'elimination' && tile.category === 'Fem Ouro' && tile.round === 1).id,
  1, '13:00', fixture, [firstDay], firstDay.day);
assert.equal(shifted.error, undefined);
assert.equal(shifted.shifted.length >= 1, true, 'ao soltar numa quadra ocupada, empurra os blocos seguintes');
assert.equal(shifted.tiles.some(tile => tile.court === 1 && tile.startTime === '13:35'), true);
assert.equal(grid.overlapIds(shifted.tiles, fixture).size, 0, 'o arrasto não pode deixar duas reservas na mesma quadra');
const chainPlan = { schema:1, day:firstDay.day, courts:1, eliminationMinutes:35, blocks:[] };
const chain = ['08:00', '08:35', '09:10'].map((startTime, index) => ({
  id:'chain-' + index, kind:'elimination', category:'Categoria ' + index,
  day:firstDay.day, startTime, court:1, round:1, duration:35
}));
const cascade = grid.move(chain, 'chain-2', 1, '08:00', chainPlan, [firstDay], firstDay.day);
assert.equal(cascade.error, undefined);
assert.deepEqual(cascade.shifted, ['chain-0', 'chain-1']);
assert.deepEqual(cascade.tiles.map(tile => tile.startTime), ['08:35', '09:10', '08:00']);
assert.equal(grid.validate(cascade.tiles, chainPlan, [firstDay]), null);
const legacyCourt = chain.map((tile, index) => ({ ...tile, court:index === 0 ? '1' : 1 }));
const normalizedCourt = grid.move(legacyCourt, 'chain-2', 1, '08:00', chainPlan, [firstDay], firstDay.day);
assert.deepEqual(normalizedCourt.shifted, ['chain-0', 'chain-1'], 'quadra legada em texto participa da cascata');
assert.equal(grid.overlapIds(normalizedCourt.tiles, chainPlan).size, 0);
assert.equal(grid.validate(normalizedCourt.tiles, chainPlan, [firstDay]), null);
const shortDay = { day:firstDay.day, startTime:'08:00', endTime:'09:30' };
const overflowingCascade = grid.move(chain, 'chain-2', 1, '08:00', chainPlan, [shortDay], shortDay.day);
assert.equal(grid.overlapIds(overflowingCascade.tiles, chainPlan).size, 0);
assert.match(grid.validate(overflowingCascade.tiles, chainPlan, [shortDay]), /fora do horário/);
const midnightChain = ['22:40', '23:15'].map((startTime, index) => ({
  id:'late-' + index, kind:'elimination', category:'Late ' + index,
  day:firstDay.day, startTime, court:1, round:1, duration:35
}));
const midnightDay = { day:firstDay.day, startTime:'08:00', endTime:'23:59' };
const midnightCascade = grid.move(midnightChain, 'late-0', 1, '23:00', chainPlan, [midnightDay], midnightDay.day);
assert.match(midnightCascade.error, /meia-noite/, 'a cascata impossível não pode deixar blocos sobrepostos');
assert.deepEqual(midnightChain.map(tile => tile.startTime), ['22:40', '23:15'], 'falha não altera a grade original');
const last = tiles[tiles.length - 1];
const moved = grid.move(tiles, last.id, last.court, '08:00', fixture, [firstDay, secondDay], secondDay.day);
assert.equal(moved.error, undefined);
assert.equal(grid.validate(moved.tiles, fixture, [firstDay, secondDay]), null);
const saved = grid.toPlan(fixture, moved.tiles);
assert.equal(saved.blocks.some(block => block.day === secondDay.day), true);
assert.equal(grid.validate(grid.expand(saved, tournament), saved, [firstDay, secondDay]), null);
const tooLate = grid.move(tiles, last.id, last.court, '20:45', fixture, [firstDay], firstDay.day);
assert.equal(tooLate.error, undefined, 'bloco excedente deve continuar visível no rascunho');
assert.equal(grid.outsideWindow(tooLate.tiles.find(tile => tile.id === last.id), firstDay), true);
assert.match(grid.validate(tooLate.tiles, fixture, [firstDay]), /fora do horário/);
const monthMove = grid.move(tiles, last.id, last.court, '08:00', fixture, [firstDay, laterDay], laterDay.day);
assert.equal(monthMove.error, undefined);
assert.equal(grid.validate(monthMove.tiles, fixture, [firstDay, laterDay]), null,
  'a grade aceita dias de jogo meses depois da primeira rodada');
assert.match(grid.validate(monthMove.tiles, fixture, [firstDay]), /fora do horário/,
  'um dia fora da agenda explícita não é criado por inferência');
const proposal = grid.suggest({ days:[firstDay], courts:8, gameDuration:30, callTime:5,
  warmupTime:5, eliminationPlayMinutes:25,
  categories:[{ name:'Fem Diamante', groups:8 }, { name:'Fem Ouro', groups:16 }, { name:'Fem Prata', groups:12 }] });
assert.equal(proposal.error, undefined, 'a proposta do CAMIS deve caber das 8h às 21h');
assert.equal(proposal.plan.totalGames, 144);
assert.equal(grid.validate(proposal.tiles, proposal.plan, [firstDay]), null);
assert.equal(grid.overlapIds(proposal.tiles, proposal.plan).size, 0);
assert.deepEqual(proposal.tiles.filter(tile => tile.category === 'Fem Diamante' && tile.kind === 'groups').length, 8);
assert.deepEqual(proposal.tiles.filter(tile => tile.category === 'Fem Ouro' && tile.kind === 'groups').length, 16);
assert.deepEqual(proposal.tiles.filter(tile => tile.category === 'Fem Prata' && tile.kind === 'groups').length, 12);
assert.match(grid.suggest({ days:[firstDay], courts:8, gameDuration:30, callTime:5,
  warmupTime:5, eliminationPlayMinutes:25, categories:[{ name:'Fem Prata', groups:1.5 }] }).error, /quatro atletas/);
console.log('Grade com dias esparsos: números, arrasto e excedente visível');
