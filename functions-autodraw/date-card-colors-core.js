'use strict';
const KEYS = ['background', 'text', 'day', 'month', 'time'];
const TYPOGRAPHY_KEYS = ['daySize', 'dayWeight', 'monthSize', 'monthWeight', 'timeSize', 'timeWeight'];
function validTypography(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === TYPOGRAPHY_KEYS.length && TYPOGRAPHY_KEYS.every(key => {
      const n = value[key];
      return Number.isInteger(n) && (key.endsWith('Size') ? n >= 70 && n <= 130 && n % 5 === 0 :
        n >= 300 && n <= 800 && n % 100 === 0);
    });
}
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.keys(value).length !== KEYS.length && Object.keys(value).length !== KEYS.length + 1) ||
      KEYS.some(key => typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key])) ||
      Object.keys(value).some(key => !KEYS.includes(key) && key !== 'typography') ||
      (Object.prototype.hasOwnProperty.call(value, 'typography') && !validTypography(value.typography))) {
    throw new Error('Escolha cores e tipografia válidas para a data.');
  }
  return value;
}
function mergeLegacyTypography(patch, current) {
  validate(patch);
  if (Object.prototype.hasOwnProperty.call(patch, 'typography') ||
      !current || !validTypography(current.typography)) return patch;
  return validate(Object.assign({}, patch, { typography: current.typography }));
}
module.exports = { validate, validTypography, mergeLegacyTypography };
