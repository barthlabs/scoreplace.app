'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const root = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/views/bracket-ui.js'), 'utf8');
const tree = bracket.slice(bracket.indexOf('function _bracketIsEliminationTree'), bracket.indexOf('// A régua fixa de rodadas'));
const zoom = ui.slice(ui.indexOf('window._applyBracketZoom = function'), ui.indexOf('window._togglePrevRoundsBlock = function'));

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 700 } });
    await page.setContent('<style>body{margin:0}.bracket-columns-track{display:flex;gap:60px;align-items:flex-start;width:max-content}.bracket-round-column{width:260px;display:flex;flex-direction:column;gap:20px}.sp-match-card{height:80px;background:#192335;border:1px solid #556;box-sizing:border-box}</style>' +
      '<div id="view-container"><div data-bracket-tabs-root><div class="bracket-scroll-container" style="width:900px;overflow:auto"><div class="bracket-columns-track">' +
      '<div class="bracket-round-column"><div id="card-a" class="sp-match-card"></div><div id="card-b" class="sp-match-card"></div><div id="card-c" class="sp-match-card"></div><div id="card-d" class="sp-match-card"></div></div>' +
      '<div class="bracket-round-column"><div id="card-semi1" class="sp-match-card"></div><div id="card-semi2" class="sp-match-card"></div></div>' +
      '<div class="bracket-round-column"><div id="card-final" class="sp-match-card"></div></div></div></div></div>' +
      '<input id="bracket-zoom-slider" type="range" min="1" max="800"><span id="bracket-zoom-label"></span></div>');
    await page.addScriptTag({ content: tree + '\n' + zoom });
    const startsCondensed = await page.evaluate(() => {
      window._bracketZoom = 1;
      window._currentBracketTournament = { phases: [{ kind: 'elimination' }], matches: [
        { id: 'a', nextMatchId: 'semi1', nextSlot: 'p1' },
        { id: 'b', nextMatchId: 'semi1', nextSlot: 'p2' },
        { id: 'c', nextMatchId: 'semi2', nextSlot: 'p1' },
        { id: 'd', nextMatchId: 'semi2', nextSlot: 'p2' },
        { id: 'semi1', nextMatchId: 'final', nextSlot: 'p1' },
        { id: 'semi2', nextMatchId: 'final', nextSlot: 'p2' },
        { id: 'unrelated', nextMatchId: 'final' }
      ] };
      _bracketLayoutEliminationTree(document.querySelector('[data-bracket-tabs-root]'));
      const condensed = !document.querySelector('svg[data-bracket-tree-lines]');
      window._setBracketPresentation('chaves');
      return condensed;
    });
    assert.ok(startsCondensed, 'a eliminatória inicia condensada até o usuário escolher Expandido');
    await page.waitForSelector('svg[data-bracket-tree-lines] path:nth-child(6)');
    const result = await page.evaluate(() => {
      const paths = [...document.querySelectorAll('svg[data-bracket-tree-lines] path')];
      const edges = paths.map(p => p.dataset.sourceMatch + '>' + p.dataset.targetMatch);
      const semi1 = document.getElementById('card-semi1').getBoundingClientRect();
      const a = document.getElementById('card-a').getBoundingClientRect();
      const b = document.getElementById('card-b').getBoundingClientRect();
      window._applyBracketZoom(.05);
      return { edges, semi1Y: semi1.top + semi1.height / 2, sourcesY: (a.top + a.height / 2 + b.top + b.height / 2) / 2,
        label: document.getElementById('bracket-zoom-label').textContent,
        transform: document.querySelector('.bracket-columns-track').style.transform };
    });
    assert.deepEqual(result.edges.sort(), ['a>semi1', 'b>semi1', 'c>semi2', 'd>semi2', 'semi1>final', 'semi2>final'].sort(), 'somente as seis arestas reais são desenhadas');
    assert.ok(Math.abs(result.semi1Y - result.sourcesY) < 2, 'semifinal acompanha os dois jogos de origem, não a ordem visual dos cartões');
    assert.equal(result.label, '5%');
    assert.equal(result.transform, 'scale(0.05)');
    await page.evaluate(() => window._setBracketZoom(null, -1));
    assert.equal(await page.locator('#bracket-zoom-label').textContent(), '1%', 'zoom out permite mostrar chaves grandes inteiras');
    await page.evaluate(() => window._resetBracketZoom());
    assert.equal(await page.locator('#bracket-zoom-label').textContent(), '100%');
    const gestures = await page.evaluate(() => {
      const wrapper = document.querySelector('.bracket-scroll-container');
      const ordinaryWheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100, clientX: 200 });
      wrapper.dispatchEvent(ordinaryWheel);
      const unchanged = window._bracketZoom;
      const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -500, clientX: 200 });
      wrapper.dispatchEvent(wheel);
      const desktopZoom = window._bracketZoom;
      const touch = (x) => new Touch({ identifier: x, target: wrapper, clientX: x, clientY: 100 });
      wrapper.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(100), touch(200)] }));
      const pinchOut = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(75), touch(225)] });
      wrapper.dispatchEvent(pinchOut);
      const openedZoom = window._bracketZoom;
      const pinchIn = new TouchEvent('touchmove', { bubbles: true, cancelable: true, touches: [touch(125), touch(175)] });
      wrapper.dispatchEvent(pinchIn);
      const closedZoom = window._bracketZoom;
      window._applyBracketZoom(20);
      return { unchanged, desktopZoom, openedZoom, closedZoom: openedZoom > closedZoom,
        wheelCanceled: wheel.defaultPrevented, pinchCanceled: pinchOut.defaultPrevented,
        maxZoom: window._bracketZoom, spacer: !!wrapper.querySelector('.bracket-zoom-spacer'),
        scrollWidth: wrapper.scrollWidth, expectedWidth: wrapper.querySelector('.bracket-columns-track').scrollWidth * 8 };
    });
    assert.equal(gestures.unchanged, 1, 'rolagem comum não altera zoom');
    assert.ok(gestures.desktopZoom > 1.5 && gestures.wheelCanceled, 'Ctrl+rolagem amplia além de 150%');
    assert.ok(gestures.openedZoom > gestures.desktopZoom && gestures.closedZoom && gestures.pinchCanceled, 'pinça abre e fecha o zoom: ' + JSON.stringify(gestures));
    assert.equal(gestures.maxZoom, 8, 'limite é 800%');
    assert.ok(gestures.spacer, 'largura ampliada continua rolável');
    assert.ok(gestures.scrollWidth >= gestures.expectedWidth - 1, 'é possível rolar até o fim da chave ampliada');
    await page.evaluate(() => window._resetBracketZoom());
    await page.evaluate(() => {
      window._currentBracketTournament.matches.find(m => m.id === 'a').nextMatchId = 'semi2';
      window._currentBracketTournament.matches.find(m => m.id === 'c').nextMatchId = 'semi1';
      _bracketLayoutEliminationTree(document.querySelector('[data-bracket-tabs-root]'));
    });
    await page.waitForFunction(() => !!document.querySelector('path[data-source-match="a"][data-target-match="semi2"]'));
    assert.equal(await page.locator('path[data-source-match="a"][data-target-match="semi1"]').count(), 0,
      'trocar a origem altera o conector, mesmo sem mudar a posição dos cartões');
    await page.evaluate(() => window._setBracketPresentation('jogos'));
    assert.equal(await page.locator('svg[data-bracket-tree-lines]').count(), 0, 'Jogos remove os conectores sem recriar os cards');
    assert.equal(await page.locator('[data-bracket-tree-margin]').count(), 0, 'Jogos devolve os cards à posição compacta');
    await page.evaluate(() => window._setBracketPresentation('chaves'));
    await page.waitForFunction(() => !!document.querySelector('path[data-source-match="a"][data-target-match="semi2"]'));
    assert.equal(await page.locator('.sp-match-card').count(), 7, 'alternar de volta preserva os jogos');
    await page.evaluate(() => {
      window._currentBracketTournament.phases = [{ kind: 'group' }, { kind: 'elimination' }];
      window._currentBracketTournament.currentPhaseIndex = 0;
      document.querySelector('.bracket-columns-track').setAttribute('data-bracket-phase-index', '1');
      _bracketLayoutEliminationTree(document.querySelector('[data-bracket-tabs-root]'));
    });
    await page.waitForFunction(() => !!document.querySelector('path[data-source-match="a"][data-target-match="semi2"]'));
    assert.equal(await page.locator('svg[data-bracket-tree-lines] path').count(), 6,
      'a eliminatória consultada mantém os conectores mesmo quando a fase atual é de grupos');
    await page.evaluate(() => window._currentBracketTournament.phases[1].kind = 'classification');
    await page.evaluate(() => _bracketLayoutEliminationTree(document.querySelector('[data-bracket-tabs-root]')));
    await page.waitForFunction(() => !document.querySelector('svg[data-bracket-tree-lines]'));
    assert.equal(await page.locator('svg[data-bracket-tree-lines]').count(), 0, 'fase não eliminatória não desenha conectores');
    await page.evaluate(() => { window._currentBracketTournament.phases[0].kind = 'classification'; _bracketLayoutEliminationTree(document.querySelector('[data-bracket-tabs-root]')); });
    assert.equal(await page.locator('svg[data-bracket-tree-lines]').count(), 0, 'a classificatória não mostra conectores');
    const groupZoom = await page.evaluate(() => {
      const wrapper = document.querySelector('.bracket-scroll-container');
      window._applyBracketZoom(1);
      wrapper.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, metaKey: true, deltaY: 100, clientX: 200 }));
      return window._bracketZoom;
    });
    assert.ok(groupZoom < 1, 'a classificatória também aceita zoom out');
    const zoomFocus = await page.evaluate(() => {
      const wrapper = document.querySelector('.bracket-scroll-container');
      const content = wrapper.querySelector('.bracket-columns-track');
      document.body.style.paddingTop = '1000px';
      document.body.style.paddingBottom = '1200px';
      content.style.minHeight = '900px';
      window._applyBracketZoom(.5);
      window.scrollTo(0, 940);
      const beforeRect = content.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      const centerY = (Math.max(0, wrapperRect.top) + Math.min(window.innerHeight, wrapperRect.bottom)) / 2;
      const logicalY = (centerY - beforeRect.top) / .5;
      window._applyBracketZoom(1);
      const afterRect = content.getBoundingClientRect();
      return { before: centerY, after: afterRect.top + logicalY, scrollTop: window.scrollY };
    });
    assert.ok(Math.abs(zoomFocus.before - zoomFocus.after) < 3,
      'ampliar após reduzir mantém o ponto central da chave no mesmo lugar: ' + JSON.stringify(zoomFocus));
    console.log('bracket-tree-zoom: OK');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
