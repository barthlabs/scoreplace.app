'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/views/tournaments-enrollment-report.js', 'utf8');
const instrumented = source.replace(/\}\)\(\);\s*$/, 'window.__testSaveReservations = _erSaveCanonicalCategoryEdits;\n})();');
assert.notEqual(instrumented, source, 'executa o salvamento real da Análise');
const calls = [];
let fail = false, unknown = false;
const window = {
  FirestoreDB: { _callFn: async (name, data) => {
    calls.push({ name, data });
    if (fail) throw new Error('falha simulada no servidor');
    if (unknown) return { data: { ok:true, changed:1 } };
    return { data: { ok:true, outcome:'assigned', changed:data.edits.length + data.reservations.length,
      resolvedEntries:data.edits.length + data.reservations.length, operationId:data.operationId } };
  } },
  _canonicalCategoryIdForDisplay: (_t, label) => label === 'Retinal' ? 'retinal'
    : label === 'Vitamina C' ? 'vitamina-c' : label === '__uncategorized__' ? label : '',
};
vm.runInNewContext(instrumented, { window, document:{}, console, setTimeout, clearTimeout, Promise, Date, Math });
const tournament = { id:'sb_test', isSandbox:true };
const rows = Array.from({ length:16 }, (_, i) => ({ manualId:'manual-' + i, uid:null,
  categoryId:'', _duplaIdx:null, genericPlaceholderReservation:true }));
const edits = rows.map((row) => ({ manualParticipantId:row.manualId,
  category:row.manualId === 'manual-15' ? 'Vitamina C' : 'Retinal' }));

(async () => {
  const first = await window.__testSaveReservations(tournament, rows, edits);
  assert.equal(first.resolvedEntries,16);
  assert.equal(calls.length,1,'duas categorias são uma única chamada');
  assert.equal(calls[0].name,'assignCanonicalPlaceholderCategoryBatch');
  assert.equal(calls[0].data.reservations.length,16);
  assert.equal(calls[0].data.edits.length,0);
  assert.equal(calls[0].data.sandbox,true);
  assert.match(calls[0].data.operationId,/^er13_[A-Za-z0-9_]+$/);
  const stableId = calls[0].data.operationId;
  calls.length=0; fail=true;
  await assert.rejects(window.__testSaveReservations(tournament, rows, edits),/falha simulada/);
  assert.equal(calls.length,1);
  assert.equal(calls[0].data.operationId,stableId,'retry usa o mesmo ID');
  fail=false; unknown=true;
  await assert.rejects(window.__testSaveReservations(tournament, rows, edits),/não confirmou o bloco inteiro/);
  unknown=false; calls.length=0;
  const existing={manualId:'existing',uid:null,categoryId:'retinal',assigned:['Retinal'],
    _duplaIdx:null,genericPlaceholderReservation:false};
  await window.__testSaveReservations(tournament,[rows[0],existing],[
    {manualParticipantId:'manual-0',category:'Retinal'},
    {manualParticipantId:'existing',category:'Vitamina C'}]);
  assert.equal(calls.length,1,'reserva e reclassificação compartilham a chamada');
  assert.equal(calls[0].data.reservations.length,1);
  assert.equal(calls[0].data.edits.length,1);
  assert.equal(calls[0].data.edits[0].fromCategoryId,'retinal');
  assert.equal(calls[0].data.edits[0].toCategoryId,'vitamina-c');
  calls.length=0;
  await window.__testSaveReservations(tournament,[
    {order:1,uid:'alice',manualId:'',categoryId:'retinal',_duplaIdx:null},
    {order:2,uid:'alice',manualId:'',categoryId:'vitamina-c',_duplaIdx:null}
  ],[{uid:'alice',sourceRowOrder:2,category:'Retinal'}]);
  assert.equal(calls[0].data.edits[0].fromCategoryId,'vitamina-c',
    'ordem do card preserva a inscrição exata quando a conta tem duas categorias');
  calls.length=0;
  assert.throws(() => window.__testSaveReservations(tournament,rows,
    [{manualParticipantId:'manual-0',category:'Inexistente'}]),/categoria escolhida não existe/);
  assert.equal(calls.length,0,'categoria inválida é recusada antes da chamada');
  console.log('✓ E13 cliente: bloco único, IDs tipados, retry e recibo explícito');
})().catch((error) => { console.error(error); process.exitCode=1; });
