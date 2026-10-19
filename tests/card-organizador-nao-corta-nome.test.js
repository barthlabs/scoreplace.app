'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const tournaments = read('js/views/tournaments.js');
const start = tournaments.indexOf('function _buildOrgCard(');
const end = tournaments.indexOf('\n        }', start);
assert.ok(start >= 0 && end > start, 'renderizador do card encontrado');
const cardSource = tournaments.slice(start, end + '\n        }'.length);
const store = read('js/store.js');
const fitEnd = store.indexOf('window._fitNameToBox = _fitOne;');
const fitSource = store.slice(store.lastIndexOf('\n(function() {', fitEnd), store.indexOf('\n})();', fitEnd) + 6);

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [340, 280]) {
      const page = await browser.newPage({ viewport: { width: width + 30, height: 400 } });
      await page.setContent('<style>' + read('css/components.css') + '</style><main style="width:' + width + 'px"></main>');
      const geometry = await page.evaluate(({ cardSource, fitSource }) => {
        window._safeHtml = (value) => String(value);
        window._personAvatarHtml = () => '<span style="display:block;width:2rem;height:2rem;flex-shrink:0"></span>';
        window._personNameHtml = (_, name, style, cls, attrs) => '<span class="' + cls + '" style="' + style + '"' + attrs + '>' + name + '</span>';
        eval('var _t = { id: "test" };' + cardSource + '; window._testOrgCard = _buildOrgCard;');
        const names = ['Carolina Oliveira', 'Alexandre Albuquerque', 'Fernando de Figueiredo'];
        document.querySelector('main').innerHTML = names.map((name) => window._testOrgCard(name, 'Co-organizador(a)', 'background:#201d31;', true, 'test', false, 'uid', '', '')).join('');
        eval(fitSource);
        document.querySelectorAll('.sp-org-card').forEach((card) => card.style.marginBottom = '8px');
        window._fitNames(document, 0);
        return [...document.querySelectorAll('.sp-org-card')].map((card) => {
          const box = card.querySelector('.sp-org-name-box');
          const name = box.querySelector('.sp-name-fit');
          const label = box.parentElement.nextElementSibling;
          const c = card.getBoundingClientRect(), n = name.getBoundingClientRect(), l = label.getBoundingClientRect();
          return { name: name.textContent, cardHeight: c.height,
            nameVisible: n.top >= c.top - 1 && n.bottom <= c.bottom + 1,
            labelVisible: l.top >= n.bottom - 1 && l.bottom <= c.bottom + 1,
            boxFits: name.scrollHeight <= box.clientHeight + 1 };
        });
      }, { cardSource, fitSource });
      assert.equal(geometry.length, 3);
      for (const card of geometry) {
        assert.ok(card.cardHeight >= 76, `card ${card.name} tem altura suficiente em ${width}px`);
        assert.ok(card.nameVisible && card.labelVisible && card.boxFits,
          `nome e papel visíveis no card ${card.name} em ${width}px: ${JSON.stringify(card)}`);
      }
      await page.close();
    }
    console.log('✅ cards de organização sem corte em 340px e 280px');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
