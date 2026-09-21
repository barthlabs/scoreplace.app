'use strict';

const DIMENSIONS = new Set(['skill', 'age', 'gender', 'custom']);
const RIGORS = new Set(['casual', 'moderate', 'official']);
const ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;

function fail(message) { throw new Error(message); }
function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

function normalizeCategoryDefinitions(input) {
  if (!Array.isArray(input) || input.length > 50) fail('definições de categoria inválidas');
  const ids = new Set();
  return input.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('definição de categoria inválida');
    const allowed = new Set(['id', 'label', 'dimension', 'exclusivityGroup', 'criteria', 'enabled']);
    if (Object.keys(raw).some((key) => !allowed.has(key))) fail('campo de categoria não permitido');
    const id = String(raw.id || '');
    const label = String(raw.label || '').trim();
    const dimension = String(raw.dimension || '');
    if (!ID_RE.test(id) || ids.has(id) || !label || label.length > 80 || !DIMENSIONS.has(dimension)) fail('definição de categoria inválida');
    ids.add(id);
    const exclusivityGroup = raw.exclusivityGroup == null ? null : String(raw.exclusivityGroup);
    if (exclusivityGroup !== null && !ID_RE.test(exclusivityGroup)) fail('grupo de exclusividade inválido');
    const criteria = raw.criteria == null ? {} : raw.criteria;
    if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) fail('critério de categoria inválido');
    return { id, label, dimension, exclusivityGroup, criteria, enabled: raw.enabled !== false };
  });
}

function ageFromBirthDate(raw, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw || ''))) return null;
  const birth = new Date(String(raw) + 'T00:00:00Z');
  if (Number.isNaN(birth.getTime())) return null;
  const date = now instanceof Date ? now : new Date(now || Date.now());
  let age = date.getUTCFullYear() - birth.getUTCFullYear();
  if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && date.getUTCDate() < birth.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

function criterionIssues(definition, profile, sport, now) {
  const criteria = definition.criteria || {}, issues = [];
  if (criteria.age && own(criteria.age, 'minYears')) {
    const minimum = Number(criteria.age.minYears), age = ageFromBirthDate(profile && profile.birthDate, now);
    if (!Number.isInteger(minimum) || minimum < 0 || minimum > 120) issues.push('invalid-age-criterion');
    else if (age === null) issues.push('missing-birth-date');
    else if (age < minimum) issues.push('age-not-eligible');
  }
  if (criteria.gender && Array.isArray(criteria.gender.allowed)) {
    const allowed = criteria.gender.allowed.map(String);
    if (!allowed.length || allowed.some((value) => !['feminino', 'masculino', 'misto'].includes(value))) issues.push('invalid-gender-criterion');
    else if (!profile || !allowed.includes(String(profile.gender || ''))) issues.push(profile && profile.gender ? 'gender-not-eligible' : 'missing-gender');
  }
  if (criteria.skill && Array.isArray(criteria.skill.allowed)) {
    const allowed = criteria.skill.allowed.map(String);
    const skills = profile && profile.skillBySport && typeof profile.skillBySport === 'object' ? profile.skillBySport : {};
    const skill = String((sport && skills[sport]) || (profile && profile.defaultCategory) || '');
    if (!allowed.length) issues.push('invalid-skill-criterion');
    else if (!skill) issues.push('missing-skill');
    else if (!allowed.includes(skill)) issues.push('skill-not-eligible');
  }
  return issues;
}

function decideEnrollment(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('pedido de inscrição inválido');
  const definitions = normalizeCategoryDefinitions(input.definitions);
  const rigor = String(input.rigor || 'casual');
  if (!RIGORS.has(rigor)) fail('rigor inválido');
  const requested = Array.isArray(input.categoryIds) ? input.categoryIds.map(String) : [];
  if (!requested.length || requested.length > definitions.length || new Set(requested).size !== requested.length) fail('categorias solicitadas inválidas');
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const selected = requested.map((id) => byId.get(id));
  if (selected.some((definition) => !definition || !definition.enabled)) return { outcome: 'rejected', reasons: ['unknown-or-disabled-category'] };
  const existing = Array.isArray(input.existingCategoryIds) ? input.existingCategoryIds.map(String) : [];
  const groups = new Set();
  for (const id of existing.concat(requested)) {
    const definition = byId.get(id);
    if (!definition || !definition.exclusivityGroup) continue;
    if (groups.has(definition.exclusivityGroup)) return { outcome: 'conflict', reasons: ['exclusive-category-conflict'] };
    groups.add(definition.exclusivityGroup);
  }
  if (rigor === 'casual') return { outcome: 'accepted', validationState: 'approved', categoryIds: requested };
  const issues = selected.flatMap((definition) => criterionIssues(definition, input.profile || {}, input.sport, input.now));
  if (!issues.length) return { outcome: 'accepted', validationState: 'approved', categoryIds: requested };
  if (rigor === 'moderate') return { outcome: 'accepted', validationState: 'pending_review', categoryIds: requested, reasons: Array.from(new Set(issues)) };
  return { outcome: 'rejected', reasons: Array.from(new Set(issues)) };
}

module.exports = { DIMENSIONS, RIGORS, normalizeCategoryDefinitions, ageFromBirthDate, decideEnrollment };
