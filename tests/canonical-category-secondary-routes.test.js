'use strict';

// Regressão: Categoria não pode voltar a ser alterada pelo writer legado só
// porque o organizador abriu uma tela secundária. O marcador de migração deve
// escolher a mesma ponte tipada usada pelo gerenciador de categorias.
const fs = require('fs');
const vm = require('vm');
let failed = 0;
function ok(condition, message) {
  console.log((condition ? '✓ ' : '✗ ') + message);
  if (!condition) failed++;
}
function between(source, first, last) {
  const start = source.indexOf(first);
  const end = source.indexOf(last, start + first.length);
  return source.slice(start, end < 0 ? source.length : end);
}

const categories = fs.readFileSync('js/views/tournaments-categories.js', 'utf8');
const participantUi = fs.readFileSync('js/views/participants.js', 'utf8');
const reportUi = fs.readFileSync('js/views/tournaments-enrollment-report.js', 'utf8');
ok(reportUi.indexOf('window._erUpdateSaveBar = function') > 0 &&
   reportUi.indexOf('window._erUpdateSaveBar = function') < reportUi.lastIndexOf('window._erUpdateSaveBar();'),
  'a barra de salvar existe no mesmo módulo antes da montagem final da Análise');

const bridge = between(categories, 'function _isCanonicalCategoryRoster', 'function _assignParticipantCategory');
ok(bridge.includes('window._isCanonicalCategoryRoster = _isCanonicalCategoryRoster') &&
   bridge.includes('window._reclassifyCanonicalCategory = _reclassifyCanonicalCategory'),
  'a ponte canônica é compartilhada explicitamente, em vez de cada tela inferir o marker');
const sandboxPayloads = [];
const reclassifyBridge = vm.runInNewContext(
  between(categories, 'function _reclassifyCanonicalCategory', 'function _assignParticipantCategory') + '\n_reclassifyCanonicalCategory',
  { Promise, _assignmentParticipantIdentity: () => ({ uid: 'u1' }),
    _canonicalCategoryIdForDisplay: (_t, value) => value,
    window: { FirestoreDB: { _callFn: (_name, payload) => { sandboxPayloads.push(payload); return Promise.resolve({ ok: true }); } } } }
);
reclassifyBridge({ isSandbox: true, categoryDefinitions: [] }, 'sb_t1', { categoryId: 'cat-a' }, 'cat-b');
reclassifyBridge({ isSandbox: false, categoryDefinitions: [] }, 't1', { categoryId: 'cat-a' }, 'cat-b');
ok(sandboxPayloads.length === 2 && sandboxPayloads[0].sandbox === true && sandboxPayloads[1].sandbox === false,
  'ponte canônica envia sandbox=true somente para a cópia privada');

const skill = between(participantUi, 'window._setParticipantSkillCategory', '// ═══════════════════════════════════════════════════════════════════════════');
ok(skill.includes('isCanonicalRoster') && skill.includes('window._reclassifyCanonicalCategory') &&
   skill.indexOf('isCanonicalRoster') < skill.indexOf("_callCF('applyEnrollmentAssignments'"),
  'cartão de nível decide a rota canônica antes de considerar o writer legado');
ok(skill.includes('categoryId: String(skillIntent.participant.categoryId') &&
   skill.includes('manualParticipantId:'),
  'cartão de nível carrega categoryId e identidade estável para a reclassificação');

const save = between(reportUi, 'function _erSaveCanonicalCategoryEdits', 'function _erPendingCount');
ok(save.includes('row.categoryId') && save.includes('manualParticipantId: row.manualId') &&
   save.includes('window._reclassifyCanonicalCategory'),
  'Análise converte lote em mudanças tipadas, sem escolher alvo por nome');
ok(save.includes("'pair:'") && save.includes('seen[pairKey]'),
  'Análise envia uma única mudança para dupla fixa, pois a Function move ambas juntas');
ok(save.includes("!Object.prototype.hasOwnProperty.call(edit, 'category')") &&
   save.includes('Escolha uma categoria para gravar') && !save.includes('applyEnrollmentAssignments'),
  'Análise aceita gênero derivado da categoria no lote, mas bloqueia gênero isolado e não cai na porta legada');

