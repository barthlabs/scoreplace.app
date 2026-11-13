'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.setContent('<iframe id="tv" style="width:1920px;height:1080px;border:0"></iframe>');
    const source = file => path.join(__dirname, '../js/', file);
    for (const file of ['domain/match-day.js', 'domain/match-timing.js', 'domain/team-competition.js', 'tv-layout-core.js']) {
      await page.addScriptTag({ path: source(file) });
    }
    await page.evaluate(() => {
      window._collectAllMatches = t => t.matches;
      window._assignGlobalGameNumbers = () => {};
      window._qrCodeUrl = () => '';
      window._tourLogoSrc = () => '';
      window._personAvatarHtml = () => '<img class="tv-player-photo" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E" alt="">';
    });
    await page.addScriptTag({ path: source('views/tv-live.js') });
    const metrics = await page.evaluate(async () => {
      const layout = window.ScoreplaceTvLayout.defaults();
      Object.assign(layout.sections.courts, { visible: true, x: 0, y: 7, w: 67, h: 89.5 });
      const series = (number, a, b) => ({ number, a, b, scoreA: '', scoreB: '', status: 'active' });
      const pair = ['Adriana Ferreira Leite / Katia de Carvalho Figueiredo', 'Maira Lourenço Cavalcanti / Ana Paula Schmidt'];
      const snapshot = {
        tvLayout: layout, theme: { background: '#000', primary: '#000', secondary: '#fff', title: '#fff' }, name: 'Camis Day',
        courts: Array.from({ length: 8 }, (_, i) => ({ name: 'Quadra ' + (i + 1), number: i * 3 + 1, category: 'Fem Prata',
          phase: 'Classificatória · Grupo F', series: [0, 1, 2].map(j => series(i * 3 + j + 1, pair[0], pair[1])), timerStart: 0 })),
        nextGame: null, rankings: [], results: [], resultDay: '', qrImage: '', scoreplaceLogo: ''
      };
      const frame = document.getElementById('tv');
      frame.srcdoc = window._tvLivePreviewDocument(snapshot);
      await new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
      window._tvFitSeriesNames(frame.contentDocument);
      return [...frame.contentDocument.querySelectorAll('.tv-series-game')].slice(0, 3).map(row => {
        const bounds = row.getBoundingClientRect();
        return { rowTop: bounds.top, rowBottom: bounds.bottom,
          names: [...row.querySelectorAll('.tv-series-players > span')].map(el => {
            const rect = el.getBoundingClientRect();
            const avatar = el.querySelector('.tv-player-photo').getBoundingClientRect();
            return { full: el.title, shown: el.textContent, height: el.clientHeight, scroll: el.scrollHeight,
              top: rect.top, bottom: rect.bottom, avatarX: avatar.x };
          }) };
      });
    });
    assert.equal(metrics.length, 3, 'três jogos da mesma quadra são exibidos');
    assert(metrics.every(row => row.names.every(name => name.scroll <= name.height + 1 &&
      name.top >= row.rowTop && name.bottom <= row.rowBottom)), 'nomes cabem na linha do próprio jogo');
    assert(metrics.every(row => row.names.every(name => name.full)), 'nome completo fica disponível no título');
    assert(metrics.some(row => row.names.some(name => name.shown !== name.full)), 'nomes longos são abreviados');
    for (let side = 0; side < 4; side++) {
      const positions = metrics.map(row => row.names[side].avatarX);
      assert(Math.max(...positions) - Math.min(...positions) < 1, 'avatares ficam alinhados nos três jogos');
    }
    console.log('✓ Camis TV mantém nomes e avatares alinhados nas três linhas');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
