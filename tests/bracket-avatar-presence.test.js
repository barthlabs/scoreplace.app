'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = source.indexOf('if (!window._bracketPresenceClickInstalled');
const end = source.indexOf('/* ── LINHA DE TEMPO DO JOGO', start);
assert(start > 0 && end > start);

(async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [320, 375]) {
      const page = await browser.newPage({ viewport: { width, height: 700 } });
      await page.setContent('<div class="sp-mc-side"><span class="team">TIME</span><button type="button" data-bracket-presence-action data-presence-tid="T" data-presence-uid="u2" data-presence-name="Pessoa" aria-label="Marcar presença de Pessoa"><img class="sp-av" alt="Pessoa"></button><span class="name">Pessoa</span></div>');
      await page.addStyleTag({ path: 'css/bracket.css' });
      await page.addScriptTag({ content: source.slice(start, end) });
      const result = await page.evaluate(async () => {
        const t = { id: 'T', checkedIn: {} };
        window.AppStore = { currentUser: { uid: 'ref' } };
        window._findTournamentById = () => t;
        window._isUserAuthority = (_t, u) => u.uid === 'ref';
        window._idMapHas = (_t, map, who) => !!map[who.uid || who];
        window._applyCheckInToggle = async (tid, name, uid) => { window.calls = (window.calls || 0) + 1; t.checkedIn[uid] = true; return true; };
        window._bracketOperationsRefresh = () => {};
        document.querySelector('button').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        const button = document.querySelector('button');
        const dot = document.querySelector('[data-bracket-presence-dot]');
        return { calls: window.calls, label: button.getAttribute('aria-label'), dot: dot && dot.title,
          between: dot && dot.nextElementSibling === button,
          width: document.querySelector('.sp-mc-side').getBoundingClientRect().width };
      });
      assert.equal(result.calls, 1);
      assert.equal(result.label, 'Remover presença de Pessoa');
      assert.equal(result.dot, 'Presente');
      assert(result.between && result.width <= width);
      await page.close();
    }
    console.log('✓ foto marca presença após recibo, com indicador entre time e foto em 320/375px');
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
