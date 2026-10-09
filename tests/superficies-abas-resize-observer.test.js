/* Regressão de superfície fixa: a janela pode ser larga e o painel da chave
 * estreito (split-screen, sidebar, webview). A busca nunca pode atravessar as
 * abas nem depender de window.innerWidth.
 * node tests/superficies-abas-resize-observer.test.js */
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const css = ['css/style.css', 'css/components.css', 'css/layout.css', 'css/bracket.css', 'css/responsive.css'].map(read).join('\n');
const bracket = read('js/views/bracket.js');
let failed = 0;
function ok(name, condition, extra) {
  if (condition) console.log('  ✓ ' + name);
  else { console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); failed++; }
}

const pageHtml = '<style>' + css + `
  html,body{margin:0;background:#0b0b0e;color:#eee;}
  #view-container{width:400px;min-height:1000px;padding:0;box-sizing:border-box;}
  #fbwrap-chaves{position:sticky;top:0;z-index:30;background:#111114;padding:8px;box-sizing:border-box;}
  #bracket-search{display:block;width:100%;height:44px;box-sizing:border-box;}
  .fixture-card{position:relative;z-index:20;height:170px;margin-top:-12px;background:#452020;padding:28px 12px;box-sizing:border-box;}
  [data-bracket-tabs-root]{position:relative!important;top:auto!important;}
</style><div id="view-container"></div>`;

async function mount(page, hostWidth) {
  await page.evaluate((width) => {
    const view = document.getElementById('view-container');
    view.style.width = width + 'px';
    view.innerHTML = '<div id="fbwrap-chaves"><input id="bracket-search" value="185"></div>' +
      '<div class="fixture-card" data-bracket-tab-category="Feminina Light" data-bracket-tab-gender="fem" data-bracket-tab-round="1">Feminina</div>' +
      '<div class="fixture-card" data-bracket-tab-category="Masculina Light" data-bracket-tab-gender="masc" data-bracket-tab-round="1">Masculina</div>';
    const input = document.getElementById('bracket-search');
    input.__identity = 'canonical-input';
    input.__changes = 0;
    input.addEventListener('input', () => { input.__changes++; });
    window._currentBracketTournament = { id: 'fixture-tabs', format: 'elimination', phases: [] };
    window._bracketCategoryTabsMount();
  }, hostWidth);
  await page.waitForTimeout(80);
}

async function measure(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-bracket-tabs-root]');
    const input = document.getElementById('bracket-search');
    const inline = root && root.querySelector('[data-bracket-search-slot="inline"]');
    const stack = root && root.querySelector('[data-bracket-search-slot="stack"]');
    const primary = root && root.querySelector('[data-bracket-tabs-primary]');
    const card = document.querySelector('.fixture-card');
    const rr = root && root.getBoundingClientRect();
    const sr = stack && stack.getBoundingClientRect();
    const pr = primary && primary.getBoundingClientRect();
    const cr = card && card.getBoundingClientRect();
    const x = rr ? Math.round(rr.left + Math.min(12, Math.max(1, rr.width - 2))) : 0;
    const y = rr ? Math.round(rr.bottom - 2) : 0;
    const topNode = rr ? document.elementFromPoint(x, y) : null;
    return {
      layout: root && root.getAttribute('data-bracket-search-layout'),
      rootWidth: rr && Math.round(rr.width),
      oneInput: document.querySelectorAll('#bracket-search').length,
      identity: input && input.__identity,
      inputParent: input && input.closest('[data-bracket-search-slot]') && input.closest('[data-bracket-search-slot]').getAttribute('data-bracket-search-slot'),
      inlineHidden: inline && inline.hidden,
      stackHidden: stack && stack.hidden,
      primaryBottom: pr && Math.round(pr.bottom),
      stackTop: sr && Math.round(sr.top),
      cardTop: cr && Math.round(cr.top),
      surfaceOnTop: !!(topNode && topNode.closest && topNode.closest('[data-bracket-tabs-root]')),
      observer: !!(root && root._bracketTabsResizeObserver),
      value: input && input.value
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 820 } });
  try {
    await page.route('http://sp-layout.test/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml }));
    await page.goto('http://sp-layout.test/tournament');
    await page.addScriptTag({ content: bracket });

    for (const width of [320, 390, 559, 664, 768, 1024]) {
      await mount(page, width);
      const state = await measure(page);
      const expected = width >= 760 ? 'inline' : 'stack';
      ok(width + 'px: layout decidido pela largura do host', state.layout === expected, JSON.stringify(state));
      ok(width + 'px: existe uma única busca canônica', state.oneInput === 1 && state.identity === 'canonical-input');
      ok(width + 'px: só o slot ativo fica exposto', expected === 'inline'
        ? state.inputParent === 'inline' && !state.inlineHidden && state.stackHidden
        : state.inputParent === 'stack' && state.inlineHidden && !state.stackHidden, JSON.stringify(state));
      ok(width + 'px: busca e abas não se sobrepõem', expected === 'inline' || state.stackTop >= state.primaryBottom, JSON.stringify(state));
      ok(width + 'px: camada fixa vence o card que tenta invadir', state.surfaceOnTop, JSON.stringify(state));
    }

    // A reprodução exata do defeito: viewport desktop, mas painel estreito.
    await mount(page, 400);
    let state = await measure(page);
    ok('viewport 1024 + host 400: não usa a largura da janela', state.layout === 'stack' && state.rootWidth === 400, JSON.stringify(state));
    ok('host conectado usa ResizeObserver', state.observer, JSON.stringify(state));
    await page.evaluate(() => { document.getElementById('view-container').style.width = '1024px'; });
    await page.waitForTimeout(100);
    state = await measure(page);
    ok('resize 400→1024 promove a mesma busca ao slot inline', state.layout === 'inline' && state.identity === 'canonical-input' && state.value === '185', JSON.stringify(state));
    await page.evaluate(() => { document.getElementById('view-container').style.width = '400px'; });
    await page.waitForTimeout(100);
    state = await measure(page);
    ok('resize 1024→400 devolve a mesma busca ao slot seguro', state.layout === 'stack' && state.identity === 'canonical-input' && state.value === '185', JSON.stringify(state));
  } finally {
    await browser.close();
  }
  console.log(failed ? '\n❌ superficies-abas-resize-observer: ' + failed + ' falha(s)' : '\n✅ superficies-abas-resize-observer: OK');
  process.exitCode = failed ? 1 : 0;
})();

