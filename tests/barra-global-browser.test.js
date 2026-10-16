'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.route('http://sp.teste/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><div id="view-container"></div></body></html>' }));
    await page.goto('http://sp.teste/bracket');
    await page.addScriptTag({ content: read('js/store.js') });
    await page.addScriptTag({ content: read('js/views/bracket.js') });
    const result = await page.evaluate(async () => {
      const t = { id: 'teste-barra-global', skillCategories: ['Light', 'Power'], participants: [
        { order: 2, name: 'Bruno', uid: 'u2' }, { order: 1, name: 'Ana', uid: 'u1' }
      ] };
      document.getElementById('view-container').innerHTML = window._bracketBar(t, true) +
        '<div id="inline-bracket-container">' +
        '<div id="game-1" data-players="Ana" data-player-uids="u1" data-bracket-tab-category="Fem Light" data-bracket-tab-gender="fem"></div>' +
        '<div id="game-2" data-players="Bruno" data-player-uids="u2" data-bracket-tab-category="Masc Power" data-bracket-tab-gender="masc"></div></div>';
      await new Promise(resolve => setTimeout(resolve, 10));
      const index = document.querySelector('#bracket-competitor-index [data-bracket-index-list]');
      const initial = [...index.querySelectorAll('button')].map(b => b.textContent);
      window._fbAction('chaves', 'sort', 'name-desc');
      const descending = [...index.querySelectorAll('button')].map(b => b.textContent);
      window._fbAction('chaves', 'gender', 'Fem');
      window._fbAction('chaves', 'skill', 'Light');
      const filtered = [document.getElementById('game-1').style.display, document.getElementById('game-2').style.display];
      const controls = ['fbwrap-chaves','bracket-search','bracket-sort','bracket-gender','bracket-skill','bracket-competitor-index']
        .map(id => document.querySelectorAll('#' + id).length);
      return { initial, descending, filtered, controls,
        sticky: getComputedStyle(document.getElementById('fbwrap-chaves')).position,
        indexVisible: [...index.querySelectorAll('button')].map(b => b.textContent) };
    });
    assert.deepEqual(result.initial, ['Ana', 'Bruno']);
    assert.deepEqual(result.descending, ['Bruno', 'Ana']);
    assert.deepEqual(result.filtered, ['', 'none']);
    assert.deepEqual(result.controls, [1, 1, 1, 1, 1, 1]);
    assert.equal(result.sticky, 'sticky');
    assert.deepEqual(result.indexVisible, ['Ana']);
    console.log('✅ barra-global-browser: índice, filtro e sticky em viewport móvel');
  } finally { await browser.close(); }
})().catch((err) => { console.error(err); process.exit(1); });
