/* REPARO — devolve o OBJETO DO TIME e os uids às vagas de repescagem que eu preenchi só com o nome.
 *
 * O QUE ACONTECEU (26/set/2026, minha responsabilidade): ao desmontar a repescagem da Ouro eu apaguei
 * `p1Uid`/`team1Uids` junto com o nome, e ao remontar gravei SÓ o nome — `team1Obj`/`team2Obj` e os
 * uids não voltaram. O slot ficou com uma string e mais nada.
 * ⇒ EFEITO EM PRODUÇÃO, relatado pelo dono: o botão de W.O. não funciona (ele precisa do uid para
 * saber quem faltou) e a tela de inscritos quebra.
 *
 * O CONSERTO: para cada vaga, achar a MESMA equipe num jogo onde ela aparece ÍNTEGRA (a rodada 1, que
 * ninguém tocou) e copiar de lá o objeto do time e os uids. Não inventa nada: copia o que já existe.
 *
 * ⛔ Só grava com `--gravar`. Recusa vaga que já tenha resultado.
 * Uso: node scripts/reparar-times-da-repescagem.js <torneio> <linha> [--gravar]
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const Leitura = require(path.join(__dirname, 'lib', 'leitura-resiliente.js'));
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ALVO = args[0] || 'Confra';
const LINHA = args[1] || 'Ouro';
const GRAVAR = process.argv.includes('--gravar');
const tk = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const ler = Leitura.criarLeitor({ timeoutMs: 30000, tentativas: 4, esperaBaseMs: 500 });

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
async function lista(url) {
  let p = null, out = [];
  do {
    const q = url + (url.includes('?') ? '&' : '?') + 'pageSize=300' + (p ? '&pageToken=' + encodeURIComponent(p) : '');
    const r = await ler(q, { Authorization: 'Bearer ' + tk }, 'lista');
    if (!r.ok) { if (r.status === 404) return out; throw new Error(r.status + ' ' + url); }
    const j = JSON.parse(r.texto || '{}');
    (j.documents || []).forEach((d) => out.push({ nome: d.name, id: d.name.split('/').pop(), dados: doc2obj(d) }));
    p = j.nextPageToken || null;
  } while (p);
  return out;
}
/* converte JS → valor do Firestore, recursivo (o objeto do time é um mapa aninhado) */
function vf(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(vf) } };
  if (typeof v === 'object') {
    const f = {};
    Object.entries(v).forEach(([k, x]) => { f[k] = vf(x); });
    return { mapValue: { fields: f } };
  }
  return { stringValue: String(v) };
}
async function patch(nomeDoc, campos) {
  const mask = Object.keys(campos).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent('jogo.' + k)).join('&');
  const dentro = {};
  Object.entries(campos).forEach(([k, v]) => { dentro[k] = vf(v); });
  const r = await fetch('https://firestore.googleapis.com/v1/' + nomeDoc + '?' + mask, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { jogo: { mapValue: { fields: dentro } } } }) });
  if (!r.ok) throw new Error('PATCH ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

(async () => {
  console.log('▶ reparar times da repescagem · "' + ALVO + '" · linha "' + LINHA + '"' +
    (GRAVAR ? '  ⚠️ GRAVANDO' : '  (ensaio)') + '\n');
  const todos = await lista(`${BASE}/tournaments`);
  const item = todos.find((x) => String((x.dados && x.dados.name) || '').toLowerCase().includes(String(ALVO).toLowerCase()));
  const docs = await lista(`${BASE}/tournaments/${item.id}/matches`);
  const J = (d) => d.dados && d.dados.jogo;
  const daLinha = (m) => m && (String(m.tierLabel || '') === LINHA || String(m.bracket || '') === 'gold');

  /* FONTE: toda aparição ÍNTEGRA de cada equipe (com objeto de time), em qualquer jogo. */
  const fonte = {};
  docs.forEach((d) => {
    const m = J(d); if (!m) return;
    [['p1', 'team1Obj', 'team1Uids', 'p1Uid'], ['p2', 'team2Obj', 'team2Uids', 'p2Uid']].forEach(function (c) {
      const nome = m[c[0]];
      if (!nome || !m[c[1]]) return;
      if (!fonte[String(nome)]) fonte[String(nome)] = { obj: m[c[1]], uids: m[c[2]] || [], uid: m[c[3]] || null };
    });
  });
  console.log('equipes com objeto íntegro no banco:', Object.keys(fonte).length);

  const faltando = [];
  docs.forEach((d) => {
    const m = J(d); if (!daLinha(m)) return;
    [['p1', 'team1Obj'], ['p2', 'team2Obj']].forEach(function (c) {
      if (!m[c[0] + 'FromRepechage']) return;
      const nome = m[c[0]];
      if (!nome || nome === 'TBD') return;
      if (m[c[1]]) return;                       /* já tem objeto: nada a fazer */
      faltando.push({ doc: d.nome, id: m.id, slot: c[0], nome: String(nome),
        jogado: !!m.winner || m.scoreP1 != null || !!m.pendingResult });
    });
  });
  console.log('vagas SEM o objeto do time:', faltando.length);
  const sujas = faltando.filter((f) => f.jogado);
  if (sujas.length) { console.log('⛔ RECUSADO: ' + sujas.length + ' já têm resultado'); process.exitCode = 1; return; }

  let n = 0, semFonte = 0;
  for (const f of faltando) {
    const src = fonte[f.nome];
    if (!src) { console.log('   ⚠️ SEM FONTE para "' + f.nome + '" — pulado'); semFonte++; continue; }
    const campos = {};
    campos[f.slot === 'p1' ? 'team1Obj' : 'team2Obj'] = src.obj;
    campos[f.slot === 'p1' ? 'team1Uids' : 'team2Uids'] = (src.uids || []).map(String);
    campos[f.slot + 'Uid'] = src.uid || null;
    console.log('   ' + (GRAVAR ? 'reparando' : 'repararia') + ' ' + f.id + '.' + f.slot + ' → ' + f.nome +
      ' (' + ((src.uids || []).length) + ' uid)');
    if (GRAVAR) await patch(f.doc, campos);
    n++;
  }
  console.log('\n' + (GRAVAR ? '✅ ' : 'ensaio: ') + n + ' vaga(s) ' + (GRAVAR ? 'reparadas' : 'seriam reparadas') +
    (semFonte ? ' · ' + semFonte + ' sem fonte' : ''));
  if (!GRAVAR) console.log('rode com --gravar para valer.');
})().catch((e) => { console.error('ERRO:', e && e.message); process.exitCode = 1; });
