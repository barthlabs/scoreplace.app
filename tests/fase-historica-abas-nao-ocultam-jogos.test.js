'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const src = fs.readFileSync(path.join(__dirname, '../js/views/bracket.js'), 'utf8');
function real(start, end) {
  const a = src.indexOf(start), b = src.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'trecho real encontrado: ' + start);
  return src.slice(a, b);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="view-container">' +
      '<nav data-bracket-tabs-root="1" data-tournament-id="fixture" data-bracket-line-tabs="1" data-bracket-round-tabs="0">' +
        '<button data-bracket-primary-tab="gold">Ouro</button><button data-bracket-primary-tab="silver">Prata</button>' +
      '</nav>' +
      '<section data-bracket-historical-phase="0"><div data-group-box="1" data-monarch-group="1">' +
        '<h3>Grupo A</h3><table><tbody><tr><td>1º</td></tr></tbody></table>' +
        '<article id="historico-1" class="sp-match-card" data-bracket-tab-category="" data-players="Ana Bia Carla Dora">Ana / Bia 6 × 3 Carla / Dora</article>' +
        '<article id="historico-2" class="sp-match-card" data-bracket-tab-category="" data-players="Ana Carla Bia Dora">Ana / Carla 6 × 4 Bia / Dora</article>' +
        '<article id="historico-3" class="sp-match-card" data-bracket-tab-category="" data-players="Ana Dora Bia Carla">Ana / Dora 7 × 5 Bia / Carla</article>' +
      '</div></section>' +
      '<section data-line-section="gold"><article id="atual-ouro" class="sp-match-card" data-bracket-tab-category="gold" data-bracket-tab-gender="linhas"></article></section>' +
      '<section data-line-section="silver"><article id="atual-prata" class="sp-match-card" data-bracket-tab-category="silver" data-bracket-tab-gender="linhas"></article></section>' +
    '</main>');
    await page.addScriptTag({ content: real('function _bracketOperationalCards(', '\nfunction _bracketAgendaCompare(') });
    await page.addScriptTag({ content: 'function _bracketLineSection(card) { return card.closest("[data-line-section]"); }\n' +
      'function _bracketGeneralView() { return false; }\nfunction _bracketSyncEmptyScheduledPhase() {}\n' +
      'function _bracketTabsRefreshRoundRail() {}\nfunction _bracketLayoutEliminationTree() {}\n' +
      real('function _bracketTabsApply(', '\nfunction _bracketSyncRoundHeadingOffsets(') });
    const result = await page.evaluate(() => {
      const root = document.querySelector('[data-bracket-tabs-root]');
      root._bracketCardsScope = document.getElementById('view-container');
      root._bracketTabsScope = document.getElementById('view-container');
      const snapshot = () => ({
        history: [1, 2, 3].map(n => {
          const card = document.getElementById('historico-' + n);
          return !card.hidden && card.getClientRects().length > 0;
        }),
        gold: !document.getElementById('atual-ouro').hidden,
        silver: !document.getElementById('atual-prata').hidden,
        group: document.querySelector('[data-bracket-historical-phase] h3').textContent,
        score: document.getElementById('historico-3').textContent
      });
      _bracketTabsApply('fixture', 'linhas', 'silver', '');
      const silver = snapshot();
      _bracketTabsApply('fixture', 'linhas', 'gold', '');
      const gold = snapshot();
      return { silver, gold, operationalCount: _bracketOperationalCards(root, root._bracketTabsScope).length };
    });
    assert.deepEqual(result.silver.history, [true, true, true], 'Prata não oculta os três placares históricos');
    assert.deepEqual(result.gold.history, [true, true, true], 'Ouro não oculta os três placares históricos');
    assert.equal(result.silver.silver && !result.silver.gold && result.gold.gold && !result.gold.silver, true,
      'abas ainda governam somente os jogos da fase atual');
    assert.equal(result.operationalCount, 2, 'agenda e abas operacionais ignoram jogos históricos');
    assert.equal(result.silver.group, 'Grupo A');
    assert.match(result.silver.score, /7 × 5 Bia \/ Carla/);
    console.log('fase-historica-abas-nao-ocultam-jogos: ok');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
