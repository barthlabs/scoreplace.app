'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.evaluate(() => {
      window.ScoreplaceMatchDay = { matchDay() {}, timestamp() {}, localDay() {}, eventZone() {} };
      window._currentBracketTournament = { id:'other-format', name:'Outro torneio' };
      window._collectAllMatches = () => [];
      window._tvFullscreenRequests = [];
      Element.prototype.requestFullscreen = function (options) {
        window._tvFullscreenRequests.push({ tag:this.tagName, name:this.name, screen:options && options.screen || null });
        document.fullscreenElement = this;
        return Promise.resolve();
      };
      window.getScreenDetails = () => Promise.resolve({ screens:[
        { label:'MacBook', isPrimary:true, left:0, top:0, availLeft:0, availTop:0, width:1440, height:900, availWidth:1440, availHeight:900 },
        { label:'HDMI', isPrimary:false, left:1440, top:0, availLeft:1440, availTop:0, width:1920, height:1080, availWidth:1920, availHeight:1080 }
      ] });
    });
    await page.addScriptTag({ content:fs.readFileSync(path.join(__dirname, '../js/views/tv-live.js'), 'utf8') });
    await page.evaluate(() => window._tvLiveToggle());
    await page.locator('[data-tv-monitor="1"]').waitFor();
    assert.match(await page.locator('#tv-monitor-picker').innerText(), /Tela principal[\s\S]*MacBook[\s\S]*Tela secundária[\s\S]*HDMI/);
    await page.locator('[data-tv-monitor="1"]').click();
    const state = await page.evaluate(() => ({ requests:window._tvFullscreenRequests,
      frame:document.querySelector('iframe[name^="scoreplace-live-tv-"]'), picker:!!document.getElementById('tv-monitor-picker') }));
    assert.equal(state.picker, false);
    assert.ok(state.frame, 'a TV ocupa o detalhe existente, sem abrir uma segunda janela');
    assert.equal(state.requests[0].tag, 'IFRAME');
    assert.equal(state.requests[0].screen.label, 'HDMI',
      'escolha da segunda tela pede fullscreen no monitor selecionado');
    await page.evaluate(() => window._tvLiveToggle());
    await page.evaluate(() => {
      window.getScreenDetails = () => Promise.reject(new DOMException('Permissão negada', 'NotAllowedError'));
      window._tvLiveToggle();
    });
    await page.locator('[data-tv-monitor="manual"]').waitFor();
    assert.match(await page.locator('#tv-monitor-picker').innerText(), /permita gerenciar janelas/i);
    await page.locator('[data-tv-monitor="manual"]').click();
    const fallback = await page.evaluate(() => ({ requests:window._tvFullscreenRequests,
      frame:document.querySelector('iframe[name^="scoreplace-live-tv-"]'),
      picker:!!document.getElementById('tv-monitor-picker') }));
    assert.equal(fallback.picker, false);
    assert.ok(fallback.frame, 'a opção manual também abre a TV no navegador atual');
    assert.equal(fallback.requests.length, 2);
    assert.equal(fallback.requests[1].screen, null,
      'sem permissão de monitores, a TV pede fullscreen na tela atual');
    console.log('✓ seletor No Ar abre fullscreen na tela escolhida ou na tela atual');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
