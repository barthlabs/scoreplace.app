'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/views/tournaments-enrollment-report.js'), 'utf8');
const instrumented = source.replace(/\}\)\(\);\s*$/, 'window.__testSaveReservations = _erSaveCanonicalCategoryEdits;\n})();');
assert.notEqual(instrumented, source, 'teste alcança a mesma função de salvamento usada pela Análise');
const calls = [];
let failSecond = false;
const window = {
  FirestoreDB: { _callFn: async (name, data) => {
    calls.push({ name, data });
    if (failSecond && data.toCategoryId === 'vitamina-c') throw new Error('falha simulada');
    return { data: { changed: data.manualParticipantIds.length } };
  } },
  _canonicalCategoryIdForDisplay: (_t, label) => label === 'Retinal' ? 'retinal'
    : label === 'Vitamina C' ? 'vitamina-c' : '',
};
vm.runInNewContext(instrumented, { window, document: {}, console, setTimeout, clearTimeout, Promise });
const tournament = { id: 'sb_test', isSandbox: true };
const rows = Array.from({ length: 16 }, (_, i) => ({
  manualId: 'manual-' + i, uid: null, categoryId: '', _duplaIdx: null,
  genericPlaceholderReservation: true,
}));
const edits = rows.map((row) => ({ manualParticipantId: row.manualId,
  category: row.manualId === 'manual-15' ? 'Vitamina C' : 'Retinal' }));

(async () => {
  const result = await window.__testSaveReservations(tournament, rows, edits);
  assert.equal(result.changed, 16);
  assert.deepEqual(calls.map((call) => call.name),
    ['assignCanonicalPlaceholderCategoryBatch', 'assignCanonicalPlaceholderCategoryBatch']);
  assert.equal(calls[0].data.manualParticipantIds.length, 15);
  assert.equal(calls[0].data.toCategoryId, 'retinal');
  assert.equal(calls[1].data.manualParticipantIds[0], 'manual-15');
  assert.equal(calls[1].data.sandbox, true);
  calls.length = 0;
  failSecond = true;
  await assert.rejects(window.__testSaveReservations(tournament, rows, edits),
    /Parte do bloco pode já ter sido salva; tente Salvar novamente/);
  assert.equal(calls.length, 2, 'falha da segunda categoria é sinalizada após a primeira');
  calls.length = 0;
  assert.throws(() => window.__testSaveReservations(tournament, rows,
    [{ manualParticipantId: 'manual-0', category: 'Inexistente' }]), /categoria escolhida não existe/);
  assert.equal(calls.length, 0, 'categoria inválida falha antes de qualquer escrita');
  console.log('✓ Análise envia 16 reservas por categoria e comunica salvamento parcial');
})().catch((error) => { console.error(error); process.exitCode = 1; });
