/* FERRAMENTA DE USO ÚNICO — DESMONTA as vagas de repescagem da linha OURO (Confra).
 *
 * POR QUE EXISTE (26/set/2026): a escolha dos repescados usou os CRITÉRIOS DE DESEMPATE DO TORNEIO
 * — `["pontos_avancados","confronto_direto","saldo_pontos","vitorias",…]` — e SALDO DE GAMES não está
 * nessa lista. Resultado medido na Confra: dupla que perdeu 6-1/6-1 entrou e dupla que perdeu 6-4/6-4
 * ficou fora. O dono: _"o saldo de games é o primeiro criterio"_ e _"desmonta a repescagem urgente"_.
 *
 * O QUE ELE FAZ: zera as vagas de repescagem da linha Ouro que estão OCUPADAS, devolvendo-as a
 * "A definir" — é o que para de informar errado a quem está olhando. NÃO escolhe ninguém, NÃO
 * preenche, NÃO mexe em placar.
 *
 * ⛔ TRAVAS, e nenhuma é opcional:
 *  · SÓ roda com `--gravar`. Sem a marca é ensaio: mostra o que faria e sai;
 *  · RECUSA se qualquer vaga da Ouro tiver vencedor, placar ou placar aguardando aprovação —
 *    desmontar jogo já jogado é destruir resultado, e aí a decisão é de outra natureza. Medido antes
 *    de escrever: 0 jogados, e é essa medição que autoriza o desmonte;
 *  · SÓ a linha OURO, porque foi só ela que o dono mandou refazer;
 *  · grava na SUBCOLEÇÃO `matches`, que é onde a fonte mora neste torneio (`_semPesados` inclui
 *    `matches`) — escrever no documento principal não mudaria nada.
 *
 * Uso:  node scripts/desmontar-repescagem-ouro-confra.js            (ensaio)
 *       node scripts/desmontar-repescagem-ouro-confra.js --gravar   (grava)
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const Leitura = require(path.join(__dirname, 'lib', 'leitura-resiliente.js'));
const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
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
/* ⛔⛔ O JOGO MORA DENTRO DO CAMPO `jogo`, e foi aqui que eu errei primeiro: procurei os campos um
 * nível acima e o ensaio disse "0 vagas". Falso negativo, não boa notícia — e eu quase gravei em cima
 * dele. O documento da subcoleção é `{ _chave, _loc, jogo }`, e o caminho do slot é `jogo.p1`.
 * ⇒ Por isso o PATCH usa caminho ANINHADO na máscara: mexe só em `jogo.p1` e deixa o resto do jogo
 * (placar, arestas, rótulo, número) intacto. Máscara errada aqui apagaria o jogo. */
function _valorF(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map((s) => ({ stringValue: String(s) })) } };
  return { stringValue: String(v) };
}
async function patch(nomeDoc, camposDoJogo) {
  const mask = Object.keys(camposDoJogo)
    .map((k) => 'updateMask.fieldPaths=' + encodeURIComponent('jogo.' + k)).join('&');
  const url = 'https://firestore.googleapis.com/v1/' + nomeDoc + '?' + mask;
  const dentro = {};
  Object.entries(camposDoJogo).forEach(([k, v]) => { dentro[k] = _valorF(v); });
  const body = { fields: { jogo: { mapValue: { fields: dentro } } } };
  const r = await fetch(url, { method: 'PATCH',
    headers: { Authorization: 'Bearer ' + tk, 'Content-Type': 'application/json' },
    body: JSON.stringify(body) });
  if (!r.ok) throw new Error('PATCH ' + r.status + ' ' + (await r.text()).slice(0, 300));
}

(async () => {
  console.log('▶ desmontar repescagem da OURO' + (GRAVAR ? '  ⚠️ MODO GRAVAÇÃO' : '  (ensaio, não grava)') + '\n');
  const todos = await lista(`${BASE}/tournaments`);
  const item = todos.find((x) => String((x.dados && x.dados.name) || '').toLowerCase().includes('confra'));
  if (!item) { console.log('Confra não encontrada'); return; }
  const jogos = await lista(`${BASE}/tournaments/${item.id}/matches`);
  console.log('torneio:', item.dados.name, '(' + item.id + ') · jogos:', jogos.length);

  const vazio = (v) => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
  const alvo = [];
  jogos.forEach((j) => {
    const m = j.dados && j.dados.jogo;     /* ⛔ o jogo mora aqui, não na raiz do documento */
    if (!m) return;
    const linha = String(m.tierLabel || m.bracket || 'main');
    if (linha !== 'Ouro' && linha !== 'gold') return;
    ['p1', 'p2'].forEach((sl) => {
      if (!m[sl + 'FromRepechage']) return;
      if (vazio(m[sl])) return;
      alvo.push({ nome: j.nome, id: String(m.id || j.id), sl, quem: m[sl], round: m.round,
        jogado: !!m.winner, temPlacar: (m.scoreP1 != null || m.scoreP2 != null ||
          (Array.isArray(m.sets) && m.sets.length > 0)), pend: !!m.pendingResult });
    });
  });
  console.log('vagas de repescagem OCUPADAS na Ouro:', alvo.length);
  const sujas = alvo.filter((a) => a.jogado || a.temPlacar || a.pend);
  if (sujas.length) {
    console.log('\n⛔ RECUSADO: ' + sujas.length + ' vaga(s) já têm resultado ou placar aguardando.');
    console.log('   Desmontar aqui destruiria resultado. Jogos:', [...new Set(sujas.map((s) => s.id))].join(', '));
    process.exitCode = 1;
    return;
  }
  console.log('conferido: nenhuma tem vencedor, placar ou placar aguardando — o desmonte é seguro.\n');
  alvo.forEach((a) => console.log('   ' + (GRAVAR ? 'zerando' : 'zeraria') + ' ' + a.id + '.' + a.sl));

  if (!GRAVAR) { console.log('\nensaio. rode com --gravar para valer.'); return; }
  let n = 0;
  for (const a of alvo) {
    /* `AguardaMelhor` é a marca que a chave já usa para dizer "esta vaga espera o melhor perdedor" —
     * é ela que faz o card mostrar "A definir" em vez de um nome errado. */
    const campos = { [a.sl]: 'TBD', [a.sl + 'AguardaMelhor']: true };
    if (a.sl === 'p1') { campos.p1Uid = null; campos.team1Uids = []; }
    else { campos.p2Uid = null; campos.team2Uids = []; }
    await patch(a.nome, campos);
    n++;
    console.log('   zerado ' + a.id + '.' + a.sl);
  }
  console.log('\n✅ ' + n + ' vaga(s) zeradas — voltam a "A definir" até a ordem ser refeita.');
})().catch((e) => { console.error('ERRO:', e && e.message); process.exitCode = 1; });
