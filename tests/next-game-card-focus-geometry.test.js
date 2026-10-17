'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const bracket = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
const focusCode = bracket.slice(bracket.indexOf('function _bracketFocusOperationalCard(root, card, behavior) {'), bracket.indexOf('// A chave de fases usa um scroller HORIZONTAL', bracket.indexOf('function _bracketFocusOperationalCard(root, card, behavior) {')));
const goMine = bracket.slice(bracket.indexOf('    var _goMine = function (behavior) {'), bracket.indexOf('    setTimeout(function () { _goMine', bracket.indexOf('    var _goMine = function (behavior) {')));
const reaffirm = bracket.slice(bracket.indexOf('    var _reafirmar = function () {'), bracket.indexOf('    _reafirmar();', bracket.indexOf('    var _reafirmar = function () {')));

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 800 } });
    await page.setContent('<!doctype html><style>body{margin:0;height:3000px}nav{position:fixed;top:0;left:0;right:0;height:190px;background:#111}main{margin-top:800px}.bracket-round-heading{height:38px}.sp-match-card{height:320px;background:#222}</style><nav data-bracket-tabs-root="1" data-tournament-id="confra"></nav><main id="phase"><div class="bracket-round-column"><h3 class="bracket-round-heading">Quartas de Final</h3><article id="card-j195" class="sp-match-card">Jogo 195</article></div></main>');
    await page.addScriptTag({ content: 'window._bracketEntryHorizontalGap = function(){return 0}; function _bracketEntryHorizontalGap(){return 0}; function _bracketSyncRoundHeadingOffsets(){};' + focusCode });
    const result = await page.evaluate(() => {
      const root = document.querySelector('nav');
      const card = document.getElementById('card-j195');
      root._bracketTabsScope = document.getElementById('phase');
      const found = window._bracketOperationalRootForCard(card, 'confra');
      const safeTop = window._bracketOperationalSafeTop(found, card);
      window._bracketFocusOperationalCard(found, card, 'auto');
      return { found: found === root, safeTop, top: card.getBoundingClientRect().top,
        headingBottom: root.getBoundingClientRect().bottom };
    });
    assert.equal(result.found, true, 'card de fase pertence ao root operacional');
    assert.ok(result.top >= result.headingBottom + 12, 'o cabeçalho do card não fica sob as abas');
    assert.ok(Math.abs(result.top - result.safeTop) <= 2, 'foco pousa na mesma geometria da reafirmação');
    assert.match(goMine, /_bracketOperationalRootForCard\(_target\)/);
    assert.match(reaffirm, /_bracketOperationalSafeTop\(_operationalRoot, _el\)/);
    console.log('✅ Jogo 195: topo integral sob as abas e mesma régua na reafirmação');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
