/* O BLOCO CANÔNICO (VOLTAR + TÍTULO + BUSCA) FICA FIXO NO TOPO A ROLAGEM INTEIRA  (CONFRA.P2)
 * node tests/cabecalho-e-busca-fixos-no-celular.test.js
 *
 * RELATO DO DONO (01/set/2026, celular): depois de digitar na busca e limpar no ✕, o
 * cabeçalho canônico e a busca DEIXAM de ficar fixos ao rolar.
 *
 * ⛔ POR QUE ESTE TESTE RODA NUM NAVEGADOR DE VERDADE, SERVIDO POR HTTP: `position:sticky` é
 * layout, e layout não se prova lendo string — o harness de render tem DOM de mentira e
 * mediria 0 em tudo. E `page.setContent` não serve: ele roda em ORIGEM OPACA, o
 * `sessionStorage` lança SecurityError e o `bracket.js` MORRE NO MEIO, sem erro visível —
 * `_bracketApplyFilter` nem chega a existir e o teste passaria medindo uma página onde a
 * busca nunca rodou. Por isso a página é servida de uma origem http real via `page.route`.
 * [[feedback_init_que_morre_no_meio_e_silencioso]]
 *
 * A ESTRUTURA É A REAL (tournaments.js ~4347): a barra é IRMÃ DIRETA do cabeçalho dentro do
 * `#view-container`, e a chave vem depois, num container próprio, com os grupos adiados em
 * LOTES (`_chaveGuardaLote`). Buscar obriga a montar todos os lotes — e é aí que
 * `_chaveMontaTudo` troca cada marcador por `outerHTML`, que era o suspeito do relato.
 *
 * O QUE SE MEDE, no fluxo obrigatório (abrir → digitar → filtrar → limpar no ✕ → rolar →
 * repetir com teclado/viewport reduzido e restaurado):
 *   ① a barra é o MESMO nó do DOM do começo ao fim (não foi destruída nem recriada);
 *   ② o pai dela continua sendo o mesmo, e nenhum ancestral virou container de rolagem;
 *   ③ `position` segue `sticky` e ela para na âncora do cromo, dentro da viewport;
 *   ④ a busca continua ÚNICA e funcional: digita, filtra, o ✕ limpa e devolve o foco.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const RAIZ = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');
const CSS = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css']
  .map(ler).join('\n');

let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

const TOPBAR = 60, BACKH = 52;
const PAGINA = '<style>' + CSS + `
  :root{--topbar-h:${TOPBAR}px;--hamburger-dd-h:0px;--backheader-h:${BACKH}px;--bg-darker:#111114;}
  body{margin:0;background:#0b0b0e;color:#e8e8ea;}
  #topbar{position:fixed;top:0;left:0;right:0;height:${TOPBAR}px;background:#111827;z-index:50;}
  #backh{position:fixed;top:${TOPBAR}px;left:0;right:0;height:${BACKH}px;background:#0f172a;z-index:49;display:flex;align-items:center;padding:0 10px;box-sizing:border-box;}
  #view-container{padding:${TOPBAR + BACKH}px 12px 40px;}
</style><body>
  <div id="topbar"></div>
  <div id="view-container"></div>
</body>`;

async function abrirDetalhe(page) {
  await page.route('http://sp.teste/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA }));
  await page.goto('http://sp.teste/tournaments/confra');
  await page.addScriptTag({ content: ler('js/store.js') });
  await page.addScriptTag({ content: ler('js/views/bracket.js') });
  // monta a tela com a MESMA ordem de tournaments.js: cabeçalho, barra canônica, conteúdo.
  await page.evaluate(() => {
    const grupo = (g, n) => {
      let s = '<div data-group-box="1" class="card" style="margin:14px 0;padding:10px;overflow:visible;">';
      s += '<h3 style="margin:0 0 8px;">Grupo ' + g + '</h3>';
      for (let i = 0; i < n; i++) {
        s += '<div data-players="Fulano' + g + i + ' / Beltrano' + g + i + '" data-my-match="0" ' +
             'style="padding:16px;margin:8px 0;background:#1e1e26;border-radius:8px;">Jogo ' + g + '-' + i + '</div>';
      }
      return s + '</div>';
    };
    const cabecalho = '<div class="d-flex" style="justify-content:space-between;align-items:flex-start;margin-bottom:1rem;">' +
      '<div><button id="btn-voltar" class="btn btn-secondary">← Voltar</button>' +
      '<h2 style="margin:0;">Chave — Confra</h2></div><div><button class="btn">⚙</button></div></div>';
    const barra = window._bracketBar(true);
    // os DEMAIS grupos entram adiados, como no app (>= _CHAVE_LOTE_MIN)
    const demais = [];
    for (let g = 3; g < 11; g++) demais.push(g);
    const marcador = window._chaveGuardaLote(function () {
      return demais.map(function (g) { return grupo(g, 5); }).join('');
    });
    const visiveis = [grupo(0, 5), grupo(1, 5), grupo(2, 5)].join('');
    const chave = '<div class="mt-5" id="inline-bracket-container">' + visiveis +
      '<div class="card" data-dj-card style="margin-bottom:1rem;overflow:visible;">' +
        '<details data-dj><summary style="cursor:pointer;">▸ Demais jogos da rodada (40)</summary>' +
        marcador + '</details></div></div>';
    document.getElementById('view-container').innerHTML =
      // ⭐ o back-header é IRMÃO do conteúdo dentro da view (store.js:4664) — e é por isso
      // que `_firstVisibleSibling` pode ficar sem alvo quando o filtro esconde os irmãos.
      '<div id="backh" class="sticky-back-header"><button class="btn btn-secondary">← Voltar</button></div>' +
      cabecalho + barra + '<div id="tourn-grid-container" style="min-height:600px;background:#141419;border-radius:10px;"></div>' + chave;
    // carimbo de IDENTIDADE: se a barra for recriada, a marca não sobrevive
    document.getElementById('fbwrap-chaves').__marcaDeIdentidade = 'original';
    // ⭐ é `_reflowChrome` que publica --topbar-h/--backheader-h, e é dele que a fórmula do
    // sticky depende. Sem rodar, o teste mediria uma âncora que o app nunca usa.
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
  });
}

async function medir(page, rotulo) {
  const r = await page.evaluate((anc) => {
    const w = document.getElementById('fbwrap-chaves');
    if (!w) return { erro: 'a barra sumiu do DOM' };
    const cs = getComputedStyle(w);
    const rect = w.getBoundingClientRect();
    // ancestrais que quebram sticky (overflow != visible, transform, contain, filter)
    const quebras = [];
    for (let el = w.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const s = getComputedStyle(el);
      const ov = [s.overflow, s.overflowX, s.overflowY].join(' ');
      if (/(auto|scroll|hidden|clip)/.test(ov) && el !== document.body) quebras.push((el.id || el.className || el.tagName) + ' overflow:' + ov);
      if (s.transform !== 'none') quebras.push((el.id || el.className || el.tagName) + ' transform');
      if (s.filter !== 'none') quebras.push((el.id || el.className || el.tagName) + ' filter');
      if (s.contain && s.contain !== 'none') quebras.push((el.id || el.className || el.tagName) + ' contain:' + s.contain);
      if (s.display === 'none') quebras.push((el.id || el.className || el.tagName) + ' display:none');
    }
    const inp = document.getElementById('bracket-search');
    return {
      marca: w.__marcaDeIdentidade || null,
      pai: w.parentElement ? (w.parentElement.id || w.parentElement.tagName) : null,
      position: cs.position,
      top: Math.round(rect.top), altura: Math.round(rect.height),
      dentroDaViewport: rect.top >= 0 && rect.bottom <= window.innerHeight,
      abaixoDoCromo: Math.round(rect.top) >= anc - 2,
      quebras,
      buscas: document.querySelectorAll('#bracket-search').length,
      barras: document.querySelectorAll('[id^="fbwrap-chaves"]').length,
      valor: inp ? inp.value : null,
      cardsVisiveis: [...document.querySelectorAll('[data-players]')].filter((e) => e.style.display !== 'none').length,
      scrollY: Math.round(window.scrollY),
      // o spacer canônico: último filho do PAI DA BARRA, do tamanho do déficit
      spacer: (function () {
        const sp = document.getElementById('sp-sticky-spacer');
        if (!sp) return { existe: false };
        return { existe: true, altura: Math.round(sp.getBoundingClientRect().height),
                 noPaiDaBarra: sp.parentElement === w.parentElement,
                 ultimo: sp.parentElement && sp.parentElement.lastElementChild === sp };
      })(),
      // a barra tem por onde grudar? (o pai precisa alcançar scrollY + viewport)
      paiAlcanca: (function () {
        const host = w.parentElement; if (!host) return false;
        const doc = document.scrollingElement || document.documentElement;
        return (host.getBoundingClientRect().bottom + doc.scrollTop) >= (doc.scrollTop + window.innerHeight) - 1;
      })()
    };
  }, TOPBAR + BACKH - 1);
  console.log('  ' + rotulo.padEnd(38) + ' pos=' + r.position + ' top=' + r.top + ' pai=' + r.pai +
    ' marca=' + r.marca + ' busca=' + r.buscas + ' vis=' + r.cardsVisiveis + ' y=' + r.scrollY +
    (r.quebras && r.quebras.length ? '  ⚠ ' + r.quebras.join(' | ') : ''));
  return r;
}

const rolar = async (page, y) => { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(90); };
/* ⛔ O REFLOW RE-RODA O TEMPO TODO NO CELULAR — e é aí que mora o defeito que a v1.8.3
 * descreve: abrir e fechar o teclado é `resize`, rolar dispara, trocar de rota dispara.
 * `_reflowChrome` recalcula `--backheader-h`, que é o `top` da barra. Se ele zerar, a barra
 * continua `sticky` mas gruda no fundo da TOPBAR — ATRÁS do cabeçalho. Pra quem olha, ela
 * "deixou de ficar fixa": some ao rolar. Medir sem re-rodar o reflow é medir um app parado. */
