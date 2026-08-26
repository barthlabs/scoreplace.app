/* CONFERIDOR — o banco novo diz a mesma coisa que o velho?
 *
 * Lê as subcoleções (`matches`, `participants`, `history`), REMONTA o torneio e
 * compara com o documento original, campo por campo. É esta prova, repetida por dias
 * com o torneio ao vivo, que autoriza trocar a leitura — e só ela.
 *
 * Ordem do dono: "desliga o banco velho, que é apagado depois de ter CERTEZA de que
 * tudo funcionou no banco novo (banco velho fica de backup até concluir a Confra)".
 * Este script é o "ter certeza".
 *
 * ⛔ NÃO ESCREVE NADA. Só lê e compara.
 *
 * Uso:  node scripts/conferir-banco-novo.js            (todos)
 *       node scripts/conferir-banco-novo.js <id>       (um torneio)
 *       node scripts/conferir-banco-novo.js --detalhe  (mostra os campos que divergem)
 */
const path = require('path');
const { execSync } = require('child_process');
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const DETALHE = process.argv.includes('--detalhe');
const SO_ESTE = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;

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
const doc2obj = (d) => { const o = {}; Object.entries((d && d.fields) || {}).forEach(([k, v]) => { o[k] = fromF(v); }); return o; };

async function lista(url, tk) {
  let pag = null, out = [];
  do {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'pageSize=300' + (pag ? '&pageToken=' + pag : ''),
      { headers: { Authorization: 'Bearer ' + tk } });
    if (!r.ok) { if (r.status === 404) return out; throw new Error(r.status + ' ' + url); }
    const j = await r.json();
    (j.documents || []).forEach((d) => out.push({ id: d.name.split('/').pop(), dados: doc2obj(d) }));
    pag = j.nextPageToken || null;
  } while (pag);
  return out;
}

(async () => {
  const tk = token();
  console.log('▶ conferindo o banco novo contra o velho  (NÃO escreve nada)\n');

  const torneios = SO_ESTE
    ? [{ id: SO_ESTE, dados: doc2obj(await (await fetch(`${BASE}/tournaments/${SO_ESTE}`, { headers: { Authorization: 'Bearer ' + tk } })).json()) }]
    : await lista(`${BASE}/tournaments`, tk);

  let iguais = 0, divergentes = 0, semEspelho = 0;
  const problemas = [];

  for (const t of torneios) {
    const velho = t.dados;
    const [ms, ps, hs] = await Promise.all([
      lista(`${BASE}/tournaments/${t.id}/matches`, tk),
      lista(`${BASE}/tournaments/${t.id}/participants`, tk),
      lista(`${BASE}/tournaments/${t.id}/history`, tk)
    ]);

    const esperado = S.dividir(velho);
    const temAlgoPraEspelhar = esperado.matches.length + esperado.participants.length + esperado.history.length;
    if (!ms.length && !ps.length && !hs.length && temAlgoPraEspelhar > 0) {
      semEspelho++;
      problemas.push({ id: t.id, nome: velho.name, o: 'ESPELHO AUSENTE (' + temAlgoPraEspelhar + ' itens esperados)' });
      continue;
    }

    // remonta a partir do que está NO BANCO NOVO
    const novo = S.remontar({
      config: velho,                       // a configuração é o próprio documento
      matches: ms.map((d) => d.dados),
      participants: ps.map((d) => d.dados),
      history: hs.map((d) => d.dados)
    });

    // ⚠️ compara com o ORIGINAL: se remontar não devolve o original, a migração não
    // pode avançar — nem que seja "só a ordem".
    // ⛔ comparação CANÔNICA: o Firestore devolve as chaves de objeto ORDENADAS, e
    // exigir a ordem original faria 30 dos 39 torneios "divergirem" por nada. Ordem de
    // ARRAY continua valendo — jogo trocado de lugar é regressão visível.
    if (S.iguais(velho, novo)) { iguais++; continue; }
    divergentes++;
    const chaves = new Set([...Object.keys(velho), ...Object.keys(novo || {})]);
    const dif = [...chaves].filter((k) => !S.iguais(velho[k], (novo || {})[k]));
    problemas.push({ id: t.id, nome: velho.name, o: 'DIVERGE em: ' + (dif.join(', ') || 'ordem/estrutura') });
    if (DETALHE) {
      dif.slice(0, 2).forEach((k) => {
        console.log('   ─ ' + (velho.name || t.id) + ' · campo `' + k + '`');
        console.log('       velho: ' + JSON.stringify(velho[k]).slice(0, 200));
        console.log('       novo : ' + JSON.stringify((novo || {})[k]).slice(0, 200));
      });
    }
  }

  console.log('torneios conferidos:', torneios.length);
  console.log('  ✓ idênticos          :', iguais);
  console.log('  ✗ divergentes        :', divergentes);
  console.log('  ⚠ sem espelho ainda  :', semEspelho);
  if (problemas.length) {
    console.log('\nO QUE PRECISA DE OLHO:');
    problemas.slice(0, 12).forEach((p) => console.log('  ·', (p.nome || p.id).slice(0, 34).padEnd(34), p.o));
    if (problemas.length > 12) console.log('  … e mais', problemas.length - 12);
  }
  console.log('\n' + (divergentes === 0 && semEspelho === 0
    ? '✅ o banco novo diz EXATAMENTE a mesma coisa que o velho'
    : '⛔ NÃO trocar a leitura enquanto isto não estiver zerado'));
  process.exit(divergentes ? 1 : 0);
})();
