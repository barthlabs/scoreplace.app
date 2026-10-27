'use strict';

/*
 * Traduz somente a apresentação categórica de torneios anteriores ao contrato
 * tipado. Não deduz regra de gênero, idade, habilidade ou exclusividade: sem
 * informação estrutural confiável, inventar uma regra poderia excluir alguém
 * de um torneio que já existe. A tradução preserva os rótulos e passa a usar
 * IDs opacos e estáveis.
 */

const crypto = require('crypto');
const eligibility = require('./category-eligibility-core');
const bridge = require('./registration-category-bridge-core');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function key(value) { return text(value).normalize('NFKC').toLocaleLowerCase('pt-BR'); }
function values(value) { return Array.isArray(value) ? value : []; }
function labelOf(value) {
  if (typeof value === 'string') return text(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return text(value.label || value.name || value.title || value.value);
}
function entryOf(record) {
  return record && Object.prototype.hasOwnProperty.call(record, 'entry') ? record.entry : record;
}

function legacyLabels(tournament, records) {
  const labels = [];
  const addAll = (raw) => values(raw).forEach((value) => { const label = labelOf(value); if (label) labels.push(label); });
  const source = tournament && typeof tournament === 'object' ? tournament : {};
  addAll(source.combinedCategories);
  // O formulário antigo usava estas listas quando ainda não havia categorias
  // combinadas. Mantemos a mesma composição somente como fallback visual.
  if (!labels.length) {
    const genders = values(source.genderCategories).map(labelOf).filter(Boolean);
    const skills = values(source.skillCategories).map(labelOf).filter(Boolean);
    const customs = values(source.customCategories).map(labelOf).filter(Boolean);
    if (genders.length && skills.length) genders.forEach((gender) => skills.forEach((skill) => labels.push(gender + ' ' + skill)));
    else addAll(source.genderCategories);
    addAll(source.skillCategories);
    addAll(source.ageCategories);
    customs.forEach((label) => labels.push(label));
  }
  values(records).forEach((record) => {
    const entry = entryOf(record) || {};
    const categories = Array.isArray(entry.categories) ? entry.categories : [entry.category];
    categories.forEach((value) => { const label = text(value); if (label) labels.push(label); });
  });
  const byKey = new Map();
  labels.forEach((label) => {
    const normalized = key(label);
    if (!normalized) return;
    const previous = byKey.get(normalized);
    if (previous && previous !== label) {
      throw new Error('rótulos legados de categoria ambíguos; corrija-os antes da migração');
    }
    byKey.set(normalized, label);
  });
  return Array.from(byKey.values());
}

function idForLabel(label) {
  return 'legacy-' + crypto.createHash('sha256').update(key(label), 'utf8').digest('hex').slice(0, 32);
}

function projectedDefinitions(tournament, records) {
  const labels = legacyLabels(tournament, records);
  const general = !labels.length;
  const effective = general ? ['Geral'] : labels;
  const definitions = effective.map((label) => ({
    id: idForLabel(label), label: label, dimension: 'custom', exclusivityGroup: null, criteria: {}, enabled: true,
  }));
  return { definitions: eligibility.normalizeCategoryDefinitions(definitions), defaultCategoryId: general ? definitions[0].id : '' };
}

function resolve(tournament, records) {
  const raw = tournament && tournament.categoryDefinitions;
  if (Array.isArray(raw) && raw.length) {
    const definitions = eligibility.normalizeCategoryDefinitions(raw);
    return { definitions, categoryIdForLegacyLabel: bridge.categoryBridge(definitions), defaultCategoryId: '', shouldPersist: false, source: 'existing' };
  }
  if (raw != null && !Array.isArray(raw)) throw new Error('definições de categoria legadas inválidas');
  const projected = projectedDefinitions(tournament, records);
  return {
    definitions: projected.definitions,
    categoryIdForLegacyLabel: bridge.categoryBridge(projected.definitions, { defaultCategoryId: projected.defaultCategoryId }),
    defaultCategoryId: projected.defaultCategoryId,
    shouldPersist: true,
    source: 'legacy-projection',
  };
}

module.exports = { legacyLabels, projectedDefinitions, resolve, idForLabel };
