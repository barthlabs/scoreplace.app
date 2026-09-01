/* DEPOIS DE AVANÇAR, A CLASSIFICAÇÃO ANTERIOR VIRA HISTÓRICO COMPACTO  (CONFRA.P1)
 * node tests/classificacao-anterior-fica-compacta.test.js
 *
 * ORDEM DO DONO (01/set/2026): depois que a fase avançou, a tabela da fase anterior mostra
 * só POSIÇÃO, JOGADOR, V e SALDO. Sem D, sem Pts, sem as outras colunas. No celular o nome
 * fica com a largura que sobra e não pode quebrar uma-palavra-por-linha.
 *
 * ⛔ É SÓ APRESENTAÇÃO. Nada aqui muda cálculo, desempate, congelada, W.O. ou dado — e o
 * bloco ③ afirma isso comparando os VALORES antes e depois. Enquanto a fase NÃO avançou a
 * tabela continua inteira, porque ela ainda serve pra operar os jogos (bloco ①).
 *
 * ⭐ POR QUE COM CHROMIUM DE VERDADE: "o nome ganha a largura que sobra" é uma afirmação
 * sobre LAYOUT, e layout não se prova lendo string — o harness de render tem DOM de mentira
 * e mediria 0 em tudo. Aqui o HTML sai do render REAL (`_renderMonarchStage`) e é medido num
 * navegador de verdade, na largura de um celular. [[project_o_metodo_que_achou_os_3_bugs_do_celular]]
 */
'use strict';
const path = require('path');
const { chromium } = require('@playwright/test');
const H = require('./render-harness');
const W = H.window;

let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

/* ── o torneio: Rei/Rainha de 8, jogos simulados, com fase seguinte configurada ──────
 * ⭐ UM torneio só, renderizado DUAS vezes. Entre uma e outra a ÚNICA coisa que muda é o
 * carimbo de "já avançou" (`classifCongelada`) — e ele é gravado NA ORDEM QUE A TABELA JÁ
 * MOSTRAVA, que é o que o avanço de verdade faz. Assim, se algum valor ou alguma posição
 * mudar entre os dois renders, a mudança é do CÓDIGO, não do cenário. Um retrato em ordem
 * inventada faria as duas tabelas divergirem por construção e o teste não provaria nada. */
function torneioBase() {
  const t = H.hydrateMonarchGroups(H.buildViaDraw('Liga', 8,
    { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true }));
  H.simulateRounds(t);
  t.currentPhaseIndex = 0;
  t.phases = [{ name: 'Rei/Rainha' },
    { name: 'Ouro/Prata', fixedPairs: true,
      source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] } }];
  return t;
}
function gruposDe(t) {
  const gs = [];
  (t.rounds || []).forEach((r) => ((r && r.monarchGroups) || []).forEach((g) => gs.push(g)));
  (t.groups || []).forEach((g) => { if (gs.indexOf(g) < 0) gs.push(g); });
  return gs;
}
const htmlDe = (t) => W._renderMonarchStage(t, false, false, { suppressAutoAdvance: true }) || '';
// materializar a fase seguinte é o que o motor marca ao gerar a fase de verdade
// (phases-engine.js:2054/2083). É ISSO que torna a tabela anterior histórico.
function materializarProximaFase(t) { t._phaseMaterialized = 1; t.currentPhaseIndex = 1; }
// congela CADA grupo na ordem que a classificação já entrega — é o que `advanceMultiPhase`
// grava (phases-engine.js:2184): o retrato do que estava na tela. ⛔ congelar NÃO é avançar:
// um grupo congela quando ELE termina, com o resto do torneio ainda jogando.
function congelarComoEsta(t) {
  gruposDe(t).forEach((g) => {
    const ms = (g.matches || []).concat((g.rounds || []).reduce((a, r) => a.concat(r.matches || []), []));
    const st = W._computeMonarchStandings(
      { players: g.players || [], playersUids: g.playersUids, matches: ms }, t, g.category || null) || [];
    if (!st.length) throw new Error('fixture vazia: grupo sem classificação — o teste mediria nada');
    g.classifCongelada = st.map((x) => ({ name: (x && x.name) || '', uid: (x && x.uid) || null }));
  });
}

