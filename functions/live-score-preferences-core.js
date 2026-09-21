'use strict';
const SCALE_KEYS = ['nameScale', 'photoScale', 'scoreScale', 'plateScale', 'btnScale'];
function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('preferências inválidas');
  const keys = Object.keys(input);
  if (!keys.length || keys.some((k) => !SCALE_KEYS.includes(k) && k !== 'fixSides')) throw new Error('campo de preferência não permitido');
  const out = {};
  for (const key of SCALE_KEYS) if (Object.prototype.hasOwnProperty.call(input, key)) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 4) throw new Error('escala inválida');
    out[key] = value;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'fixSides')) {
    if (typeof input.fixSides !== 'boolean') throw new Error('fixSides inválido');
    out.fixSides = input.fixSides;
  }
  return out;
}
module.exports = { normalize };
