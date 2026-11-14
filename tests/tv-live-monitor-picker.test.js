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
      window._tvOpenFeatures = [];
      window.open = (_url, _name, features) => { window._tvOpenFeatures.push(features); return null; };
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
    const state = await page.evaluate(() => ({ features:window._tvOpenFeatures, picker:!!document.getElementById('tv-monitor-picker') }));
    assert.equal(state.picker, false);
    assert.match(state.features[0], /left=1440,top=0,width=1920,height=1080,fullscreen/,
      'escolha da segunda tela abre a janela diretamente nas coordenadas do HDMI');
    await page.evaluate(() => {
      window.getScreenDetails = () => Promise.reject(new DOMException('Permissão negada', 'NotAllowedError'));
      window._tvLiveToggle();
    });
    await page.locator('[data-tv-monitor="manual"]').waitFor();
    assert.match(await page.locator('#tv-monitor-picker').innerText(), /permita gerenciar janelas/i);
    await page.locator('[data-tv-monitor="manual"]').click();
    const fallback = await page.evaluate(() => ({ features:window._tvOpenFeatures,
      picker:!!document.getElementById('tv-monitor-picker') }));
    assert.equal(fallback.picker, false);
    assert.match(fallback.features[1], /^popup,width=1024,height=640$/,
      'sem permissão de monitores, a opção manual abre uma janela arrastável');
    console.log('✓ seletor No Ar oferece duas telas e abre a secundária nas coordenadas escolhidas');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
