const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const editor = fs.readFileSync(path.join(__dirname, '../js/views/phase-grid-editor.js'), 'utf8');
const form = fs.readFileSync(path.join(__dirname, '../js/views/create-tournament.js'), 'utf8');
const pt = fs.readFileSync(path.join(__dirname, '../js/i18n-pt.js'), 'utf8');
const format = fs.readFileSync(path.join(__dirname, '../js/views/format2-ui.js'), 'utf8');
assert.match(pt, /'create\.gameDurLabel': 'Tempo de jogo'/);
assert.match(form, /id="tourn-game-duration"/);
assert.match(form, /gameDurationVal = parseInt\(document\.getElementById\('tourn-game-duration'\)\.value\)/);
assert.match(format, /_placeExt\(\);\s*if \(typeof window\._renderPhaseGridEditor === 'function'\) window\._renderPhaseGridEditor\(\)/);

const mount = { innerHTML: 'Grade de fases e quadras' };
const window = { ScoreplacePhaseGridPlan: {}, _f2GetConfig: () => ({ parceria: 'super_eight' }) };
const document = { getElementById: (id) => id === 'phase-call-order-editor' ? mount : null,
  addEventListener() {} };
vm.runInNewContext(editor, { window, document, Event });
window._renderPhaseGridEditor();
assert.equal(mount.innerHTML, '', 'Super 8 não mostra o campo independente de jogo eliminatório');
assert.doesNotMatch(editor, /phase-grid-(?:call-time|warmup-time|elimination-play)/);
assert.match(editor, /eliminationPlayMinutes:tournament\.gameDuration/);
console.log('✓ todos os formatos editam os três tempos em uma única seção');
