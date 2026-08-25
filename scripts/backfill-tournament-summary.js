/* BACKFILL — cria o RESUMO (`tournaments_summary/{id}`) dos torneios que já existem.
 *
 * O gatilho `tournamentSummary` (functions/index.js) mantém o resumo a cada escrita —
 * mas torneio que ninguém tocar depois do deploy nunca geraria o seu. Este script faz
 * a primeira leva, uma vez.
 *
 * O resumo sai do MESMO código que a Cloud Function usa
 * (functions/tournament-summary-core.js) — nada de uma segunda versão da regra.
 *
 * Idempotente: regravar o mesmo resumo é inofensivo (o documento é gerado inteiro).
 * Dry-run por padrão; grava só com --apply.
 *
 * Uso: node scripts/backfill-tournament-summary.js            (dry-run)
 *      node scripts/backfill-tournament-summary.js --apply    (grava)
 */
const path = require('path');
const { execSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
// ⛔ os derivados saem das funções do APP (mesmo shim que a Cloud Function usa),
// nunca de uma cópia — medido: reimplementação divergia em 10 dos 28 torneios.
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const M = require(path.join(ROOT, 'functions-autodraw', 'tournament-summary-core.js'));
const _H = M.helpersDe(globalThis.window);
if (!_H.progress || !_H.competitors || !_H.waitlistPeople) {
  console.error('✗ shim sem os helpers do app — abortando (não grava número chutado)');
  process.exit(1);
}
const buildSummary = function (t, id) { return M.buildSummary(t, id, _H); };

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const APPLY = process.argv.includes('--apply');
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

function fromF(v) {
  if (v == null) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return parseInt(v.integerValue, 10);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromF);
  if ('mapValue' in v) { const o = {}; Object.entries(v.mapValue.fields || {}).forEach(([k, x]) => { o[k] = fromF(x); }); return o; }
  return null;
}
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toF) } };
  if (typeof v === 'object') { const f = {}; Object.entries(v).forEach(([k, x]) => { f[k] = toF(x); }); return { mapValue: { fields: f } }; }
  return { nullValue: null };
}
const docParaObj = (d) => {
  const o = {};
  Object.entries((d && d.fields) || {}).forEach(([k, v]) => { o[k] = fromF(v); });
  return o;
};

(async () => {
  const tk = token();
  console.log('▶ lendo torneios' + (APPLY ? '' : '  (DRY-RUN — nada será gravado)'));

  let pagina = null, torneios = [];
  do {
    const url = `${BASE}/tournaments?pageSize=200` + (pagina ? `&pageToken=${pagina}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
    if (!r.ok) { console.error('✗ falhou ao listar:', r.status, await r.text()); process.exit(1); }
    const j = await r.json();
    (j.documents || []).forEach((d) => {
      torneios.push({ id: d.name.split('/').pop(), doc: docParaObj(d) });
    });
    pagina = j.nextPageToken || null;
  } while (pagina);

  console.log('  torneios encontrados:', torneios.length);

  let gravados = 0, pulados = 0, somaComp = 0, somaRes = 0;
  for (const t of torneios) {
    const resumo = buildSummary(t.doc, t.id);
    if (!resumo) { pulados++; continue; }
    somaComp += JSON.stringify(t.doc).length;
    somaRes += JSON.stringify(resumo).length;
    if (!APPLY) { gravados++; continue; }
    const fields = {};
    Object.entries(resumo).forEach(([k, v]) => { fields[k] = toF(v); });
    const w = await fetch(`${BASE}/tournaments_summary/${t.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    if (!w.ok) { console.error('  ✗', t.id, w.status, (await w.text()).slice(0, 160)); continue; }
    gravados++;
    if (gravados % 25 === 0) console.log('  …', gravados);
  }

  console.log('');
  console.log(APPLY ? '✓ resumos gravados:' : '✓ resumos que SERIAM gravados:', gravados, '| pulados:', pulados);
  if (somaComp) {
    console.log('  peso: ' + Math.round(somaComp / 1024) + ' KB (completo) → ' +
      Math.round(somaRes / 1024) + ' KB (resumo) = ' +
      (100 - somaRes / somaComp * 100).toFixed(1) + '% menor');
  }
  if (!APPLY) console.log('\n(rode com --apply para gravar)');
})();
