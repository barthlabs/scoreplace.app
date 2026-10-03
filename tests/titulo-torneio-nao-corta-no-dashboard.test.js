'use strict';
/* Regressão real do card da dashboard (03/out/2026): o CSS usa !important no
 * teto tipográfico. O encolhedor precisa vencê-lo, ou "TOURNAMENT" é cortado
 * mesmo depois de o JS marcar o título como ajustado. Este teste mede os rects
 * das linhas renderizadas na geometria do card, não só o texto-fonte. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const responsive = fs.readFileSync(path.join(ROOT, 'css/responsive.css'), 'utf8');
const start = store.indexOf('window._fitTournamentTitles = function(root, force) {');
const end = store.indexOf('// Largura do card muda', start);
assert.ok(start >= 0 && end > start, 'motor canônico de título localizado');
const fitter = store.slice(start, end);

(async function () {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 740, height: 720 } });
  // A pessoa pode aumentar a escala tipográfica do app. Foi nessa condição que
  // a palavra final estourou no card real: o teto em rem cresce, o slot não.
  await page.setContent('<style>html{font-size:26px}' + responsive + '</style>' +
    '<section style="width:550px;overflow:hidden">' +
      '<div style="display:flex;align-items:flex-start;gap:14px">' +
        '<div style="width:33%;min-width:80px;flex-shrink:0;aspect-ratio:1"></div>' +
        '<div class="sp-tournament-title-slot" style="flex:1;min-width:0;display:flex;flex-direction:column">' +
          '<div style="display:flex;align-items:flex-start;gap:6px">' +
            '<h4 id="title" class="tournament-card-title" style="margin:0;font-weight:800;color:white;flex:1;min-width:0">NEON NIGHTMARE – THE TOURNAMENT</h4>' +
            '<span style="font-size:1.4rem;flex-shrink:0;line-height:1">♡</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</section>');
  await page.evaluate((source) => { eval(source); window._fitTournamentTitles(document, true); }, fitter);
  const metric = await page.evaluate(() => {
    const el = document.getElementById('title');
    const box = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = Array.from(range.getClientRects()).filter(r => r.width > 0);
    return {
      size: parseFloat(getComputedStyle(el).fontSize),
      right: box.right,
      lines: lines.map(r => ({ left: r.left, right: r.right, width: r.width }))
    };
  });
  await browser.close();
  assert.ok(metric.lines.length >= 2, 'título longo quebra entre palavras');
  assert.ok(metric.lines.every(line => line.right <= metric.right + 0.5),
    'nenhuma linha, inclusive TOURNAMENT, ultrapassa a caixa do título: ' + JSON.stringify(metric));
  assert.ok(metric.size < 58.5, 'o motor reduz a fonte quando o maior vocábulo não cabe no teto: ' + metric.size);
  console.log('✅ título longo da dashboard cabe inteiro no slot real (' + metric.size + 'px)');
})().catch(err => { console.error(err); process.exit(1); });
