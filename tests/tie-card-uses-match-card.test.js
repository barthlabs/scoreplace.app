'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 520, height: 800 } });
    await page.setContent('<main style="width:480px"></main>');
    await page.addStyleTag({ path: 'css/style.css' });
    await page.addStyleTag({ path: 'css/components.css' });
    await page.addStyleTag({ path: 'css/bracket.css' });
    await page.addScriptTag({ path: 'js/views/bracket.js' });
    const cards = await page.evaluate(() => {
      const t = { id:'sb_tie_card', isSandbox:true, courtCount:8,
        scoring:{ type:'gsm', fixedSet:true }, scheduleWindow:{ days:[{ day:'2026-11-11' }] } };
      window.AppStore = { currentUser:{ uid:'organizer' } };
      window._findTournamentById = () => t;
      window._safeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      window._spCor = color => color;
      window._scoringUsesSets = () => true;
      window._bracketIsPendingMatch = () => false;
      window._matchWinnerSide = () => null;
      window._souOrganizador = () => false;
      window._isConcentratedTournament = () => true;
      window._spCourtClockHtml = () => '<span class="sp-match-court-clock">Chamado</span>';
      window._cardNomeGeo = () => ({ avatar:'26px', maxRem:.94, minRem:.5,
        oneLineBoxH:1.1, twoLineBoxH:2.1, twoLineMaxRem:.8 });
      const tie = { id:'tie-3a', isTieBreak:true, decisionId:'group-0:1:2', _gameNum:'3A',
        p1:'Atleta Azul', p2:'Atleta Verde' };
      function render(match) {
        document.querySelector('main').innerHTML = _bracketOperationsReplica(match, t, {},
          'PRÓXIMO JOGO A CHAMAR', '', {}, [], 'next');
        const card = document.querySelector('.sp-match-card');
        return {
          header:card.querySelector('.sp-mc-head').textContent,
          names:[...card.querySelectorAll('.sp-mc-nm')].map(node => node.textContent),
          scores:[...card.querySelectorAll('.sp-mc-num')].map(node => node.textContent),
          rows:card.querySelectorAll('.sp-mc-sc').length,
          vs:card.querySelector('.sp-mc-vs').textContent,
          action:card.querySelector('[data-operations-open-tie]')?.getAttribute('data-operations-open-tie'),
          buttons:[...card.querySelectorAll('button')].map(node => node.textContent),
          court:card.querySelector('.sp-match-court')?.textContent || '',
          regularCourtSelect:!!card.querySelector('.sp-match-court select'),
          group:card.textContent.includes('R1 Grupo A')
        };
      }
      const waiting = render(tie);
      const called = render({ ...tie, court:'Quadra 8', courtCalledAt:'2026-11-11T12:00:00Z' });
      const canonicalRenderer = window.renderMatchCard;
      window.renderMatchCard = () => 'sem elemento';
      const fallback = _bracketOperationsReplica(tie, t, {}, 'PRÓXIMO JOGO A CHAMAR', '', {}, [], 'next');
      window.renderMatchCard = canonicalRenderer;
      return { waiting, called, fallback };
    });
    for (const card of [cards.waiting, cards.called]) {
      assert.match(card.header, /JOGO 3A/);
      assert.match(card.header, /SIMPLES DESEMPATE/);
      assert.deepEqual(card.names, ['Atleta Azul', 'Atleta Verde']);
      assert.deepEqual(card.scores, ['0', '0']);
      assert.equal(card.rows, 2, 'um placar em cada lado do card normal');
      assert.equal(card.vs, 'VS');
      assert.equal(card.action, 'group-0:1:2');
      assert.deepEqual(card.buttons, ['Abrir desempate']);
      assert.equal(card.regularCourtSelect, false);
      assert.equal(card.group, false);
    }
    assert.equal(cards.waiting.court, '');
    assert.equal(cards.called.court, 'Quadra 8');
    assert.match(cards.fallback, /sem elemento/, 'HTML inesperado não derruba toda a faixa');
    if (process.env.SP_TIE_SCREENSHOT) await page.screenshot({ path: process.env.SP_TIE_SCREENSHOT });
    console.log('✓ desempate 3A usa card canônico de simples, com placares e painel próprio');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