console.log('──── ① antes de avançar a tabela continua INTEIRA ────');
const alvo = torneioBase();
const htmlInteiro = htmlDe(alvo);
{
  ok('o render real produziu a tabela', /<table/.test(htmlInteiro));
  ok('⭐ tem a coluna D (ainda serve pra operar os jogos)', />D<\/th>/.test(htmlInteiro));
  ok('⭐ tem a coluna de pontos (Pts ou PA)', />Pts<\/th>/.test(htmlInteiro) || /PA<\/th>/.test(htmlInteiro));
  ok('  → e o aproveitamento', />%<\/th>/.test(htmlInteiro));
  ok('  → junto com V e Saldo', />V<\/th>/.test(htmlInteiro) && />Saldo<\/th>/.test(htmlInteiro));
}

/* ── ①bis CONGELADO NÃO É AVANÇADO ──────────────────────────────────────────────────
 * ⛔ O vazamento que este bloco tranca: `classifCongelada` é gravada POR GRUPO, quando
 * AQUELE grupo termina. Se ela bastasse como sinal, o grupo que acabou primeiro já apareceria
 * compacto — sem D, sem Pts — enquanto o torneio ainda precisa da tabela inteira pra operar
 * os jogos que faltam nos outros grupos. */
console.log('──── ①bis grupo congelado, fase AINDA não avançada: tabela INTEIRA ────');
congelarComoEsta(alvo);
const htmlCongelado = htmlDe(alvo);
{
  ok('a congelada foi mesmo gravada em todos os grupos',
    gruposDe(alvo).every((g) => Array.isArray(g.classifCongelada) && g.classifCongelada.length > 0));
  ok('  → e a fase seguinte NÃO foi materializada', !(alvo._phaseMaterialized > 0));
  ok('⭐⭐ mesmo congelada, a coluna D continua', />D<\/th>/.test(htmlCongelado));
  ok('⭐⭐ e a coluna de pontos continua',
    />Pts<\/th>/.test(htmlCongelado) || /PA<\/th>/.test(htmlCongelado));
  ok('  → e o aproveitamento também', />%<\/th>/.test(htmlCongelado));
}

console.log('──── ② depois de MATERIALIZAR a fase seguinte sobram posição, jogador, V e saldo ────');
// ⭐ MESMO torneio, MESMOS jogos, MESMA congelada — só a fase seguinte foi materializada.
materializarProximaFase(alvo);
const htmlCompacto = htmlDe(alvo);
{
  ok('⭐⭐ a coluna D SAIU', !/>D<\/th>/.test(htmlCompacto));
  ok('⭐⭐ a coluna de pontos SAIU (nem Pts nem PA)',
    !/>Pts<\/th>/.test(htmlCompacto) && !/PA<\/th>/.test(htmlCompacto));
  ok('⭐⭐ o aproveitamento SAIU', !/>%<\/th>/.test(htmlCompacto));
  ok('  → e as colunas de sets/games/TB também', !/>±S<\/th>/.test(htmlCompacto) && !/>TB<\/th>/.test(htmlCompacto));
  ok('⭐⭐ V continua', />V<\/th>/.test(htmlCompacto));
  ok('⭐⭐ Saldo continua', />Saldo<\/th>/.test(htmlCompacto));
  ok('  → e a coluna Jogador continua', />Jogador<\/th>/.test(htmlCompacto));
  ok('  → e a posição também (1º, 2º…)', /1º<\/td>/.test(htmlCompacto));
}

