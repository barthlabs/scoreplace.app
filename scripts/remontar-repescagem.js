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
/* ⛔⛔⛔ ESTE SCRIPT ESTÁ BLOQUEADO PARA GRAVAÇÃO. NÃO REMOVA O BLOQUEIO SEM CONSERTAR OS TRÊS PONTOS.
 *
 * Ele JÁ derrubou produção uma vez (26/set/2026): gravou vagas só com o nome, sem o objeto do time e
 * sem uid, e com isso o botão de W.O. parou de funcionar e a tela de inscritos parou de abrir. Aquilo
 * foi remendado, mas a revisão apontou que o script continua capaz de corromper dado:
 *   ① a conversão para o formato do banco não é recursiva em mapa aninhado — o objeto do time tem
 *      mapas dentro de mapas, e o que não converter direito vai gravado torto;
 *   ② ele escolhe o torneio por PEDAÇO DO NOME, não por id exato: rodar com o alvo errado grava na
 *      chave de outro torneio;
 *   ③ não há precondição: ele lê, decide e grava sem exigir que o documento ainda esteja como estava.
 *      Alguém lançando placar no meio perde a gravação, ou a dele é perdida.
 *
 * ⚠️ A LEITURA CONTINUA LIBERADA de propósito: o ensaio (sem `--gravar`) é útil e não arrisca nada.
 * Quem precisar remontar de verdade: conserte os três pontos e tire este bloqueio no mesmo commit. */
if (process.argv.includes('--gravar')) {
  console.error('\n⛔ GRAVAÇÃO BLOQUEADA neste script — ele pode corromper o torneio.');
  console.error('   Motivos, no cabeçalho do arquivo: conversão não recursiva de mapa aninhado,');
  console.error('   alvo escolhido por pedaço do nome e gravação sem precondição.');
  console.error('   O ensaio (sem --gravar) continua funcionando.\n');
  process.exit(1);
}

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

  let n = 0, recusadas = 0;
  for (const m of all) {
    if (!daLinha(m)) continue;
    for (const sl of ['p1', 'p2']) {
      if (!m[sl + 'FromRepechage']) continue;
      const agora = m[sl];
      if (vazio(agora)) continue;
      if (String(antes[String(m.id) + '|' + sl] || '') === String(agora)) continue;
      const doc = porId[String(m.id)];
      if (!doc) { console.log('   ⚠️ sem documento para', m.id, '— pulado'); continue; }
      /* ⛔⛔ NUNCA GRAVAR UMA VAGA SÓ COM O NOME — foi assim que eu derrubei produção em 26/set/2026.
       * O nome é rótulo; a IDENTIDADE é o uid, e o slot também carrega o OBJETO DO TIME
       * (`team1Obj`/`team2Obj`), de onde saem os dados dos jogadores. Gravando só a string, o W.O.
       * parou de funcionar (precisa do uid para saber de quem é o W.O.) e a tela de inscritos parou de
       * abrir (varre os slots esperando o objeto). O `if (uids.length)` de antes deixava a gravação
       * passar CALADA sem identidade nenhuma — condicional em vez de exigência.
       * ⇒ agora é RECUSA: sem uid e sem objeto do time, esta vaga não é gravada e o script grita.
       * [[feedback_uid_controls_everything_name_only_ficticio]] */
      const uids = (sl === 'p1') ? m.team1Uids : m.team2Uids;
      const obj = (sl === 'p1') ? m.team1Obj : m.team2Obj;
      const temUid = Array.isArray(uids) && uids.filter(Boolean).length > 0;
      if (!temUid || !obj) {
        console.log('   ⛔ RECUSADO ' + m.id + '.' + sl + ' → ' + agora +
          '  (uid=' + (temUid ? 'sim' : 'NÃO') + ' objeto=' + (obj ? 'sim' : 'NÃO') + ')' +
          ' — gravar sem identidade quebra W.O. e inscritos');
        recusadas++;
        continue;
      }
      const campos = {};
      campos[sl] = String(agora);
      campos[sl + 'AguardaMelhor'] = null;
      campos[(sl === 'p1' ? 'team1Uids' : 'team2Uids')] = uids.filter(Boolean).map(String);
      campos[(sl === 'p1' ? 'team1Obj' : 'team2Obj')] = obj;
      campos[sl + 'Uid'] = (uids.filter(Boolean).length === 1) ? String(uids.filter(Boolean)[0]) : null;
      console.log('   ' + (GRAVAR ? 'gravando' : 'gravaria') + ' ' + m.id + '.' + sl + ' → ' + agora +
        ' (' + campos[(sl === 'p1' ? 'team1Uids' : 'team2Uids')].length + ' uid)');
      if (GRAVAR) { await patch(doc, campos); }
      n++;
    }
  }
  console.log('\n' + (GRAVAR ? '✅ ' : 'ensaio: ') + n + ' vaga(s) ' + (GRAVAR ? 'gravadas' : 'seriam gravadas') + '.');
  if (recusadas) {
    console.log('⛔ ' + recusadas + ' vaga(s) RECUSADAS por falta de identidade — nada foi gravado nelas.');
    process.exitCode = 1;
  }
  if (!GRAVAR) console.log('rode com --gravar para valer.');
})().catch((e) => { console.error('ERRO:', e && e.message); process.exitCode = 1; });
