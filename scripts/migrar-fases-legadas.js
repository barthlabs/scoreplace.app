/* Migra somente a representação de fases dos torneios legados.
 *
 * Não recria chave, rodadas, partidas, inscrições, duplas ou placares: a projeção
 * lossless acrescenta `phases` a partir dos campos que o documento já possui.
 * O script é idempotente e começa em dry-run. Para gravar, use --apply.
 *
 * Uso:
 *   node scripts/migrar-fases-legadas.js
 *   node scripts/migrar-fases-legadas.js --apply
 *   node scripts/migrar-fases-legadas.js --id <torneioId> [--apply]
 */
'use strict';

const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { _window } = require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const { planLegacyPhaseProjection } = require(path.join(ROOT, 'functions', 'legacy-phase-projection-core.js'));

const project = _window && _window.FORMAT2 && _window.FORMAT2.projectLegacyPhases;
if (typeof project !== 'function') {
  console.error('✗ projetor FORMAT2 indisponível; abortando sem escrever');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const requestedIdAt = process.argv.indexOf('--id');
const ONLY_ID = requestedIdAt >= 0 ? process.argv[requestedIdAt + 1] : null;
if (requestedIdAt >= 0 && !ONLY_ID) {
  console.error('✗ --id exige o identificador do torneio');
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

async function listTournaments(accessToken) {
  if (ONLY_ID) {
    const response = await fetch(`${BASE}/tournaments/${encodeURIComponent(ONLY_ID)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`falhou ao ler ${ONLY_ID}: ${response.status} ${await response.text()}`);
    return [response];
  }
  const documents = [];
  let pageToken = null;
  do {
    const url = `${BASE}/tournaments?pageSize=200` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`falhou ao listar torneios: ${response.status} ${await response.text()}`);
    const json = await response.json();
    documents.push(...(json.documents || []).map((document) => ({ ok: true, json: async () => document })));
    pageToken = json.nextPageToken || null;
  } while (pageToken);
  return documents;
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
  console.log(`▶ migração de fases legadas${APPLY ? '' : ' (DRY-RUN — nenhuma escrita)'}`);
  const responses = await listTournaments(accessToken);
  let scanned = 0;
  let planned = 0;
  let written = 0;
  let unchanged = 0;
  const residualSwiss = { tournaments: 0, format: 0, classifyFormat: 0, currentStage: 0, swissRounds: 0 };

  for (const response of responses) {
    const document = await response.json();
    const id = document.name.split('/').pop();
    const tournament = documentToObject(document);
    scanned++;
    const markers = legacySwissMarkers(tournament);
    const hasResidual = Object.keys(markers).some((key) => markers[key]);
    if (hasResidual) {
      residualSwiss.tournaments++;
      Object.keys(markers).forEach((key) => { if (markers[key]) residualSwiss[key]++; });
    }
    const plan = planLegacyPhaseProjection(tournament, project);
    if (!plan.changed) { unchanged++; continue; }
    planned++;
    console.log(`  ${APPLY ? 'gravando' : 'simulando'} ${id}: ${plan.reason}`);
    if (!APPLY) continue;

    /* updateMask torna impossível substituir acidentalmente outros campos. */
    const url = `${BASE}/tournaments/${encodeURIComponent(id)}?updateMask.fieldPaths=phases`;
    const write = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { phases: toFirestore(plan.phases) } })
    });
    if (!write.ok) throw new Error(`falhou ao gravar ${id}: ${write.status} ${(await write.text()).slice(0, 240)}`);
    written++;
  }

  console.log(`✓ analisados: ${scanned} | ${APPLY ? 'gravados' : 'a gravar'}: ${APPLY ? written : planned} | já canônicos: ${unchanged}`);
  console.log('  marcadores suíços transitórios (somente censo): ' +
    `${residualSwiss.tournaments} torneio(s) · format=${residualSwiss.format} · ` +
    `classifyFormat=${residualSwiss.classifyFormat} · currentStage=${residualSwiss.currentStage} · swissRounds=${residualSwiss.swissRounds}`);
  if (!APPLY) console.log('  rode com --apply somente após revisar esta lista');
}

main().catch((error) => {
  console.error('✗ migração abortada:', error && error.message ? error.message : error);
  process.exit(1);
});
