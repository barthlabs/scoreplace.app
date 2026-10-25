'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="form"><details id="tv-personalization"><summary>Personalização</summary><div id="tv-layout-editor"></div></details><div id="visibility">Visibilidade</div><div id="fase1-box">Formato</div></div>');
    await page.addScriptTag({ path: path.join(__dirname, '../js/tv-layout-core.js') });
    await page.addScriptTag({ path: path.join(__dirname, '../js/views/tv-layout-editor.js') });
    await page.waitForSelector('[data-tv-canvas]', { state: 'attached' });
    assert.equal(await page.evaluate(() => document.getElementById('fase1-box').previousElementSibling.id), 'tv-personalization');
    assert.equal(await page.evaluate(() => document.getElementById('tv-personalization').open), false);
    await page.evaluate(() => { document.getElementById('tv-personalization').open = true; });
    await page.locator('[data-tv-visible="qr"]').uncheck();
    await page.locator('[data-tv-card="score"]').uncheck();
    await page.locator('[data-tv-background]').fill('#112233');
    const before = await page.evaluate(() => window._tvEditorReadLayout().sections.upcoming.x);
    await page.locator('[data-tv-box="upcoming"]').scrollIntoViewIfNeeded();
    const box = await page.locator('[data-tv-box="upcoming"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 5);
    await page.mouse.up();
    const layout = await page.evaluate(() => window._tvEditorReadLayout());
    assert.ok(layout.sections.upcoming.x > before, 'arrastar deve alterar a posição');
    assert.equal(layout.background, '#112233');
    assert.equal(layout.sections.qr.visible, false);
    assert.equal(layout.card.score, false);
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
    console.log('✓ editor TV: painel fechado, posição, opções e restauração');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