const reportSave = between(reportUi, 'window._erSaveEdits = function', '// ─── Verificação letzplay');
ok(reportSave.includes('isCanonicalRoster') && reportSave.includes('_erSaveCanonicalCategoryEdits') &&
   reportSave.indexOf('isCanonicalRoster') < reportSave.indexOf("_callCF('applyEnrollmentAssignments'"),
  'salvamento escolhe a rota canônica antes da chamada legada de compatibilidade');

// A falha real só aparecia ao arrastar várias duplas: o lote levava gênero
// derivado da coluna junto da categoria, enquanto uma dupla isolada não levava.
(async function () {
  const calls = [];
  const context = {
    Promise,
    window: {
      _canonicalCategoryIdForDisplay: (_t, value) => value,
      _reclassifyCanonicalCategory: (_t, _id, participant, target) => {
        calls.push({ participant, target });
        return Promise.resolve();
      }
    }
  };
  const fn = vm.runInNewContext(save + '\n_erSaveCanonicalCategoryEdits', context);
  const rows = [
    { order: 113, manualId: 'm113', categoryId: '__uncategorized__', _duplaIdx: 1 },
    { order: 114, manualId: 'm114', categoryId: '__uncategorized__', _duplaIdx: 1 },
    { order: 115, manualId: 'm115', categoryId: '__uncategorized__', _duplaIdx: 2 },
    { order: 116, manualId: 'm116', categoryId: '__uncategorized__', _duplaIdx: 2 }
  ];
  const edits = rows.map((row) => ({ manualParticipantId: row.manualId, gender: 'masc', category: 'Masc Light' }));
  const result = await fn({ id: 'neon' }, rows, edits);
  ok(result.changed === 2 && calls.length === 2 && calls.every((call) => call.target === 'Masc Light'),
    'lote com gênero derivado grava uma vez por dupla, sem rejeitar antes da Function');
  let genderOnlyRejected = false;
  try { await fn({ id: 'neon' }, rows, [{ manualParticipantId: 'm113', gender: 'masc' }]); }
  catch (error) { genderOnlyRejected = /Escolha uma categoria/.test(error.message); }
  ok(genderOnlyRejected, 'gênero isolado continua bloqueado no roster canônico');

  // A seleção por Shift precisa seguir os cards visíveis, não a ordem interna
  // do array de inscrições (que no Neon colocava 111/112 dentro do intervalo).
  const pairCode = between(reportUi, 'function _erPairOrdersFrom', 'window._erMxClearSelection');
  const cardOrders = [113, 115, 117, 119, 121, 123, 125, 127];
  const cards = cardOrders.map((order) => ({ getAttribute: () => String(order) }));
  const grid = { querySelectorAll: () => cards };
  const shiftContext = {
    Date, Array, Number,
    _liveState: { rows: [111, 112].concat(Array.from({ length: 16 }, (_, i) => 113 + i))
      .reverse().map((order) => ({ order, _duplaIdx: Math.floor((order - 113) / 2) })) },
    _erLastMatrixDragAt: 0,
    _erHasFinePointer: () => true,
    _erSelectionAnchor: null,
    _erSelectedOrders: {},
    _erSelectRange: () => { throw new Error('não deve usar a ordem interna'); },
    window: { _erRenderMatrix: () => {} }
  };
  vm.createContext(shiftContext);
  vm.runInContext(pairCode, shiftContext);
  const event = { shiftKey: false, metaKey: false, ctrlKey: false,
    currentTarget: { closest: () => grid }, preventDefault() {}, stopPropagation() {} };
  shiftContext.window._erMxPairClick(event, 113);
  event.shiftKey = true;
  shiftContext.window._erMxPairClick(event, 127);
  const selected = Object.keys(shiftContext._erSelectedOrders).map(Number).sort((a, b) => a - b);
  ok(selected.length === 16 && selected[0] === 113 && selected[15] === 128 &&
     selected.includes(121) && selected.includes(122) && !selected.includes(111) && !selected.includes(112),
    'Shift seleciona exatamente 113–128 na grade visível, sem buraco nem 111/112');
  process.exitCode = failed ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
