/* O ÍNDICE COBRE TODO TORNEIO? — a rede de proteção de "meus torneios".
 *
 * Desde a 2.0.95 a lista "meus torneios" lê `tournaments_summary` (518 KB -> 25 KB no
 * organizador da Confra). O ganho é grande e o risco tem NOME: se um torneio não tiver
 * resumo, ele SOME DA LISTA DA PESSOA — e sumir é pior que pesar.
 *
 * O conferidor de conteúdo (scripts/conferir-banco-novo.js) prova que o que está espelhado
 * diz a mesma coisa. Este aqui prova a outra metade: que não FALTA ninguém, e que o
 * `memberUids` — o campo pelo qual a lista consulta — é o mesmo dos dois lados.
 * Torneios em modo de teste são privados e ficam fora do índice público.
 *
 * ⛔ NÃO ESCREVE NADA.
 *
 * Uso:  node scripts/conferir-indice-completo.js
 */
const { accessTokenForServiceAccountSync } = require('./firebase-service-account-token');
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => accessTokenForServiceAccountSync();

async function todos(colecao, tk) {
  const out = new Map();
  let pageToken = '';
  do {
    const campos = colecao === 'tournaments'
      ? ['memberUids', 'adminUids', 'creatorUid', 'organizerOnly', 'membersOnly', 'testModeEnabled']
      : ['memberUids', 'requiresFullRead'];
    const mask = campos.map((campo) => '&mask.fieldPaths=' + encodeURIComponent(campo)).join('');
    const url = BASE + '/' + colecao + '?pageSize=300' + mask +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + tk } });
    const j = await r.json();
    if (j.error) { console.error(colecao + ': ' + j.error.message); process.exit(2); }
    (j.documents || []).forEach((d) => {
      const id = d.name.split('/').pop();
      const f = d.fields || {};
      const arr = (name) => (((f[name] || {}).arrayValue || {}).values || [])
        .map((v) => v.stringValue).filter(Boolean);
      const scalar = (name) => {
        const value = f[name] || {};
        if (value.booleanValue != null) return value.booleanValue;
        if (value.stringValue != null) return value.stringValue;
        return null;
      };
      out.set(id, { memberUids: arr('memberUids'), adminUids: arr('adminUids'),
        creatorUid: scalar('creatorUid') || '', organizerOnly: scalar('organizerOnly') === true,
        membersOnly: scalar('membersOnly') === true, testModeEnabled: scalar('testModeEnabled') === true,
        requiresFullRead: scalar('requiresFullRead') === true });
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
  const elegiveis = [...velho.keys()].filter((id) => !velho.get(id).testModeEnabled);
  const excluidos = velho.size - elegiveis.length;
  console.log('  elegíveis p/ resumo ...... ' + elegiveis.length);
  console.log('  excluídos (modo teste) ... ' + excluidos);
  console.log('  resumos existentes ....... ' + novo.size);

  const faltando = elegiveis.filter((id) => !novo.has(id));
  const sobrando = [...novo.keys()].filter((id) => !velho.has(id) || velho.get(id).testModeEnabled);
  const normalizar = (values) => [...new Set(values.filter(Boolean).map(String))].sort().join(',');
  const divergem = elegiveis.filter((id) => {
    if (!novo.has(id)) return false;
    const root = velho.get(id), expected = root.organizerOnly
      ? root.adminUids.concat([root.creatorUid])
      : root.membersOnly
        ? root.memberUids.concat(root.adminUids, [root.creatorUid])
        : root.memberUids;
    return normalizar(expected) !== normalizar(novo.get(id).memberUids);
  });
  const fallback = elegiveis.filter((id) => novo.has(id) && novo.get(id).requiresFullRead);

  console.log('  ✗ SEM resumo (sumiriam da lista) ... ' + faltando.length);
  faltando.slice(0, 10).forEach((id) => console.log('       ' + id));
  console.log('  ⚠ resumo órfão (torneio apagado) ... ' + sobrando.length);
  sobrando.slice(0, 10).forEach((id) => console.log('       ' + id));
  console.log('  ✗ memberUids DIFERENTE ............. ' + divergem.length);
  divergem.slice(0, 10).forEach((id) => console.log('       ' + id +
    '\n         esperado: ' + normalizar(velho.get(id).memberUids).slice(0, 100) +
    '\n         resumo : ' + normalizar(novo.get(id).memberUids).slice(0, 100)));
  console.log('  ⚠ resumo exige leitura completa .... ' + fallback.length);
  fallback.slice(0, 10).forEach((id) => console.log('       ' + id));

  console.log('');
  const ok = faltando.length === 0 && divergem.length === 0 && fallback.length === 0;
  console.log(ok ? '✅ todos os torneios elegíveis têm resumo e membros compatíveis'
                 : '⛔ cobertura do resumo incompleta ou marcada para leitura canônica');
  process.exit(ok ? 0 : 1);
})();
