/* Migra somente a representação de fases dos torneios legados.
 *
 * Não recria chave, rodadas, partidas, inscrições, duplas ou placares: a projeção
 * lossless acrescenta `phases` a partir dos campos que o documento já possui.
 * O script é idempotente e começa em dry-run. Para gravar, use --apply.
 *
 * Uso:
 *   node scripts/migrar-fases-legadas.js --id <torneioId>
 *   node scripts/migrar-fases-legadas.js --id <torneioId> --apply --fingerprint <recibo>
 */
'use strict';

const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { _window } = require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const { runOne } = require(path.join(ROOT, 'scripts', 'migrar-fases-legadas-core.js'));

const project = _window && _window.FORMAT2 && _window.FORMAT2.projectLegacyPhases;
if (typeof project !== 'function') {
  console.error('✗ projetor FORMAT2 indisponível; abortando sem escrever');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const requestedIdAt = process.argv.indexOf('--id');
const ONLY_ID = requestedIdAt >= 0 ? process.argv[requestedIdAt + 1] : null;
const fingerprintAt = process.argv.indexOf('--fingerprint');
const FINGERPRINT = fingerprintAt >= 0 ? process.argv[fingerprintAt + 1] : null;
if (requestedIdAt >= 0 && !ONLY_ID) {
  console.error('✗ --id exige o identificador do torneio');
  process.exit(1);
}
if (!ONLY_ID) {
  console.error('✗ esta migração é individual; informe --id <torneioId>');
  process.exit(1);
}
if (APPLY && !ONLY_ID) {
  console.error('✗ --apply exige --id; migração em lote é proibida');
  process.exit(1);
}
if (APPLY && !FINGERPRINT) {
  console.error('✗ --apply exige --fingerprint do dry-run revisado');
  process.exit(1);
}

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

function fromFirestore(value) {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(fromFirestore);
  if ('mapValue' in value) {
    const result = {};
    Object.entries(value.mapValue.fields || {}).forEach(([key, child]) => { result[key] = fromFirestore(child); });
    return result;
  }
  return null;
}

function toFirestore(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestore) } };
  if (typeof value === 'object') {
    const fields = {};
    Object.entries(value).forEach(([key, child]) => { fields[key] = toFirestore(child); });
    return { mapValue: { fields } };
  }
  return { nullValue: null };
}

function documentToObject(document) {
  const result = {};
  Object.entries((document && document.fields) || {}).forEach(([key, value]) => { result[key] = fromFirestore(value); });
  return result;
}

async function readTournament(accessToken, id) {
  const response = await fetch(`${BASE}/tournaments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`falhou ao ler ${id}: ${response.status} ${await response.text()}`);
  const document = await response.json();
  return { tournament: documentToObject(document), updateTime: document.updateTime || '' };
}

async function writePhases(accessToken, id, phases, updateTime) {
  if (!updateTime) throw new Error('documento sem updateTime; CAS indisponível');
  const query = new URLSearchParams();
  query.append('updateMask.fieldPaths', 'phases');
  query.append('currentDocument.updateTime', updateTime);
  const response = await fetch(`${BASE}/tournaments/${encodeURIComponent(id)}?${query.toString()}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { phases: toFirestore(phases) } })
  });
  if (!response.ok) throw new Error(`CAS recusou a escrita de ${id}: ${response.status} ${(await response.text()).slice(0, 240)}`);
}

// Marcadores de transição que um documento antigo pode carregar mesmo depois de
// `phases[]` já descrever completamente o torneio. Eles são SOMENTE medidos
// aqui: removê-los em lote é uma escrita de dados separada, a ser feita apenas
// depois de conferir que nenhuma tela/Function ainda depende daquele fato.
function legacySwissMarkers(tournament) {
  const t = tournament || {};
  return {
    format: String(t.format || '') === 'Suíço Clássico',
    classifyFormat: String(t.classifyFormat || '') === 'swiss',
    currentStage: String(t.currentStage || '') === 'swiss',
    swissRounds: t.swissRounds !== null && t.swissRounds !== undefined
  };
}

async function main() {
  const accessToken = token();
  console.log(`▶ migração individual de fases legadas${APPLY ? '' : ' (DRY-RUN — nenhuma escrita)'}`);
  const result = await runOne({
    tournamentId: ONLY_ID,
    apply: APPLY,
    fingerprint: FINGERPRINT,
    project,
    load: (id) => readTournament(accessToken, id),
    write: (id, phases, updateTime) => writePhases(accessToken, id, phases, updateTime),
  });
  const plan = result.plan;
  const markers = legacySwissMarkers((await readTournament(accessToken, ONLY_ID)).tournament);
  console.log(`✓ ${ONLY_ID}: ${result.outcome} · ${plan.reason}`);
  console.log(`  recibo: ${plan.fingerprint}`);
  console.log(`  campos protegidos: ${plan.protectedFingerprint}`);
  console.log('  marcadores suíços transitórios (somente censo): ' +
    `format=${markers.format} · classifyFormat=${markers.classifyFormat} · ` +
    `currentStage=${markers.currentStage} · swissRounds=${markers.swissRounds}`);
  if (!APPLY && plan.changed) console.log(`  para aplicar: --id ${ONLY_ID} --apply --fingerprint ${plan.fingerprint}`);
}

main().catch((error) => {
  console.error('✗ migração abortada:', error && error.message ? error.message : error);
  process.exit(1);
});