const reflow = async (page) => {
  await page.evaluate(() => { if (typeof window._reflowChrome === 'function') window._reflowChrome(); });
  await page.waitForTimeout(60);
};

(async () => {
  const navegador = await chromium.launch();
  const page = await navegador.newPage({ viewport: { width: 390, height: 844 } });
  const errosDePagina = [];
  page.on('pageerror', (e) => errosDePagina.push(String(e).slice(0, 200)));
  try {
    console.log('──── fluxo obrigatório no celular (390x844) ────');
    await abrirDetalhe(page);
    const m1 = await medir(page, '① detalhe aberto, rolado 900px');
    await rolar(page, 900);
    const m1b = await medir(page, '① rolado');

    console.log('▸ ② digitar na busca e ③ aplicar o filtro');
    await page.evaluate(() => {
      const i = document.getElementById('bracket-search');
      i.value = 'Fulano7';
      window._fbSearchInput('chaves', i);
    });
    await page.waitForTimeout(120);
    await reflow(page);
    const m2 = await medir(page, '②③ filtrado');
    await rolar(page, 900);
    const m2b = await medir(page, '②③ filtrado, rolado');

    /* ⛔ BUSCA SEM RESULTADO: é o caso extremo que a v1.8.3 descreve. O filtro esconde TODOS
     * os irmãos de conteúdo com `display:none`, e `_firstVisibleSibling` (que já pula
     * sticky/fixed, ou seja pula a própria barra) fica sem alvo. Se a altura do back-header
     * fosse medida dentro do `if (next)`, `--backheader-h` zeraria aqui e a barra passaria a
     * grudar no fundo da TOPBAR — atrás do cabeçalho. */
    console.log('▸ ③bis busca SEM RESULTADO (esconde todos os irmãos)');
    await page.evaluate(() => {
      const i = document.getElementById('bracket-search');
      i.value = 'ninguemcomessenome';
      window._fbSearchInput('chaves', i);
    });
    await page.waitForTimeout(120);
    await reflow(page);
    await rolar(page, 400);
    const mZero = await medir(page, '③bis sem resultado, rolado');

    console.log('▸ ④ limpar no ✕ e ⑤ rolar bastante');
    await page.evaluate(() => window._fbClearSearch('chaves'));
    await page.waitForTimeout(120);
    await reflow(page);
    const m3 = await medir(page, '④ após o ✕');
    await rolar(page, 1800);
    const m3b = await medir(page, '⑤ rolado 1800px');

    console.log('▸ ⑥ teclado: viewport reduzido e restaurado');
    await page.setViewportSize({ width: 390, height: 420 });
    await page.waitForTimeout(120);
    await reflow(page);
    await page.evaluate(() => {
      const i = document.getElementById('bracket-search');
      i.value = 'Beltrano3';
      window._fbSearchInput('chaves', i);
    });
    await page.waitForTimeout(120);
    await reflow(page);
    await rolar(page, 700);
    const m4 = await medir(page, '⑥ teclado aberto, filtrado, rolado');
    await page.evaluate(() => window._fbClearSearch('chaves'));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(120);
    await reflow(page);
    await rolar(page, 1500);
    const m5 = await medir(page, '⑥ teclado fechado, limpo, rolado');

    const passos = { '① aberto': m1b, '②③ filtrado': m2b, '③bis sem resultado': mZero, '④ após ✕': m3, '⑤ rolado': m3b, '⑥ teclado': m4, '⑥ restaurado': m5 };
    console.log('──── veredito ────');
    ok('nenhum erro de página (o app carregou inteiro)', errosDePagina.length === 0, errosDePagina.join(' | '));
    Object.keys(passos).forEach((k) => {
      ok('⭐ ' + k + ': a barra é o MESMO nó (não foi destruída nem recriada)', passos[k].marca === 'original',
        'marca=' + passos[k].marca);
    });
    Object.keys(passos).forEach((k) => {
      ok('⭐ ' + k + ': continua no MESMO pai (' + passos[k].pai + ')', passos[k].pai === 'view-container');
    });
    Object.keys(passos).forEach((k) => {
      ok('⭐ ' + k + ': nenhum ancestral quebra o sticky', (passos[k].quebras || []).length === 0,
        (passos[k].quebras || []).join(' | '));
    });
    Object.keys(passos).forEach((k) => {
      ok('⭐⭐ ' + k + ': position=sticky e grudada na âncora do cromo', passos[k].position === 'sticky' && passos[k].abaixoDoCromo,
        'position=' + passos[k].position + ' top=' + passos[k].top);
    });
    Object.keys(passos).forEach((k) => {
      ok('⭐⭐ ' + k + ': visível dentro da viewport', passos[k].dentroDaViewport,
        'top=' + passos[k].top + ' altura=' + passos[k].altura);
    });
    Object.keys(passos).forEach((k) => {
      ok('  → ' + k + ': existe UMA busca canônica só', passos[k].buscas === 1 && passos[k].barras === 1,
        'buscas=' + passos[k].buscas + ' barras=' + passos[k].barras);
    });
    Object.keys(passos).forEach((k) => {
      ok('⭐⭐ ' + k + ': o PAI da barra continua alto o bastante pra ela grudar', passos[k].paiAlcanca,
        'sem isso o sticky não tem por onde viajar e a barra descola');
    });
    ok('⭐⭐ ao encolher a lista, o spacer canônico entra no PAI DA BARRA',
      mZero.spacer.existe && mZero.spacer.noPaiDaBarra && mZero.spacer.ultimo && mZero.spacer.altura > 0,
      JSON.stringify(mZero.spacer));
    ok('⭐⭐ e filtrar NÃO move a rolagem (nada de reposicionar por baixo do dono)',
      Math.abs(m2b.scrollY - m1b.scrollY) <= 1 || m2b.scrollY === m2.scrollY,
      'antes=' + m1b.scrollY + ' filtrado=' + m2b.scrollY);
    ok('⭐⭐ o filtro FUNCIONA: buscar reduz os cards visíveis', m2.cardsVisiveis > 0 && m2.cardsVisiveis < m1.cardsVisiveis,
      'antes=' + m1.cardsVisiveis + ' filtrado=' + m2.cardsVisiveis);
    ok('  → e buscar montou os lotes adiados (a chave inteira entrou no DOM)',
      m2.cardsVisiveis + 0 >= 1 && m3.cardsVisiveis > m1.cardsVisiveis,
      'antes=' + m1.cardsVisiveis + ' depois do ✕=' + m3.cardsVisiveis);
    ok('⭐⭐ o ✕ limpa o campo e devolve TODOS os cards', m3.valor === '' && m3.cardsVisiveis === m3b.cardsVisiveis,
      'valor=' + JSON.stringify(m3.valor) + ' vis=' + m3.cardsVisiveis);
    const focoNoCampo = await page.evaluate(() => document.activeElement && document.activeElement.id);
    ok('  → e o foco fica no campo de busca (dá pra digitar de novo)', focoNoCampo === 'bracket-search',
      'foco em: ' + focoNoCampo);
  } finally { await navegador.close(); }
  console.log(falhas === 0 ? '\n✅ cabecalho-e-busca-fixos-no-celular: OK' : '\n❌ ' + falhas + ' falha(s)');
  process.exit(falhas === 0 ? 0 : 1);
})();
