'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/views/tournaments-enrollment-report.js'), 'utf8');
const start = source.indexOf('  window._lzAthleteDialog = function (uid, order)');
const end = source.indexOf('  function _lzAskProfileCounts(', start);
assert(start >= 0 && end > start);
const row = { order: 7, uid: '', manualId: 'typed-7', name: 'Pessoa digitada', _duplaIdx: 2 };
let opened, edited = 0, removed = 0, imported = 0;
const window = {
  _lzScanCtx: {}, _lzRenderCtx: {}, _lzContagens: () => ({
    g: { x: 0, y: null }, t: { x: 0, y: null }, r: { x: 0, y: null },
  }),
  _lzGameCards: () => '', _lzAba: () => {},
  _spLetzplayPrecisaDesktop: () => false,
  _lzAthleteImport: () => { imported++; },
  _erEditPairMember: (order) => { assert.equal(order, 7); edited++; },
  showConfirmDialog: (title, body, confirm, cancel, options) => { opened = { title, body, options }; },
};
vm.runInNewContext(source.slice(start, end), {
  window,
  _liveState: { rows: [row], isOrg: true, t: { canonicalRegistrationMigration: { fingerprint: 'verified' } } },
  _lzNomeDoUid: () => '', _lzLastUpdateOf: () => null, _lzMelhorImport: () => null,
  _lzTourneyRows: () => '', _lzGameRows: () => '', _lzJuntarScoreplace: () => {},
  _esc: (value) => String(value), navigator: { userAgent: 'Desktop' },
  setTimeout: () => {},
  document: { getElementById: () => ({ remove() { removed++; } }) },
});
window._lzAthleteDialog('', 7);
assert.match(opened.title, /Pessoa digitada/);
assert.match(opened.options.headerHtml, /_erEditFromFicha\(7\)/);
assert(!opened.options.headerHtml.includes('Puxar histórico'), 'manual sem @ não oferece import');
assert.equal(imported, 0);
window._erEditFromFicha(7);
assert.equal(removed, 1);
assert.equal(edited, 1);
console.log('✓ ficha de vaga digitada abre sem UID e mantém edição dentro do diálogo');
