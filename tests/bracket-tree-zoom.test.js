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
      '<input id="bracket-zoom-slider" type="range" min="5" max="150"><span id="bracket-zoom-label"></span></div>');
    await page.addScriptTag({ content: tree + '\n' + zoom });
    await page.evaluate(() => {
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
    });
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
    assert.equal(await page.locator('#bracket-zoom-label').textContent(), '5%', 'zoom out respeita o limite mínimo');
    await page.evaluate(() => window._resetBracketZoom());
    assert.equal(await page.locator('#bracket-zoom-label').textContent(), '100%');
    await page.evaluate(() => {
      window._currentBracketTournament.matches.find(m => m.id === 'a').nextMatchId = 'semi2';
      window._currentBracketTournament.matches.find(m => m.id === 'c').nextMatchId = 'semi1';
      _bracketLayoutEliminationTree(document.querySelector('[data-bracket-tabs-root]'));
    });
    await page.waitForFunction(() => !!document.querySelector('path[data-source-match="a"][data-target-match="semi2"]'));
    assert.equal(await page.locator('path[data-source-match="a"][data-target-match="semi1"]').count(), 0,
      'trocar a origem altera o conector, mesmo sem mudar a posição dos cartões');
    await page.evaluate(() => { window._currentBracketTournament.phases[0].kind = 'classification'; _bracketLayoutEliminationTree(document.querySelector('[data-bracket-tabs-root]')); });
    assert.equal(await page.locator('svg[data-bracket-tree-lines]').count(), 0, 'a classificatória não mostra conectores');
    console.log('bracket-tree-zoom: OK');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
