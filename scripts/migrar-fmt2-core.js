'use strict';

const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { stable } = require('./backup-torneio-operacional-core');
const { toFirestore } = require('./phase-projection-firestore-core');
const { _window } = require('../functions-autodraw/draw-core');

const PROJECT = 'scoreplace-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/tournaments`;
const EXCLUDED_IDS = new Set([
  'tour_1780009816637',
  'tour_1790628592058_c342a1e8f5068424887f1702a1633a44'
]);
const MUTABLE_TOP = Object.freeze([
  'fmt2', 'phases', 'drawMode', 'enrollmentMode', 'gruposClassified',
  'gruposCount', 'manualPairing', 'mixedPairingSeparated',
  'politicaDaChave', 'teamSize', 'turnos'
]);
const MUTABLE_SET = new Set(MUTABLE_TOP);
const DERIVED_TOP_ALLOWED = new Set([...MUTABLE_TOP, 'format']);

function fail(message) { throw new Error('FMT2 ABORTADO: ' + message); }
function canonical(value) { return JSON.stringify(stable(value)); }
function hash(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }

function timestampParts(value) {
  if (value && value.__firestoreType === 'timestamp') {
    if (!Number.isSafeInteger(value.seconds) || !Number.isInteger(value.nanoseconds)) fail('timestamp inválido no backup');
    return [value.seconds, value.nanoseconds];
  }
  const match = typeof value === 'string' && value.match(/^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/);
  if (!match) fail('timestamp REST inválido');
  const seconds = Date.parse(match[1] + 'Z') / 1000;
  if (!Number.isSafeInteger(seconds)) fail('timestamp REST fora do intervalo');
  return [seconds, Number((match[2] || '').padEnd(9, '0'))];
}
function sameTimestamp(left, right) {
  return isDeepStrictEqual(timestampParts(left), timestampParts(right));
}
function stableRestValue(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) {
    const [seconds, nanoseconds] = timestampParts(value.timestampValue);
    return { __firestoreType: 'timestamp', seconds, nanoseconds };
  }
  if ('bytesValue' in value) return { __firestoreType: 'bytes', base64: value.bytesValue };
  if ('geoPointValue' in value) return { __firestoreType: 'geopoint', latitude: value.geoPointValue.latitude, longitude: value.geoPointValue.longitude };
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(stableRestValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, child]) => [key, stableRestValue(child)]));
  fail('tipo Firestore não representado no backup');
}
function decodeDocument(document) {
  if (!document || !document.updateTime || !document.fields) fail('documento REST incompleto');
  return { data: Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, stableRestValue(value)])), updateTime: document.updateTime };
}
function toFirestorePreservingTypes(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.__firestoreType === 'timestamp') {
      const [seconds, nanos] = timestampParts(value);
      const base = new Date(seconds * 1000).toISOString().replace(/\.000Z$/, '');
      return { timestampValue: base + '.' + String(nanos).padStart(9, '0') + 'Z' };
    }
    if (value.__firestoreType === 'geopoint') return { geoPointValue: { latitude: value.latitude, longitude: value.longitude } };
    if (value.__firestoreType === 'bytes') return { bytesValue: value.base64 };
    if (Object.prototype.hasOwnProperty.call(value, '__firestoreType')) fail('tipo especial desconhecido');
    return { mapValue: { fields: Object.fromEntries(Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, toFirestorePreservingTypes(child)])) } };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestorePreservingTypes) } };
  return toFirestore(value);
}
function protectedFields(tournament) {
  return Object.fromEntries(Object.entries(tournament).filter(([key]) => !MUTABLE_SET.has(key)));
}
function pruneUndefined(value) {
  if (Array.isArray(value)) return value.map((item) => item === undefined ? null : pruneUndefined(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, child]) => child !== undefined)
    .map(([key, child]) => [key, pruneUndefined(child)]));
  if (typeof value === 'number' && !Number.isFinite(value)) fail('número não finito no patch');
  return value;
}
function mergeDeclarative(original, compiled) {
  if (!original || !compiled || typeof original !== 'object' || typeof compiled !== 'object' ||
      Array.isArray(original) || Array.isArray(compiled)) return compiled;
  const result = { ...original };
  for (const [key, value] of Object.entries(compiled)) {
    // Configuração de fase existente pode carregar política de placar, número
    // de rodadas e outros dados operacionais. O fmt2 novo vira a intenção
    // canônica; o espelho histórico conserva literalmente cada chave antiga.
    if (!Object.prototype.hasOwnProperty.call(original, key)) result[key] = value;
    else if (original[key] && value && typeof original[key] === 'object' && typeof value === 'object' &&
        !Array.isArray(original[key]) && !Array.isArray(value)) result[key] = mergeDeclarative(original[key], value);
  }
  return result;
}
function phaseProjection(original, compiled) {
  if (!Array.isArray(original) || !Array.isArray(compiled) || original.length !== compiled.length) fail('número de fases divergiu');
  return original.map((phase, index) => {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) fail('fase antiga inválida: ' + index);
    // O tradutor já comprovou equivalência dos campos declarativos. Campos de
    // resultado/operacionais desconhecidos nunca são removidos da fase.
    return mergeDeclarative(phase, compiled[index]);
  });
}
function normalizeEffective(tournament, effective) {
  const result = structuredClone(effective);
  if (tournament.format === 'Eliminatórias Simples' && !result.politicaDaChave) result.politicaDaChave = 'repescagem';
  return result;
}
function buildPatch(tournament) {
  if (!tournament || typeof tournament !== 'object' || tournament.fmt2) fail('torneio já canônico ou inválido');
  const translation = _window.FORMAT2.translateLegacyTournament(tournament);
  if (!translation.ok) fail('tradução não comprovada: ' + translation.reason);
  const { fmt2, derived } = translation;
  for (const key of Object.keys(derived.topLevel)) {
    if (!DERIVED_TOP_ALLOWED.has(key)) fail('campo novo fora da allowlist: ' + key);
  }
  if (derived.topLevel.format !== tournament.format) fail('formato histórico divergiu');
  const phases = phaseProjection(tournament.phases, derived.phases);
  const fields = { fmt2, phases };
  for (const [key, value] of Object.entries(derived.topLevel)) {
    if (key !== 'format' && value !== undefined) fields[key] = value;
  }
  const cleaned = pruneUndefined(fields);
  const after = { ...tournament, ...cleaned };
  if (hash(protectedFields(tournament)) !== hash(protectedFields(after))) fail('campo protegido mudou');
  const oldCfg = normalizeEffective(tournament, _window._buildPhase0Cfg(tournament));
  const newCfg = normalizeEffective(after, _window._buildPhase0Cfg(after));
  if (!isDeepStrictEqual(oldCfg, newCfg)) fail('configuração efetiva do sorteio mudou');
  return { fields: cleaned, mask: Object.keys(cleaned).sort(), after, translation };
}
function buildPatchRequest(id, patch, updateTime) {
  if (!id || !updateTime || !patch || !patch.fields) fail('patch/CAS inválido');
  if (EXCLUDED_IDS.has(id)) fail('torneio canônico protegido');
  const keys = Object.keys(patch.fields).sort();
  if (!isDeepStrictEqual(keys, [...patch.mask].sort()) || keys.some((key) => !MUTABLE_SET.has(key)) || !keys.includes('fmt2') || !keys.includes('phases')) fail('máscara fora da allowlist');
  const query = new URLSearchParams();
  keys.forEach((key) => query.append('updateMask.fieldPaths', key));
  query.append('currentDocument.updateTime', updateTime);
  const encoded = Object.fromEntries(keys.map((key) => [key, toFirestorePreservingTypes(patch.fields[key])]));
  for (const key of keys) {
    if (!isDeepStrictEqual(stable(stableRestValue(encoded[key])), stable(patch.fields[key]))) fail('encoding Firestore não preserva ' + key);
  }
  return {
    url: BASE + '/' + encodeURIComponent(id) + '?' + query.toString(),
    body: { fields: encoded }
  };
}
function assertBackupMatchesPreview(backup, preview) {
  if (!backup || backup.project !== PROJECT || backup.tournamentId !== preview.id) fail('backup de outro torneio/projeto');
  if (!sameTimestamp(backup.tournament.updateTime, preview.updateTime)) fail('backup difere do preview em updateTime');
  if (hash(backup.tournament.data) !== preview.fingerprint) fail('backup difere do preview em conteúdo');
}
function assertPostcheck(before, after, expected, id) {
  if (EXCLUDED_IDS.has(id)) fail('torneio canônico protegido');
  if (hash(protectedFields(before)) !== hash(protectedFields(after))) fail('pós-check: campo protegido mudou');
  for (const [key, value] of Object.entries(expected.fields)) {
    if (!isDeepStrictEqual(stable(after[key]), stable(value))) fail('pós-check: campo traduzido divergiu: ' + key);
  }
}

module.exports = {
  PROJECT, BASE, EXCLUDED_IDS, MUTABLE_TOP, fail, canonical, hash, timestampParts,
  sameTimestamp, stableRestValue, decodeDocument, toFirestorePreservingTypes, protectedFields, buildPatch,
  buildPatchRequest, assertBackupMatchesPreview, assertPostcheck
};
