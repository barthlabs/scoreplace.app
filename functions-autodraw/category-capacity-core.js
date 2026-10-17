'use strict';

// A ficha define uma capacidade geral e, opcionalmente, uma por categoria.
// O total é sempre derivado dessas capacidades. Documentos antigos incoerentes
// podem ser preservados em edições não relacionadas, mas não criados de novo.
function validateCapacityConfig(config, HttpsError, previous) {
  const fail = message => { throw new HttpsError('invalid-argument', message); };
  const c = Object.assign({}, previous || {}, config || {});
  const categories = Array.isArray(c.combinedCategories) ? c.combinedCategories : [];
  const map = c.maxParticipantsByCategory == null ? {} : c.maxParticipantsByCategory;
  if (!map || typeof map !== 'object' || Array.isArray(map)) fail('Vagas por categoria inválidas.');
  const keys = Object.keys(map);
  const categorySet = new Set(categories);
  if (categorySet.size !== categories.length) fail('Categorias duplicadas na capacidade.');
  keys.forEach(key => {
    if (!categorySet.has(key)) fail('Categoria inexistente na capacidade: ' + key);
    if (!Number.isSafeInteger(map[key]) || map[key] <= 0) fail('Vagas da categoria devem ser inteiros positivos.');
  });
  const general = c.maxParticipantsPerCategory;
  const hasGeneral = general !== null && general !== undefined && general !== '';
  if (hasGeneral && (!Number.isSafeInteger(general) || general <= 0)) fail('Vagas gerais por categoria devem ser um inteiro positivo.');
  if (keys.length && !hasGeneral && keys.length !== categories.length) fail('Defina vagas gerais antes das exceções por categoria.');
  if (!categories.length || (!hasGeneral && !keys.length)) return;
  const expected = categories.reduce((sum, key) => sum + (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : general), 0);
  if (c.enrollmentLimitMode === 'draw' && (c.maxParticipants === null || c.maxParticipants === undefined)) return;
  const previousCategories = previous && Array.isArray(previous.combinedCategories) ? previous.combinedCategories : [];
  const previousMap = previous && previous.maxParticipantsByCategory || {};
  const sameAsPrevious = previous &&
    previousCategories.length === categories.length && categories.every(key => previousCategories.includes(key)) &&
    previous.maxParticipantsPerCategory === general &&
    Object.keys(previousMap).length === keys.length && keys.every(key => previousMap[key] === map[key]) &&
    previous.maxParticipants === c.maxParticipants;
  if (!sameAsPrevious && c.maxParticipants !== expected) fail('O total de vagas deve ser a soma das categorias.');
}

module.exports = { validateCapacityConfig };
