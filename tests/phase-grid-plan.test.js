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
const compactPreset = grid.preset(tiles, fixture, [firstDay], 'compact');
const spreadPreset = grid.preset(tiles, fixture, [firstDay], 'spread');
assert.equal(compactPreset.error, undefined);
assert.equal(spreadPreset.error, undefined);
const openingCategories = result => new Set(result.tiles.filter(tile => tile.startTime === '08:00').map(tile => tile.category));
assert.deepEqual([...openingCategories(compactPreset)], ['Fem Diamante'],
  'concentrar reserva as primeiras quadras para a primeira categoria');
assert.equal(openingCategories(spreadPreset).size, 3,
  'espalhar alterna as três categorias já no primeiro horário');
const compactAgain = grid.preset(spreadPreset.tiles, fixture, [firstDay], 'compact');
assert.equal(compactAgain.error, undefined);
assert.deepEqual([...openingCategories(compactAgain)], ['Fem Diamante'],
  'voltar a concentrar recupera a ordem da grade original');
assert.equal(grid.validate(spreadPreset.tiles, fixture, [firstDay]), null);
const splitDays = [
  { day:firstDay.day, startTime:'08:00', endTime:'12:00' },
  { day:secondDay.day, startTime:'09:15', endTime:'21:00' }
];
const spreadAcrossDays = grid.preset(tiles, fixture, splitDays, 'spread');
assert.equal(spreadAcrossDays.error, undefined, 'espalhar três categorias deve respeitar duas janelas diferentes');
assert.equal(grid.validate(spreadAcrossDays.tiles, fixture, splitDays), null);
assert.equal(spreadAcrossDays.tiles.some(tile => tile.day === secondDay.day), true);
assert.equal(spreadAcrossDays.tiles.filter(tile => tile.day === firstDay.day && tile.startTime === '08:00')
  .map(tile => tile.category).filter((value, index, all) => all.indexOf(value) === index).length, 3,
  'três categorias dividem as quadras disponíveis desde a abertura');
assert.equal(spreadAcrossDays.tiles.filter(tile => tile.day === secondDay.day)
  .every(tile => grid.minutes(tile.startTime) >= grid.minutes('09:15')), true,
  'o segundo dia nunca começa antes do horário configurado');
const compactAcrossDays = grid.preset(spreadAcrossDays.tiles, fixture, splitDays, 'compact');
assert.equal(compactAcrossDays.error, undefined, 'concentrar depois de espalhar preserva todos os blocos');
assert.equal(grid.validate(compactAcrossDays.tiles, fixture, splitDays), null);
assert.deepEqual([...openingCategories(compactAcrossDays)], ['Fem Diamante']);
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
const quarters = tiles.filter(tile => tile.kind === 'elimination' && tile.category === 'Fem Diamante' && tile.round === 1);
const swappedQuarters = grid.move(tiles, quarters[0].id, quarters[1].court, quarters[1].startTime,
  fixture, [firstDay], firstDay.day, quarters[1].id);
assert.equal(swappedQuarters.error, undefined);
assert.equal(swappedQuarters.swapped, quarters[1].id, 'soltar sobre bloco ocupado troca as posições');
assert.equal(swappedQuarters.tiles.find(tile => tile.id === quarters[0].id).court, quarters[1].court);
assert.equal(swappedQuarters.tiles.find(tile => tile.id === quarters[1].id).court, quarters[0].court);
assert.equal(grid.validate(swappedQuarters.tiles, fixture, [firstDay]), null);
const invalidRound = grid.move(tiles, quarters[0].id, quarters[0].court, '13:20', fixture, [firstDay], firstDay.day);
assert.match(invalidRound.error, /rodada eliminatória/,
  'arrastar quartas sobre semifinal não pode iniciar rodada fora da sequência');
assert.equal(invalidRound.tiles, undefined, 'movimento inválido não é aplicado ao rascunho');
assert.equal(grid.validate(tiles, fixture, [firstDay]), null, 'a grade original fica intacta');
const chainPlan = { schema:1, day:firstDay.day, courts:1, eliminationMinutes:35, blocks:[] };
const chain = ['08:00', '08:35', '09:10'].map((startTime, index) => ({
  id:'chain-' + index, kind:'elimination', category:'Categoria ' + index,
  day:firstDay.day, startTime, court:1, round:1, duration:35
}));
const swap = grid.move(chain, 'chain-2', 1, '08:00', chainPlan, [firstDay], firstDay.day);
assert.equal(swap.error, undefined);
assert.equal(swap.swapped, 'chain-0');
assert.deepEqual(swap.tiles.map(tile => tile.startTime), ['09:10', '08:35', '08:00']);
assert.equal(grid.validate(swap.tiles, chainPlan, [firstDay]), null);
const legacyCourt = chain.map((tile, index) => ({ ...tile, court:index === 0 ? '1' : 1 }));
const normalizedCourt = grid.move(legacyCourt, 'chain-2', 1, '08:00', chainPlan, [firstDay], firstDay.day);
assert.equal(normalizedCourt.swapped, 'chain-0', 'quadra legada em texto participa da troca');
assert.equal(grid.overlapIds(normalizedCourt.tiles, chainPlan).size, 0);
assert.equal(grid.validate(normalizedCourt.tiles, chainPlan, [firstDay]), null);
const shortDay = { day:firstDay.day, startTime:'08:00', endTime:'09:30' };
const overflowingMove = grid.move(chain, 'chain-2', 1, '09:00', chainPlan, [shortDay], shortDay.day);
assert.match(overflowingMove.error, /fora do horário/);
assert.equal(overflowingMove.tiles, undefined);
const midnightChain = ['22:40', '23:15'].map((startTime, index) => ({
  id:'late-' + index, kind:'elimination', category:'Late ' + index,
  day:firstDay.day, startTime, court:1, round:1, duration:35
}));
const midnightDay = { day:firstDay.day, startTime:'08:00', endTime:'23:59' };
const midnightMove = grid.move(midnightChain, 'late-0', 1, '23:55', chainPlan, [midnightDay], midnightDay.day);
assert.match(midnightMove.error, /fora do horário/, 'um movimento impossível não pode deixar blocos sobrepostos');
assert.deepEqual(midnightChain.map(tile => tile.startTime), ['22:40', '23:15'], 'falha não altera a grade original');
const last = tiles[tiles.length - 1];
const moved = grid.move(tiles, last.id, last.court, '08:00', fixture, [firstDay, secondDay], secondDay.day);
assert.equal(moved.error, undefined);
assert.equal(grid.validate(moved.tiles, fixture, [firstDay, secondDay]), null);
const saved = grid.toPlan(fixture, moved.tiles);
assert.equal(saved.blocks.some(block => block.day === secondDay.day), true);
assert.equal(grid.validate(grid.expand(saved, tournament), saved, [firstDay, secondDay]), null);
const tooLate = grid.move(tiles, last.id, last.court, '20:45', fixture, [firstDay], firstDay.day);
assert.match(tooLate.error, /fora do horário/, 'bloco excedente não deve quebrar o rascunho');
assert.equal(tooLate.tiles, undefined);
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
