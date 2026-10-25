'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
    await page.setContent('<div id="form"><details id="tv-personalization"><summary>Personalização</summary><div id="tv-layout-editor"></div></details><div id="visibility">Visibilidade</div><div id="fase1-box">Formato</div></div>');
    const source = file => path.join(__dirname, '../js/', file);
    await page.addScriptTag({ path: source('domain/match-day.js') });
    await page.addScriptTag({ path: source('domain/match-timing.js') });
    await page.addScriptTag({ path: source('domain/team-competition.js') });
    await page.addScriptTag({ path: source('tv-layout-core.js') });
    await page.evaluate(() => {
      window._collectAllMatches = t => t.matches;
      window._assignGlobalGameNumbers = t => t.matches.forEach(m => { m._gameNum = 49; });
      window.ScoreplaceNextMatch = { knownSide: () => true, firstAvailable: () => null };
      window._dashboardNextMatchCompare = () => 0;
      window._qrCodeUrl = () => 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
      window._editingTournament = {
        id: 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44',
        name: 'TORNEIO REAL DA PRÉVIA',
        _nJogos: 1,
        courtNames: ['Quadra 4'],
        matches: [{
          id: 'jogo-1', court: 'Quadra 4', category: 'Fem Light',
          scheduledAt: '2026-10-25T12:00:00Z', resultAt: '2026-10-25T12:30:00Z',
          p1: 'Ana / Bia', p2: 'Clara / Dora', scoreP1: 6, scoreP2: 3, winner: 'p1'
        }]
      };
    });
    await page.addScriptTag({ path: source('views/tv-live.js') });
    assert.equal(await page.evaluate(() => typeof window._tvLivePreviewDocument), 'function');
    await page.addScriptTag({ path: source('views/tv-layout-editor.js') });
    await page.waitForSelector('[data-tv-frame]', { state: 'attached' });
    await page.waitForFunction(() => {
      const frame = document.querySelector('[data-tv-frame]');
      return frame && frame.contentDocument && frame.contentDocument.querySelector('.tv-custom-board');
    });
    assert.equal(await page.evaluate(() => document.getElementById('fase1-box').previousElementSibling.id), 'tv-personalization');
    assert.equal(await page.evaluate(() => document.getElementById('tv-personalization').open), false);
    await page.evaluate(() => { document.getElementById('tv-personalization').open = true; });
    assert.equal(await page.locator('[data-tv-value]').count(), 0);
    assert.equal(await page.locator('[data-tv-visible]').count(), 0);
    const preview = await page.evaluate(() => document.querySelector('[data-tv-frame]').contentDocument.body.textContent);
    assert.match(preview, /TORNEIO REAL DA PRÉVIA/);
    assert.match(preview, /Ana/);
    assert.match(preview, /6/);
    assert.equal(await page.evaluate(() => Object.hasOwn(window._editingTournament.matches[0], '_gameNum')), false,
      'montar a prévia não deixa _gameNum no objeto salvo pelo formulário');
    await page.locator('[data-tv-remove="qr"]').click();
    assert.equal(await page.locator('[data-tv-box="qr"]').count(), 0);
    assert.equal(await page.locator('[data-tv-restore="qr"]').count(), 1);
    assert.equal(await page.evaluate(() => window._tvEditorReadLayout().sections.qr.visible), false);
    await page.locator('[data-tv-restore="qr"]').click();
    assert.equal(await page.locator('[data-tv-box="qr"]').count(), 1);
    await page.locator('[data-tv-card="score"]').uncheck();
    await page.locator('[data-tv-background]').fill('#112233');
    const before = await page.evaluate(() => window._tvEditorReadLayout().sections.upcoming.x);
    await page.locator('[data-tv-box="upcoming"]').scrollIntoViewIfNeeded();
    const box = await page.locator('[data-tv-box="upcoming"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 5);
    await page.mouse.up();
    let layout = await page.evaluate(() => window._tvEditorReadLayout());
    assert.ok(layout.sections.upcoming.x > before, 'arrastar altera a posição');
    assert.equal(layout.background, '#112233');
    assert.equal(layout.card.score, false);
    const innerX = await page.evaluate(() => document.querySelector('[data-tv-frame]').contentDocument.querySelector('.tv-custom-upcoming').style.left);
    assert.equal(innerX, layout.sections.upcoming.x + '%', 'a seção real acompanha o arraste');
    const handle = await page.locator('[data-tv-resize="courts"]').boundingBox();
    const widthBefore = layout.sections.courts.w;
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 35, handle.y + handle.height / 2);
    await page.mouse.up();
    layout = await page.evaluate(() => window._tvEditorReadLayout());
    assert.ok(layout.sections.courts.w > widthBefore, 'redimensionar altera a largura');
    const innerWidth = await page.evaluate(() => document.querySelector('[data-tv-frame]').contentDocument.querySelector('.tv-custom-courts').style.width);
    assert.equal(innerWidth, layout.sections.courts.w + '%', 'os dados reais refluem com o novo tamanho');
    await page.locator('[data-tv-default]').click();
    assert.equal(await page.evaluate(() => window._tvEditorReadLayout().sections.qr.visible), true);
    await page.evaluate(() => {
      document.getElementById('form').innerHTML = '<details id="tv-personalization"><summary>Personalização</summary><div id="tv-layout-editor"></div></details><div id="fase1-box">Formato</div>';
      const next = window.ScoreplaceTvLayout.defaults();
      next.background = '#445566';
      window._tvEditorSetLayout(next);
    });
    await page.waitForSelector('[data-tv-background][value="#445566"]', { state: 'attached' });
    assert.equal(await page.evaluate(() => window._tvEditorReadLayout().background), '#445566');
    console.log('✓ editor TV: dados reais, remoção/restauração, arraste e estado intacto');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
