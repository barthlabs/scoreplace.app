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
    const cards = await page.evaluate(async () => {
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
      window.ScoreplaceCourtOccupancy = { occupiesCourt:() => false, isFinished:() => false };
      window._cardNomeGeo = () => ({ avatar:'26px', maxRem:.94, minRem:.5,
        oneLineBoxH:1.1, twoLineBoxH:2.1, twoLineMaxRem:.8 });
      const tie = { id:'tie-3a', isTieBreak:true, decisionId:'group-0:1:2', _gameNum:'3A',
        p1:'Atleta Azul', p2:'Atleta Verde', category:'Fem Diamante · A1',
        tieSeries:[{ id:'tie-3a', displayGameNumber:'3A', p1:{name:'Atleta Azul'}, p2:{name:'Atleta Verde'} }] };
      function render(match, role) {
        document.querySelector('main').innerHTML = _bracketOperationsReplica(match, t, role || {},
          'PRÓXIMO JOGO A CHAMAR', '', {}, [], 'next');
        const card = document.querySelector('.sp-match-card');
        return {
          header:card.querySelector('.sp-mc-head').textContent,
          names:[...card.querySelectorAll('.sp-mc-nm')].map(node => node.textContent),
          scores:[...card.querySelectorAll('[data-tie-score]')].map(node => node.value),
          rows:card.querySelectorAll('.sp-mc-sc').length,
          vs:card.querySelector('.sp-mc-vs').textContent,
          actions:[...card.querySelectorAll('[data-tie-action]')].map(node => node.getAttribute('data-tie-action')),
          court:card.querySelector('.sp-match-court')?.textContent || '',
          courtSelect:!!card.querySelector('[data-tie-court-select]'),
          category:card.textContent.includes('Fem Diamante'),
          nav:card.querySelectorAll('[data-operations-nav]').length,
          group:card.textContent.includes('R1 Grupo A')
        };
      }
      const waiting = render(tie);
      const called = render({ ...tie, court:'Quadra 8', courtCalledAt:'2026-11-11T12:00:00Z',
        tieSeries:[{ ...tie.tieSeries[0], court:'Quadra 8', courtCalledAt:'2026-11-11T12:00:00Z' }] }, { active:true });
      const triple = render({ ...tie, tieSeries:[tie.tieSeries[0],
        { id:'tie-3b', displayGameNumber:'3B', p1:{name:'Atleta Azul'}, p2:{name:'Atleta Vermelha'} }] });
      const canonicalRenderer = window.renderMatchCard;
      window.renderMatchCard = () => 'sem elemento';
      const fallback = _bracketOperationsReplica(tie, t, {}, 'PRÓXIMO JOGO A CHAMAR', '', {}, [], 'next');
      window.renderMatchCard = canonicalRenderer;
      const stored = { id:'tie-3a', displayGameNumber:'3A', p1:{name:'Atleta Azul'}, p2:{name:'Atleta Verde'},
        court:'Quadra 8', courtCalledAt:'2026-11-11T12:00:00Z', livePoints:{ p1:0, p2:0 } };
      t.phaseTieDecisions = { 0:{ 'group-0:1:2':{ status:'pending', matches:[stored] } } };
      const sent = [];
      window._phaseTieCardAction = async (_, __, ___, action) => {
        sent.push(action);
        if (action.type === 'point') stored.livePoints[action.side]++;
        return { reason:'tie-match-pending' };
      };
      _bracketTieLive(t.id, tie.decisionId, tie.id);
      document.querySelector('#sp-tie-live [data-tie-point="p1"]').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      const liveScore = document.querySelector('#sp-tie-live .sp-tie-live-sides strong').textContent;
      document.querySelector('#sp-tie-live [data-tie-close]').click();
      _bracketTieChoice(t.id, tie.decisionId, tie.id, 'Aplicar W.O.', [
        { label:'Atleta Azul', action:{ type:'wo', winner:'p1' } },
        { label:'Atleta Verde', action:{ type:'wo', winner:'p2' } }
      ]);
      document.querySelector('#sp-tie-choice [data-tie-choice="1"]').click();
      await new Promise(resolve => setTimeout(resolve, 0));
      return { waiting, called, triple, fallback, sent, liveScore };
    });
    for (const card of [cards.waiting, cards.called]) {
      assert.match(card.header, /JOGO 3A/);
      assert.match(card.header, /SIMPLES DESEMPATE/);
      assert.deepEqual(card.names, ['Atleta Azul', 'Atleta Verde']);
      assert.deepEqual(card.scores, ['0', '0']);
      assert.equal(card.rows, 2, 'um placar em cada lado do card normal');
      assert.equal(card.vs, 'VS');
      assert(card.actions.includes('wo'), 'W.O. no próprio card');
      assert(card.actions.includes('score'), 'placar no próprio card');
      assert(card.category, 'categoria do grupo visível');
      assert.equal(card.group, false);
    }
    assert.equal(cards.waiting.courtSelect, true);
    assert(cards.waiting.actions.includes('call'), 'chamada OK no próprio card');
    assert.equal(cards.waiting.nav, 0, 'dois atletas: um jogo, sem setas');
    assert.equal(cards.called.court, 'Quadra 8');
    assert(cards.called.actions.includes('live'), 'Ao Vivo após chamada');
    assert(cards.called.actions.includes('cancel-call'), 'cancelar chamada no próprio card');
    assert(cards.called.actions.includes('release'), 'Encerrado no próprio card');
    assert.equal(cards.triple.nav, 2, 'três atletas: navegação entre jogos do desempate');
    assert.equal(cards.liveScore, '1', 'Ao Vivo atualiza o placar mostrado');
    assert.deepEqual(cards.sent, [{ type:'point', side:'p1' }, { type:'wo', winner:'p2' }],
      'ponto e W.O. seguem para a operação do desempate');
    assert.match(cards.fallback, /sem elemento/, 'HTML inesperado não derruba toda a faixa');
    if (process.env.SP_TIE_SCREENSHOT) await page.screenshot({ path: process.env.SP_TIE_SCREENSHOT });
    console.log('✓ desempate 3A usa card de simples com controles; setas só quando há mais de um jogo');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
