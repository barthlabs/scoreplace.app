/* SEMEIA `playerUids` nos jogos JÁ espelhados (Fase 2b).
 *
 * É esse campo que sustenta a regra "só quem joga ESTE jogo escreve, e não pode se
 * auto-incluir" (firestore.rules). Os jogos espelhados ANTES da 2.0.98 não o têm — e sem
 * ele a regra nega escrita a todo mundo (seguro, mas não destrava nada).
 *
 * ⛔ SÓ ACRESCENTA O CAMPO. Não toca no conteúdo do jogo (`jogo`, `_loc`, `_chave`).
 * ⛔ Roda em SECO por padrão.
 * ⚠️ ORDEM: o gatilho `tournamentMirror` já tem que estar publicado com a 2.0.98, senão a
 *    próxima escrita no torneio re-espelha SEM o campo e apaga o que foi semeado aqui.
 *
 * ⚠️ CARREGA COMO O SERVIDOR CARREGA: `draw-core.js` monta `window = globalThis` e traz o
 *    vendor (bracket-logic → `_matchPlayerUids`). Requerer o tradutor direto dá um `window`
 *    DIFERENTE e a derivação some — a primeira medição deu 0 de 115 por causa disso.
 *
 * Uso:  node scripts/semear-playeruids.js              (seco)
 *       node scripts/semear-playeruids.js --escrever
 */
const path = require('path');
const { execSync } = require('child_process');

require(path.join(__dirname, '..', 'functions-autodraw', 'draw-core.js'));
const S = require(path.join(__dirname, '..', 'functions-autodraw', 'vendor', 'tournament-split-core.js'));
if (typeof (global.window || {})._matchPlayerUids !== 'function') {
  console.error('⛔ `_matchPlayerUids` não carregou — sem ela este script semearia NADA em silêncio.');
  process.exit(2);
}

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const ESCREVE = process.argv.includes('--escrever');
const SO_ESTE = process.argv.slice(2).find((a) => !a.startsWith('--')) || null;

/* Firestore REST → objeto JS. */
function conv(v) {
  if (v == null) return null;
  const k = Object.keys(v)[0];
  if (k === 'mapValue') {
    const o = {};
    Object.entries(v.mapValue.fields || {}).forEach(([a, b]) => { o[a] = conv(b); });
    return o;
  }
  if (k === 'arrayValue') return (v.arrayValue.values || []).map(conv);
  if (k === 'integerValue') return Number(v.integerValue);
  if (k === 'doubleValue') return Number(v.doubleValue);
  if (k === 'booleanValue') return v.booleanValue;
  if (k === 'nullValue') return null;
  return v[k];
}

(async () => {
  const tk = token();
  let pageToken = '', ids = [];
  do {
    const r = await fetch(BASE + '/tournaments?pageSize=300&mask.fieldPaths=name' +
      (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''), { headers: { Authorization: 'Bearer ' + tk } });
    const j = await r.json();
    if (j.error) { console.error(j.error.message); process.exit(2); }
    (j.documents || []).forEach((d) => ids.push(d.name.split('/').pop()));
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  if (SO_ESTE) ids = ids.filter((x) => x === SO_ESTE);

  let totJog = 0, totFalta = 0, totJa = 0, totGrav = 0, totErro = 0;
  for (const id of ids) {
    const d = await (await fetch(BASE + '/tournaments/' + id, { headers: { Authorization: 'Bearer ' + tk } })).json();
    if (d.error) continue;
    const t = {};
    Object.entries(d.fields || {}).forEach(([a, b]) => { t[a] = conv(b); });
    t.id = t.id || id;

    const partes = S.dividir(t);
    if (!partes) continue;
    const porChave = {};
    partes.matches.forEach((m) => { if (m && m._chave) porChave[m._chave] = m; });

    // o que o espelho tem hoje
    let pt = '', espelho = [];
    do {
      const r = await fetch(BASE + '/tournaments/' + id + '/matches?pageSize=300&mask.fieldPaths=playerUids&mask.fieldPaths=_chave' +
        (pt ? '&pageToken=' + encodeURIComponent(pt) : ''), { headers: { Authorization: 'Bearer ' + tk } });
      const j = await r.json();
      (j.documents || []).forEach((x) => espelho.push(x));
      pt = j.nextPageToken || '';
    } while (pt);

    let falta = 0, ja = 0;
    const aGravar = [];
    espelho.forEach((doc) => {
      const nome = doc.name.split('/').pop();
      const f = doc.fields || {};
      const temUid = (((f.playerUids || {}).arrayValue || {}).values || []).length > 0;
      const chave = ((f._chave || {}).stringValue) || '';
      const calc = porChave[chave];
      const uids = calc && Array.isArray(calc.playerUids) ? calc.playerUids : null;
      if (temUid) { ja++; return; }
      if (!uids) return;                       // folga/BYE: não tem quem jogue
      falta++;
      aGravar.push({ nome, uids });
    });
    totJog += espelho.length; totFalta += falta; totJa += ja;
    if (falta) console.log('  ' + id + ': ' + espelho.length + ' jogos · já com uid ' + ja + ' · a semear ' + falta);

    if (ESCREVE) {
      for (const x of aGravar) {
        const r = await fetch(BASE + '/tournaments/' + id + '/matches/' + encodeURIComponent(x.nome) +
          '?updateMask.fieldPaths=playerUids', {
          method: 'PATCH',
          headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { playerUids: { arrayValue: { values: x.uids.map((u) => ({ stringValue: String(u) })) } } } })
        });
        if (r.ok) totGrav++; else { totErro++; if (totErro < 4) console.error('   ✗ ' + x.nome + ': ' + r.status); }
      }
    }
  }

  console.log('');
  console.log('  torneios ................ ' + ids.length);
  console.log('  jogos no espelho ........ ' + totJog);
  console.log('  já tinham playerUids .... ' + totJa);
  console.log('  a semear ................ ' + totFalta);
  if (ESCREVE) console.log('  gravados ................ ' + totGrav + ' · erros: ' + totErro);
  else console.log('\n(seco — nada foi escrito. use --escrever)');
})();
