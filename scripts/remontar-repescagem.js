/* REMONTAR A REPESCAGEM DE UMA LINHA — com a REGRA DO APP, não com uma cópia dela.
 *
 * POR QUE EXISTE (26/set/2026): a repescagem da linha Ouro da Confra saiu errada porque
 * `saldo_pontos` era medido no placar de SETS. Corrigido o código, as 14 vagas foram zeradas e
 * precisam ser preenchidas de novo — e a única maneira honesta de preencher é RODANDO A FUNÇÃO QUE
 * RODA EM PRODUÇÃO (`_reassignBestLosersToRepechage`) e gravando o que ela decidir. Reimplementar a
 * escolha aqui daria um dado que concorda com o script e não com o app.
 *
 * ⛔ TRAVAS:
 *  · só grava com `--gravar`; sem a marca é ensaio;
 *  · RECUSA se qualquer vaga da linha já tiver vencedor, placar ou placar aguardando aprovação;
 *  · escreve SÓ os slots que a função preencheu, por caminho aninhado (`jogo.p1`), deixando o resto
 *    do jogo intacto;
 *  · a linha é parâmetro: serve para Ouro, Prata e qualquer linha de qualquer torneio.
 *
 * Uso:  node scripts/remontar-repescagem.js <parte-do-nome-do-torneio> <linha> [--gravar]
 *       node scripts/remontar-repescagem.js Confra Ouro
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const Split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
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
function _valorF(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((s) => ({ stringValue: String(s) })) } };
  return { stringValue: String(v) };
}
async function patch(nomeDoc, camposDoJogo) {
  const mask = Object.keys(camposDoJogo).map((k) => 'updateMask.fieldPaths=' + encodeURIComponent('jogo.' + k)).join('&');
  const dentro = {};
  Object.entries(camposDoJogo).forEach(([k, v]) => { dentro[k] = _valorF(v); });
  const r = await fetch('https://firestore.googleapis.com/v1/' + nomeDoc + '?' + mask, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { jogo: { mapValue: { fields: dentro } } } }) });
  if (!r.ok) throw new Error('PATCH ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

(async () => {
  console.log('▶ remontar repescagem · torneio "' + ALVO + '" · linha "' + LINHA + '"' +
    (GRAVAR ? '  ⚠️ GRAVANDO' : '  (ensaio)') + '\n');
  const todos = await lista(`${BASE}/tournaments`);
  const item = todos.find((x) => String(x.id) === ALVO ||
    String((x.dados && x.dados.name) || '').toLowerCase().includes(String(ALVO).toLowerCase()));
  if (!item) { console.log('torneio não encontrado'); return; }
  const fora = Array.isArray(item.dados._semPesados) ? item.dados._semPesados : [];
  const partes = Object.fromEntries(await Promise.all(fora.map(async (nome) => {
    const col = Split.colecaoDaParte(nome);
    const docs = await lista(`${BASE}/tournaments/${item.id}/${col}`);
    return [col, docs.map((d) => d.dados)];
  })));
  const t = await Split.montarDoBanco(item.dados, async (c) => partes[c] || []);
  console.log('torneio:', t.name, '(' + item.id + ')');

  /* a regra do app, carregada na mesma ordem do index.html */
  const H = require(path.join(__dirname, '..', 'tests', 'headless.js'));
  ['bracket-model.js', 'chaves.js', 'chaves-adapter.js', 'bracket-logic.js'].forEach((f) => {
    try { H.load(f); } catch (e) {}
  });
  const W = H.window;
  if (typeof W._reassignBestLosersToRepechage !== 'function') {
    console.log('⛔ a função do app não carregou — abortando sem concluir nada'); process.exitCode = 1; return;
  }

  const vazio = (v) => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
  const all = (typeof W._collectAllMatches === 'function') ? (W._collectAllMatches(t) || []) : (t.matches || []);
  const daLinha = (m) => String((m && (m.tierLabel || m.bracket)) || '') === LINHA ||
                          String((m && m.bracket) || '') === LINHA;

  /* ⛔ NENHUMA vaga pode ter sido jogada — senão remontar destrói resultado. */
  const suja = all.filter((m) => daLinha(m) && ['p1', 'p2'].some((sl) => m[sl + 'FromRepechage']) &&
    (m.winner || m.scoreP1 != null || m.pendingResult));
  if (suja.length) {
    console.log('⛔ RECUSADO: ' + suja.length + ' jogo(s) de repescagem já têm resultado:',
      suja.map((m) => m.id).join(', '));
    process.exitCode = 1; return;
  }

  const antes = {};
  all.forEach((m) => { if (daLinha(m)) ['p1', 'p2'].forEach((sl) => {
    if (m[sl + 'FromRepechage']) antes[String(m.id) + '|' + sl] = m[sl];
  }); });
  const trocas = W._reassignBestLosersToRepechage(t);
  console.log('a função do app decidiu; trocas:', trocas, '\n');

  const porId = {};
  (await lista(`${BASE}/tournaments/${item.id}/matches`)).forEach((d) => {
    const g = d.dados && d.dados.jogo; if (g && g.id) porId[String(g.id)] = d.nome;
  });

  let n = 0;
  for (const m of all) {
    if (!daLinha(m)) continue;
    for (const sl of ['p1', 'p2']) {
      if (!m[sl + 'FromRepechage']) continue;
      const agora = m[sl];
      if (vazio(agora)) continue;
      if (String(antes[String(m.id) + '|' + sl] || '') === String(agora)) continue;
      const doc = porId[String(m.id)];
      if (!doc) { console.log('   ⚠️ sem documento para', m.id, '— pulado'); continue; }
      const campos = {};
      campos[sl] = String(agora);
      campos[sl + 'AguardaMelhor'] = null;
      const uids = (sl === 'p1') ? m.team1Uids : m.team2Uids;
      if (Array.isArray(uids) && uids.length) campos[(sl === 'p1' ? 'team1Uids' : 'team2Uids')] = uids.map(String);
      console.log('   ' + (GRAVAR ? 'gravando' : 'gravaria') + ' ' + m.id + '.' + sl + ' → ' + agora);
      if (GRAVAR) { await patch(doc, campos); }
      n++;
    }
  }
  console.log('\n' + (GRAVAR ? '✅ ' : 'ensaio: ') + n + ' vaga(s) ' + (GRAVAR ? 'gravadas' : 'seriam gravadas') + '.');
  if (!GRAVAR) console.log('rode com --gravar para valer.');
})().catch((e) => { console.error('ERRO:', e && e.message); process.exitCode = 1; });
