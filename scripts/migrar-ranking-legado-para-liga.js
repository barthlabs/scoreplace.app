/* ETAPA 8 — migra configurações persistidas de `ranking*` para `liga*`.
 *
 * Segurança operacional:
 * - dry-run é o padrão e só revela ID/campos, nunca PII;
 * - `--apply` exige um retrato existente de `backup-torneios.js`;
 * - só preenche campo atual ausente/nulo, sem apagar `ranking*`;
 * - divergência entre os dois contratos não é escolhida automaticamente;
 * - cada PATCH usa `currentDocument.updateTime`, então escrita concorrente aborta.
 *
 * Uso:
 *   node scripts/migrar-ranking-legado-para-liga.js
 *   node scripts/migrar-ranking-legado-para-liga.js --apply --backup-confirmed /caminho/retrato.json
 */
const fs = require('fs');
const { execSync } = require('child_process');
const { planoDeMigracao } = require('./migrar-ranking-legado-para-liga-core');

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const APPLY = process.argv.includes('--apply');
const backupIndex = process.argv.indexOf('--backup-confirmed');
const BACKUP = backupIndex >= 0 ? process.argv[backupIndex + 1] : null;
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
function toF(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  throw new Error('tipo de configuração não suportado: ' + typeof v);
}
function obj(d) { return Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, fromF(v)])); }

async function listar(tk) {
  let pagina = null; const out = [];
  do {
    const url = BASE + '/tournaments?pageSize=300' + (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tk } });
    if (!r.ok) throw new Error('listagem falhou: ' + r.status + ' ' + (await r.text()).slice(0, 180));
    const j = await r.json();
    (j.documents || []).forEach((d) => out.push(d));
    pagina = j.nextPageToken || null;
  } while (pagina);
  return out;
}

(async () => {
  if (APPLY && (!BACKUP || !fs.existsSync(BACKUP))) {
    throw new Error('--apply exige --backup-confirmed <retrato existente de backup-torneios.js>');
  }
  const tk = token();
  const docs = await listar(tk);
  let comLegado = 0, preenchimentos = 0, conflitos = 0, gravados = 0;
  console.log('▶ etapa 8: ranking* → liga* ' + (APPLY ? '(APLICAR)' : '(DRY-RUN — nenhuma escrita)'));

  for (const d of docs) {
    const id = d.name.split('/').pop();
    const plano = planoDeMigracao(obj(d));
    if (!plano.legado.length) continue;
    comLegado++;
    const campos = Object.keys(plano.preencher);
    conflitos += plano.conflitos.length;
    preenchimentos += campos.length;
    console.log('  ' + id + ': legado=[' + plano.legado.join(', ') + ']' +
      (campos.length ? ' → preencher=[' + campos.join(', ') + ']' : '') +
      (plano.conflitos.length ? ' ⚠ conflitos=[' + plano.conflitos.map((x) => x.antigo + '→' + x.atual).join(', ') + ']' : ''));
    if (!APPLY || !campos.length || plano.conflitos.length) continue;

    const mask = campos.map((campo) => 'updateMask.fieldPaths=' + encodeURIComponent(campo)).join('&');
    const url = BASE + '/tournaments/' + encodeURIComponent(id) + '?' + mask +
      '&currentDocument.updateTime=' + encodeURIComponent(d.updateTime);
    const fields = Object.fromEntries(campos.map((campo) => [campo, toF(plano.preencher[campo])]));
    const r = await fetch(url, {
      method: 'PATCH', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    if (!r.ok) throw new Error(id + ': PATCH falhou ' + r.status + ' ' + (await r.text()).slice(0, 180));
    gravados++;
  }
  console.log('\n  torneios com ranking*: ' + comLegado);
  console.log('  campos que ' + (APPLY ? 'foram preenchidos' : 'seriam preenchidos') + ': ' + preenchimentos);
  console.log('  conflitos (não alterados): ' + conflitos);
  if (APPLY) console.log('  documentos gravados: ' + gravados + '\n✓ `ranking*` foi preservado; rode o censo antes de qualquer retirada.');
  else console.log('\n✓ dry-run concluído. Para aplicar, faça backup e use --apply --backup-confirmed <arquivo>.');
})().catch((e) => { console.error('⛔ migração interrompida:', e.message); process.exit(1); });
