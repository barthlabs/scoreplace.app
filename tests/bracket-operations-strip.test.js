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
    await page.addStyleTag({ path: 'css/bracket.css' });
    await page.addScriptTag({ path: 'js/domain/court-occupancy.js' });
    await page.addScriptTag({ path: 'js/views/bracket-model.js' });
    await page.addScriptTag({ content: source.slice(start, end) });
    const state = await page.evaluate(() => {
      window._matchCardTimestamp = value => value ? Date.parse(value) : 0;
      window._bracketSyncRoundHeadingOffsets = () => {};
      window.ScoreplaceNextMatch = { knownSide: value => !!value && value !== 'TBD' };
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
        courts: [...strip.querySelectorAll('.sp-operations-court-slot:not(.sp-operations-court-slot--active) > .sp-operations-label')].map(node => node.textContent) };
      const trackHeight = strip.querySelector('.sp-operations-court-track').getBoundingClientRect().height;
      const freeRect = strip.querySelector('.sp-operations-court-free').getBoundingClientRect();
      const nextRect = next.getBoundingClientRect();
      const freeHeight = freeRect.height;
      initial.geometry = { trackHeight, freeHeight, freeTop: freeRect.top, freeBottom: freeRect.bottom, nextHeight: nextRect.height, nextTop: nextRect.top, nextBottom: nextRect.bottom,
        rowHeight: strip.querySelector('.sp-operations-track').style.getPropertyValue('--sp-operations-row-height'),
        replicaHeight: strip.querySelector('.sp-operations-next .sp-operations-replica').getBoundingClientRect().height,
        trackBoxHeight: strip.querySelector('.sp-operations-track').getBoundingClientRect().height,
        nextBoxHeight: strip.querySelector('.sp-operations-next').getBoundingClientRect().height };
      const courtLabelHeight = strip.querySelector('.sp-operations-court-slot > .sp-operations-label').getBoundingClientRect().height;
      const courtTrackPadding = parseFloat(getComputedStyle(strip.querySelector('.sp-operations-court-track')).paddingTop) || 0;
      initial.freeSlotFillsTrack = trackHeight > 100 && freeHeight >= trackHeight - courtTrackPadding - courtLabelHeight - 12;
      const fullSlotRect = strip.querySelector('.sp-operations-court-slot').getBoundingClientRect();
      initial.freeSlotMatchesCard = Math.abs(fullSlotRect.top - nextRect.top) <= 3 &&
        Math.abs(fullSlotRect.bottom - nextRect.bottom) <= 3 &&
        Math.abs(fullSlotRect.height - nextRect.height) <= 3;
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
      const activeRect = strip.querySelector('.sp-operations-court-slot--active .sp-match-card').getBoundingClientRect();
      const goldRect = strip.querySelector('.sp-operations-next .sp-match-card').getBoundingClientRect();
      const afterCall = { called: window.called, saved: window.saved, clock: window.clock, live: window.live, wo: window.wo,
        opened: window.opened, confirmVisible,
        activeBottomAligned: Math.abs(activeRect.bottom - goldRect.bottom) <= 3,
        draft: strip.querySelector('.sp-operations-court-card [data-operations-source-input="s1-m1"]').value,
        next: strip.querySelector('.sp-operations-next [data-operations-match]').getAttribute('data-operations-match') };
      window.AppStore.currentUser = { uid: 'ref' };
      window._bracketCourtReleaseCache = { sb_test: { released: { m1: '2026-10-22T18:05:00Z' } } };
      window._bracketOperationsRefresh(t, root);
      const refereeView = {
        visible: !!strip.querySelector('.sp-operations-next .sp-match-confirm'),
        pending: !!strip.querySelector('.sp-operations-pending [data-operations-match="m1"]'),
        releasedCourt: !!strip.querySelector('.sp-operations-court-slot:nth-child(2) .sp-operations-court-free'),
        availableCourt: strip.querySelector('.sp-operations-availability').textContent
      };
      window.AppStore.currentUser = { uid: 'other' };
      window._bracketOperationsRefresh(t, root);
      return { initial, afterCall, refereeView, selectFocusRestored, outsiderHidden: !document.querySelector('[data-bracket-operations-strip]') };
    });
    assert(state.initial.full && state.initial.names && state.initial.noCanonical && state.initial.uniqueIds && state.initial.linked && state.initial.noInline);
    assert.deepEqual(state.initial.courts, ['Quadra 4', 'Quadra 5']);
    assert(state.initial.freeSlotFillsTrack, 'o slot vazio deve ocupar toda a altura rolável: ' + JSON.stringify(state.initial));
    assert(state.initial.freeSlotMatchesCard, 'o slot vazio, incluindo o rótulo acima do box, deve ter a mesma altura do card completo: ' + JSON.stringify(state.initial));
    assert.deepEqual(state.afterCall.called, ['sb_test', 'm1', 'Quadra 5']);
    assert.deepEqual(state.afterCall.live, ['sb_test', 'm1']);
    assert.deepEqual(state.afterCall.wo, ['sb_test', 'm|m1']);
    assert.deepEqual(state.afterCall.opened, ['sb_test', 'm1']);
    assert.deepEqual(state.afterCall.saved, ['sb_test', 'm1', '6', '3']);
    assert.deepEqual(state.afterCall.clock, ['sb_test', 'm1', 'next']);
    assert(state.afterCall.confirmVisible && state.outsiderHidden && state.selectFocusRestored);
    assert(state.afterCall.activeBottomAligned, 'cards em quadra e próximo a chamar devem alinhar pela base');
    assert.equal(state.afterCall.draft, '6');
    assert.equal(state.afterCall.next, 'm2');
    assert(state.refereeView.visible && state.refereeView.pending && state.refereeView.releasedCourt);
    assert.match(state.refereeView.availableCourt, /2 QUADRAS LIVRES/);
    const scrollLayout = await page.evaluate(() => {
      const t = window._findTournamentById();
      const root = document.querySelector('[data-bracket-tabs-root]');
      window.AppStore.currentUser = { uid: 'org' };
      t.courtNames = ['Quadra 4', 'Quadra 5', 'Quadra 6', 'Quadra 7', 'Quadra 8'];
      window._bracketCourtReleaseCache = { sb_test: { released: {} } };
      window._bracketOperationsRefresh(t, root);
      const strip = root._bracketOperationsStrip;
      const track = strip.querySelector('.sp-operations-track');
      const next = strip.querySelector('.sp-operations-next');
      const noPending = !strip.querySelector('.sp-operations-pending');
      const freeCount = strip.querySelector('.sp-operations-availability').textContent;
      const courtNames = [...strip.querySelectorAll('.sp-operations-court-slot > .sp-operations-label')].map(el => el.textContent);
      track.scrollLeft = 240;
      const sticky = getComputedStyle(next).position === 'sticky' && next.getBoundingClientRect().left <= track.getBoundingClientRect().left + 9;
      const noVerticalClip = track.scrollHeight <= track.clientHeight;
      window._bracketOperationsRefresh(t, root);
      const scrollPreserved = root._bracketOperationsStrip.querySelector('.sp-operations-track').scrollLeft === 240;
      window._bracketCourtReleaseCache = { sb_test: { released: { m1: '2026-10-22T18:05:00Z' } } };
      window._bracketOperationsRefresh(t, root);
      const withPending = !!strip.querySelector('.sp-operations-pending [data-operations-match="m1"]');
      const courtSlot = strip.querySelector('.sp-operations-court-slot');
      const card = strip.querySelector('.sp-operations-next .sp-match-card');
      const aligned = Math.abs(courtSlot.getBoundingClientRect().top - card.getBoundingClientRect().top) <= 3 &&
        Math.abs(courtSlot.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom) <= 3;
      const liveTrack = strip.querySelector('.sp-operations-track');
      const width = liveTrack.scrollWidth, viewport = liveTrack.clientWidth;
      window._bracketCourtReleaseCache = { sb_test: { released: {} } };
      t.courtNames = ['Quadra 5'];
      window._bracketOperationsRefresh(t, root);
      const zero = strip.querySelector('.sp-operations-availability').textContent;
      t.courtNames = ['Quadra 4', 'Quadra 5'];
      window._bracketOperationsRefresh(t, root);
      const one = strip.querySelector('.sp-operations-availability').textContent;
      return { noPending, freeCount, courtNames, sticky, noVerticalClip, scrollPreserved, withPending, aligned,
        width, viewport, zero, one };
    });
    assert(scrollLayout.noPending && scrollLayout.withPending, 'o painel azul só aparece com placar pendente');
    assert.equal(scrollLayout.freeCount, '4 QUADRAS LIVRES');
    assert.equal(scrollLayout.zero, '0 QUADRAS LIVRES');
    assert.equal(scrollLayout.one, '1 QUADRA LIVRE');
    assert.deepEqual(scrollLayout.courtNames, ['Quadra 4', 'Quadra 6', 'Quadra 7', 'Quadra 8']);
    assert(scrollLayout.width > scrollLayout.viewport && scrollLayout.sticky && scrollLayout.scrollPreserved,
      'a faixa inteira deve rolar e manter o próximo jogo fixo: ' + JSON.stringify(scrollLayout));
    assert(scrollLayout.noVerticalClip && scrollLayout.aligned, 'a faixa não pode cortar ou desalinhavar os cards: ' + JSON.stringify(scrollLayout));
    await page.setViewportSize({ width: 600, height: 800 });
    await page.waitForTimeout(120);
    const mobileClip = await page.evaluate(() => {
      const track = document.querySelector('.sp-operations-track');
      return { height: track.clientHeight, content: track.scrollHeight, mobileHeight: getComputedStyle(track).height };
    });
    assert(mobileClip.content <= mobileClip.height, 'mobile não pode cortar cards após resize: ' + JSON.stringify(mobileClip));
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
    const endStart = source.indexOf('window._endMatchOnCourt = function');
    const endStop = source.indexOf('function _syncMatchCourtCopies(', endStart);
    assert(endStart > 0 && endStop > endStart);
    await page.addScriptTag({ content: source.slice(endStart, endStop) });
    const endFeedback = await page.evaluate(async () => {
      const calls = [], notices = [];
      window.confirm = () => true;
      window.showNotification = (...args) => notices.push(args);
      window._callCF = (name, payload) => { calls.push([name, payload]); return Promise.resolve({ data: { ok: true } }); };
      await window._endMatchOnCourt('tour_test', 'm1');
      await window._endMatchOnCourt('sb_test', 'm2');
      window._callCF = () => Promise.reject(new Error('falha de rede'));
      try { await window._endMatchOnCourt('tour_test', 'm3'); } catch (_) {}
      return { calls, notices };
    });
    assert.equal(endFeedback.calls[0][1].sandbox, false);
    assert.equal(endFeedback.calls[1][1].sandbox, true);
    assert(endFeedback.notices.some(args => args[0] === 'Quadra liberada' && args[2] === 'success'));
    assert(endFeedback.notices.some(args => args[0] === 'Quadra não liberada' && args[2] === 'error'));
    // Exercita também o renderizador real: a faixa não pode passar apenas no
    // stub se uma mudança futura quebrar o caminho opts.idScope.
    const real = await browser.newPage();
    try {
      await real.addScriptTag({ path: 'js/domain/court-occupancy.js' });
      await real.addScriptTag({ path: 'js/views/bracket-model.js' });
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
      const courtState = await real.evaluate(async () => {
        const target = { id: 'court-target', p1: 'A / B', p2: 'C / D', category: 'Fem Light',
          court: 'Quadra 4', scheduledAt: new Date().toISOString() };
        const occupant = { id: 'court-occupant', court: 'Quadra 4', courtCalledAt: new Date().toISOString() };
        const t = { id: 'sb_court', matches: [target, occupant], courtNames: ['Quadra 4', 'Quadra 5'],
          format: 'Liga', scoring: { type: 'simple' } };
        window._findTournamentById = () => t;
        const card = html => { const el = document.createElement('div'); el.innerHTML = html; document.body.appendChild(el); return el; };
        const first = card(window.renderMatchCard(target, true, t.id, 1, false, null));
        const second = card(window.renderMatchCard(target, true, t.id, 1, false, null, { idScope: 'court-copy' }));
        const selectors = () => [first, second].map(el => el.querySelector('.sp-match-court select'));
        const initial = selectors().map(el => ({ value: el.value, red: el.classList.contains('sp-court-placeholder-busy'),
          occupiedDisabled: el.querySelector('option[value="Quadra 4"]').disabled,
          okDisabled: el.closest('.sp-match-operational').querySelector('.sp-match-confirm').disabled }));
        window._callCF = () => Promise.reject(new Error('falha simulada'));
        selectors()[0].value = 'Quadra 5';
        try { await window._assignMatchCourtFromSelect(selectors()[0], t.id, target.id); } catch (e) {}
        const rollback = selectors().map(el => [el.value, el.getAttribute('data-persisted-court')]);
        window._callCF = () => Promise.resolve({ data: { ok: true, changed: true } });
        selectors()[0].value = 'Quadra 5';
        await window._assignMatchCourtFromSelect(selectors()[0], t.id, target.id);
        const saved = selectors().map(el => [el.value, el.getAttribute('data-persisted-court')]);
        return { initial, rollback, saved, modelCourt: target.court };
      });
      assert(courtState.initial.every(x => x.value === 'Quadra 5' && !x.red && x.occupiedDisabled), JSON.stringify(courtState));
      assert.deepEqual(courtState.rollback, [['Quadra 5', 'Quadra 4'], ['Quadra 5', 'Quadra 4']]);
      assert.deepEqual(courtState.saved, [['Quadra 5', 'Quadra 5'], ['Quadra 5', 'Quadra 5']]);
      assert.equal(courtState.modelCourt, 'Quadra 5');
    } finally { await real.close(); }
    const scoringPage = await browser.newPage();
    try {
      await scoringPage.addScriptTag({ content: fs.readFileSync('js/views/bracket-ui.js', 'utf8') });
      const saved = await scoringPage.evaluate(async () => {
        const matches = ['simple', 'best3', 'tiebreak'].map(id => ({ id, p1: 'A', p2: 'B', group: 0 }));
        const tournament = { id: 'sb_scores', matches, scoring: { type: 'simple' } };
        const calls = [];
        window.AppStore = { currentUser: { uid: 'org' },
          commitResultTx: (tid, mid, payload) => { calls.push({ mid, payload }); return Promise.resolve(true); }, logAction: () => {} };
        window._findTournamentById = () => tournament;
        window._findMatch = (t, id) => t.matches.find(match => match.id === id);
        window._effectiveScoring = t => t.scoring;
        window._scoringUsesSets = scoring => scoring.type === 'sets';
        window._matchSetPlan = (scoring, match) => match.id === 'best3'
          ? { initialTwoSetEntry: true, superTiebreak: true, superTiebreakPoints: 10, tiebreakMargin: 2 } : null;
        window._validateNormalSetScore = () => ({ ok: true });
        window._tbLoserGames = () => 6;
        window._isTiebreakSetScore = (a, b) => Math.min(a, b) === 6 && Math.max(a, b) === 7;
        window._tbMargem = () => 2;
        window._tbPoints = (a, b) => ({ pointsP1: a, pointsP2: b });
        window._resultNeedsApproval = () => false;
        window._checkGroupRoundComplete = () => {};
        window._idMapHas = () => true;
        window._idMapDel = () => {};
        window._propagateMatchUpdate = () => {};
        window._rerenderBracket = () => {};
        window._t = key => key;
        window.showNotification = () => {};
        const field = (key, value, scoped) => '<input ' + (scoped ? 'data-operations-source-input' : 'id') + '="' + key + '" value="' + value + '">';
        const submit = async (id, values) => {
          const op = document.createElement('div');
          op.innerHTML = Object.entries(values).map(([key, value]) => field(key, value, true)).join('');
          // A chave contém números diferentes: o servidor precisa receber a faixa.
          document.body.innerHTML = Object.keys(values).map(key => field(key, 1, false)).join('');
          await window._saveResultInline(tournament.id, id, op);
        };
        await submit('simple', { 's1-simple': 6, 's2-simple': 3 });
        tournament.scoring = { type: 'sets', tiebreakEnabled: true };
        await submit('best3', { 's1-best3-0': 6, 's2-best3-0': 4, 's1-best3-1': 4,
          's2-best3-1': 6, 's1-best3-2': 10, 's2-best3-2': 8 });
        await submit('tiebreak', { 's1-tiebreak': 7, 's2-tiebreak': 6, 'tb1-tiebreak': 7, 'tb2-tiebreak': 5 });
        return calls.map(call => ({ mid: call.mid, payload: call.payload }));
      });
      assert.deepEqual(saved.map(call => call.mid), ['simple', 'best3', 'tiebreak']);
      assert.deepEqual([saved[0].payload.s1, saved[0].payload.s2], [6, 3]);
      assert.deepEqual(saved[1].payload.sets.map(set => [set.gamesP1, set.gamesP2]), [[6, 4], [4, 6], [10, 8]]);
      assert.deepEqual([saved[1].payload.setsWonP1, saved[1].payload.setsWonP2], [2, 1]);
      assert.deepEqual([saved[2].payload.s1, saved[2].payload.s2, saved[2].payload.tbP1, saved[2].payload.tbP2], [7, 6, 7, 5]);
      assert.equal(saved[2].payload.isTiebreakEntry, true);
    } finally { await scoringPage.close(); }
    console.log('✓ faixa replica o card completo com IDs únicos, chamada, placar e relógio');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
