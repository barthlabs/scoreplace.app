'use strict';

// Contrato puro da atualização do PRÓPRIO perfil. Campos fora desta lista nunca
// chegam à escrita privilegiada da Function; preferências que já têm Functions
// específicas também não entram aqui.
const STRING_FIELDS = new Set([
  'authProvider', 'photoURL', 'displayName', 'email', 'gender', 'birthDate', 'city', 'hrMax',
  'letzplayHandle', 'letzplaySource', 'phone', 'phoneCountry'
]);
const ARRAY_FIELDS = new Set(['preferredCeps', 'preferredSports', 'refereeSports']);
const MAP_FIELDS = new Set(['skillBySport', 'canRefereeBySport']);
const ERASEABLE_FIELDS = new Set([
  'gender', 'birthDate', 'age', 'city', 'hrMax', 'letzplayHandle',
  'letzplaySource', 'preferredCeps', 'preferredSports'
]);

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function text(value, field) {
  if (typeof value !== 'string') throw new Error(field + ' deve ser texto');
  return value.trim();
}

function normalize(input) {
  if (!isPlainObject(input)) throw new Error('profile deve ser um objeto');
  const patch = {};
  Object.keys(input).forEach((field) => {
    const value = input[field];
    if (STRING_FIELDS.has(field)) {
      const normalized = text(value, field);
      if (normalized) patch[field] = normalized;
      return;
    }
    if (ARRAY_FIELDS.has(field)) {
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(field + ' deve ser lista de textos');
      patch[field] = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
      return;
    }
    if (MAP_FIELDS.has(field)) {
      if (!isPlainObject(value)) throw new Error(field + ' deve ser objeto');
      patch[field] = value;
      return;
    }
    if (field === 'age') {
      if (!Number.isInteger(value) || value < 0 || value > 130) throw new Error('age deve ser inteiro plausível');
      patch.age = value;
      return;
    }
    throw new Error('campo de perfil não permitido: ' + field);
  });
  return patch;
}

function normalizeEraseFields(fields) {
  if (fields == null) return [];
  if (!Array.isArray(fields) || fields.some((field) => typeof field !== 'string')) throw new Error('eraseFields deve ser lista de campos');
  const unique = [...new Set(fields)];
  unique.forEach((field) => {
    if (!ERASEABLE_FIELDS.has(field)) throw new Error('campo não pode ser apagado: ' + field);
  });
  return unique;
}

module.exports = { normalize, normalizeEraseFields, ERASEABLE_FIELDS };
