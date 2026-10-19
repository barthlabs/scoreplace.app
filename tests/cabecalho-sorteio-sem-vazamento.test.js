'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-draw.js'), 'utf8');
const sectionStyle = (source.match(/overlay\.innerHTML = '<section[^']*?style="([^"]+)"/) || [])[1];
const headerStyle = (source.match(/'<div style="([^"]+)"><div><h2 id="team-draw-review-title"/) || [])[1];
const scrollStyle = (source.match(/'<div data-team-draw-scroll style="([^"]+)"/) || [])[1];
assert.ok(sectionStyle && headerStyle && scrollStyle, 'estrutura real do modal encontrada');

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 780]) {
      const page = await browser.newPage({ viewport:{ width, height:700 } });
      await page.setContent('<body style="margin:0"><div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">' +
        '<section id="dialog" style="' + sectionStyle + '"><div id="header" style="' + headerStyle + '">' +
        '<div><h2 id="team-draw-review-title">🎲 Configurar sorteio</h2><span>128 participantes · 64 duplas · 6 categorias · 8 times</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:8px"><button id="back">← Voltar</button><button id="draw">🎲 Sortear times e confrontos</button></div></div>' +
        '<div id="scroll" data-team-draw-scroll style="' + scrollStyle + '">' +
        '<div id="colored" style="height:1800px;background:linear-gradient(blue,red)">Conteúdo rolável</div></div></section></div></body>');
      const geometry = await page.evaluate(() => {
        const dialog = document.getElementById('dialog');
        const header = document.getElementById('header');
        const scroll = document.getElementById('scroll');
        scroll.scrollTop = 500;
        const d = dialog.getBoundingClientRect(), h = header.getBoundingClientRect(), s = scroll.getBoundingClientRect();
        const hit = document.elementFromPoint(h.left + 10, h.top + 5);
        return { scrollTop:scroll.scrollTop, headerAboveBody:h.bottom <= s.top + 1,
          headerInsideDialog:h.top >= d.top && h.bottom <= d.bottom,
          topCovered:hit === header || header.contains(hit),
          buttonsVisible:['back','draw'].every(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= h.top && r.bottom <= h.bottom; }) };
      });
      assert.ok(geometry.scrollTop > 0 && geometry.headerAboveBody && geometry.headerInsideDialog &&
        geometry.topCovered && geometry.buttonsVisible, `sem vazamento e com ações visíveis em ${width}px: ${JSON.stringify(geometry)}`);
      await page.close();
    }
    console.log('✅ cabeçalho do sorteio sem vazamento em 390px e 780px');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
