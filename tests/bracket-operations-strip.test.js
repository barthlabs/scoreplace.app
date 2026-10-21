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
    await page.setContent('<main id="view-container"><section id="tourn-grid-container"></section><nav data-bracket-tabs-root="1" data-tournament-id="sb_test"></nav><section id="rounds"><article id="card-m2" class="sp-match-card"></article></section></main>');
    await page.addScriptTag({ content: source.slice(start, end) });
    const state = await page.evaluate(() => {
      window._matchCardTimestamp = value => value ? Date.parse(value) : 0;
      window._bracketSyncRoundHeadingOffsets = () => {};
      window.ScoreplaceCourtOccupancy = { isFinished: m => !!m.resultAt, occupiesCourt: m => !!(m.court && m.courtCalledAt && !m.resultAt) };
      window.ScoreplaceNextMatch = { knownSide: value => !!value && value !== 'TBD' };
      window._collectAllMatches = t => t.matches;
      window._isConcentratedTournament = () => true;
      window._safeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      window.AppStore = { currentUser: { uid: 'org' } };
      window._isUserAuthority = (t, u) => ['org', 'ref'].includes(u.uid);
      window._souOrganizador = () => window.AppStore.currentUser.uid === 'org';
      window._resultEntryIncludes = () => true;
      window.renderMatchCard = (m, canEnter, tid, num, compact, pending, opts) => _bracketScopeReplicaHtml(
        '<article class="sp-match-card" id="card-' + m.id + '"><div class="sp-mc-head">JOGO ' + num +
        '<button id="live-' + m.id + '" onclick="window._openLiveScoringForMatch()">📡 Ao Vivo</button>' +
        '<button class="wo-action" onclick="window._woOpenClaim()">Aplicar W.O.</button>' +
        '<button class="open-action" onclick="window._editResultInline()">Editar</button>' +
        '<button id="confirm-' + m.id + '" data-confirm-for="' + m.id + '" style="display:none" onclick="window._irrelevant()">✓ Confirmar</button></div>' +
        '<div class="team"><strong>TIME A</strong><span>' + m.p1 + '</span><label for="s1-' + m.id + '">Placar</label><input id="s1-' + m.id + '" oninput="window._irrelevant()"></div>' +
        '<div class="versus">VS</div><div class="team"><strong>TIME B</strong><span>' + m.p2 + '</span><input id="s2-' + m.id + '" oninput="window._irrelevant()"></div>' +
        '<div class="sp-match-operational"><label class="sp-match-court"><select data-persisted-court="' + m.court + '"><option>' + m.court + '</option></select></label>' +
        '<button class="sp-match-confirm">OK</button>' + (m.courtCalledAt ? '<button class="sp-match-clock-action sp-match-clock-next">FF</button><span class="sp-match-call-timer">00:01</span>' : '') +
        '</div></article>', opts.idScope);
      const t = { id: 'sb_test', creatorUid: 'org', _nJogos: 2, courtNames: ['Quadra 4', 'Quadra 5'], matches: [
        { id: 'm1', _gameNum: 1, p1: 'A / B', p2: 'C / D', scheduledAt: '2026-10-22T18:00:00Z', court: 'Quadra 5' },
        { id: 'm2', _gameNum: 2, p1: 'E / F', p2: 'G / H', scheduledAt: '2026-10-22T18:35:00Z', court: 'Quadra 4' }
      ] };
      window._findTournamentById = () => t;
      window._openLiveScoringForMatch = (tid, mid) => { window.live = [tid, mid]; };
      window._woOpenClaim = (tid, key) => { window.wo = [tid, key]; };
      window._bracketOperationsOpen = (tid, mid) => { window.opened = [tid, mid]; };
      window._saveResultInline = (tid, mid, card) => { window.saved = [tid, mid, ...[...card.querySelectorAll('input[data-operations-source-input]')].map(input => input.value)]; };
      window._confirmMatchCourtCall = (button, tid, mid) => {
        window.called = [tid, mid, button.closest('.sp-match-operational').querySelector('select').value];
        t.matches.find(m => m.id === mid).courtCalledAt = '2026-10-22T18:01:00Z';
        window._bracketOperationsRefresh(t, root);
      };
      window._adjustMatchCourtClock = (button, tid, mid, action) => { window.clock = [tid, mid, action]; };
      const root = document.querySelector('[data-bracket-tabs-root]');
      root._bracketCardsScope = document.getElementById('view-container');
      root._bracketGeneralView = document.createElement('section');
      document.getElementById('tourn-grid-container').after(root._bracketGeneralView);
      window._bracketOperationsRefresh(t, root);
      const strip = root._bracketOperationsStrip;
      let next = strip.querySelector('.sp-operations-next .sp-match-card');
      const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
      const initial = { full: !!next && next.querySelectorAll('.team').length === 2 && !!next.querySelector('.sp-mc-head, .versus, .sp-match-operational'),
        names: next.textContent.includes('A / B') && next.textContent.includes('C / D'),
        noCanonical: !document.getElementById('card-m1'), uniqueIds: ids.length === new Set(ids).size,
        linked: next.querySelector('label[for]').htmlFor === next.querySelector('input').id,
        noInline: !next.querySelector('[onclick], [oninput]'),
        courts: [...strip.querySelectorAll('.sp-operations-court-free strong')].map(node => node.textContent) };
      next.querySelector('select').focus();
      window._bracketOperationsRefresh(t, root);
      const selectFocusRestored = document.activeElement === strip.querySelector('.sp-operations-next select');
      next = strip.querySelector('.sp-operations-next .sp-match-card');
      next.querySelector('[id*="-live-"]').click();
      next.querySelector('.wo-action').click();
      next.querySelector('.open-action').click();
      next.querySelector('.sp-match-confirm').click();
      const court = strip.querySelector('.sp-operations-court-slot:nth-child(2) .sp-operations-replica');
      const fields = [...court.querySelectorAll('input[data-operations-source-input]')];
      fields[0].value = '6'; fields[0].dispatchEvent(new Event('input', { bubbles: true }));
      fields[1].value = '3'; fields[1].dispatchEvent(new Event('input', { bubbles: true }));
      const confirmVisible = court.querySelector('[data-confirm-for]').style.display !== 'none';
      court.querySelector('[data-confirm-for]').click();
      court.querySelector('.sp-match-clock-next').click();
      window._bracketOperationsRefresh(t, root);
      const afterCall = { called: window.called, saved: window.saved, clock: window.clock, live: window.live, wo: window.wo,
        opened: window.opened, confirmVisible,
        draft: strip.querySelector('.sp-operations-court-card [data-operations-source-input="s1-m1"]').value,
        next: strip.querySelector('.sp-operations-next [data-operations-match]').getAttribute('data-operations-match') };
      window.AppStore.currentUser = { uid: 'other' };
      window._bracketOperationsRefresh(t, root);
      return { initial, afterCall, selectFocusRestored, outsiderHidden: !document.querySelector('[data-bracket-operations-strip]') };
    });
    assert(state.initial.full && state.initial.names && state.initial.noCanonical && state.initial.uniqueIds && state.initial.linked && state.initial.noInline);
    assert.deepEqual(state.initial.courts, ['Quadra 4', 'Quadra 5']);
    assert.deepEqual(state.afterCall.called, ['sb_test', 'm1', 'Quadra 5']);
    assert.deepEqual(state.afterCall.live, ['sb_test', 'm1']);
    assert.deepEqual(state.afterCall.wo, ['sb_test', 'm|m1']);
    assert.deepEqual(state.afterCall.opened, ['sb_test', 'm1']);
    assert.deepEqual(state.afterCall.saved, ['sb_test', 'm1', '6', '3']);
    assert.deepEqual(state.afterCall.clock, ['sb_test', 'm1', 'next']);
    assert(state.afterCall.confirmVisible && state.outsiderHidden && state.selectFocusRestored);
    assert.equal(state.afterCall.draft, '6');
    assert.equal(state.afterCall.next, 'm2');
    const bestOfThree = await page.evaluate(() => {
      const op = document.createElement('div');
      op.innerHTML = '<button data-confirm-for="m3" style="display:none">✓</button>' +
        [0, 1, 2].map(i => '<input data-operations-source-input="s1-m3-' + i + '"><input data-operations-source-input="s2-m3-' + i + '">').join('');
      const fields = [...op.querySelectorAll('input')];
      fields[0].value = '6'; fields[1].value = '2';
      fields[2].value = '6'; fields[3].value = '4';
      _bracketOperationsSyncReplicaScore(op, 'm3');
      const twoSetWin = op.querySelector('button').style.display !== 'none';
      fields[2].value = '4'; fields[3].value = '6';
      _bracketOperationsSyncReplicaScore(op, 'm3');
      const splitNeedsThird = op.querySelector('button').style.display === 'none';
      fields[4].value = '10'; fields[5].value = '8';
      _bracketOperationsSyncReplicaScore(op, 'm3');
      return { twoSetWin, splitNeedsThird, thirdUnlocks: op.querySelector('button').style.display !== 'none' };
    });
    assert.deepEqual(bestOfThree, { twoSetWin: true, splitNeedsThird: true, thirdUnlocks: true });
    // Exercita também o renderizador real: a faixa não pode passar apenas no
    // stub se uma mudança futura quebrar o caminho opts.idScope.
    const real = await browser.newPage();
    try {
      await real.addScriptTag({ content: source });
      const names = [...new Set((source.slice(source.indexOf('function renderMatchCard('), source.indexOf('// ─── Highlight winner based on score'))
        .match(/window\._[A-Za-z0-9_]+/g) || []).map(value => value.slice(7)))];
      const rendered = await real.evaluate(names => {
        const match = { id: 'm-real', p1: 'A / B', p2: 'C / D', category: 'Fem Light', court: 'Quadra 4', scheduledAt: '2026-10-22T18:00:00Z' };
        const tournament = { id: 'sb_real', matches: [match], courtNames: ['Quadra 4'], format: 'Liga', scoring: { type: 'simple' } };
        for (const name of names) if (typeof window[name] !== 'function') window[name] = () => null;
        window.AppStore = { currentUser: { uid: 'org' }, tournaments: [tournament] };
        window._findTournamentById = () => tournament;
        window._safeHtml = value => String(value);
        window._spCor = value => value;
        window._t = value => value;
        window._scoringUsesSets = () => false;
        window._bracketIsPendingMatch = () => false;
        window._isConcentratedTournament = () => true;
        window._souOrganizador = () => true;
        window._isUserAuthority = () => true;
        window._matchSetPlan = () => ({ multi: false, initialTwoSetEntry: false, columns: [] });
        const standard = document.createElement('template');
        standard.innerHTML = window.renderMatchCard(match, true, tournament.id, 1, false, null);
        const replica = document.createElement('template');
        replica.innerHTML = window.renderMatchCard(match, true, tournament.id, 1, false, null, { idScope: 'operations-m-real' });
        const a = standard.content.firstElementChild, b = replica.content.firstElementChild;
        return { sameTeams: a.querySelectorAll('.sp-mc-sc').length === b.querySelectorAll('.sp-mc-sc').length,
          sameStructure: a.querySelectorAll('*').length === b.querySelectorAll('*').length,
          operational: !!a.querySelector('.sp-match-operational') === !!b.querySelector('.sp-match-operational'),
          scoped: b.id === 'operations-m-real-card-m-real',
          clean: !b.querySelector('[onclick],[oninput],[onchange]') };
      }, names);
      assert.deepEqual(rendered, { sameTeams: true, sameStructure: true, operational: true, scoped: true, clean: true });
    } finally { await real.close(); }
    console.log('✓ faixa replica o card completo com IDs únicos, chamada, placar e relógio');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
