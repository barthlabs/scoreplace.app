'use strict';

/* A inclusão manual é a última porta de roster que poderia perder a categoria
 * tipada após a materialização. Este teste textual protege o contrato entre as
 * duas superfícies da organização e a callable: IDs entram, labels não. */
const fs = require('fs');
let fail = 0;
function ok(value, message) { console.log((value ? '✓ ' : '✗ ') + message); if (!value) fail++; }

const enrollment = fs.readFileSync('js/views/tournaments-enrollment.js', 'utf8');
const tools = fs.readFileSync('js/views/tournaments-org-tools.js', 'utf8');
const analysis = fs.readFileSync('js/views/tournaments-enrollment-report.js', 'utf8');
const coreStart = enrollment.indexOf('window._doAddParticipant = function');
const coreEnd = enrollment.indexOf('\n\n\n})();', coreStart);
const core = enrollment.slice(coreStart, coreEnd < 0 ? enrollment.length : coreEnd);
const pickerStart = enrollment.indexOf('window._addParticipantWithAutocomplete = function');
const picker = enrollment.slice(pickerStart);

ok(core.includes('if (!_ids.length && !_organizerManual)') &&
  core.includes('if (_ids.length) participantObj.categoryIds = Array.from(new Set(_ids))'),
  'organizador pode adiar categoria; inscrição comum continua exigindo IDs');
ok(!/participantObj\.categories\s*=/.test(core) && !/participantObj\.category\s*=/.test(core),
  'inclusão manual não envia rótulo legado como categoria');
ok(!picker.includes('id="ap-category-ids"') && picker.includes('onConfirm(sel.name, sel.uid, sel.photo)'),
  'atalho da organização não exige categoria antes da Análise');
ok(!tools.includes('id="addpart-category-') && !tools.includes('select.selectedOptions'),
  'painel e página da organização não exibem seletor de categoria');
ok(core.includes('window._doAddParticipant = function (tId, pName, selectedUid, selectedPhoto, onDone, _resolved, categoryIds)') &&
  tools.includes('window._doAddParticipant(tId, name, null, null, function'),
  'página de inclusão chama a assinatura canônica de sete argumentos sem impor categoria');
ok(analysis.includes("if (curCat === '__uncategorized__') curCat = '';"),
  'Análise apresenta a inscrição canônica sem categoria como pendente de classificação');

process.exit(fail ? 1 : 0);
