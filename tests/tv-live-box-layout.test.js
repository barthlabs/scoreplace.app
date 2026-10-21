const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

(async () => {
  const capture = path.join(os.tmpdir(), `scoreplace-tv-${process.pid}.html`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'tv-live-snapshot.test.js')], {
      env: { ...process.env, SP_TV_CAPTURE: capture }, stdio: 'pipe'
    });
    const html = fs.readFileSync(capture, 'utf8').replace(/<script src="[^"]*match-timing[^>]*><\/script>/, '');
    const browser = await chromium.launch();
    try {
      for (const viewport of [{ width: 2048, height: 1152 }, { width: 1440, height: 900 }]) {
        const page = await browser.newPage({ viewport });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent(html);
        await page.evaluate(() => {
          document.querySelectorAll('.tv-team-tag,.tv-result-team').forEach(el => { el.textContent = 'BLACKOUT'; });
          document.querySelectorAll('.tv-upcoming .tv-result-players span').forEach(el => {
            el.textContent = 'Alessandra Feltrini Massa';
          });
          window.__tvFitLabels();
        });
        assert.deepEqual(errors, [], 'script da janela NO AR não falha no navegador');
        const measurement = await page.evaluate(() => {
          const inside = (el, parent) => {
            const a = el.getBoundingClientRect(), b = parent.getBoundingClientRect();
            return a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && a.left >= b.left - 1 && a.right <= b.right + 1;
          };
          return {
            labels: [...document.querySelectorAll('.tv-side .tv-team-tag,.tv-result-side .tv-result-team')]
              .filter(el => !inside(el, el.closest('.tv-side,.tv-result-side')) || el.scrollHeight > el.clientHeight + 1)
              .map(el => ({ text:el.textContent, kind:el.className, height:el.clientHeight, scroll:el.scrollHeight,
                parent:el.closest('.tv-side,.tv-result-side').clientHeight })),
            scores: [...document.querySelectorAll('.tv-side .tv-score')]
              .every(el => inside(el, el.closest('.tv-side'))),
            players: [...document.querySelectorAll('.tv-upcoming .tv-result-players')]
              .every(el => inside(el, el.closest('.tv-result-side'))),
            upcomingFont: parseFloat(getComputedStyle(document.querySelector('.tv-upcoming .tv-result-players span')).fontSize)
          };
        });
        assert.equal(measurement.labels.length, 0, `etiquetas dos times ficam nos boxes em ${viewport.width}px: ${JSON.stringify(measurement.labels)}`);
        assert(measurement.scores, `placares ficam nos boxes em ${viewport.width}px`);
        assert(measurement.players, `atletas do próximo jogo ficam nos boxes em ${viewport.width}px`);
        assert(measurement.upcomingFont >= 10, 'nomes do próximo jogo seguem legíveis');
        await page.close();
      }
    } finally { await browser.close(); }
    console.log('✓ TV: etiquetas, placares e próximo jogo contidos nos boxes');
  } finally { try { fs.unlinkSync(capture); } catch (_) {} }
})().catch(error => { console.error(error); process.exitCode = 1; });
