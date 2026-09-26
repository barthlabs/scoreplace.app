/* CONFERIDOR — os repescados entraram por DESEMPENHO, ou por sorteio?
 *
 * Pergunta do dono (26/set/2026), ao ver a linha Ouro: _"sairam os repescados da ouro. confere se
 * esta certo por desempenho e nao por puro sorteio."_
 *
 * A REGRA QUE O CÓDIGO DIZ SEGUIR (`_reassignBestLosersToRepechage` em bracket-logic.js):
 * os perdedores da rodada-fonte são ordenados por `_rankLosersByCriteria`, que chama
 * `_rankByTiebreakers` (os critérios de desempate DO TORNEIO). A ordem dos jogos só decide
 * quando os critérios empatam EXATAMENTE — é o desempate final, não o critério.
 *
 * O QUE ESTE SCRIPT FAZ: lê o torneio de verdade (documento + subcoleções, porque em torneio
 * dividido ler só o documento não prova nada), descobre as vagas de repescagem já ocupadas,
 * recalcula a ordem por desempenho com a MESMA função do app e compara.
 *
 * ⛔ ESTRITAMENTE READ-ONLY. Não grava, não corrige, não sugere gravação.
 *
 * Uso: node scripts/conferir-repescados-por-desempenho.js [<tid|parte-do-nome>] [--detalhe]
 */
'use strict';
const path = require('path');
const { execSync } = require('child_process');
const Split = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
const Leitura = require(path.join(__dirname, 'lib', 'leitura-resiliente.js'));

const BASE = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents';
const DETALHE = process.argv.includes('--detalhe');
const ALVO = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'Confra';
const token = () => execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
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

async function lista(url, tk) {
  let page = null, out = [];
  do {
    const q = url + (url.includes('?') ? '&' : '?') + 'pageSize=300' + (page ? '&pageToken=' + encodeURIComponent(page) : '');
    const r = await ler(q, { Authorization: 'Bearer ' + tk }, 'lista ' + url);
    if (!r.ok) { if (r.status === 404) return out; throw new Error(r.status + ' ' + url); }
    const j = JSON.parse(r.texto || '{}');
    (j.documents || []).forEach((d) => out.push({ id: d.name.split('/').pop(), dados: doc2obj(d) }));
    page = j.nextPageToken || null;
  } while (page);
  return out;
}
async function montar(tid, config, tk) {
  const fora = Array.isArray(config._semPesados) ? config._semPesados : [];
  if (!fora.length) return config;
  const partes = await Promise.all(fora.map(async (nome) => {
    const col = Split.colecaoDaParte(nome);
    const docs = await lista(`${BASE}/tournaments/${tid}/${col}`, tk);
    return [col, docs.map((d) => d.dados)];
  }));
  const porColecao = Object.fromEntries(partes);
  return Split.montarDoBanco(config, async (c) => porColecao[c] || []);
}

/* Carrega as funções REAIS do app num sandbox — a ordem tem de ser a mesma do index.html,
 * senão eu estaria conferindo a regra contra uma reimplementação minha, que não prova nada. */
function carregarRegraDoApp() {
  const H = require(path.join(__dirname, '..', 'tests', 'headless.js'));
  ['bracket-model.js', 'chaves.js', 'chaves-adapter.js', 'bracket-logic.js'].forEach((f) => {
    try { H.load(f); } catch (e) { /* alguns módulos pedem irmãos; o que importa é o rank */ }
  });
  return H.window;
}

