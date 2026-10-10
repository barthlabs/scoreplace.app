'use strict';

// Regressão: Categoria não pode voltar a ser alterada pelo writer legado só
// porque o organizador abriu uma tela secundária. O marcador de migração deve
// escolher a mesma ponte tipada usada pelo gerenciador de categorias.
const fs = require('fs');
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

const bridge = between(categories, 'function _isCanonicalCategoryRoster', 'function _assignParticipantCategory');
ok(bridge.includes('window._isCanonicalCategoryRoster = _isCanonicalCategoryRoster') &&
   bridge.includes('window._reclassifyCanonicalCategory = _reclassifyCanonicalCategory'),
  'a ponte canônica é compartilhada explicitamente, em vez de cada tela inferir o marker');

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
ok(save.includes('gênero não é editável') && !save.includes('applyEnrollmentAssignments'),
  'Análise bloqueia campos sem equivalente canônico e não cai na porta legada');

const reportSave = between(reportUi, 'window._erSaveEdits = function', '// ─── Verificação letzplay');
ok(reportSave.includes('isCanonicalRoster') && reportSave.includes('_erSaveCanonicalCategoryEdits') &&
   reportSave.indexOf('isCanonicalRoster') < reportSave.indexOf("_callCF('applyEnrollmentAssignments'"),
  'salvamento escolhe a rota canônica antes da chamada legada de compatibilidade');

process.exitCode = failed ? 1 : 0;