console.log('──── ③ os VALORES e a congelada não mudaram (é só apresentação) ────');
{
  const vitorias = (h) => (h.match(/color:var\(--sp-c-4ade80,#4ade80\);font-weight:700;">(\d+)</g) || []).join(',');
  ok('⭐⭐ as vitórias impressas são as MESMAS nas duas versões',
    vitorias(htmlInteiro) === vitorias(htmlCompacto),
    'inteiro: ' + vitorias(htmlInteiro) + '\n      compacto: ' + vitorias(htmlCompacto));
  const saldos = (h) => (h.match(/title="Saldo \(pró − contra\)">([+-]?\d+)</g) || []).join(',');
  ok('⭐⭐ os saldos impressos são os MESMOS', saldos(htmlInteiro) === saldos(htmlCompacto),
    'inteiro: ' + saldos(htmlInteiro) + '\n      compacto: ' + saldos(htmlCompacto));
  const antes = JSON.stringify(gruposDe(alvo).map((g) => g.classifCongelada));
  htmlDe(alvo); htmlDe(alvo);
  ok('⭐⭐ renderizar não tocou na congelada (byte a byte igual)',
    JSON.stringify(gruposDe(alvo).map((g) => g.classifCongelada)) === antes);
  const ordem = (h) => (h.match(/data-maxrem="0\.85"[^>]*>(?:<[^>]+>)*([^<]{2,})/g) || []).join('|');
  ok('  → e a ORDEM das linhas é a mesma nas duas versões (nada foi reordenado)',
    ordem(htmlInteiro) === ordem(htmlCompacto),
    'inteiro: ' + ordem(htmlInteiro).slice(0, 160) + '\n      compacto: ' + ordem(htmlCompacto).slice(0, 160));
}

/* ── ④ A MEDIÇÃO: num celular de verdade, o nome ganha largura ─────────────────────── */
(async () => {
  console.log('──── ④ no celular (375px) o nome fica com mais largura útil ────');
  const navegador = await chromium.launch();
  try {
    const pag = await navegador.newPage({ viewport: { width: 375, height: 812 } });
    const medir = async (html) => {
      await pag.setContent('<div style="width:375px">' + html + '</div>');
      return pag.evaluate(() => {
        const tabela = document.querySelector('table');
        if (!tabela) return null;
        const ths = [...tabela.querySelectorAll('thead th')];
        const iNome = ths.findIndex((th) => /Jogador/.test(th.textContent));
        const tds = [...tabela.querySelectorAll('tbody tr')].map((tr) => tr.children[iNome]).filter(Boolean);
        const larguras = tds.map((td) => td.getBoundingClientRect().width);
        // "quebrou em uma-palavra-por-linha" = a célula ficou mais alta que uma linha e o
        // nome tem mais de uma palavra: é o sintoma que o dono descreveu.
        const quebrados = tds.filter((td) => {
          const r = td.getBoundingClientRect();
          const linhas = r.height / parseFloat(getComputedStyle(td).lineHeight || '16');
          return linhas > 1.6 && (td.textContent || '').trim().split(/\s+/).length > 1;
        }).length;
        return { colunas: ths.length, nomeMin: Math.min(...larguras), nomeMax: Math.max(...larguras),
                 linhas: tds.length, quebrados,
                 estouro: tabela.scrollWidth > tabela.clientWidth + 1 };
      });
    };
    const mInteiro = await medir(htmlInteiro);
    const mCompacto = await medir(htmlCompacto);
    console.log('    inteiro : ' + mInteiro.colunas + ' colunas, nome ' + Math.round(mInteiro.nomeMin) + '–' + Math.round(mInteiro.nomeMax) + 'px, ' + mInteiro.quebrados + ' quebrado(s)');
    console.log('    compacto: ' + mCompacto.colunas + ' colunas, nome ' + Math.round(mCompacto.nomeMin) + '–' + Math.round(mCompacto.nomeMax) + 'px, ' + mCompacto.quebrados + ' quebrado(s)');
    ok('a tabela tem linhas nas duas versões', mInteiro.linhas > 0 && mCompacto.linhas === mInteiro.linhas);
    ok('⭐⭐ o compacto tem MENOS colunas', mCompacto.colunas < mInteiro.colunas,
      mCompacto.colunas + ' vs ' + mInteiro.colunas);
    ok('⭐⭐ e o nome fica com MAIS largura útil', mCompacto.nomeMin > mInteiro.nomeMin,
      Math.round(mCompacto.nomeMin) + 'px vs ' + Math.round(mInteiro.nomeMin) + 'px');
    ok('⭐⭐ nenhum nome quebra uma-palavra-por-linha no compacto', mCompacto.quebrados === 0,
      mCompacto.quebrados + ' quebrado(s)');
    ok('  → e a tabela não estoura a largura do celular', !mCompacto.estouro);
  } finally { await navegador.close(); }
  console.log(falhas === 0 ? '\n✅ classificacao-anterior-fica-compacta: OK' : '\n❌ ' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})();
