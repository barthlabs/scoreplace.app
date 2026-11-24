'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ channel:'chromium' });
  try {
    const context = await browser.newContext({ viewport:null });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const origin = 'https://tv.example.test';
    const { targetInfo } = await cdp.send('Target.getTargetInfo');
    const permission = { permission:{ name:'window-management' }, origin, browserContextId:targetInfo.browserContextId };
    const { screenInfo } = await cdp.send('Emulation.addScreen', { left:1600, top:0, width:1280, height:720, label:'HDMI virtual' });
    await cdp.send('Browser.setPermission', { ...permission, setting:'granted' });
    await context.route(origin + '/**', route => route.request().resourceType() === 'script'
      ? route.fulfill({ path:'js/domain/match-timing.js', contentType:'application/javascript' })
      : route.fulfill({ contentType:'text/html', body:'<button id="tv">No ar</button>' }));
    await page.goto(origin);
    await page.evaluate(() => {
      window.ScoreplaceMatchDay = { matchDay() {}, timestamp() {}, localDay() {}, eventZone() {} };
      window._currentBracketTournament = { id:'other-format', name:'Outro torneio' };
      window._collectAllMatches = () => [];
      document.querySelector('#tv').onclick = () => window._tvLiveToggle();
    });
    await page.addScriptTag({ path:'js/views/tv-live.js' });
    async function openTv() {
      const popup = page.waitForEvent('popup');
      await page.locator('#tv').click();
      return popup;
    }
    const tv = await openTv();
    await tv.getByRole('button', { name:/HDMI virtual/ }).click();
    await tv.waitForFunction(async () => document.fullscreenElement === document.documentElement &&
      (await getScreenDetails()).currentScreen.label === 'HDMI virtual');
    assert.equal(await tv.title(), 'TV · Outro torneio');
    assert.equal(await tv.locator('#tv-monitor-picker').count(), 0);
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    assert.equal(new URL(page.url()).pathname, '/');
    await tv.close();
    await cdp.send('Emulation.removeScreen', { screenId:screenInfo.id });
    const hotplug = await openTv();
    await hotplug.getByRole('button', { name:'Detectar novamente' }).waitFor();
    assert.equal(await hotplug.locator('[data-tv-monitor="1"]').count(), 0);
    await cdp.send('Emulation.addScreen', { left:1600, top:0, width:1280, height:720, label:'Projetor' });
    await hotplug.getByRole('button', { name:'Detectar novamente' }).click();
    await hotplug.getByRole('button', { name:/Projetor/ }).waitFor();
    await hotplug.close();
    await cdp.send('Browser.setPermission', { ...permission, setting:'denied' });
    const manual = await openTv();
    await manual.locator('[data-tv-monitor="manual"]').click();
    await manual.waitForFunction(() => document.fullscreenElement === document.documentElement);
    assert.equal(await page.evaluate(() => !!document.fullscreenElement), false);
    await manual.close();
    const cancelled = await openTv();
    const closed = cancelled.waitForEvent('close');
    await cancelled.locator('[data-tv-monitor="cancel"]').click();
    await closed;
    assert.equal(await page.locator('#tv').isVisible(), true);
    console.log('✓ TV em fullscreen real no HDMI virtual e na tela manual, com controle independente');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