(async () => {
  const tk = token();
  console.log('▶ conferindo se os repescados entraram por DESEMPENHO (NÃO escreve nada)\n');
  const todos = await lista(`${BASE}/tournaments`, tk);
  const achados = todos.filter((x) => String(x.id) === ALVO ||
    String((x.dados && x.dados.name) || '').toLowerCase().includes(String(ALVO).toLowerCase()));
  if (!achados.length) { console.log('nenhum torneio casou com "' + ALVO + '"'); return; }

  const W = carregarRegraDoApp();
  const temRank = typeof W._rankLosersByCriteria === 'function';
  console.log('  regra do app carregada: _rankLosersByCriteria=' + temRank +
    ' · _rankByTiebreakers=' + (typeof W._rankByTiebreakers === 'function') + '\n');
  if (!temRank) { console.log('⛔ sem a função do app não há o que conferir — abortando sem concluir nada'); return; }

  for (const item of achados) {
    const t = await montar(item.id, item.dados, tk);
    const all = (typeof W._collectAllMatches === 'function') ? (W._collectAllMatches(t) || []) : (t.matches || []);
    console.log('── ' + (t.name || item.id) + '  (' + item.id + ')  jogos=' + all.length);
    if (!all.length) { console.log('   sem jogos montados — nada a conferir\n'); continue; }

    const vazio = (v) => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
    const rod = (m) => (typeof m.round === 'number') ? m.round : 1;
    const linha = (m) => String(m.tierLabel || m.bracket || 'main');

    /* as vagas de repescagem JÁ OCUPADAS, por linha */
    const ocupadas = [];
    all.forEach((m) => ['p1', 'p2'].forEach((sl) => {
      if (m && m[sl + 'FromRepechage'] && !vazio(m[sl])) ocupadas.push({ m, sl, quem: String(m[sl]) });
    }));
    if (!ocupadas.length) { console.log('   nenhuma vaga de repescagem ocupada\n'); continue; }

    /* agrupa por (linha | rodada de ORIGEM = a rodada anterior à da vaga) */
    const porGrupo = {};
    ocupadas.forEach((o) => {
      const k = linha(o.m) + ' | vaga na rodada ' + rod(o.m);
      (porGrupo[k] = porGrupo[k] || []).push(o);
    });

    Object.keys(porGrupo).sort().forEach((k) => {
      const grupo = porGrupo[k];
      const rVaga = rod(grupo[0].m);
      const lin = linha(grupo[0].m);
      /* fonte: os jogos da rodada anterior, na mesma linha */
      const fonte = all.filter((m) => m && linha(m) === lin && rod(m) < rVaga &&
        !m.isBye && !m.isSitOut && m.winner);
      const rMax = fonte.length ? Math.max.apply(null, fonte.map(rod)) : null;
      const daFonte = fonte.filter((m) => rod(m) === rMax);
      const perdedores = [];
      daFonte.forEach((m) => {
        const lado = (typeof W._matchWinnerSide === 'function') ? W._matchWinnerSide(m) : 1;
        const perd = (lado === 1) ? m.p2 : m.p1;
        if (perd && !vazio(perd) && perdedores.indexOf(String(perd)) === -1) perdedores.push(String(perd));
      });
      if (!perdedores.length) { console.log('   ' + k + ': não achei os perdedores da rodada de origem'); return; }

      let ordem = [];
      try { ordem = W._rankLosersByCriteria(t, perdedores) || []; }
      catch (e) { console.log('   ' + k + ': a regra do app falhou (' + (e && e.message) + ')'); return; }

      const entraram = grupo.map((o) => o.quem);
      const esperados = ordem.slice(0, entraram.length);
      const faltaram = esperados.filter((n) => entraram.indexOf(n) === -1);
      const sobraram = entraram.filter((n) => esperados.indexOf(n) === -1);
      const bate = !faltaram.length && !sobraram.length;

      console.log('   ' + k);
      console.log('     perdedores da rodada ' + rMax + ': ' + perdedores.length +
        ' · vagas ocupadas: ' + entraram.length);
      console.log('     ' + (bate ? '✅ BATE com a ordem por desempenho'
                                  : '⛔ NÃO BATE com a ordem por desempenho'));
      if (!bate || DETALHE) {
        console.log('     ordem por desempenho (os ' + entraram.length + ' primeiros): ' + esperados.join(' | '));
        console.log('     quem de fato entrou:                    ' + entraram.join(' | '));
        if (faltaram.length) console.log('     ⛔ deveriam ter entrado e não entraram: ' + faltaram.join(' | '));
        if (sobraram.length) console.log('     ⛔ entraram sem estar entre os melhores: ' + sobraram.join(' | '));
      }
    });
    console.log('');
  }
  console.log('— fim. Este script não gravou nada.');
})().catch((e) => { console.error('ERRO:', e && e.message); process.exitCode = 1; });
