'use strict';

/* A inclusão manual é a última porta de roster que poderia perder a categoria
 * tipada após a materialização. Este teste textual protege o contrato entre as
 * duas superfícies da organização e a callable: IDs entram, labels não. */
const fs = require('fs');
let fail = 0;
function ok(value, message) { console.log((value ? '✓ ' : '✗ ') + message); if (!value) fail++; }

const enrollment = fs.readFileSync('js/views/tournaments-enrollment.js', 'utf8');
const tools = fs.readFileSync('js/views/tournaments-org-tools.js', 'utf8');
const coreStart = enrollment.indexOf('window._doAddParticipant = function');
const coreEnd = enrollment.indexOf('\n\n\n})();', coreStart);
const core = enrollment.slice(coreStart, coreEnd < 0 ? enrollment.length : coreEnd);
const pickerStart = enrollment.indexOf('window._addParticipantWithAutocomplete = function');
const picker = enrollment.slice(pickerStart);

ok(core.includes('participantObj.categoryIds = Array.from(new Set(_ids))') &&
  core.includes('Categoria necessária'),
  'inclusão manual canônica exige e transporta categoryIds');
ok(!/participantObj\.categories\s*=/.test(core) && !/participantObj\.category\s*=/.test(core),
  'inclusão manual não envia rótulo legado como categoria');
ok(picker.includes('id="ap-category-ids"') && picker.includes('onConfirm(sel.name, sel.uid, sel.photo, categoryIds)'),
  'atalho geral coleta IDs no seletor múltiplo e os entrega ao core');
ok(tools.includes('id="addpart-category-') && tools.includes('select.selectedOptions') &&
  tools.includes('null, categoryIds)'),
  'página da organização também coleta IDs e os entrega ao core');

process.exit(fail ? 1 : 0);
