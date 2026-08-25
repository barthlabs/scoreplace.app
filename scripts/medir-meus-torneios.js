/* QUANTO PESA "MEUS TORNEIOS" HOJE — e quanto pesaria lendo o RESUMO.
 *
 * `loadMyTournaments` lê o documento COMPLETO de todo torneio em que a pessoa está
 * (`memberUids array-contains uid`). Para quem joga a Confra, isso arrasta os 238 KB dela
 * numa tela que só desenha CARTÕES — e o cartão não usa jogos, inscritos nem histórico.
 * O índice (`tournaments_summary`) já carrega `memberUids`, então a mesma consulta serve.
 *
 * ⛔ NÃO ESCREVE NADA. Só lê e compara tamanhos.
 *
 * Uso:  node scripts/medir-meus-torneios.js <uid>
 */
const path = require('path');
const { execSync } = require('child_process');
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const UID = process.argv[2];
if (!UID) { console.error('uso: node scripts/medir-meus-torneios.js <uid>'); process.exit(2); }

async function lista(colecao, tk) {
  const r = await fetch(BASE + ':runQuery', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: colecao }],
      where: { fieldFilter: { field: { fieldPath: 'memberUids' }, op: 'ARRAY_CONTAINS',
               value: { stringValue: UID } } }
    } })
  });
  const j = await r.json();
  if (!Array.isArray(j)) { console.error(colecao + ': ' + JSON.stringify(j).slice(0, 300)); return []; }
  return j.filter((x) => x.document).map((x) => ({
    id: x.document.name.split('/').pop(),
    bytes: JSON.stringify(x.document.fields || {}).length
  }));
}

(async () => {
  const tk = token();
  const completos = await lista('tournaments', tk);
  const resumos = await lista('tournaments_summary', tk);
  const kb = (n) => (n / 1024).toFixed(0).padStart(6) + ' KB';
  const soma = (a) => a.reduce((s, x) => s + x.bytes, 0);
  const porId = {}; resumos.forEach((r) => { porId[r.id] = r.bytes; });

  console.log('torneios em que este uid está: ' + completos.length);
  console.log('  documento COMPLETO (hoje) .. ' + kb(soma(completos)));
  console.log('  RESUMO (proposta) .......... ' + kb(soma(resumos)) + '   (' + resumos.length + ' com espelho)');
  const semEspelho = completos.filter((c) => porId[c.id] === undefined);
  if (semEspelho.length) console.log('  ⚠️ SEM resumo ainda ......... ' + semEspelho.length + ' — estes cairiam no caminho antigo');
  console.log('');
  console.log('  os 5 mais pesados hoje:');
  completos.slice().sort((a, b) => b.bytes - a.bytes).slice(0, 5).forEach((c) =>
    console.log('    ' + kb(c.bytes) + '  ->  ' + (porId[c.id] === undefined ? '(sem resumo)' : kb(porId[c.id])) + '   ' + c.id));
})();
