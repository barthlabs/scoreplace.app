/* NORMALIZA a modalidade gravada: tira o EMOJI do valor.
 *
 * CAUSA (achada em 25/ago/2026): os botões de modalidade padronizavam a string ERRADA.
 * `<option>🎾 Beach Tennis</option>` não tinha atributo `value`, então o valor ERA o texto,
 * emoji incluído — e era isso que ia pro banco. Os dois caminhos de criação (torneio
 * completo e criação rápida) faziam igual.
 * MEDIDO na base real: "Beach Tennis" (27) e "🎾 Beach Tennis" (7) convivendo como se
 * fossem modalidades DIFERENTES. Qualquer filtro por modalidade nasce mentindo.
 *
 * O código já foi corrigido (o emoji voltou a ser rótulo). Este script conserta o que
 * ficou gravado — sem ele, os 7 seguem invisíveis a qualquer filtro.
 *
 * ⛔ ESCREVE em torneio de outras pessoas. Roda em SECO por padrão.
 * ⛔ O valor certo é o de window.SPORT_LIST (js/views/sport-rules.js) — não inventa nome.
 * ⚠️ O resumo (tournaments_summary) NÃO é tocado aqui: ele é derivado, e o gatilho
 *    `tournamentMirror` o reescreve sozinho quando o documento muda.
 *
 * Uso:  node scripts/normalizar-modalidade.js              (seco — só mostra)
 *       node scripts/normalizar-modalidade.js --escrever
 */
const path = require('path');
const { execSync } = require('child_process');
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const ESCREVE = process.argv.includes('--escrever');

// a fonte única das modalidades, lida do próprio app
global.window = global.window || {};
require(path.join(__dirname, '..', 'js', 'views', 'sport-rules.js'));
const CANONICAS = global.window.SPORT_LIST || [];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const chave = (s) => semAcento(s).replace(/[^a-zA-Z ]/g, '').trim().toLowerCase();
const porChave = {};
CANONICAS.forEach((c) => { porChave[chave(c)] = c; });

(async () => {
  const tk = token();
  let pageToken = '', docs = [];
  do {
    const r = await fetch(BASE + '/tournaments?pageSize=300&mask.fieldPaths=sport&mask.fieldPaths=name' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), { headers: { Authorization: 'Bearer ' + tk } });
    const j = await r.json();
    if (j.error) { console.error(j.error.message); process.exit(2); }
    (j.documents || []).forEach((d) => docs.push(d));
    pageToken = j.nextPageToken || '';
  } while (pageToken);

  console.log('modalidades canônicas: ' + CANONICAS.join(' · '));
  console.log('torneios lidos: ' + docs.length);
  console.log('');

  const trocar = [];
  const semCanon = [];
  docs.forEach((d) => {
    const f = d.fields || {};
    const atual = (f.sport || {}).stringValue;
    if (!atual) return;
    if (CANONICAS.indexOf(atual) !== -1) return;          // já está certo
    const alvo = porChave[chave(atual)];
    const id = d.name.split('/').pop();
    const nome = ((f.name || {}).stringValue || '').slice(0, 34);
    if (!alvo) { semCanon.push({ id, atual, nome }); return; }
    trocar.push({ id, atual, alvo, nome });
  });

  trocar.forEach((x) => console.log('  ' + JSON.stringify(x.atual) + '  ->  ' + JSON.stringify(x.alvo) + '   ' + x.nome));
  console.log('');
  console.log('  a trocar: ' + trocar.length);
  if (semCanon.length) {
    console.log('  ⚠️ SEM canônica correspondente (NÃO serão tocados — inventar nome aqui é pior que deixar):');
    semCanon.forEach((x) => console.log('       ' + JSON.stringify(x.atual) + '   ' + x.nome));
  }
  if (!ESCREVE) { console.log('\n(seco — nada foi escrito. use --escrever)'); return; }
  if (!trocar.length) { console.log('\nnada a fazer'); return; }

  let ok = 0, erro = 0;
  for (const x of trocar) {
    const r = await fetch(BASE + '/tournaments/' + x.id + '?updateMask.fieldPaths=sport', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { sport: { stringValue: x.alvo } } })
    });
    if (r.ok) { ok++; } else { erro++; console.error('  ✗ ' + x.id + ': ' + r.status + ' ' + (await r.text()).slice(0, 120)); }
  }
  console.log('');
  console.log('  gravados: ' + ok + ' · erros: ' + erro);
  console.log('  ⚠️ o resumo se atualiza sozinho pelo gatilho — confira com scripts/conferir-indice-completo.js');
})();
