/* O ÍNDICE COBRE TODO TORNEIO? — a rede de proteção de "meus torneios".
 *
 * Desde a 2.0.95 a lista "meus torneios" lê `tournaments_summary` (518 KB -> 25 KB no
 * organizador da Confra). O ganho é grande e o risco tem NOME: se um torneio não tiver
 * resumo, ele SOME DA LISTA DA PESSOA — e sumir é pior que pesar.
 *
 * O conferidor de conteúdo (scripts/conferir-banco-novo.js) prova que o que está espelhado
 * diz a mesma coisa. Este aqui prova a outra metade: que não FALTA ninguém, e que o
 * `memberUids` — o campo pelo qual a lista consulta — é o mesmo dos dois lados.
 *
 * ⛔ NÃO ESCREVE NADA.
 *
 * Uso:  node scripts/conferir-indice-completo.js
 */
const { execSync } = require('child_process');
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();

async function todos(colecao, tk) {
  const out = new Map();
  let pageToken = '';
  do {
    const url = BASE + '/' + colecao + '?pageSize=300&mask.fieldPaths=memberUids' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tk } });
    const j = await r.json();
    if (j.error) { console.error(colecao + ': ' + j.error.message); process.exit(2); }
    (j.documents || []).forEach((d) => {
      const id = d.name.split('/').pop();
      const uids = (((d.fields || {}).memberUids || {}).arrayValue || {}).values || [];
      out.set(id, uids.map((v) => v.stringValue).filter(Boolean).sort().join(','));
    });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

(async () => {
  const tk = token();
  const velho = await todos('tournaments', tk);
  const novo = await todos('tournaments_summary', tk);
  console.log('▶ o índice cobre todo torneio?  (NÃO escreve nada)');
  console.log('');
  console.log('  torneios no banco ....... ' + velho.size);
  console.log('  com resumo .............. ' + novo.size);

  const faltando = [...velho.keys()].filter((id) => !novo.has(id));
  const sobrando = [...novo.keys()].filter((id) => !velho.has(id));
  const divergem = [...velho.keys()].filter((id) => novo.has(id) && novo.get(id) !== velho.get(id));

  console.log('  ✗ SEM resumo (sumiriam da lista) ... ' + faltando.length);
  faltando.slice(0, 10).forEach((id) => console.log('       ' + id));
  console.log('  ⚠ resumo órfão (torneio apagado) ... ' + sobrando.length);
  sobrando.slice(0, 10).forEach((id) => console.log('       ' + id));
  console.log('  ✗ memberUids DIFERENTE ............. ' + divergem.length);
  divergem.slice(0, 10).forEach((id) => console.log('       ' + id +
    '\n         velho: ' + (velho.get(id) || '(vazio)').slice(0, 100) +
    '\n         novo : ' + (novo.get(id) || '(vazio)').slice(0, 100)));

  console.log('');
  const ok = faltando.length === 0 && divergem.length === 0;
  console.log(ok ? '✅ o índice cobre todos, e a lista de membros bate — a lista pode ler o resumo'
                 : '⛔ NÃO troque a leitura: alguém sumiria da própria lista');
  process.exit(ok ? 0 : 1);
})();
