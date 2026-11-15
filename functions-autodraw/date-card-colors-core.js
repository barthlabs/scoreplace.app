'use strict';
const KEYS = ['background', 'text', 'day', 'month', 'time'];
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== KEYS.length ||
      Object.keys(value).some(key => !KEYS.includes(key) || typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key]))) {
    throw new Error('Escolha cinco cores válidas para a data.');
  }
  return value;
}
module.exports = { validate };
