'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    // A popup runs in its own JS realm, so instrument requestFullscreen there too.
    await context.addInitScript(() => {
      Element.prototype.requestFullscreen = function (options) {
        window._tvFullscreenRequests = (window._tvFullscreenRequests || []).concat([
          { tag:this.tagName, screen:options && options.screen || null }
        ]);
        return Promise.resolve();
      };
    });
    const page = await context.newPage();
    await page.goto('about:blank');
    await page.evaluate(() => {
      window.ScoreplaceMatchDay = { matchDay() {}, timestamp() {}, localDay() {}, eventZone() {} };
      window._currentBracketTournament = { id:'other-format', name:'Outro torneio' };
      window._collectAllMatches = () => [];
      window.__openRequests = [];
      const open = window.open.bind(window);
      window.open = (url, name, features) => {
        window.__openRequests.push({ url, name, features });
        return open(url, name, features);
      };
      Element.prototype.requestFullscreen = function (options) {
        window._tvFullscreenRequests = (window._tvFullscreenRequests || []).concat([
          { tag:this.tagName, screen:options && options.screen || null }
        ]);
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

    const popupPromise = page.waitForEvent('popup');
    await page.locator('[data-tv-monitor="1"]').click();
    const popup = await popupPromise;
    await popup.locator('#tv-root').waitFor();
    const state = await page.evaluate(() => ({
      open:window.__openRequests.at(-1),
      picker:!!document.getElementById('tv-monitor-picker'), fullscreen:!!document.fullscreenElement,
      control:!!document.body
    }));
    assert.equal(state.picker, false);
    assert.equal(state.fullscreen, false, 'abrir a TV não põe a tela de controle em tela cheia');
    assert.ok(state.control, 'a tela de controle continua aberta na janela original');
    assert.match(state.open.features, /left=1440/);
    assert.match(state.open.features, /width=1920/);
    assert.match(state.open.features, /height=1080/);
    const tvRequests = await popup.evaluate(() => window._tvFullscreenRequests || []);
    assert.equal(tvRequests[0].screen.label, 'HDMI', 'a TV tenta fullscreen no monitor escolhido');
    assert.equal(await popup.title(), 'TV · Outro torneio');
    assert.equal(await popup.locator('#tv-root').count(), 1, 'a transmissão vive em uma janela independente');

    const closePromise = popup.waitForEvent('close');
    await page.evaluate(() => window._tvLiveToggle());
    await closePromise;
    await page.evaluate(() => {
      window.getScreenDetails = () => Promise.reject(new DOMException('Permissão negada', 'NotAllowedError'));
      window._tvLiveToggle();
    });
    await page.locator('[data-tv-monitor="manual"]').waitFor();
    assert.match(await page.locator('#tv-monitor-picker').innerText(), /permita gerenciar janelas/i);
    const fallbackPromise = page.waitForEvent('popup');
    await page.locator('[data-tv-monitor="manual"]').click();
    const fallbackPopup = await fallbackPromise;
    await fallbackPopup.locator('#tv-root').waitFor();
    const fallback = await page.evaluate(() => ({
      open:window.__openRequests.at(-1),
      picker:!!document.getElementById('tv-monitor-picker'), fullscreen:!!document.fullscreenElement
    }));
    assert.equal(fallback.picker, false);
    assert.equal(fallback.fullscreen, false, 'fallback também preserva o controle');
    assert.match(fallback.open.features, /left=0/);
    const fallbackRequests = await fallbackPopup.evaluate(() => window._tvFullscreenRequests || []);
    assert.equal(fallbackRequests[0].screen, null, 'sem permissão, a TV tenta fullscreen na tela atual');
    await page.evaluate(() => window._tvLiveToggle());
    await fallbackPopup.waitForEvent('close');
    console.log('✓ TV abre em janela independente, posicionada no monitor, sem deslocar o controle');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
