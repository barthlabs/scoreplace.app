/* Faixa da chave em DOM de navegador, com stubs para modelo, relógio e gravação. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = source.indexOf('function _bracketAgendaCompare(');
const end = source.indexOf('function _bracketAgendaExpected(', start);
assert(start > 0 && end > start);

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="view-container"><section id="tourn-grid-container">Torneio</section><nav data-bracket-tabs-root="1" data-tournament-id="sb_test"></nav><section id="rounds"><article class="sp-match-card" id="card-m1"><div class="sp-mc-sc" id="score-p1-m1"><input id="s1-m1"></div><div class="sp-mc-sc" id="score-p2-m1"><input id="s2-m1"></div><button id="confirm-m1" data-confirm-for="m1" style="display:none">Confirmar</button></article><article class="sp-match-card" id="card-m2"><div class="sp-mc-sc" id="score-p1-m2"><input id="s1-m2-0"><input id="s1-m2-1"></div><div class="sp-mc-sc" id="score-p2-m2"><input id="s2-m2-0"><input id="s2-m2-1"></div><button id="confirm-m2" data-confirm-for="m2" style="display:none">Confirmar</button></article><article class="sp-match-card" id="card-m3"></article></section></main>');
    await page.addScriptTag({ content: source.slice(start, end) });
    const state = await page.evaluate(() => {
      window._matchCardTimestamp = value => value ? Date.parse(value) : 0;
      window._spCourtClockHtml = (start, t, now, tid, mid, controls) => '<span class="sp-match-court-clock"><span class="sp-match-call-timer" data-start-ms="' + start + '">00:00:00</span>' + (controls ? '<button type="button" class="sp-match-clock-action">REW</button><button type="button" class="sp-match-clock-action">FF</button>' : '') + '</span>';
      window._bracketSyncRoundHeadingOffsets = () => {};
      window.ScoreplaceCourtOccupancy = {
        isFinished: m => !!(m.resultAt || m.winner != null || m.wo),
        occupiesCourt: m => !!(m.court && (m.courtCalledAt || m.startedAt) && !m.resultAt && !m.winner && !m.wo)
      };
      window.ScoreplaceNextMatch = { knownSide: value => !!value && value !== 'TBD' };
      window._dashboardNextMatchCompare = (a, b) => Date.parse(a.item.m.scheduledAt) - Date.parse(b.item.m.scheduledAt) || a.item.m._gameNum - b.item.m._gameNum;
      window._collectAllMatches = t => t.phases.flatMap(phase => phase.matches);
      window._isConcentratedTournament = () => true;
      window._safeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      window.AppStore = { currentUser: { uid: 'org' } };
      window._isUserAuthority = (t, u) => ['org', 'ref', 'legacy'].includes(u.uid);
      window._souOrganizador = () => ['org', 'legacy'].includes(window.AppStore.currentUser.uid);
      window._saveResultInline = (tid, mid) => { window.savedScores = [...document.getElementById('card-' + mid).querySelectorAll('input')].map(input => input.value); };
      document.getElementById('rounds').addEventListener('input', event => {
        const card = event.target.closest('.sp-match-card');
        if (card) card.querySelector('button[data-confirm-for]').style.display = [...card.querySelectorAll('input')].every(input => input.value !== '') ? '' : 'none';
      });
      const t = { id: 'sb_test', creatorUid: 'org', adminUids: ['org'], _nJogos: 3, courtNames: ['Quadra 4', 'Quadra 5'], matches: [
        { id: 'm1', _gameNum: 1, p1: 'A', p2: 'B', category: 'Light', scheduledAt: '2026-10-22T18:00:00Z', court: 'Quadra 5' },
        { id: 'm2', _gameNum: 2, p1: 'C', p2: 'D', category: 'Light', scheduledAt: '2026-10-22T18:35:00Z', court: 'Quadra 4' },
        { id: 'm3', _gameNum: 3, p1: 'E', p2: 'F', category: 'Power', scheduledAt: '2026-10-22T19:10:00Z', court: 'Quadra 5' }
      ] };
      t.phases = [{ matches: t.matches.slice(0, 2) }, { matches: t.matches.slice(2) }];
      const root = document.querySelector('[data-bracket-tabs-root]');
      root._bracketCardsScope = document.getElementById('view-container');
      const general = document.createElement('section');
      general.setAttribute('data-bracket-general-view', '1');
      document.getElementById('tourn-grid-container').insertAdjacentElement('afterend', general);
      root._bracketGeneralView = general;
      window._bracketOperationsRefresh(t, root);
      window._bracketOperationsRefresh(t, root);
      const strip = root._bracketOperationsStrip;
      const initial = {
        next: strip.querySelector('.sp-operations-next [data-operations-match]').getAttribute('data-operations-match'),
        courts: [...strip.querySelectorAll('.sp-operations-court-free strong')].map(n => n.textContent),
        cardBorder: document.getElementById('card-m1').style.border,
        order: strip.previousElementSibling.id === 'tourn-grid-container' && general.previousElementSibling === strip,
        oneStrip: document.querySelectorAll('[data-bracket-operations-strip]').length === 1,
        oneGeneral: document.querySelectorAll('[data-bracket-general-view]').length === 1,
        noDuplicateIds: document.querySelectorAll('#card-m1').length === 1 && !strip.querySelector('[id], input'),
        orgLabel: strip.querySelector('.sp-operations-next').textContent.includes('PRÓXIMO A CHAMAR')
      };
      t.matches[0].courtCalledAt = '2026-10-22T18:01:00Z';
      window._bracketOperationsRefresh(t, root);
      const op1 = strip.querySelector('.sp-operations-court-card[data-operations-match="m1"]');
      const first = op1.querySelector('[data-operations-source-input="s1-m1"]');
      first.value = '6'; first.dispatchEvent(new Event('input', { bubbles: true }));
      const second = op1.querySelector('[data-operations-source-input="s2-m1"]');
      second.value = '3'; second.dispatchEvent(new Event('input', { bubbles: true }));
      const confirmVisible = !op1.querySelector('.sp-operations-confirm').hidden;
      op1.querySelector('.sp-operations-confirm').click();
      const simpleScore = window.savedScores;
      const oldCard = document.getElementById('card-m1');
      const freshCard = oldCard.cloneNode(true);
      freshCard.querySelectorAll('input').forEach(input => { input.value = ''; });
      oldCard.replaceWith(freshCard);
      window._bracketOperationsRefresh(t, root);
      const keptDraft = strip.querySelector('[data-operations-source-input="s1-m1"]').value;
      const restoredCanonical = document.getElementById('s1-m1').value;
      const afterCall = {
        next: strip.querySelector('.sp-operations-next [data-operations-match]').getAttribute('data-operations-match'),
        occupiedCourt: strip.querySelectorAll('.sp-operations-court-slot')[1].querySelector('[data-operations-match]').getAttribute('data-operations-match'),
        freeCourt: strip.querySelectorAll('.sp-operations-court-slot')[0].textContent.includes('Livre'),
        greenCard: document.getElementById('card-m1').style.border.includes('22c55e'),
        clock: !!op1.querySelector('.sp-match-call-timer'),
        rewind: op1.querySelectorAll('.sp-match-clock-action').length === 2,
        confirmVisible, simpleScore, keptDraft, restoredCanonical,
        uniqueScores: document.querySelectorAll('#s1-m1').length === 1 && !strip.querySelector('[id^="s1-"], [id^="s2-"], [id^="confirm-"]')
      };
      t.matches[1].courtCalledAt = '2026-10-22T18:40:00Z';
      window._bracketOperationsRefresh(t, root);
      const op2 = strip.querySelector('.sp-operations-court-card[data-operations-match="m2"]');
      for (const [id, value] of [['s1-m2-0', '6'], ['s2-m2-0', '4'], ['s1-m2-1', '6'], ['s2-m2-1', '2']]) {
        const input = op2.querySelector('[data-operations-source-input="' + id + '"]');
        input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      op2.querySelector('.sp-operations-confirm').click();
      const multiScore = window.savedScores;
      const fixedCourtOrder = [...strip.querySelectorAll('.sp-operations-court-slot [data-operations-match]')].map(n => n.getAttribute('data-operations-match'));
      t.matches[0].resultAt = '2026-10-22T19:00:00Z';
      t.matches[0].winner = 'A';
      window._bracketOperationsRefresh(t, root);
      const afterResult = {
        court5Free: strip.querySelectorAll('.sp-operations-court-slot')[1].textContent.includes('Livre'),
        next: strip.querySelector('.sp-operations-next [data-operations-match]').getAttribute('data-operations-match')
      };
      document.getElementById('card-m2').remove();
      window._bracketOperationsRefresh(t, root);
      const absentCanonical = {
        open: !strip.querySelector('.sp-operations-court-card .sp-operations-open').hidden,
        noInputs: !strip.querySelector('.sp-operations-court-card input'),
        noConfirm: strip.querySelector('.sp-operations-court-card .sp-operations-confirm').hidden
      };
      window.AppStore.currentUser = { uid: 'ref' };
      window._bracketOperationsRefresh(t, root);
      const referee = {
        visible: !!root._bracketOperationsStrip,
        neutral: strip.querySelector('.sp-operations-next').textContent.includes('PRÓXIMO JOGO'),
        noCall: !strip.textContent.includes('CHAMAR') && !strip.textContent.includes('Abrir para chamar'),
        timerWithoutActions: !!strip.querySelector('.sp-match-call-timer') && !strip.querySelector('.sp-match-clock-action')
      };
      window.AppStore.currentUser = { uid: 'legacy' };
      window._bracketOperationsRefresh(t, root);
      const legacyNoClockActions = !strip.querySelector('.sp-match-clock-action');
      window.AppStore.currentUser = { uid: 'other' };
      window._bracketOperationsRefresh(t, root);
      const outsiderHidden = !document.querySelector('[data-bracket-operations-strip]');
      return { initial, afterCall, fixedCourtOrder, multiScore, afterResult, absentCanonical, referee, legacyNoClockActions, outsiderHidden };
    });
    assert.equal(state.initial.next, 'm1');
    assert.deepEqual(state.initial.courts, ['Quadra 4', 'Quadra 5']);
    assert.match(state.initial.cardBorder, /fbbf24/);
    assert(state.initial.order && state.initial.oneStrip && state.initial.oneGeneral && state.initial.noDuplicateIds && state.initial.orgLabel);
    assert.equal(state.afterCall.next, 'm2');
    assert.equal(state.afterCall.occupiedCourt, 'm1');
    assert(state.afterCall.freeCourt && state.afterCall.greenCard && state.afterCall.clock && state.afterCall.rewind && state.afterCall.confirmVisible && state.afterCall.uniqueScores);
    assert.deepEqual(state.afterCall.simpleScore, ['6', '3']);
    assert.equal(state.afterCall.keptDraft, '6');
    assert.equal(state.afterCall.restoredCanonical, '6');
    assert.deepEqual(state.multiScore, ['6', '6', '4', '2']);
    assert.deepEqual(state.fixedCourtOrder, ['m2', 'm1']);
    assert.deepEqual(state.afterResult, { court5Free: true, next: 'm3' });
    assert(state.absentCanonical.open && state.absentCanonical.noInputs && state.absentCanonical.noConfirm);
    assert(state.referee.visible && state.referee.neutral && state.referee.noCall && state.referee.timerWithoutActions && state.legacyNoClockActions && state.outsiderHidden);
    console.log('✓ faixa operacional: quadras fixas, placar simples e múltiplo, relógio, papéis e IDs únicos');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
