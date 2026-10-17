'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const root = path.join(__dirname, '..');
const bracket = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const tournaments = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
const sourceCode = bracket.slice(bracket.indexOf('window._directBracketSlotSource = function'), bracket.indexOf('// Competições por times', bracket.indexOf('window._directBracketSlotSource = function')));
const navigationCode = tournaments.slice(tournaments.indexOf('window._goToBracketSourceMatch = function'), tournaments.indexOf('// Um destino de chave', tournaments.indexOf('window._goToBracketSourceMatch = function')));

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body><div id="card-parent" onclick="window.parentClicks++"></div><div id="bracket"></div></body>');
    await page.addScriptTag({ content: `window._safeHtml = ${function(value) { return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }.toString()};` });
    await page.addScriptTag({ content: sourceCode });
    await page.addScriptTag({ content: navigationCode });
    const initial = await page.evaluate(() => {
      const source = { id: 'src&"<', _gameNum: 186, nextMatchId: 'j195', nextSlot: 'p2', bracket: 'silver', round: 4 };
      const destination = { id: 'j195', p2: 'TBD' };
      const t = { id: 'confra', matches: [source, destination] };
      window._currentBracketTournament = t;
      window._collectAllMatches = x => x.matches;
      window._findTournamentById = () => t;
      window.parentClicks = 0;
      window.routeCalls = [];
      window._goToTournamentMatch = (...args) => window.routeCalls.push(args);
      const html = window._directBracketSlotLinkHtml(t, destination, 'p2');
      document.getElementById('card-parent').innerHTML = html;
      document.getElementById('bracket').innerHTML = html;
      const link = document.querySelector('.sp-source-match-link');
      return { label: window._directBracketSlotLabel(t, destination, 'p2'),
        attr: link.dataset.sourceMatchId, html,
        noEdge: window._directBracketSlotLinkHtml(t, { id: 'unknown' }, 'p2'),
        bestLoser: window._directBracketSlotLinkHtml(t, { ...destination, p2AguardaMelhor: true }, 'p2') };
    });
    assert.equal(initial.label, 'Vencedor do jogo 186');
    assert.equal(initial.attr, 'src&"<');
    assert.match(initial.html, /src&amp;&quot;&lt;/);
    assert.equal(initial.noEdge, '');
    assert.equal(initial.bestLoser, '');
    await page.locator('#card-parent .sp-source-match-link').click();
    const fromDashboard = await page.evaluate(() => ({ routeCalls: window.routeCalls, parentClicks: window.parentClicks }));
    assert.equal(fromDashboard.parentClicks, 0, 'o onclick inline do card pai não dispara');
    assert.deepEqual(fromDashboard.routeCalls[0], ['confra', 'src&"<', { category: 'silver', gender: 'linhas', round: '4' }]);

    await page.evaluate(() => {
      location.hash = '#tournaments/confra';
      window.tabCalls = [];
      window.focusCalls = [];
      window._bracketSelectCategoryTab = (...args) => window.tabCalls.push(args);
      window._focusTournamentMatchWhenReady = (...args) => window.focusCalls.push(args);
      const card = document.createElement('article');
      card.id = 'card-src&"<';
      card.textContent = 'Jogo 186';
      document.body.appendChild(card);
    });
    await page.locator('#bracket .sp-source-match-link').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    const fromBracket = await page.evaluate(() => ({ tabs: window.tabCalls, focus: window.focusCalls }));
    assert.deepEqual(fromBracket.tabs[0], ['confra', 'linhas', 'silver', '4']);
    assert.equal(fromBracket.focus[0][1], 'src&"<');
    assert.equal(fromBracket.focus[1][1], 'src&"<', 'Espaço também ativa o link de forma acessível');
    console.log('✅ Vaga pendente: origem real, escape, clique e teclado sem acionar card pai');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
