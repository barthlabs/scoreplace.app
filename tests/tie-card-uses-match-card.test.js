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
        const courtSelect = card.querySelector('[data-tie-court-select]');
        const ok = card.querySelector('[data-tie-action="call"]');
        const wo = card.querySelector('[data-tie-action="wo"]');
        const confirm = card.querySelector('[data-tie-action="score"]');
        return {
          header:card.querySelector('.sp-mc-head').textContent,
          names:[...card.querySelectorAll('.sp-mc-nm')].map(node => node.textContent),
          scores:[...card.querySelectorAll('[data-tie-score]')].map(node => node.value),
          rows:card.querySelectorAll('.sp-mc-sc').length,
          vs:card.querySelector('.sp-mc-vs').textContent,
          actions:[...card.querySelectorAll('[data-tie-action]')].map(node => node.getAttribute('data-tie-action')),
          court:card.querySelector('.sp-match-court')?.textContent || '',
          courtSelect:!!courtSelect,
          courtSelectWidth:courtSelect?.getBoundingClientRect().width || 0,
          okColor:ok && getComputedStyle(ok).backgroundColor,
          woWidth:wo?.getBoundingClientRect().width || 0,
          woTwoLines:!!wo?.querySelector('br'),
          confirmInitiallyHidden:confirm?.style.display === 'none',
          extraScoreButton:card.textContent.includes('Salvar placar'),
          category:card.textContent.includes('Fem Diamante'),
          nav:card.querySelectorAll('[data-operations-nav]').length,
          postpone:!!document.querySelector('[data-tie-action="postpone"]'),
          finalNotice:document.querySelector('.sp-operations-tie-final-notice')?.textContent || '',
          group:card.textContent.includes('R1 Grupo A')
        };
      }
      const waiting = render(tie);
      window._tieWaitingScreenshot = document.querySelector('main').innerHTML;
      const postponable = render(tie, { postponeReady:true, tieCanPostpone:true });
      const finalTie = render(tie, { postponeReady:true, tieCanPostpone:false });
      const waitingCard = document.querySelector('.sp-operations-tie-card');
      waitingCard.querySelector('[data-tie-score="p1"]').value = '6';
      _bracketTieSyncConfirm(waitingCard);
      const afterFirstScore = waitingCard.querySelector('[data-tie-action="score"]').style.display;
      waitingCard.querySelector('[data-tie-score="p2"]').value = '3';
      _bracketTieSyncConfirm(waitingCard);
      const scoreEntry = { afterFirstScore,
        confirmVisible:waitingCard.querySelector('[data-tie-action="score"]').style.display !== 'none',
        liveHidden:waitingCard.querySelector('[data-tie-action="live"]').style.display === 'none',
        courtStillUncalled:!!waitingCard.querySelector('[data-tie-action="call"]') };
      const called = render({ ...tie, court:'Quadra 8', courtCalledAt:'2026-11-11T12:00:00Z',
        tieSeries:[{ ...tie.tieSeries[0], court:'Quadra 8', courtCalledAt:'2026-11-11T12:00:00Z' }] }, { active:true });
      const triple = render({ ...tie, tieSeries:[tie.tieSeries[0],
        { id:'tie-3b', displayGameNumber:'3B', p1:{name:'Atleta Azul'}, p2:{name:'Atleta Vermelha'} }] });
      const groupMatches = [1, 2, 3].map((number) => ({ id:'regular-' + number, _gameNum:number,
        isMonarch:true, monarchGroup:0, round:1, phaseIndex:0, category:'Fem Diamante',
        groupName:'Grupo A1', p1:'Atleta Azul', p2:'Atleta Verde',
        team1:['Atleta Azul'], team2:['Atleta Verde'] }));
      const groupTie = { ...tie, tieBaseGameNumber:3 };
      const groupRoot = {};
      const groupPages = [];
      for (let index = 0; index < 5; index++) {
        if (index) groupRoot._bracketOperationsNav.next.index = index;
        document.querySelector('main').innerHTML = _bracketOperationsReplica(groupTie, t, {},
          'PRÓXIMO JOGO A CHAMAR', '', groupRoot, groupMatches, 'next');
        groupPages.push({ title:document.querySelector('.sp-operations-nav-title')?.textContent,
          nav:document.querySelectorAll('[data-operations-nav]').length,
          standings:!!document.querySelector('.sp-operations-standings') });
      }
      t.phaseTieDecisions = { 0:{ [tie.decisionId]:{ choice:'play', status:'pending',
        baseGameNumber:3, category:'Fem Diamante', matches:tie.tieSeries } } };
      const groupCards = _bracketTieGroupCards(t, { matches:groupMatches, category:'Fem Diamante' }, 0);
      const otherGroupCards = _bracketTieGroupCards(t, { matches:groupMatches.map(match => ({ ...match,
        _gameNum:match._gameNum + 3, id:match.id + '-other' })), category:'Fem Diamante' }, 0);
      tie.tieSeries[0].p1.key = 'blue';
      tie.tieSeries[0].p2.key = 'green';
      tie.tieSeries[0].winnerKey = 'blue';
      tie.tieSeries[0].sets = [{ p1:5, p2:3 }];
      t.phaseTieDecisions[0][tie.decisionId].status = 'complete';
      const completedGroupCards = _bracketTieGroupCards(t, { matches:groupMatches, category:'Fem Diamante' }, 0);
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
      return { waiting, postponable, finalTie, called, triple, fallback, sent, liveScore, scoreEntry,
        groupPages, groupCards, otherGroupCards, completedGroupCards };
    });
    for (const card of [cards.waiting, cards.called]) {
      assert.match(card.header, /JOGO 3A/);
      assert.match(card.header, /SIMPLES DESEMPATE/);
      assert.deepEqual(card.names, ['Atleta Azul', 'Atleta Verde']);
      assert.deepEqual(card.scores, ['', ''], 'placar vazio usa placeholder 0 como nos demais jogos');
      assert.equal(card.rows, 2, 'um placar em cada lado do card normal');
      assert.equal(card.vs, 'VS');
      assert(card.actions.includes('wo'), 'W.O. no próprio card');
      assert(card.actions.includes('score'), 'placar no próprio card');
      assert(card.confirmInitiallyHidden, 'Confirmar nasce escondido');
      assert.equal(card.extraScoreButton, false, 'não cria Salvar placar extra');
      assert(card.woTwoLines && card.woWidth < 105, 'W.O. compacto de duas linhas');
      assert(card.category, 'categoria do grupo visível');
      assert.equal(card.group, false);
    }
    assert.equal(cards.waiting.courtSelect, true);
    assert(cards.waiting.courtSelectWidth <= 125, 'seletor de quadra tem a largura do card comum');
    assert.equal(cards.waiting.okColor, 'rgb(22, 101, 52)', 'OK verde do card comum');
    assert.equal(cards.scoreEntry.afterFirstScore, 'none');
    assert(cards.scoreEntry.confirmVisible && cards.scoreEntry.liveHidden && cards.scoreEntry.courtStillUncalled,
      'Confirmar aparece ao digitar os dois placares mesmo antes da chamada para quadra');
    assert(cards.waiting.actions.includes('call'), 'chamada OK no próprio card');
    assert.equal(cards.waiting.nav, 0, 'dois atletas: um jogo, sem setas');
    assert(cards.postponable.postpone, 'Pular jogo aparece quando há outro jogo chamável na fase');
    assert(!cards.finalTie.postpone && /próxima fase depende deste desempate/.test(cards.finalTie.finalNotice),
      'no último jogo, o botão some e a dependência da fase fica explícita');
    assert.equal(cards.called.court, 'Quadra 8');
    assert(cards.called.actions.includes('live'), 'Ao Vivo após chamada');
    assert(cards.called.actions.includes('cancel-call'), 'cancelar chamada no próprio card');
    assert(cards.called.actions.includes('release'), 'Encerrado no próprio card');
    assert.equal(cards.triple.nav, 2, 'três atletas: navegação entre jogos do desempate');
    assert.deepEqual(cards.groupPages.map(page => page.title),
      ['JOGO 3A', 'JOGO 1 (1/3)', 'JOGO 2 (2/3)', 'JOGO 3 (3/3)', 'Grupo A1'],
      'a seta do desempate percorre os três jogos e a classificação do mesmo grupo');
    assert(cards.groupPages.every(page => page.nav === 2));
    assert(cards.groupPages[4].standings);
    assert.match(cards.groupCards, /JOGO 3A/);
    assert.match(cards.groupCards, /SIMPLES DESEMPATE/);
    assert.match(cards.completedGroupCards, /JOGO 3A/,
      'o desempate concluído permanece visível no grupo para conferência');
    assert.equal(cards.otherGroupCards, '', 'outros grupos não recebem o desempate');
    assert.equal(cards.liveScore, '1', 'Ao Vivo atualiza o placar mostrado');
    assert.deepEqual(cards.sent, [{ type:'point', side:'p1' }, { type:'wo', winner:'p2' }],
      'ponto e W.O. seguem para a operação do desempate');
    assert.match(cards.fallback, /sem elemento/, 'HTML inesperado não derruba toda a faixa');
    if (process.env.SP_TIE_SCREENSHOT) {
      await page.evaluate(() => { document.querySelector('main').innerHTML = window._tieWaitingScreenshot; });
      const visibleActions = await page.evaluate(() => [...document.querySelectorAll('.sp-mc-acts [data-tie-action]')]
        .map(node => ({ action:node.dataset.tieAction, width:node.getBoundingClientRect().width, display:getComputedStyle(node).display })));
      assert(visibleActions.some(row => row.action === 'wo' && row.width > 0 && row.display !== 'none'));
      assert(visibleActions.some(row => row.action === 'live' && row.width > 0 && row.display !== 'none'));
      await page.screenshot({ path: process.env.SP_TIE_SCREENSHOT });
    }
    console.log('✓ desempate 3A usa card de simples e abre jogos e classificação do grupo');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
