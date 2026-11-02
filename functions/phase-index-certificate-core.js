'use strict';

const { createHash } = require('crypto');

const FIELD = '_phaseReadCertificate';
const VERSION = 2;
// O leitor usa uma consulta IN limitada a estas trinta fases.
const MAX_PHASE_INDEX = 29;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const result = {};
    Object.keys(value).sort().forEach((key) => {
      if (value[key] !== undefined) result[key] = stable(value[key]);
    });
    return result;
  }
  return value;
}

function jsonPure(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== null && proto !== Object.prototype &&
      Object.getPrototypeOf(proto) !== null) return false;
  if (Array.isArray(value) && Object.keys(value).length !== value.length) return false;
  seen.add(value);
  const valid = Object.keys(value).every((key) =>
    key !== '__proto__' && key !== 'constructor' && jsonPure(value[key], seen));
  seen.delete(value);
  return valid;
}

function hash(entries) {
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

// Só recebe a lista física completa de envelopes, obtida pelo escritor confiável.
// null força a leitura integral; um registro ambíguo jamais vira fase zero.
function build(records, split) {
  if (!Array.isArray(records) || !split || typeof split.faseIndexavel !== 'function' ||
      typeof split.chaveDoRegistro !== 'function') return null;
  const entries = [];
  const seen = new Set();
  for (const record of records) {
    if (!record || !record.jogo || !record._loc) return null;
    if (!jsonPure(record._loc) ||
        (Object.prototype.hasOwnProperty.call(record.jogo, 'phaseIndex') &&
          !jsonPure(record.jogo.phaseIndex))) return null;
    const key = split.chaveDoRegistro(record);
    if (!key || seen.has(key)) return null;
    seen.add(key);
    const phase = split.faseIndexavel(record.jogo, record._loc);
    if (!Number.isSafeInteger(phase) || phase < 0 || phase > MAX_PHASE_INDEX ||
        record._phaseIndex !== phase) return null;
    entries.push([key, stable(record._loc),
      Object.prototype.hasOwnProperty.call(record.jogo, 'phaseIndex')
        ? stable(record.jogo.phaseIndex) : { absent: true }, phase]);
  }
  entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const phases = {};
  for (let phase = 0; phase <= MAX_PHASE_INDEX; phase++) {
    phases[String(phase)] = hash(entries.filter((entry) => entry[3] === phase));
  }
  return { version: VERSION, count: entries.length, digest: hash(entries), phases };
}

module.exports = { FIELD, VERSION, MAX_PHASE_INDEX, build };
