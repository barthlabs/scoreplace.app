'use strict';
function normalizeContactPrivacy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((k) => k !== 'omitEmail' && k !== 'omitPhone') || !Object.keys(input).length) throw new Error('privacidade de contato inválida');
  const out = {}; ['omitEmail', 'omitPhone'].forEach((k) => { if (Object.prototype.hasOwnProperty.call(input, k)) { if (typeof input[k] !== 'boolean') throw new Error('preferência de contato inválida'); out[k] = input[k]; } }); return out;
}
module.exports = { normalizeContactPrivacy };
