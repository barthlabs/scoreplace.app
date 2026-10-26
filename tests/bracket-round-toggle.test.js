'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const source = fs.readFileSync(path.join(__dirname, '../js/views/bracket.js'), 'utf8');
const toggle = source.slice(source.indexOf('window._toggleBracketRound = function'), source.indexOf('function _bracketEnsureRoundHeadingResizeListener'));
const findTabs = source.slice(source.indexOf('function _bracketFindTabsRoot'), source.indexOf('function _bracketIsEliminationTree'));
const portal = source.slice(source.indexOf('function _bracketUpdateRoundHeadingPortal'), source.indexOf('function _bracketEnsureRoundHeadingResizeListener'));
const primaryTabs = source.slice(source.indexOf('window._bracketPrimaryTabsHtml = function'), source.indexOf('window._bracketCategoryTabsMount = function'));
assert.match(source, /--bracket-round-reveal-top/, 'controle lateral usa base inferior da faixa fixa');
assert.match(source, /class="bracket-previous-phase-button"/, 'fase anterior usa controle lateral vertical como as rodadas');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<div data-bracket-tabs-root></div><div data-bracket-round-reveal-scope><button class="bracket-previous-round-button">Mostrar rodada anterior</button><div class="bracket-round-column" data-round-num="1" data-round-hide-key="r1" data-bracket-round-collapsed="0"><div class="bracket-round-heading"><button data-round-hide-key="r1" aria-expanded="true">Ocultar</button></div><div class="bracket-round-body"><div class="sp-match-card">Jogo 1</div></div></div><div class="bracket-round-column" data-round-num="2" data-round-hide-key="r2" data-bracket-round-collapsed="0"><div class="bracket-round-heading"><button data-round-hide-key="r2" aria-expanded="true">Ocultar</button></div><div class="bracket-round-body"><div class="sp-match-card">Jogo 2</div></div></div></div><div data-bracket-round-heading-portal><button data-round-hide-key="r1">Ocultar</button></div>');
    await page.addScriptTag({ content: 'function _bracketLayoutEliminationTree() {} function _bracketSyncRoundHeadingOffsets() {}\n' + toggle + '\n' + findTabs });
    const state = await page.evaluate(() => {
      const portalButton = document.querySelector('[data-bracket-round-heading-portal] button');
      window._toggleBracketRound(portalButton);
      const column = document.querySelector('.bracket-round-column');
      const body = column.querySelector('.bracket-round-body');
      const hidden = body.style.display === 'none' && column.dataset.bracketRoundCollapsed === '1';
      const label = column.querySelector('button').textContent;
      window._toggleBracketRound(portalButton);
      return { hidden, label, shown: body.style.display !== 'none', expanded: column.querySelector('button').getAttribute('aria-expanded') };
    });
    assert.deepEqual(state, { hidden: true, label: 'Mostrar', shown: true, expanded: 'true' });
    const reopenedAfterRevert = await page.evaluate(() => {
      window._bracketRoundHidden.r1 = true;
      // Um resultado foi desfeito: a rodada não está mais concluída, mas a
      // preferência anterior não pode deixá-la sem o botão de reabertura.
      const html = window._bracketRoundToggleHtml('r1', false, true);
      const column = document.querySelector('.bracket-round-column');
      column.querySelector('.bracket-round-heading').innerHTML = html;
      column.querySelector('.bracket-round-body').style.display = 'none';
      const button = column.querySelector('button');
      window._toggleBracketRound(button);
      return { button: !!button, text: button && button.textContent, visible: column.querySelector('.bracket-round-body').style.display !== 'none' };
    });
    assert.deepEqual(reopenedAfterRevert, { button: true, text: 'Ocultar', visible: true },
      'rodada recolhida ainda pode ser reaberta depois da correção de um resultado');
    const previousRound = await page.evaluate(() => {
      const scope = document.querySelector('[data-bracket-round-reveal-scope]');
      const final = scope.querySelector('.bracket-round-column').cloneNode(true);
      final.setAttribute('data-round-num', '3');
      final.setAttribute('data-round-hide-key', 'r3');
      final.querySelector('button').setAttribute('data-round-hide-key', 'r3');
      scope.appendChild(final);
      const columns = scope.querySelectorAll('.bracket-round-column');
      window._toggleBracketRound(columns[0].querySelector('button'));
      window._toggleBracketRound(columns[1].querySelector('button'));
      window._toggleBracketRound(columns[2].querySelector('button'));
      window._revealBracketPreviousRound(scope.querySelector('.bracket-previous-round-button'));
      const afterFirst = Array.from(columns).map(column => column.dataset.bracketRoundCollapsed);
      window._revealBracketPreviousRound(scope.querySelector('.bracket-previous-round-button'));
      const afterSecond = Array.from(columns).map(column => column.dataset.bracketRoundCollapsed);
      window._revealBracketPreviousRound(scope.querySelector('.bracket-previous-round-button'));
      return { afterFirst, afterSecond, afterThird: Array.from(columns).map(column => column.dataset.bracketRoundCollapsed) };
    });
    assert.deepEqual(previousRound, { afterFirst: ['1', '1', '0'], afterSecond: ['1', '0', '0'], afterThird: ['0', '0', '0'] },
      'controle lateral revela uma rodada anterior por clique');
    await page.setContent('<div id="scope"><nav id="tabs"></nav><div class="bracket-round-reveal-scope" data-bracket-round-reveal-scope><button class="bracket-previous-round-button">Mostrar rodada anterior</button><div class="bracket-round-column"><div class="bracket-round-heading">Rodada 3</div></div></div></div>');
    await page.addStyleTag({ path: path.join(__dirname, '../css/bracket.css') });
    await page.addScriptTag({ content: portal });
    const portalPlacement = await page.evaluate(() => {
      const scope = document.querySelector('#scope');
      const root = document.querySelector('#tabs');
      const heading = scope.querySelector('.bracket-round-heading');
      const column = scope.querySelector('.bracket-round-column');
      const button = scope.querySelector('.bracket-previous-round-button');
      root.getBoundingClientRect = () => ({ top: 100, bottom: 160, left: 20, width: 600 });
      heading.getBoundingClientRect = () => ({ top: 120, height: 30, left: 64, width: 280 });
      column.getBoundingClientRect = () => ({ bottom: 800 });
      _bracketUpdateRoundHeadingPortal(root, scope);
      const visibleTop = Number.parseInt(getComputedStyle(button).top, 10);
      const portalBottom = Number.parseInt(root._bracketRoundHeadingPortal.style.top, 10) + Number.parseInt(root._bracketRoundHeadingPortal.style.height, 10);
      heading.getBoundingClientRect = () => ({ top: 180, height: 30, left: 64, width: 280 });
      _bracketUpdateRoundHeadingPortal(root, scope);
      return { inScope: scope.contains(button), visibleTop, portalBottom,
        hiddenTop: Number.parseInt(getComputedStyle(button).top, 10), hidden: root._bracketRoundHeadingPortal.style.display };
    });
    assert.equal(portalPlacement.inScope && portalPlacement.visibleTop > portalPlacement.portalBottom &&
      portalPlacement.hiddenTop === 168 && portalPlacement.hidden === 'none', true,
    'botão herda o deslocamento abaixo do portal visível e mantém posição válida sem portal');
    assert.match(source, /class="bracket-round-column" data-round-num="\$\{finalRoundNum\}"/, 'a final espelhada informa o número da rodada para o controle lateral');
    const tabs = await page.evaluate(() => {
      const host = document.createElement('div');
      const scope = document.createElement('div');
      host.appendChild(scope);
      document.body.appendChild(host);
      const first = document.createElement('nav');
      first.setAttribute('data-bracket-tabs-root', '1');
      first.setAttribute('data-tournament-id', 'confra');
      host.appendChild(first);
      const duplicate = first.cloneNode();
      host.appendChild(duplicate);
      const reused = _bracketFindTabsRoot(host, scope, 'confra');
      return { reused: reused === first, count: host.querySelectorAll('[data-bracket-tabs-root]').length };
    });
    assert.deepEqual(tabs, { reused: true, count: 1 }, 'a busca/remontagem reutiliza as abas fora do trilho e remove duplicatas');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.setContent('<div id="tabs-fixture" style="width:100%;box-sizing:border-box;padding:0 8px"></div>');
    await page.addStyleTag({ path: path.join(__dirname, '../css/bracket.css') });
    await page.addScriptTag({ content: primaryTabs });
    const narrow = await page.evaluate(() => {
      document.querySelector('#tabs-fixture').innerHTML = window._bracketPrimaryTabsHtml(
        '<button data-bracket-primary-tab style="min-width:132px;padding:10px 24px">Feminina</button><button data-bracket-primary-tab style="min-width:132px;padding:10px 24px">Masculina</button>',
        '<div class="bracket-presentation-switch"><button>Condensado</button><button>Expandido</button></div>');
      const row = document.querySelector('[data-bracket-tabs-primary]');
      const rail = document.querySelector('[data-bracket-main-tabs]');
      const switcher = document.querySelector('[data-bracket-presentation-tabs]');
      return { switchFits: switcher.getBoundingClientRect().right <= document.documentElement.clientWidth,
        rowFits: row.getBoundingClientRect().right <= document.documentElement.clientWidth,
        touchHeight: switcher.querySelector('button').getBoundingClientRect().height,
        railWidth: rail.getBoundingClientRect().width,
        tabWidth: rail.querySelector('button').getBoundingClientRect().width };
    });
    assert.equal(narrow.switchFits && narrow.rowFits && narrow.touchHeight >= 44 && narrow.railWidth >= 120 && narrow.tabWidth >= 56, true,
      'em 320 px o seletor e as abas ficam acessíveis na mesma linha, com toque de 44 px');
    assert.match(source, /roundMatches\.every\(function \(m\) \{ return !!m\.winner; \}\)/, 'multifase considera a disputa de 3º lugar para concluir a rodada');
    assert.match(source, /root\.innerHTML = window\._bracketPrimaryTabsHtml\(genderHtml, presentationTabs\)/, 'a tela usa o mesmo layout medido no teste');
    console.log('bracket-round-toggle: OK');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
