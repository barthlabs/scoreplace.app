/* CENSO L9 — formatos legados ainda presentes em produção.
 *
 * ⛔ NÃO ESCREVE NADA. Só faz GET na coleção tournaments e imprime a medição.
 * Uso: node scripts/censo-formatos-legados.js [--json]
 */
const { execSync } = require('child_process');
const { resumir } = require('./censo-formatos-legados-core');
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents/tournaments';
const JSON_OUTPUT = process.argv.includes('--json');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

function fromF(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromF);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromF(x)]));
  return null;
}
function doc2obj(d) { return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromF(v)])); }

async function listar(tk) {
  let pageToken = null;
  const out = [];
  do {
    const qs = '?pageSize=300' + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const r = await fetch(BASE + qs, { headers: { Authorization: 'Bearer ' + tk } });
    if (!r.ok) throw new Error('Firestore respondeu ' + r.status);
    const j = await r.json();
    (j.documents || []).forEach((d) => out.push(doc2obj(d)));
    pageToken = j.nextPageToken || null;
  } while (pageToken);
  return out;
}

(async () => {
  const dados = resumir(await listar(token()));
  if (JSON_OUTPUT) console.log(JSON.stringify(dados));
  else {
    console.log('▶ censo L9 de formatos (SOMENTE LEITURA)');
    Object.entries(dados).forEach(([k, v]) => console.log('  ' + k + ':', v));
    console.log('\n✅ use estes números antes de remover um fallback; o censo não altera produção');
  }
})().catch((e) => { console.error('⛔ censo interrompido:', e.message); process.exit(1); });
