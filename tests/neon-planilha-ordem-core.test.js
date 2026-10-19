'use strict';
const assert = require('assert');
const XLSX = require('xlsx');
const core = require('../scripts/neon-planilha-ordem-core');

const grid = () => [[''], [''], ['', '#', 'CATEGORIA', '', '', 'NOME']];
const book = XLSX.utils.book_new();
const categories = [
  ['LIGHT FEM', 'LIGHT FEMININO', 16],
  ['LIGHT MASC', 'LIGHT MASCULINO', 16],
  ['POWER FEM', 'POWER FEMININO', 8],
  ['EXTREME FEM', 'EXTREME FEMININO', 8],
  ['POWER MASC', 'POWER MASCULINO', 8],
  ['EXTREME MASC', 'EXTREME MASCULINO', 8],
];
const pairs = [];
for (const [sheetName, label, count] of categories) {
  const rows = grid();
  for (let i = 0; i < count; i++) {
    const rowLabel = sheetName === 'LIGHT MASC' && i >= 8 ? 'LIGHT FEMININO' : label;
    const nameA = `${sheetName} pessoa ${i * 2 + 1}`;
    const nameB = `${sheetName} pessoa ${i * 2 + 2}`;
    rows.push(['', i % 8 + 1, rowLabel, '', '', nameA]);
    rows.push(['', null, rowLabel, '', '', nameB]);
    rows.push([]);
    const outCategory = (rowLabel.includes('FEMININO') ? 'Fem ' : 'Masc ') +
      rowLabel.split(' ')[0][0] + rowLabel.split(' ')[0].slice(1).toLowerCase();
    pairs.push({ id: `${sheetName}-${i}`, category: outCategory, members: [
      { id: `a-${sheetName}-${i}`, name: nameB, seq: i * 2 + 2 },
      { id: `b-${sheetName}-${i}`, name: nameA, seq: i * 2 + 1 },
    ] });
  }
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName);
}
const rows = core.workbookRows(book);
assert.equal(rows.length, 64);
const result = core.align(rows, pairs.reverse());
assert.equal(result.length, 64);
assert.deepEqual(result.map(x => x.seq), Array.from({ length: 64 }, (_, i) => i * 2 + 1));
assert(result.every(x => x.first.name === x.row.members[0] && x.second.name === x.row.members[1]));
assert(result.every(x => x.reversed));
assert.deepEqual(core.CATEGORY_ORDER.map(c => result.filter(x => x.row.category === c).length),
  core.EXPECTED_PAIRS);
const light = result.filter(entry => entry.row.category === 'Fem Light');
const slots = [{ category:'Fem Light', day:'2026-10-22' }, { category:'Fem Light', day:'2026-10-23' }];
const oldDays = light.map((entry, index) => ({ fixedPairId:entry.pair.id,
  day:index < 8 ? '2026-10-23' : '2026-10-22' }));
const dayPlan = core.alignedDayAssignments(result, slots, {
  originDayPolicy:'female-light-organization-final', pairDayAssignments:oldDays });
assert.equal(dayPlan.fridayPairIds.length, 8);
assert.equal(dayPlan.changes, 16, 'corrige a troca de oito duplas entre quinta e sexta');
assert.deepEqual(dayPlan.assignments.map(item => item.day), light.map(entry =>
  entry.row.sheetName === 'LIGHT MASC' ? '2026-10-23' : '2026-10-22'));
assert.equal(oldDays[0].day, '2026-10-23', 'o plano anterior não é mutado');
const staleDays = oldDays.map((item, index) => index ? item : { fixedPairId:'antigo-id', day:item.day });
const repaired = core.alignedDayAssignments(result, slots, {
  originDayPolicy:'female-light-organization-final', pairDayAssignments:staleDays });
assert.equal(repaired.staleIds, 1, 'substitui um vínculo de dupla obsoleto no plano');
assert.equal(repaired.assignments[0].fixedPairId, light[0].pair.id);
assert.throws(() => core.alignedDayAssignments(result, slots, {
  originDayPolicy:'female-light-organization-final', pairDayAssignments:oldDays.slice(1) }), /incompleto/);
assert.throws(() => core.alignedDayAssignments(result, slots, {
  originDayPolicy:'organizer-pair-days', pairDayAssignments:oldDays }), /definidos no app/,
  'planilha histórica não substitui dia definido pelo organizador no app');
assert.throws(() => core.align(rows, pairs.slice(1)), /64 duplas/);
assert.equal(core.nameScore('Maria Helena', 'Maria Hélena'), 1);
assert.equal(core.nameScore('Nome longo da pessoa', 'Nome pessoa'), 2 / 3);
const registrations = Array.from({ length: 128 }, (_, i) => ({ status: 'confirmed', enrollSeq: i + 1 }));
const emptyQueue = { waitlist: [], standbyParticipants: [], monarchWaitlist: {} };
assert.deepEqual(core.validateNumbering(registrations.concat({ status: 'withdrawn', enrollSeq: 1 }), emptyQueue),
  { active: 128, withdrawn: 1 }, 'número histórico retirado já pode coincidir sem ocupar vaga');
assert.throws(() => core.validateNumbering(registrations.concat({ status: 'pending', enrollSeq: 1 }), emptyQueue),
  /fila ou inscrição pendente/);
assert.throws(() => core.validateNumbering(registrations, { waitlist: [{}] }), /fila ou inscrição pendente/);
assert.throws(() => core.validateNumbering(registrations.map((x, i) =>
  i === 127 ? { ...x, enrollSeq: 1 } : x), emptyQueue), /permutação/);
const oldMirror = { fixedPair: true, p1Uid: 'u2', p1Name: 'Segundo', p1Seq: 2,
  p2ManualId: 'm1', p2Name: 'Primeiro', p2Seq: 1, name: 'Segundo / Primeiro', categoryId: 'intocado' };
const mirrored = core.reorderedMirror(oldMirror, 'manual:m1', 37);
assert.equal(mirrored.p1ManualId, 'm1');
assert.equal(mirrored.p2Uid, 'u2');
assert.equal(mirrored.p1Seq, 37);
assert.equal(mirrored.p2Seq, 38);
assert.equal(mirrored.name, 'Primeiro / Segundo');
assert.equal(mirrored.categoryId, 'intocado');
assert.equal(oldMirror.p1Uid, 'u2', 'o original e o backup não sofrem mutação');
console.log('✅ Neon: ordem das 64 duplas e lados da planilha, sem mudar identidade/categoria');
