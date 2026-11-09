'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('@playwright/test');
const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = source.indexOf('function _bracketAgendaCompare(');
const end = source.indexOf('function _bracketAgendaExpected(', start);
assert(start > 0 && end > start);
const dateStart = source.indexOf('function _matchCardDateTime(ms, t)');
const dateEnd = source.indexOf('\n// Evento concentrado', dateStart);
assert(dateStart > 0 && dateEnd > dateStart);
const visibleDateTime = new Function('_matchCardTimeZone', source.slice(dateStart, dateEnd) +
  '\nreturn _matchCardVisibleDateTime;')(() => 'America/Sao_Paulo');
const at = Date.parse('2026-11-13T11:00:00Z');
assert.equal(visibleDateTime(at, { scheduleWindow: { days: [{ day: '2026-11-13' }] } }, true), '08:00');
assert.equal(visibleDateTime(at, { scheduleWindow: { days: [{ day: '2026-11-13' }, { day: '2026-11-14' }] } }, true), '13/11 08:00');
assert.equal(visibleDateTime(at, { scheduleWindow: { days: [{ day: '2026-11-13' }] } }, false), '13/11 08:00');

(async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<main id="view-container"><section id="tourn-grid-container"></section><nav data-bracket-tabs-root="1" data-tournament-id="sb_test"></nav><section id="rounds"><article id="card-m2" class="sp-match-card"></article></section></main>');
    await page.addStyleTag({ path: 'css/components.css' });
    await page.addStyleTag({ path: 'css/bracket.css' });
    await page.addScriptTag({ path: 'js/domain/next-match.js' });
    await page.addScriptTag({ path: 'js/domain/court-occupancy.js' });
    await page.addScriptTag({ path: 'js/views/bracket-model.js' });
    await page.addScriptTag({ content: source.slice(start, end) });
    const state = await page.evaluate(async () => {
      window._matchCardTimestamp = value => value ? Date.parse(value) : 0;
      window._bracketSyncRoundHeadingOffsets = () => {};
      window._isConcentratedTournament = () => true;
      window._safeHtml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      window.AppStore = { currentUser: { uid: 'org' } };
      window._isUserAuthority = (t, u) => ['org', 'ref'].includes(u.uid);
      window._souOrganizador = () => window.AppStore.currentUser.uid === 'org';
      window._resultEntryIncludes = () => true;
      window.renderMatchCard = (m, canEnter, tid, num, compact, pending, opts) => _bracketScopeReplicaHtml(
        '<article class="sp-match-card" id="card-' + m.id + '"><div class="sp-mc-head">JOGO ' + num +
        (m.courtCalledAt ? '<div class="sp-mc-acts"><button class="cancel-x-btn" onclick="window._cancelCourtAction()">Cancelar</button>' +
          '<button class="sp-match-end-court" onclick="window._endMatchOnCourt()">Encerrado</button></div>' : '') +
        '<button id="live-' + m.id + '" onclick="window._openLiveScoringForMatch()">📡 Ao Vivo</button>' +
        '<button class="wo-action" onclick="window._woOpenClaim()">Aplicar W.O.</button>' +
        '<button class="open-action" onclick="window._editResultInline()">Editar</button>' +
        '<button id="confirm-' + m.id + '" data-confirm-for="' + m.id + '" style="display:none" onclick="window._irrelevant()">✓ Confirmar</button></div>' +
        '<div class="team"><strong>TIME A</strong><span>' + m.p1 + '</span><label for="s1-' + m.id + '">Placar</label><input id="s1-' + m.id + '" oninput="window._irrelevant()"></div>' +
        '<div class="versus">VS</div><div class="team"><strong>TIME B</strong><span>' + m.p2 + '</span><input id="s2-' + m.id + '" oninput="window._irrelevant()"></div>' +
        '<div class="sp-match-operational" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><label class="sp-match-court"><select onclick="event.stopPropagation()" data-persisted-court="' + m.court + '"><option>' + m.court + '</option></select></label>' +
        '<button class="sp-match-confirm">OK</button>' + (m.courtCalledAt ? '<span class="sp-match-court-clock" style="margin-left:auto"><button class="sp-match-clock-action sp-match-clock-next">FF</button><span class="sp-match-clock-label">Chamado</span><span class="sp-match-clock-next-slot"></span><span class="sp-match-call-timer">00:01</span></span>' : '') +
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
      const courtLabelRect = strip.querySelector('.sp-operations-court-slot > .sp-operations-label').getBoundingClientRect();
      const availabilityRect = strip.querySelector('.sp-operations-availability').getBoundingClientRect();
      initial.geometry = { trackHeight, freeHeight, freeTop: freeRect.top, freeBottom: freeRect.bottom, nextHeight: nextRect.height, nextTop: nextRect.top, nextBottom: nextRect.bottom,
        courtLabelTop: courtLabelRect.top, availabilityTop: availabilityRect.top,
        rowHeight: strip.querySelector('.sp-operations-track').style.getPropertyValue('--sp-operations-row-height'),
        replicaHeight: strip.querySelector('.sp-operations-next .sp-operations-replica').getBoundingClientRect().height,
        trackBoxHeight: strip.querySelector('.sp-operations-track').getBoundingClientRect().height,
        nextBoxHeight: strip.querySelector('.sp-operations-next').getBoundingClientRect().height };
      initial.freeSlotFillsTrack = trackHeight > 100 && Math.abs(courtLabelRect.top - availabilityRect.top) <= 3;
      const fullSlotRect = strip.querySelector('.sp-operations-court-slot').getBoundingClientRect();
      initial.freeSlotMatchesCard = fullSlotRect.height >= nextRect.height &&
        Math.abs(freeRect.top - nextRect.top) <= 3 &&
        Math.abs(freeRect.bottom - nextRect.bottom) <= 3 &&
        Math.abs(freeRect.height - nextRect.height) <= 3;
      const openSelect = next.querySelector('select');
      const selectorDoesNotOpenBracket = !openSelect.hasAttribute('data-operations-open');
      openSelect.click();
      const selectorStayedInStrip = !window.opened;
      openSelect.focus();
      window._bracketOperationsRefresh(t, root);
      const selectFocusRestored = document.activeElement === openSelect &&
        strip.querySelector('.sp-operations-next select') === openSelect;
      next = strip.querySelector('.sp-operations-next .sp-match-card');
      next.querySelector('[id*="-live-"]').click();
      next.querySelector('.wo-action').click();
      next.querySelector('.open-action').click();
      openSelect.blur();
      next.querySelector('.sp-match-confirm').click();
      await Promise.resolve();
      const court = strip.querySelector('.sp-operations-court-slot:nth-child(2) .sp-operations-replica');
      const fields = [...court.querySelectorAll('input[data-operations-source-input]')];
      fields[0].value = '6'; fields[0].dispatchEvent(new Event('input', { bubbles: true }));
      fields[1].value = '3'; fields[1].dispatchEvent(new Event('input', { bubbles: true }));
      const confirmVisible = court.querySelector('[data-confirm-for]').style.display !== 'none';
      court.querySelector('[data-confirm-for]').click();
      court.querySelector('.sp-match-clock-next').click();
      window._bracketOperationsRefresh(t, root);
      const activeRect = strip.querySelector('.sp-operations-court-slot--active .sp-match-card').getBoundingClientRect();
      const footer = strip.querySelector('.sp-operations-court-slot--active .sp-operations-court-footer-actions');
      const footerRect = footer && footer.getBoundingClientRect();
      const stableHeights = [];
      for (let i = 0; i < 8; i++) {
        window._bracketOperationsRefresh(t, root);
        const current = strip.querySelector('.sp-operations-court-slot--active .sp-match-card');
        stableHeights.push(current.getBoundingClientRect().height);
      }
      const clockRect = strip.querySelector('.sp-operations-court-slot--active .sp-match-court-clock').getBoundingClientRect();
      const goldRect = strip.querySelector('.sp-operations-next .sp-match-card').getBoundingClientRect();
      const afterCall = { called: window.called, saved: window.saved, scoreSourceCleared: window._bracketOperationsScoreSource == null,
        clock: window.clock, live: window.live, wo: window.wo,
        opened: window.opened, confirmVisible,
        activeBottomActions: [...strip.querySelectorAll('.sp-operations-court-slot--active .sp-match-operational [data-operations-action]')]
          .map(button => button.getAttribute('data-operations-action')),
        activeHeaderActions: strip.querySelectorAll('.sp-operations-court-slot--active .sp-mc-head [data-operations-action="cancel-court"], .sp-operations-court-slot--active .sp-mc-head [data-operations-action="ended"]').length,
        clockInsideCard: clockRect.top >= activeRect.top && clockRect.bottom <= activeRect.bottom - 2 && clockRect.right <= activeRect.right - 2,
        activeBottomAligned: Math.abs(activeRect.bottom - goldRect.bottom) <= 3,
        footerOnRight: !!footerRect && footerRect.right >= activeRect.right - 20,
        stableHeights,
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
      return { initial, afterCall, refereeView, selectFocusRestored, selectorDoesNotOpenBracket,
        selectorStayedInStrip, outsiderHidden: !document.querySelector('[data-bracket-operations-strip]') };
    });
    assert(state.initial.full && state.initial.names && state.initial.noCanonical && state.initial.uniqueIds && state.initial.linked && state.initial.noInline);
    assert.deepEqual(state.initial.courts, ['Quadra 4', 'Quadra 5']);
    assert(state.initial.freeSlotFillsTrack, 'Quadra X deve alinhar com X quadras livres: ' + JSON.stringify(state.initial));
    assert(state.initial.freeSlotMatchesCard, 'o box vazio deve ter a mesma altura e alinhamento do card do próximo jogo: ' + JSON.stringify(state.initial));
    assert.deepEqual(state.afterCall.called, ['sb_test', 'm1', 'Quadra 5']);
    assert.deepEqual(state.afterCall.live, ['sb_test', 'm1']);
    assert.deepEqual(state.afterCall.wo, ['sb_test', 'm|m1']);
    assert.deepEqual(state.afterCall.opened, ['sb_test', 'm1']);
    assert.deepEqual(state.afterCall.saved, ['sb_test', 'm1', '6', '3']);
    assert(state.afterCall.scoreSourceCleared, 'marca de origem do placar deve ser limpa quando a gravação retorna');
    assert.deepEqual(state.afterCall.clock, ['sb_test', 'm1', 'next']);
    assert.deepEqual(state.afterCall.activeBottomActions, ['cancel-court', 'ended']);
    assert.equal(state.afterCall.activeHeaderActions, 0, 'Cancelar e Encerrado saem do cabeçalho em quadra');
    assert(state.afterCall.clockInsideCard, 'o cronômetro chamado deve caber inteiramente dentro do card');
    assert(state.afterCall.confirmVisible && state.outsiderHidden && state.selectFocusRestored &&
      state.selectorDoesNotOpenBracket && state.selectorStayedInStrip,
    'selecionar a quadra na faixa não pode abrir o card da chave');
    assert(state.afterCall.activeBottomAligned, 'cards em quadra e próximo a chamar devem alinhar pela base');
    assert(state.afterCall.footerOnRight, 'Cancelar e Encerrado ficam à direita do rodapé');
    assert(Math.max(...state.afterCall.stableHeights) - Math.min(...state.afterCall.stableHeights) <= 2,
      'a altura do card não cresce a cada atualização: ' + state.afterCall.stableHeights);
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
      const courtSlot = strip.querySelector('.sp-operations-court-slot .sp-operations-court-free');
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
    for (const width of [600, 900, 1440, 1971]) {
      await page.setViewportSize({ width, height: 800 });
      const geometry = await page.evaluate(() => {
        const t = window._findTournamentById();
        const root = document.querySelector('[data-bracket-tabs-root]');
        window._bracketCourtReleaseCache = { sb_test: { released: { m1: '2026-10-22T18:05:00Z' } } };
        window._bracketOperationsRefresh(t, root);
        const strip = root._bracketOperationsStrip;
        const rect = selector => strip.querySelector(selector).getBoundingClientRect();
        const next = rect('.sp-operations-next .sp-match-card');
        const pending = rect('.sp-operations-pending .sp-match-card');
        const free = rect('.sp-operations-court-free');
        const panels = [...strip.querySelectorAll('.sp-operations-next,.sp-operations-pending,.sp-operations-courts')].map(el => el.getBoundingClientRect());
        const label = rect('.sp-operations-court-slot > .sp-operations-label');
        const availability = rect('.sp-operations-availability');
        return { next: [next.top, next.bottom], pending: [pending.top, pending.bottom],
          free: [free.top, free.bottom], panels: panels.map(r => [r.top, r.bottom]),
          labels: [label.top, availability.top], clipped: strip.querySelector('.sp-operations-track').scrollHeight > strip.querySelector('.sp-operations-track').clientHeight };
      });
      const aligned = (a, b) => Math.abs(a[0] - b[0]) <= 3 && Math.abs(a[1] - b[1]) <= 3;
      assert(aligned(geometry.next, geometry.pending) && aligned(geometry.next, geometry.free),
        'cards e slot livre devem ocupar a mesma região em ' + width + 'px: ' + JSON.stringify(geometry));
      assert(geometry.panels.every(panel => aligned(panel, geometry.panels[0])) &&
        Math.abs(geometry.labels[0] - geometry.labels[1]) <= 3 && !geometry.clipped,
      'as três seções e cabeçalhos devem alinhar sem corte em ' + width + 'px: ' + JSON.stringify(geometry));
    }
    const scrollAfterRefresh = await page.evaluate(() => {
      document.getElementById('view-container').style.paddingTop = '650px';
      document.getElementById('rounds').style.height = '1600px';
      window.scrollTo(0, 350);
      const before = window.scrollY;
      const root = document.querySelector('[data-bracket-tabs-root]');
      root._bracketOperationsStrip.querySelector('.sp-operations-track').scrollLeft = 180;
      const leftBefore = root._bracketOperationsStrip.querySelector('.sp-operations-track').scrollLeft;
      window._bracketOperationsRefresh(window._findTournamentById(), root);
      return { before, after: window.scrollY, leftBefore, left: root._bracketOperationsStrip.querySelector('.sp-operations-track').scrollLeft };
    });
    assert.equal(scrollAfterRefresh.after, scrollAfterRefresh.before, 'atualização da faixa preserva a posição vertical');
    assert.equal(scrollAfterRefresh.left, scrollAfterRefresh.leftBefore, 'atualização da faixa preserva a posição horizontal');
    const toggleStart = source.indexOf('window._toggleMyMatches = function(checked) {');
    const toggleEnd = source.indexOf('// ── PINTAR EM ETAPAS', toggleStart);
    assert(toggleStart > 0 && toggleEnd > toggleStart);
    await page.addScriptTag({ content: source.slice(toggleStart, toggleEnd) });
    const filterFocus = await page.evaluate(async () => {
      const t = window._findTournamentById();
      const root = document.querySelector('[data-bracket-tabs-root]');
      window.AppStore.currentUser = { uid: 'org' };
      window._bracketOperationsRefresh(t, root);
      let jumps = 0;
      window._bracketClearSearchForHeaderFilter = () => {};
      window._applyMyMatchesFilter = () => {};
      window._bracketSyncHeaderFilterButtons = () => {};
      window._bracketTabsRevealFilteredMatch = () => { jumps++; };
      window._bracketEntryTarget = () => ({ scrollIntoView: () => { jumps++; } });
      window._reflowChrome = () => {};
      window.scrollTo(0, 350);
      const before = window.scrollY;
      window._toggleMyMatches(true);
      window._toggleMyMatches(false);
      await new Promise(resolve => setTimeout(resolve, 80));
      const operational = { jumps, before, after: window.scrollY, visible: !!root._bracketOperationsStrip };
      window.AppStore.currentUser = { uid: 'other' };
      window._bracketOperationsRefresh(t, root);
      jumps = 0;
      window._toggleMyMatches(true);
      await new Promise(resolve => setTimeout(resolve, 80));
      return { operational, participantJumps: jumps, participantHasStrip: !!root._bracketOperationsStrip };
    });
    assert.deepEqual(filterFocus.operational, { jumps: 0, before: 350, after: 350, visible: true },
      'alternar Só meus jogos não move nem oculta a faixa operacional: ' + JSON.stringify(filterFocus));
    assert(filterFocus.participantJumps > 0 && !filterFocus.participantHasStrip,
      'participante sem faixa conserva o foco anterior: ' + JSON.stringify(filterFocus));
    const bestOfThree = await page.evaluate(() => {
      const op = document.createElement('div');
      op.innerHTML = '<button data-confirm-for="m3" style="display:none">✓</button>' +
        '<input data-operations-source-input="s1-m3"><input data-operations-source-input="s2-m3">';
      const fields = [...op.querySelectorAll('input')];
      fields[0].value = '6';
      _bracketOperationsSyncReplicaScore(op, 'm3');
      const missingSideHidden = op.querySelector('button').style.display === 'none';
      fields[1].value = '0';
      _bracketOperationsSyncReplicaScore(op, 'm3');
      const firstSetReady = op.querySelector('button').style.display !== 'none';
      fields[0].value = '';
      _bracketOperationsSyncReplicaScore(op, 'm3');
      return { missingSideHidden, firstSetReady, clearingHides: op.querySelector('button').style.display === 'none' };
    });
    assert.deepEqual(bestOfThree, { missingSideHidden: true, firstSetReady: true, clearingHides: true });
    const nextSetButton = await page.evaluate(() => {
      const op = document.createElement('div');
      op.innerHTML = '<button data-confirm-for="m3" style="display:none">✓</button>' +
        '<input class="sp-set-inp--live" data-operations-source-input="s1-m3">' +
        '<input class="sp-set-inp--live" data-operations-source-input="s2-m3">' +
        '<input class="sp-set-inp--live" data-operations-source-input="s1-m3-1" value="6">' +
        '<input class="sp-set-inp--live" data-operations-source-input="s2-m3-1" value="4">';
      _bracketOperationsSyncReplicaScore(op, 'm3');
      return op.querySelector('button').style.display !== 'none';
    });
    assert.equal(nextSetButton, true, 'a réplica oferece Confirmar se um set seguinte foi preenchido');
    const endStart = source.indexOf('function _courtOperationId()');
    const endStop = source.indexOf('function _syncMatchCourtCopies(', endStart);
    assert(endStart > 0 && endStop > endStart);
    await page.addScriptTag({ content: source.slice(endStart, endStop) });
    const endFeedback = await page.evaluate(async () => {
      const calls = [], notices = [];
      window.showConfirmDialog = (_title, _message, onConfirm) => onConfirm();
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
    const courtDialog = await page.evaluate(async () => {
      let opens = 0, writes = 0, callbacks;
      window._callCF = () => { writes++; return Promise.resolve({ data: { ok: true } }); };
      window.showConfirmDialog = (_title, _message, ok, cancel) => {
        const old = document.getElementById('custom-confirm-dialog');
        if (old) old.remove();
        const dialog = document.createElement('div');
        dialog.id = 'custom-confirm-dialog'; document.body.appendChild(dialog);
        callbacks = { ok, cancel, dialog }; opens++;
      };
      const first = window._endMatchOnCourt('tour_test', 'cancelled');
      const duplicate = window._endMatchOnCourt('tour_test', 'cancelled');
      const duplicated = opens === 1 && await duplicate === null;
      callbacks.cancel(); callbacks.dialog.remove();
      const cancelled = await first === null && writes === 0;
      const replaced = window._endMatchOnCourt('tour_test', 'replaced');
      window.showConfirmDialog('Outro diálogo', '', () => {}, () => {});
      const replacementSettled = await Promise.race([replaced.then(x => x === null), new Promise(r => setTimeout(() => r(false), 500))]);
      const retried = window._endMatchOnCourt('tour_test', 'replaced');
      const reopens = opens === 4;
      callbacks.ok(); callbacks.ok();
      await retried;
      return { duplicated, cancelled, replacementSettled, reopens, writes };
    });
    assert.deepEqual(courtDialog, { duplicated: true, cancelled: true, replacementSettled: true, reopens: true, writes: 1 });
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
        window._matchSetPlan = () => ({ multi: false, columns: [] });
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
        window._matchSetPlan = (scoring, match) => {
          if (match.id !== 'best3') return null;
          const played = match.sets || [];
          const live = { i: played.length, kind: played.length === 2 ? 'stb' : 'set',
            state: 'live', label: played.length === 2 ? 'STB' : String(played.length + 1), points: 10 };
          const columns = played.map((set, i) => ({ i, kind: 'set', state: 'done', set }));
          columns.push(live);
          if (!played.length) columns.push({ i: 1, kind: 'set', state: 'open' });
          return { multi: true, played, setsToWin: 2, tiebreakMargin: 2,
            live, columns };
        };
        window._saveSetsEmAndamento = (_tid, mid, sets, p1, p2) => {
          const match = matches.find(m => m.id === mid);
          match.sets = sets;
          calls.push({ mid, payload: { setsInProgress: true, sets, setsWonP1: p1, setsWonP2: p2 } });
          return Promise.resolve(true);
        };
        window._commitSetsResult = (_tid, mid, sets, p1, p2) => {
          calls.push({ mid, payload: { sets, setsWonP1: p1, setsWonP2: p2 } });
          return Promise.resolve(true);
        };
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
          const inputs = id === 'best3' && !(matches.find(m => m.id === id).sets || []).length
            ? { ...values, 's1-best3-1': '', 's2-best3-1': '' } : values;
          op.innerHTML = Object.entries(inputs).map(([key, value]) => field(key, value, true)).join('');
          // A chave contém números diferentes: o servidor precisa receber a faixa.
          document.body.innerHTML = Object.keys(values).map(key => field(key, 1, false)).join('');
          await window._saveResultInline(tournament.id, id, op);
        };
        await submit('simple', { 's1-simple': 6, 's2-simple': 3 });
        tournament.scoring = { type: 'sets', setsToWin: 2, gamesPerSet: 6, superTiebreak: true, tiebreakEnabled: true };
        await submit('best3', { 's1-best3': 6, 's2-best3': 4 });
        await submit('best3', { 's1-best3': 4, 's2-best3': 6 });
        await submit('best3', { 's1-best3': 10, 's2-best3': 8 });
        await submit('tiebreak', { 's1-tiebreak': 7, 's2-tiebreak': 6, 'tb1-tiebreak': 7, 'tb2-tiebreak': 5 });
        return calls.map(call => ({ mid: call.mid, payload: call.payload }));
      });
      assert.deepEqual(saved.map(call => call.mid), ['simple', 'best3', 'best3', 'best3', 'tiebreak']);
      assert.deepEqual([saved[0].payload.s1, saved[0].payload.s2], [6, 3]);
      assert.equal(saved[1].payload.setsInProgress, true);
      assert.deepEqual(saved[1].payload.sets.map(set => [set.gamesP1, set.gamesP2]), [[6, 4]]);
      assert.deepEqual(saved[2].payload.sets.map(set => [set.gamesP1, set.gamesP2]), [[6, 4], [4, 6]]);
      assert.deepEqual(saved[3].payload.sets.map(set => [set.gamesP1, set.gamesP2]), [[6, 4], [4, 6], [10, 8]]);
      assert.deepEqual([saved[3].payload.setsWonP1, saved[3].payload.setsWonP2], [2, 1]);
      assert.deepEqual([saved[4].payload.s1, saved[4].payload.s2, saved[4].payload.tbP1, saved[4].payload.tbP2], [7, 6, 7, 5]);
      assert.equal(saved[4].payload.isTiebreakEntry, true);
    } finally { await scoringPage.close(); }
    await page.addStyleTag({ content: '.sp-operations-standings td { height:48px; }' });
    const carousel = await page.evaluate(async () => {
      const t = window._findTournamentById();
      const root = document.querySelector('[data-bracket-tabs-root]');
      window.AppStore.currentUser = { uid: 'org' };
      const games = [1, 9, 17].map((num, i) => ({ id: 'group-' + num, _gameNum: num,
        isMonarch: true, category: 'Fem Diamante', p1: ['Ana / Bia', 'Ana / Carla', 'Ana / Dora'][i],
        p2: ['Carla / Dora', 'Bia / Dora', 'Bia / Carla'][i],
        scheduledAt: '2026-11-13T11:00:00Z', court: 'Quadra 4' }));
      t.matches = [];
      t.scheduleWindow = { days: [{ day: '2026-11-13', startTime: '08:00', endTime: '21:00' }] };
      t.rounds = [];
      t.phaseRounds = { classificatoria: { rounds: [{ matches: games, monarchGroups: [{
        name: 'R1 Grupo A', category: 'Fem Diamante', players: ['Ana', 'Bia', 'Carla', 'Dora'],
        matchIds: games.map(game => game.id)
      }] }] } };
      t._nJogos = 3;
      t.courtNames = ['Quadra 4'];
      window.groupCalls = [];
      window._confirmMatchCourtCall = (button, tid, mid) => {
        window.groupCalls.push([mid, button.closest('.sp-match-operational').querySelector('select')?.value]);
        return Promise.resolve();
      };
      window._computeMonarchStandings = group => group.players.map((name, i) => ({ name, wins: 3 - i, pointsFor: 6 - i, pointsAgainst: i }));
      window._bracketCourtReleaseCache = { sb_test: { released: {} } };
      root._bracketOperationsNav = {};
      window._bracketOperationsRefresh(t, root);
      const strip = root._bracketOperationsStrip;
      const read = () => ({ title: strip.querySelector('.sp-operations-next .sp-operations-nav-title')?.textContent,
        navStyle: (() => { const nav = strip.querySelector('.sp-operations-next .sp-operations-game-nav');
          const style = getComputedStyle(nav); return { color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight }; })(),
        match: strip.querySelector('.sp-operations-next [data-operations-match]')?.getAttribute('data-operations-match'),
        postpone: strip.querySelector('.sp-operations-next [data-postpone-next]')?.getAttribute('data-postpone-next'),
        cardHeight: strip.querySelector('.sp-operations-next .sp-match-card')?.getBoundingClientRect().height,
        category: strip.querySelector('.sp-operations-next [data-match-time-status], .sp-operations-next .sp-operations-standings-category')?.textContent.trim(),
        footerBelowTable: (() => { const card = strip.querySelector('.sp-operations-next .sp-operations-standings-card');
          const table = card?.querySelector('.sp-operations-standings');
          const footer = card?.querySelector('.sp-operations-standings-footer');
          return !!footer && footer.getBoundingClientRect().top >= table.getBoundingClientRect().bottom - 2; })(),
        categoryAboveStandings: (() => { const card = strip.querySelector('.sp-operations-next .sp-operations-standings-card');
          const status = card?.querySelector('.sp-operations-standings-status');
          const category = card?.querySelector('.sp-operations-standings-category');
          return !!category && !!status && category.getBoundingClientRect().bottom <= status.getBoundingClientRect().top + 1; })(),
        callGameLabel: !!strip.querySelector('.sp-operations-next .sp-operations-standings-call-label'),
        teams: [...strip.querySelectorAll('.sp-operations-next .team span')].map(el => el.textContent),
        canCall: !!strip.querySelector('.sp-operations-next .sp-match-confirm'),
        court: strip.querySelector('.sp-operations-next .sp-match-court select')?.value,
        classification: !!strip.querySelector('.sp-operations-next .sp-operations-standings'),
        players: [...strip.querySelectorAll('.sp-operations-next .sp-operations-standings tbody tr')].map(el => el.textContent) });
      const callCurrent = async () => {
        strip.querySelector('.sp-operations-next .sp-match-confirm')?.click();
        await new Promise(resolve => setTimeout(resolve, 0));
      };
      const states = [read()];
      await callCurrent();
      for (let i = 0; i < 3; i++) {
        strip.querySelector('.sp-operations-next [data-operations-nav="next"]').click();
        states.push(read());
        await callCurrent();
      }
      const standingsCells = strip.querySelectorAll('.sp-operations-next .sp-operations-standings tbody tr:first-child td');
      const standingsInset = {
        left: parseFloat(getComputedStyle(standingsCells[0]).paddingLeft),
        right: parseFloat(getComputedStyle(standingsCells[standingsCells.length - 1]).paddingRight),
        contentLeft: (() => { const card = strip.querySelector('.sp-operations-next .sp-match-card');
          return Math.min(...['.sp-operations-standings-status', '.sp-operations-standings-category', '.sp-operations-standings', '.sp-operations-standings-footer'].map(sel =>
            strip.querySelector('.sp-operations-next ' + sel).getBoundingClientRect().left - card.getBoundingClientRect().left)); })()
      };
      strip.querySelector('.sp-operations-next [data-operations-nav="next"]').click();
      states.push(read());
      strip.querySelector('.sp-operations-next [data-operations-nav="prev"]').click();
      states.push(read());
      strip.querySelector('.sp-operations-next [data-operations-nav="prev"]').click();
      window._bracketOperationsRefresh(t, root);
      const survivesRefresh = read().title === 'JOGO 17';
      strip.querySelector('.sp-operations-next [data-operations-action="live"]').click();
      const liveMatch = window.live?.[1];
      const arrows = [...strip.querySelectorAll('.sp-operations-next .sp-operations-nav-arrow')].map(el => ({
        label: el.getAttribute('aria-label'),
        triangular: el.querySelector('svg polygon')?.getAttribute('points').trim().split(/\s+/).length === 3,
        width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }));
      t.scheduleWindow.days.push({ day: '2026-11-14', startTime: '08:00', endTime: '21:00' });
      window._bracketOperationsRefresh(t, root);
      const multiDayHasNav = !!strip.querySelector('.sp-operations-next [data-operations-nav]');
      t.scheduleWindow.days.pop();
      t.phaseRounds.classificatoria.rounds[0].monarchGroups[0].matchIds = games.slice(0, 2).map(game => game.id);
      window._bracketOperationsRefresh(t, root);
      const incompleteHasNav = !!strip.querySelector('.sp-operations-next [data-operations-nav]');
      const other = [1, 2, 3].map(n => ({ id: n, isMonarch: true, p1: 'Outro A', p2: 'Outro B' }));
      const grouped = { ...t, rounds: [{ monarchGroups: [
        { name: 'Grupo A1', matchIds: [1, '2', 3] },
        { name: 'Grupo B1', matchIds: games.map(game => game.id) }
      ] }] };
      const numeric = _bracketOperationsGroup(grouped, other[0], [...other, ...games]);
      const distinct = _bracketOperationsGroup(grouped, games[0], [...other, ...games]);
      const missing = _bracketOperationsGroup({ ...grouped, rounds: [{ monarchGroups: [{ matchIds: [1, 2, 99] }] }] }, other[0], other);
      const tieBreak = _bracketOperationsGroup(grouped, other[0], [{ ...other[0], isTieBreak: true }, ...other.slice(1), ...games]);
      const nonMonarch = _bracketOperationsGroup(grouped, other[0], [{ ...other[0], isMonarch: false }, ...other.slice(1), ...games]);
      const refs = _bracketOperationsGroup({ ...grouped, rounds: [{ monarchGroups: [{ matches: other.map(m => ({ id: m.id })) }] }] }, other[0], other);
      const stale = other.map(m => ({ ...m, scoreP1: 0 }));
      const fresh = other.map(m => ({ ...m, scoreP1: 6 }));
      const roundCanonical = _bracketOperationsGroup({ ...grouped, matches: stale,
        rounds: [{ matches: fresh, monarchGroups: [{ name: 'Grupo A1', matchIds: [1, 2, 3] }] }] }, stale[0], [...stale, ...fresh]);
      const onlyRounds = _bracketOperationsGroup({ ...grouped, matches: [],
        rounds: [{ matches: other, monarchGroups: [{ name: 'Grupo A1', matchIds: [1, 2, 3] }] }] }, other[0], other);
      const extra = _bracketOperationsGroup({ ...grouped, rounds: [{ monarchGroups: [{ matches: [...other, { id: 4, isTieBreak: true }] }] }] }, other[0], [...other, { id: 4, isTieBreak: true }]);
      // Shape real do CAMIS: 3 categorias reutilizam monarchGroup=0; não há
      // rounds/phaseRounds nem documentos de grupo no torneio carregado.
      const camis = ['Fem Diamante', 'Fem Ouro', 'Fem Prata'].flatMap((category, ci) =>
        [0, 1, 2].map((slot, i) => ({
          id: 'match-rr-r1-g0-' + slot + '-' + category.replace(/ /g, '_') + '-1794172435574',
          isMonarch: true, monarchGroup: 0, round: 1, phaseIndex: 0,
          category, groupName: 'R1 Grupo A', _gameNum: ci * 24 + i + 1,
          team1: ['A', 'B'], team2: ['C', 'D'],
          scheduledAt: new Date(Date.UTC(2026, 10, 13, 11, i * 20)).toISOString(),
          p1: 'A / B', p2: 'C / D'
        })));
      const camisTournament = { ...t, matches: camis, rounds: [], phaseRounds: {} };
      window._currentBracketTournament = camisTournament;
      const camisGroup = _bracketOperationsGroup(camisTournament, camis[0], camis);
      const camisOther = _bracketOperationsGroup(camisTournament, camis[3], camis);
      const camisPrata = _bracketOperationsGroup(camisTournament, camis[6], camis);
      const nextRound = camis.slice(0, 3).map((game, i) => ({ ...game,
        id: 'match-rr-r2-g0-' + i + '-Fem_Diamante-1794172435574', round: 2, groupName: 'R2 Grupo A' }));
      const acrossRounds = { ...camisTournament, matches: [...camis, ...nextRound] };
      window._currentBracketTournament = acrossRounds;
      const nextRoundLabel = _bracketOperationsGroup(acrossRounds, nextRound[0], acrossRounds.matches)?.name;
      const sixGames = { ...camisTournament, matches: [...camis, ...camis.slice(0, 3).map((game, i) => ({
        ...game, id: 'extra-' + i
      }))] };
      window._currentBracketTournament = sixGames;
      const sixGamesHaveNav = !!_bracketOperationsGroup(sixGames, camis[0], sixGames.matches);
      const idCategories = { ...camisTournament,
        categoryDefinitions: [{ id: 'diamante', label: 'Fem Diamante' }, { id: 'ouro', label: 'Fem Ouro' }, { id: 'prata', label: 'Fem Prata' }],
        matches: camis.map(game => ({ ...game, category: ({ 'Fem Diamante': 'diamante', 'Fem Ouro': 'ouro', 'Fem Prata': 'prata' })[game.category] })) };
      window._currentBracketTournament = idCategories;
      const idLabel = _bracketOperationsGroup(idCategories, idCategories.matches[3], idCategories.matches)?.name;
      window._currentBracketTournament = camisTournament;
      document.documentElement.style.fontSize = '20px';
      const simpleRender = window.renderMatchCard;
      window.renderMatchCard = function (game, canEnter, tid, num, compact, pending, options) {
        const template = document.createElement('template');
        template.innerHTML = simpleRender(game, canEnter, tid, num, compact, pending, options);
        const card = template.content.firstElementChild;
        if (game.isMonarch) card.querySelector('.sp-mc-head').innerHTML =
          '<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start;min-width:0;">' +
          '<div style="display:flex;align-items:center;gap:7px;min-width:0;flex-wrap:wrap;">' +
          '<span style="font-size:.7rem;font-weight:700;">JOGO ' + num + '</span></div>' +
          '<span data-match-time-status><span style="font-size:.62rem;font-weight:700;color:var(--sp-c-7dd3fc,#7dd3fc);line-height:1.2;white-space:nowrap;">Fem Diamante</span></span></div>' +
          '<div class="btn-row sp-mc-acts"><button class="btn btn-danger btn-micro" style="height:auto;min-height:42px;">Aplicar<br>W.O.</button>' +
          '<button class="btn btn-live btn-micro" style="min-height:42px;">📡 Ao Vivo</button></div>';
        return card.outerHTML;
      };
      t.matches = camis;
      t.rounds = [];
      t.phaseRounds = {};
      t._nJogos = camis.length;
      root._bracketOperationsNav = {};
      window._bracketOperationsRefresh(t, root);
      const camisUi = {
        title: strip.querySelector('.sp-operations-next .sp-operations-nav-title')?.textContent,
        arrows: strip.querySelectorAll('.sp-operations-next .sp-operations-nav-arrow').length
      };
      const gameTitle = strip.querySelector('.sp-operations-next .sp-operations-nav-title');
      const previousArrow = strip.querySelector('.sp-operations-next [data-operations-nav="prev"]');
      const previousGlyph = strip.querySelector('.sp-operations-next [data-operations-nav="prev"] > svg');
      const nextGlyph = strip.querySelector('.sp-operations-next [data-operations-nav="next"] > svg');
      const category = strip.querySelector('.sp-operations-next [data-match-time-status]');
      camisUi.categoryText = category.textContent.trim();
      const categoryWord = category.querySelector('span:first-child');
      const groupCode = category.querySelector('.sp-operations-group-code');
      camisUi.groupTypographyMatches = !!groupCode &&
        getComputedStyle(groupCode).fontSize === getComputedStyle(categoryWord).fontSize &&
        getComputedStyle(groupCode).color === getComputedStyle(categoryWord).color &&
        getComputedStyle(groupCode).fontWeight === getComputedStyle(categoryWord).fontWeight;
      const actionButtons = [...strip.querySelectorAll('.sp-operations-next .sp-mc-acts button')];
      camisUi.fontSize = parseFloat(getComputedStyle(gameTitle).fontSize);
      camisUi.arrowGap = {
        left: gameTitle.getBoundingClientRect().left - previousGlyph.getBoundingClientRect().right,
        right: nextGlyph.getBoundingClientRect().left - gameTitle.getBoundingClientRect().right
      };
      camisUi.categoryBelowTitle = category.getBoundingClientRect().top >= gameTitle.getBoundingClientRect().bottom;
      camisUi.titleCategoryGap = category.getBoundingClientRect().top - gameTitle.getBoundingClientRect().bottom;
      camisUi.categoryAlignedLeft = Math.abs(category.getBoundingClientRect().left - previousGlyph.getBoundingClientRect().left) <= 6;
      camisUi.titleTopOffset = gameTitle.getBoundingClientRect().top - actionButtons[0].getBoundingClientRect().top;
      camisUi.categoryBottomOffset = category.getBoundingClientRect().bottom - actionButtons[0].getBoundingClientRect().bottom;
      camisUi.arrowTargetInsideCard = previousArrow.getBoundingClientRect().left >=
        strip.querySelector('.sp-operations-next .sp-match-card').getBoundingClientRect().left + 2;
      camisUi.actionsSpanTwoLines = actionButtons.every(button =>
        button.parentElement?.parentElement === category.parentElement?.parentElement &&
        button.getBoundingClientRect().top <= gameTitle.getBoundingClientRect().top + 5 &&
        button.getBoundingClientRect().bottom >= category.getBoundingClientRect().bottom - 5);
      camisUi.buttonsOnOneLine = actionButtons.length === 2 &&
        Math.abs(actionButtons[0].getBoundingClientRect().top - actionButtons[1].getBoundingClientRect().top) < 4;
      const operationCard = strip.querySelector('.sp-operations-next .sp-match-card');
      const operationHead = operationCard.querySelector('.sp-mc-head');
      camisUi.bounds = { cardRight: operationCard.getBoundingClientRect().right,
        headRight: operationHead.getBoundingClientRect().right,
        categoryLeft: category.getBoundingClientRect().left, categoryRight: category.getBoundingClientRect().right,
        arrowLeft: previousGlyph.getBoundingClientRect().left,
        titleTop: gameTitle.getBoundingClientRect().top, categoryBottom: category.getBoundingClientRect().bottom,
        buttonTop: actionButtons[0].getBoundingClientRect().top, buttonBottom: actionButtons[0].getBoundingClientRect().bottom,
        firstButtonLeft: actionButtons[0].getBoundingClientRect().left,
        lastButtonRight: actionButtons[1].getBoundingClientRect().right,
        cardPaddingRight: getComputedStyle(operationCard).paddingRight };
      camisUi.metaFitsCard = actionButtons[1].getBoundingClientRect().right <= operationCard.getBoundingClientRect().right - 2 &&
        category.getBoundingClientRect().right < actionButtons[0].getBoundingClientRect().left;
      camisUi.measuredHeights = [];
      for (let refresh = 0; refresh < 12; refresh++) {
        window._bracketOperationsRefresh(t, root);
        camisUi.measuredHeights.push({ card: strip.querySelector('.sp-operations-next .sp-match-card').getBoundingClientRect().height,
          button: strip.querySelector('.sp-operations-next .sp-mc-acts button').getBoundingClientRect().height });
      }
      strip.querySelector('.sp-operations-next [data-operations-nav="next"]').click();
      camisUi.nextTitle = strip.querySelector('.sp-operations-next .sp-operations-nav-title')?.textContent;
      window.skipCalls = [];
      window._callCF = (name, payload) => { window.skipCalls.push([name, payload.matchId]); return Promise.resolve({ ok: true }); };
      window._bracketReloadCourtState = () => Promise.resolve();
      window._bracketCourtReleaseCache = { sb_test: { ready: true, revision: 7, released: {}, postponed: [] } };
      root._bracketOperationsNav = {};
      window._bracketOperationsRefresh(t, root);
      for (let screen = 0; screen < 4; screen++) {
        strip.querySelector('.sp-operations-next [data-postpone-next]').click();
        await new Promise(resolve => setTimeout(resolve, 0));
        if (screen < 3) strip.querySelector('.sp-operations-next [data-operations-nav="next"]').click();
      }
      window._renderCamisFixture = window.renderMatchCard;
      window.renderMatchCard = simpleRender;
      const categoryCounts = [['Fem Diamante', 8], ['Fem Ouro', 16], ['Fem Prata', 12]];
      const fullMatches = categoryCounts.flatMap(([category, count]) =>
        Array.from({ length: count }, (_, groupIndex) => [0, 1, 2].map(slot => ({
          id: category + '-g' + groupIndex + '-j' + slot, category,
          phaseIndex: 0, round: 1, isMonarch: true, monarchGroup: groupIndex,
          groupName: 'R1 Grupo ' + String.fromCharCode(65 + groupIndex),
          team1: ['A', 'B'], team2: ['C', 'D']
        }))).flat());
      const fullTournament = { ...t, matches: fullMatches, _nJogos: 108, rounds: [], phaseRounds: {},
        categoryDefinitions: categoryCounts.map(([label]) => ({ label })) };
      window._currentBracketTournament = fullTournament;
      window._assignGlobalGameNumbers(fullTournament);
      const fullNumbers = fullMatches.map(game => game._gameNum);
      const fullLabels = fullMatches.filter(game => game.id.endsWith('-j0')).map(game =>
        window._bracketMonarchGroupLabel(fullTournament, { name: game.groupName, matches: [game] }));
      return { states, called: window.called, groupCalls: window.groupCalls, skipCalls: window.skipCalls,
        arrows, survivesRefresh, liveMatch, multiDayHasNav, incompleteHasNav, standingsInset,
        groupChecks: { numeric: numeric?.name, distinct: distinct?.name, missing: !!missing,
          tieBreak: !!tieBreak, nonMonarch: !!nonMonarch, refs: refs?.matches.map(m => m.id),
          canonicalScore: roundCanonical?.matches[0].scoreP1, onlyRounds: onlyRounds?.matches.length, extra: !!extra },
        camis: { ids: camisGroup?.matches.map(m => m.id), otherIds: camisOther?.matches.map(m => m.id),
          labels: [camisGroup?.name, camisOther?.name, camisPrata?.name, nextRoundLabel],
          sixGamesHaveNav, idLabel, ui: camisUi },
        fullUniqueness: { games: new Set(fullNumbers).size, min: Math.min(...fullNumbers), max: Math.max(...fullNumbers),
          groups: new Set(fullLabels).size, count: fullLabels.length,
          examples: [fullLabels[0], fullLabels[8], fullLabels[24]] } };
    });
    assert.deepEqual(carousel.states.map(item => item.title), ['JOGO 1', 'JOGO 9', 'JOGO 17', 'Grupo A', 'JOGO 1', 'Grupo A']);
    assert(carousel.states.every(item => JSON.stringify(item.navStyle) === JSON.stringify(carousel.states[3].navStyle)),
      'jogos e classificação compartilham a cor, o peso e o tamanho do título do grupo');
    assert.deepEqual(carousel.states.map(item => item.match), ['group-1', 'group-9', 'group-17', 'group-1', 'group-1', 'group-1']);
    assert.equal(carousel.states[3].category, 'Fem Diamante · A');
    assert(carousel.states[3].footerBelowTable && carousel.states[3].categoryAboveStandings && !carousel.states[3].callGameLabel,
      'a classificação deixa quadra e OK no rodapé, categoria no cabeçalho e nenhum Jogo 1');
    assert.deepEqual(carousel.states.slice(0, 4).map(item => item.postpone),
      ['group-1', 'group-9', 'group-17', 'group-1'], 'Pular jogo acompanha as quatro telas do grupo');
    assert.deepEqual(carousel.skipCalls, [
      ['endMatchOnCourt', 'match-rr-r1-g0-0-Fem_Diamante-1794172435574'],
      ['endMatchOnCourt', 'match-rr-r1-g0-1-Fem_Diamante-1794172435574'],
      ['endMatchOnCourt', 'match-rr-r1-g0-2-Fem_Diamante-1794172435574'],
      ['endMatchOnCourt', 'match-rr-r1-g0-0-Fem_Diamante-1794172435574']
    ], 'Pular jogo envia o jogo correspondente a cada tela');
    assert.deepEqual(carousel.states.slice(0, 3).map(item => item.teams), [
      ['Ana / Bia', 'Carla / Dora'], ['Ana / Carla', 'Bia / Dora'], ['Ana / Dora', 'Bia / Carla']
    ]);
    assert.deepEqual(carousel.groupChecks, { numeric: 'Grupo A1', distinct: 'Grupo B1', missing: false,
      tieBreak: false, nonMonarch: false, refs: [1, 2, 3], canonicalScore: 6, onlyRounds: 3, extra: false });
    assert.deepEqual(carousel.camis.ids.map(id => id.includes('Fem_Diamante')), [true, true, true]);
    assert.deepEqual(carousel.camis.otherIds.map(id => id.includes('Fem_Ouro')), [true, true, true]);
    assert.deepEqual(carousel.camis.labels, ['R1 Grupo A1', 'R1 Grupo A2', 'R1 Grupo A3', 'R2 Grupo A4']);
    assert.equal(carousel.camis.sixGamesHaveNav, false);
    assert.equal(carousel.camis.idLabel, 'R1 Grupo A2');
    assert.equal(carousel.camis.ui.categoryText, 'Fem Diamante\u00a0A1');
    assert(carousel.camis.ui.groupTypographyMatches, 'A1 deve usar a mesma fonte, peso e cor da categoria');
    assert.deepEqual({ title:carousel.camis.ui.title, arrows:carousel.camis.ui.arrows, nextTitle:carousel.camis.ui.nextTitle },
      { title: 'JOGO 1', arrows: 2, nextTitle: 'JOGO 2' });
    assert(Math.max(...carousel.camis.ui.measuredHeights.map(item => item.card)) -
      Math.min(...carousel.camis.ui.measuredHeights.map(item => item.card)) <= 2 &&
      Math.max(...carousel.camis.ui.measuredHeights.map(item => item.button)) <= 44,
      'atualizações repetidas não esticam card ou botões: ' + JSON.stringify(carousel.camis.ui.measuredHeights));
    assert(carousel.camis.ui.fontSize <= 15 && carousel.camis.ui.categoryBelowTitle && carousel.camis.ui.titleCategoryGap <= 8 &&
      carousel.camis.ui.categoryAlignedLeft && carousel.camis.ui.arrowTargetInsideCard && carousel.camis.ui.actionsSpanTwoLines &&
      carousel.camis.ui.buttonsOnOneLine && carousel.camis.ui.metaFitsCard &&
      carousel.camis.ui.arrowGap.left >= 0 && carousel.camis.ui.arrowGap.left <= 14 &&
      carousel.camis.ui.arrowGap.right >= 6 && carousel.camis.ui.arrowGap.right <= 14 &&
      Math.abs(carousel.camis.ui.titleTopOffset) <= 3 && Math.abs(carousel.camis.ui.categoryBottomOffset) <= 3,
      'navegação e categoria alinhadas à esquerda, ações ocupando as duas linhas à direita: ' + JSON.stringify(carousel.camis.ui));
    assert(carousel.standingsInset.left >= 4 && carousel.standingsInset.right >= 4 && carousel.standingsInset.contentLeft >= 12,
      'classificação, categoria, tabela e quadra têm respiro nas bordas');
    assert.deepEqual(carousel.fullUniqueness, { games: 108, min: 1, max: 108,
      groups: 36, count: 36, examples: ['R1 Grupo A1', 'R1 Grupo A2', 'R1 Grupo A3'] });
    assert(carousel.states.slice(0, 4).every(item => item.canCall && item.court === 'Quadra 4'),
      'todos os jogos e a classificação oferecem quadra e OK para o jogo exibido ou próximo jogo do grupo: ' +
      JSON.stringify(carousel.states.slice(0, 4)));
    assert(Math.max(...carousel.states.map(item => item.cardHeight)) -
      Math.min(...carousel.states.map(item => item.cardHeight)) <= 2,
      'a classificação e a volta aos jogos mantêm a mesma altura: ' + JSON.stringify(carousel.states));
    assert.deepEqual(carousel.groupCalls, [
      ['group-1', 'Quadra 4'], ['group-9', 'Quadra 4'], ['group-17', 'Quadra 4'], ['group-1', 'Quadra 4']
    ], 'o OK chama o jogo visível; na classificação, o primeiro jogo ainda disponível');
    assert(carousel.states[3].classification && carousel.states[3].players.length === 4);
    assert(carousel.arrows.every(item => item.label && item.triangular && item.width >= 44 && item.height >= 44));
    assert(carousel.survivesRefresh);
    await page.setViewportSize({ width: 320, height: 800 });
    const narrowCall = await page.evaluate(() => {
      const t = window._findTournamentById();
      const root = document.querySelector('[data-bracket-tabs-root]');
      window._currentBracketTournament = t;
      window.renderMatchCard = window._renderCamisFixture;
      root._bracketOperationsNav = {};
      window._bracketOperationsRefresh(t, root);
      const card = root._bracketOperationsStrip.querySelector('.sp-operations-next .sp-match-card');
      const head = card.querySelector('.sp-mc-head');
      const arrow = head.querySelector('[data-operations-nav="prev"]');
      const gameBounds = { cardWidth: card.clientWidth, cardScroll: card.scrollWidth,
        headWidth: head.clientWidth, headScroll: head.scrollWidth,
        arrowLeft: arrow.getBoundingClientRect().left, cardLeft: card.getBoundingClientRect().left };
      for (let i = 0; i < 3; i++) root._bracketOperationsStrip.querySelector('.sp-operations-next [data-operations-nav="next"]').click();
      const groupCard = root._bracketOperationsStrip.querySelector('.sp-operations-next .sp-operations-standings-card');
      const groupSelect = groupCard.querySelector('.sp-match-court select');
      const groupButton = groupCard.querySelector('.sp-match-confirm');
      return { ...gameBounds,
        groupSelectVisible: !!groupSelect && groupSelect.getBoundingClientRect().bottom <= groupCard.getBoundingClientRect().bottom,
        groupButtonVisible: !!groupButton && groupButton.getBoundingClientRect().bottom <= groupCard.getBoundingClientRect().bottom };
    });
    assert(narrowCall.cardScroll <= narrowCall.cardWidth + 1 && narrowCall.headScroll <= narrowCall.headWidth + 1 &&
      narrowCall.arrowLeft >= narrowCall.cardLeft + 2 && narrowCall.groupSelectVisible && narrowCall.groupButtonVisible,
      'a faixa de chamada não pode cortar os controles em 320px: ' + JSON.stringify(narrowCall));
    assert.equal(carousel.liveMatch, 'group-17');
    assert(!carousel.multiDayHasNav && !carousel.incompleteHasNav);
    assert.deepEqual(carousel.called, ['sb_test', 'm1', 'Quadra 5'], 'navegar não pode fazer nova chamada');
    console.log('✓ faixa replica o card completo e navega três jogos do quarteto e a classificação');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
