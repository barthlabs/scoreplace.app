'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
const tournamentsSrc = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments.js'), 'utf8');
const detailFocusStart = tournamentsSrc.indexOf('window._focusTournamentMatchWhenReady = function(');
const detailFocusEnd = tournamentsSrc.indexOf('// A entrada genérica da dashboard', detailFocusStart);
assert(detailFocusStart >= 0 && detailFocusEnd > detailFocusStart);
assert(tournamentsSrc.includes('{ behavior: \'auto\', reaffirm: true }'),
  'o detalhe do torneio precisa ativar a reafirmação depois de renderBracket');
const start = src.indexOf('function _applyMyMatchesFilter()');
const end = src.indexOf('// ── v1.8.99: ÂNCORA POR GRUPO', start);
assert(start >= 0 && end > start);
const geometryStart = src.indexOf('function _scrollBracketEntryMatchToTop(');
const geometryEnd = src.indexOf('function _bracketGeneralView(', geometryStart);
assert(geometryStart >= 0 && geometryEnd > geometryStart);

(async () => {
  const browser = await chromium.launch();
  try {
    const geometryPage = await browser.newPage({ viewport: { width: 1200, height: 693 } });
    await geometryPage.route('http://anchor.test/geometry', route => route.fulfill({ contentType: 'text/html', body: `<style>
      body { margin: 0; height: 3000px; }
      #before { height: 900px; }
      .bracket-scroll-container { height: 610px; overflow: auto; }
      #card-a { margin-top: 62px; height: 399px; scroll-margin-top: 137px; }
    </style><div id="before"></div><div class="bracket-scroll-container"><div id="card-a">JOGO</div><div style="height:300px"></div></div>` }));
    await geometryPage.goto('http://anchor.test/geometry');
    await geometryPage.addScriptTag({ content: `
      function _medirLarguraUtilDaChave() {}
      function _alvoDeEntrada(id) { return document.getElementById('card-' + id); }
      function _bracketEntryHorizontalGap() { return 0; }
      window._bracketOperationalRootForCard = () => null;
      ${src.slice(geometryStart, geometryEnd)}
      ${src.slice(start, end)}
    ` });
    // Geometria medida no Chrome do Confra: janela interna a y=245, card a
    // y=308 (399 px de altura) numa viewport de 693 px. Há rolagem interna,
    // mas o card solicitado está no começo dela (scrollTop=0).
    await geometryPage.evaluate(() => window.scrollTo(0, 655));
    const before = await geometryPage.evaluate(() => ({
      top: document.getElementById('card-a').getBoundingClientRect().top,
      bottom: document.getElementById('card-a').getBoundingClientRect().bottom,
      innerScroll: document.querySelector('.bracket-scroll-container').scrollTop,
      scrollHeight: document.querySelector('.bracket-scroll-container').scrollHeight,
      clientHeight: document.querySelector('.bracket-scroll-container').clientHeight
    }));
    assert.ok(Math.abs(before.top - 307) < 2 && before.bottom > 693,
      'reproduz o card parcialmente cortado visto no Chrome');
    assert.ok(before.scrollHeight > before.clientHeight, 'a chave tem rolagem vertical interna');
    assert.equal(before.innerScroll, 0, 'o jogo está no início da janela interna');
    // No Chrome servido, scrollIntoView do card deixou a janela da página em
    // y=308: a janela interna recebeu a tentativa de alinhamento. Reproduzimos
    // esse resultado para que o teste falhe se o fluxo voltar a depender dela.
    await geometryPage.evaluate(() => {
      document.getElementById('card-a').scrollIntoView = function () {
        document.querySelector('.bracket-scroll-container').scrollTop = 0;
      };
      window._newEntryScroll = _scrollBracketEntryMatchToTop;
      _scrollBracketEntryMatchToTop = (card, behavior) =>
        card.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
      sessionStorage.setItem('sp_scrollToMatch', 'a');
      window._bracketPendingScroll = 'fixture';
      _applyMyMatchesFilter();
    });
    await geometryPage.waitForTimeout(850);
    const legacyBottom = await geometryPage.evaluate(() => {
      const card = document.getElementById('card-a');
      const bottom = card.getBoundingClientRect().bottom;
      window._bracketEntryToken.cancel();
      _scrollBracketEntryMatchToTop = window._newEntryScroll;
      window.scrollTo(0, 655);
      return bottom;
    });
    assert.ok(legacyBottom > 693, 'controle com scrollIntoView deixa o rodapé cortado');
    await geometryPage.evaluate(() => {
      sessionStorage.setItem('sp_scrollToMatch', 'a');
      window._bracketPendingScroll = 'fixture';
      _applyMyMatchesFilter();
    });
    await geometryPage.waitForTimeout(850);
    const geometry = await geometryPage.evaluate(() => {
      const card = document.getElementById('card-a');
      const scroller = card.closest('.bracket-scroll-container');
      return { top: card.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom,
        viewport: innerHeight, innerScroll: scroller.scrollTop };
    });
    assert.ok(Math.abs(geometry.top - 137) < 2, 'jogo explícito alinhado ao topo livre da página');
    assert.ok(geometry.bottom <= geometry.viewport, 'card inteiro visível na janela de 693 px');
    assert.equal(geometry.innerScroll, 0, 'sem mover a rolagem vertical interna da chave');
    await geometryPage.addScriptTag({ content: tournamentsSrc.slice(detailFocusStart, detailFocusEnd) });
    await geometryPage.evaluate(() => {
      window._bracketEntryToken?.cancel();
      window.scrollTo(0, 655);
      window._travaRolagemDaChave = true;
      window._focusTournamentMatchWhenReady('fixture', 'a', { behavior: 'auto', reaffirm: true });
    });
    await geometryPage.waitForTimeout(180);
    await geometryPage.evaluate(() => { window._travaRolagemDaChave = false; });
    await geometryPage.waitForTimeout(500);
    const detailFocus = await geometryPage.evaluate(() => {
      const card = document.getElementById('card-a');
      return { top: card.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom };
    });
    assert.ok(Math.abs(detailFocus.top - 137) < 2 && detailFocus.bottom <= 693,
      'a entrada do detalhe aguarda o destravamento e mostra o card inteiro');
    await geometryPage.close();
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
      function _scrollBracketEntryMatchToTop(target, behavior) {
        window.calls.push({ id: target.id, behavior });
        target.style.position = 'fixed'; target.style.top = '0px';
      }
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
