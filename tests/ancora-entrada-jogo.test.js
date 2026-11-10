'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
const start = src.indexOf('function _applyMyMatchesFilter()');
const end = src.indexOf('// ── v1.8.99: ÂNCORA POR GRUPO', start);
assert(start >= 0 && end > start);

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route('http://anchor.test/', route => route.fulfill({ contentType: 'text/html', body:
      '<html><body style="margin:0"><div id="card-a" style="position:fixed;top:0">A</div><div id="card-b">B</div></body></html>' }));
    await page.goto('http://anchor.test/');
    await page.addScriptTag({ content: `
      window.calls = [];
      function _medirLarguraUtilDaChave() {}
      function _alvoDeEntrada(id) { return document.getElementById('card-' + (id || sessionStorage.getItem('sp_scrollToMatch'))); }
      function _bracketEntryHorizontalGap() { return 0; }
      window._bracketOperationalRootForCard = () => null;
      Element.prototype.scrollIntoView = function (opts) {
        window.calls.push({ id: this.id, behavior: opts.behavior });
        this.style.position = 'fixed'; this.style.top = '0px';
      };
      ${src.slice(start, end)}
    ` });
    await page.evaluate(() => {
      sessionStorage.setItem('sp_scrollToMatch', 'a');
      window._bracketPendingScroll = 'torneio';
      _applyMyMatchesFilter();
    });
    await page.waitForTimeout(850);
    const ready = await page.evaluate(() => window._bracketEntryAnchor && window._bracketEntryAnchor.ready);
    assert.equal(ready, true, 'entrada inicial assentou antes do reparo');
    const late = await page.evaluate(async () => {
      sessionStorage.removeItem('sp_scrollToMatch');
      document.getElementById('card-a').remove();
      const replacement = document.createElement('div');
      replacement.id = 'card-a'; replacement.textContent = 'A reconstruído';
      replacement.style.marginTop = '500px'; document.body.appendChild(replacement);
      const before = window.calls.length;
      _applyMyMatchesFilter();
      await new Promise(requestAnimationFrame);
      return window.calls.slice(before);
    });
    assert.equal(late.at(-1).id, 'card-a', 'render tardio mantém o jogo explicitamente pedido');
    assert.equal(late.at(-1).behavior, 'auto');
    const cancelled = await page.evaluate(async () => {
      window.dispatchEvent(new WheelEvent('wheel'));
      const before = window.calls.length;
      _applyMyMatchesFilter();
      await new Promise(requestAnimationFrame);
      return { after: window.calls.length, before, anchor: window._bracketEntryAnchor,
        pending: sessionStorage.getItem('sp_scrollToMatch'), suppressed: window._suppressSoftRefresh };
    });
    assert.equal(cancelled.after, cancelled.before, 'interação manual impede novo reposicionamento');
    assert.equal(cancelled.anchor, null);
    assert.equal(cancelled.pending, null, 'interação manual limpa a intenção temporária');
    assert.equal(cancelled.suppressed, false, 'interação manual libera o refresh');
    const switched = await page.evaluate(async () => {
      sessionStorage.setItem('sp_scrollToMatch', 'a');
      window._bracketPendingScroll = 'torneio'; _applyMyMatchesFilter();
      const old = window._bracketEntryAnchor;
      sessionStorage.setItem('sp_scrollToMatch', 'b');
      window._bracketPendingScroll = 'torneio'; _applyMyMatchesFilter();
      const current = window._bracketEntryAnchor;
      old.cancel();
      return { distinct: old !== current, currentActive: current.active,
        globalIsCurrent: window._bracketEntryAnchor === current,
        pending: sessionStorage.getItem('sp_scrollToMatch') };
    });
    assert.deepEqual(switched, { distinct: true, currentActive: true, globalIsCurrent: true, pending: 'b' },
      'entrada anterior não cancela a nova nem apaga seu pedido');
    await page.waitForTimeout(7100);
    const afterOriginalTimer = await page.evaluate(async () => {
      sessionStorage.removeItem('sp_scrollToMatch');
      document.getElementById('card-b').remove();
      const replacement = document.createElement('div');
      replacement.id = 'card-b'; replacement.textContent = 'B reconstruído';
      replacement.style.marginTop = '700px'; document.body.appendChild(replacement);
      const before = window.calls.length;
      _applyMyMatchesFilter();
      await new Promise(requestAnimationFrame);
      return { calls: window.calls.slice(before), active: !!window._bracketEntryAnchor?.active };
    });
    assert.equal(afterOriginalTimer.active, true);
    assert.equal(afterOriginalTimer.calls.at(-1).id, 'card-b',
      'o jogo B continua ancorado após o timer original de 6,8 segundos');
    console.log('✓ ancora-entrada-jogo: render tardio, interação e troca A→B');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
