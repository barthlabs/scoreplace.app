'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = ['css/style.css', 'css/layout.css', 'css/components.css', 'css/responsive.css']
  .map(read).join('\n');

// A estrutura mínima reproduz a ordem real de _renderPage (cabeçalho fixo,
// título no fluxo, busca sticky), mas as regras de layout e _reflowChrome vêm
// dos arquivos de produção. Não substitui uma validação autenticada da rota.
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<style>' + css + '</style></head><body><div class="app-container"><main class="main-content">' +
  '<div class="topbar"><span>scoreplace.app</span><span>☰</span></div>' +
  '<div id="view-container" class="view-container">' +
  '<div class="sticky-back-header er-analysis-back-header" style="display:flex;align-items:center;gap:12px">' +
  '<button>Voltar</button><strong>Análise de Inscritos</strong></div>' +
  '<div class="er-analysis-title" style="max-width:100%;margin:0 auto;padding:10px 1.25rem 0">' +
  '<div style="margin-bottom:14px">NEON NIGHTMARE – THE TOURNAMENT</div></div>' +
  '<div id="fbwrap-analise" class="er-analysis-filter" style="position:sticky;top:calc(var(--topbar-h) + var(--backheader-h));height:54px">' +
  '<input placeholder="Buscar" aria-label="Buscar"></div>' +
  '<div style="min-height:2600px">Conteúdo da análise</div></div></main></div></body></html>';

function within(value, low, high) { return value >= low && value <= high; }
function geometryIsValid(m) {
  // _reflowChrome busca 8px de respiro para o título e põe o back-header
  // 1px sobre a topbar para selar frestas de subpixel. ±2px toleram o
  // arredondamento do Chromium sem aceitar um vão visualmente relevante.
  return within(m.titleTop - m.headerBottom, 6, 10) &&
    within(m.headerTop - m.topbarBottom, -2, 1) &&
    m.searchTop >= m.titleBottom - 1;
}

async function measure(page) {
  return page.evaluate(() => {
    const topbar = document.querySelector('.topbar').getBoundingClientRect();
    const header = document.querySelector('.er-analysis-back-header').getBoundingClientRect();
    const title = document.querySelector('.er-analysis-title').getBoundingClientRect();
    const search = document.querySelector('#fbwrap-analise').getBoundingClientRect();
    const scroll = document.scrollingElement.scrollTop;
    return {
      topbarBottom: topbar.bottom,
      headerTop: header.top,
      headerBottom: header.bottom,
      titleTop: title.top,
      titleDocumentTop: title.top + scroll,
      searchTop: search.top,
      titleBottom: title.bottom,
      margin: getComputedStyle(document.querySelector('.er-analysis-title')).marginTop,
      scroll,
    };
  });
}

async function run() {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 500, 900]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.route('http://sp.geometry/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
      await page.goto('http://sp.geometry/analise');
      await page.addScriptTag({ content: read('js/store.js') });
      const loaded = await page.evaluate(() => typeof window._reflowChrome === 'function');
      if (!loaded) throw new Error(width + 'px: _reflowChrome não foi carregada de store.js');
      await page.evaluate(() => window._reflowChrome());
      const start = await measure(page);
      await page.evaluate(() => window.scrollTo(0, 550));
      await page.evaluate(() => { for (let i = 0; i < 6; i++) { if (typeof window._reflowChrome === 'function') window._reflowChrome(); } });
      const scrolled = await measure(page);
      if (!geometryIsValid(start))
        throw new Error(width + 'px: cromo sobreposto ou lacuna indevida: ' + JSON.stringify(start));
      if (!within(scrolled.titleDocumentTop - start.titleDocumentTop, -2, 2))
        throw new Error(width + 'px: título mudou de posição no documento após rolagem');
      if (!within(scrolled.searchTop - scrolled.headerBottom, -2, 2))
        throw new Error(width + 'px: busca não grudou no cabeçalho após rolagem');
      // Prova de sensibilidade: uma margem defeituosa de +120px deve ser rejeitada
      // pelo mesmo contrato de geometria, não apenas por inspeção textual.
      await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.er-analysis-title').style.setProperty('margin-top', '120px', 'important'); });
      const broken = await measure(page);
      if (geometryIsValid(broken))
        throw new Error(width + 'px: o teste não detectou o espaço vazio simulado');
      console.log('✓ Análise ' + width + 'px: topo, rolagem e defeito simulado detectado');
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
