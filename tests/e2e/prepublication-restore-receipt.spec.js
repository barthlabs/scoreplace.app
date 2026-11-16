// Restauração pré-publicação é uma operação destrutiva, mas a tela só pode dizer
// que concluiu depois de receber e aplicar a fotografia canônica da Function.
// Este cenário roda no navegador, sem Firebase e sem escrever em produção.
const path = require('path');
const { test, expect } = require('@playwright/test');

const drawView = path.join(__dirname, '..', '..', 'js', 'views', 'tournaments-draw.js');
const bracketLogic = path.join(__dirname, '..', '..', 'js', 'views', 'bracket-logic.js');

test.describe('Restauração pré-publicação', () => {
  test('Super 8 real volta ao pré-sorteio com inscrições fechadas', async ({ page }) => {
    await page.setContent('<!doctype html><html><body><main id="view-container">Jogos sorteados</main></body></html>');
    await page.addScriptTag({ content: `
      window.location.hash = '#tournaments/super8';
      window._isDeveloperIdentity = () => true;
      window.AppStore = { tournaments: [{ id:'super8', superEight:true, gruposCount:1,
        isSandbox:false, testModeEnabled:true, status:'active', participants:[{uid:'kelly'}, {manualParticipantId:'vaga2'}],
        matches:[{id:'j1', round:1}], rounds:[] }] };
      window._countCompetitors = t => ({people:t.participants.length});
      window._hasAnyMatchResult = () => false;
      window._applyCFTournament = function(id, fresh) {
        Object.assign(window.AppStore.tournaments[0], fresh);
        window.AppStore.tournaments[0].id = id;
      };
      window.renderTournaments = function(container) {
        container.textContent = window.AppStore.tournaments[0].matches.length ? 'Jogos sorteados' : 'Pronto para sortear';
      };
      window.showAlertDialog = function(_title, _message, confirm) { window.__confirmRestore = confirm; };
      window.showNotification = function(title, message, kind) { window.__notice = {title,message,kind}; };
      window.FirestoreDB = { _callFn: function(name, payload) {
        window.__call = {name,payload};
        return Promise.resolve({ok:true,tournament:{status:'closed',
          participants:[{uid:'kelly'}, {manualParticipantId:'vaga2'}],
          matches:[],rounds:[],pendingDraw:null}});
      }};
    ` });
    await page.addScriptTag({ path: drawView });
    await page.evaluate(() => {
      window._restoreTournamentPrePublication('super8');
      window.__confirmRestore();
    });
    await expect.poll(() => page.evaluate(() => window.__call)).toEqual({
      name:'resetTournamentToEnrollment', payload:{tournamentId:'super8',restoreMode:'testModePreDraw'}
    });
    await expect(page.locator('#view-container')).toHaveText('Pronto para sortear');
    await expect.poll(() => page.evaluate(() => ({
      status:window.AppStore.tournaments[0].status,
      members:window.AppStore.tournaments[0].participants.length,
      notice:window.__notice && window.__notice.kind
    }))).toEqual({status:'closed',members:2,notice:'success'});
  });

  test('substitui imediatamente a chave local pelo recibo limpo da Function', async ({ page }) => {
    await page.setContent('<!doctype html><html><body><main id="view-container">Agenda antiga: jogo-antigo</main><div id="sp-pending-schedule-overlay">Revisão antiga</div></body></html>');
    await page.addScriptTag({ content: `
      window.location.hash = '#tournaments/neon?ref=convite';
      window._isDeveloperIdentity = () => true;
      window.AppStore = { tournaments: [{
        id: 'neon', isSandbox: false, testModeEnabled: true, status: 'ongoing',
        matches: [{ id: 'jogo-antigo', scoreP1: 6, scoreP2: 4 }],
        rounds: [{ matches: [{ id: 'jogo-antigo' }] }]
      }] };
      window._hasAnyMatchResult = function () { return false; };
      window.__pendingInitialDraws = { neon: { kind: 'initial', draft: { matches: [{ id: 'jogo-antigo' }] } } };
      window.__pendingDrawMarkers = { neon: { kind: 'initial' } };
      window._teamDrawReviewApproved = { neon: true };
      window._bracketCourtReleaseCache = { neon: {
        released: { 'jogo-antigo': true }, retryTimer: setTimeout(function () {}, 60000),
        unsubscribe: function () { window.__courtUnsubscribed = true; }
      } };
      window.renderTournaments = function (container, id) {
        var t = window.AppStore.tournaments.find(function (item) { return item.id === id; });
        var marker = window._pendingDrawMarkerFor(t);
        container.textContent = (t.matches.length ? 'Agenda antiga: jogo-antigo' : 'Sem jogos sorteados') +
          (marker ? ' · Sorteio em revisão' : '');
        window.__fullRenders = (window.__fullRenders || 0) + 1;
      };
      window._mergePresenceNoRegress = function () {};
      window._rerenderBracket = function () { window.__rerendered = true; };
      window._softRefreshView = function () { window.__refreshed = true; };
      window._error = function () {};
      window.showNotification = function (title, message, kind) {
        window.__notice = { title, message, kind, matchesAtNotice: window.AppStore.tournaments[0].matches.length };
      };
      window.showAlertDialog = function (_title, _message, onConfirm) { window.__confirmRestore = onConfirm; };
      window.FirestoreDB = { _callFn: function (name, payload) {
        window.__call = { name, payload };
        return Promise.resolve({ ok: true, tournament: {
          status: 'closed', participants: [{ uid: 'u1' }, { uid: 'u2' }],
          matches: [], rounds: [], pendingDraw: null, isSandbox: false, testModeEnabled: true
        }});
      }};
    ` });
    await page.addScriptTag({ path: bracketLogic });
    await page.addScriptTag({ path: drawView });

    await page.evaluate(() => {
      window._callCF = function (name) {
        if (name === 'getPendingDrawReviewState') return new Promise(function (resolve) { window.__resolveOldMarker = resolve; });
        return Promise.resolve({ data: { changed: true } });
      };
      window._hydratePendingDrawMarker('neon');
      window._restoreTournamentPrePublication('neon');
      window.__confirmRestore();
    });

    await expect.poll(() => page.evaluate(() => window.__notice)).toMatchObject({
      title: '🔄 Sorteio resetado', kind: 'success', matchesAtNotice: 0
    });
    await expect.poll(() => page.evaluate(() => window.__call)).toEqual({
      name: 'resetTournamentToEnrollment',
      payload: { tournamentId: 'neon', restoreMode: 'testModePreDraw' }
    });
    await expect.poll(() => page.evaluate(() => window.AppStore.tournaments[0])).toMatchObject({
      id: 'neon', status: 'closed', matches: [], rounds: []
    });
    await expect(page.locator('#view-container')).toHaveText('Sem jogos sorteados');
    await expect(page.locator('#sp-pending-schedule-overlay')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => ({
      draft: window.__pendingInitialDraws.neon,
      marker: window.__pendingDrawMarkers.neon,
      load: window.__pendingDrawMarkerLoads.neon,
      approval: window._teamDrawReviewApproved.neon,
      oldCourtReleased: (window._bracketCourtReleaseCache.neon || {}).released?.['jogo-antigo'] || false,
      unsubscribed: window.__courtUnsubscribed
    }))).toEqual({ oldCourtReleased: false, unsubscribed: true });
    const rendersBeforeLateReply = await page.evaluate(() => window.__fullRenders);
    await page.evaluate(() => window.__resolveOldMarker({ data: { pendingDraw: { kind: 'initial' } } }));
    await expect.poll(() => page.evaluate(() => ({
      marker: window.__pendingDrawMarkers.neon || null,
      renders: window.__fullRenders
    }))).toEqual({ marker: null, renders: rendersBeforeLateReply });
  });

  test('não confirma sucesso sem recibo canônico da Function', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: `
      window._isDeveloperIdentity = () => true;
      window.AppStore = { tournaments: [{ id: 'neon', isSandbox: false, testModeEnabled: true, matches: [{ id: 'antigo' }] }] };
      window._hasAnyMatchResult = function () { return false; };
      window._error = function () {};
      window.showNotification = function (title, message, kind) { window.__notice = { title, message, kind }; };
      window.showAlertDialog = function (_title, _message, onConfirm) { window.__confirmRestore = onConfirm; };
      window.FirestoreDB = { _callFn: function () { return Promise.resolve({ ok: true }); } };
    ` });
    await page.addScriptTag({ path: drawView });

    await page.evaluate(() => { window._restoreTournamentPrePublication('neon'); window.__confirmRestore(); });
    await expect.poll(() => page.evaluate(() => window.__notice)).toMatchObject({ title: 'Erro ao restaurar', kind: 'error' });
    await expect(page.evaluate(() => window.AppStore.tournaments[0].matches.length)).resolves.toBe(1);
  });

  test('publicar não encerra o listener da fila de quadra', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: `
      window._bracketCourtReleaseCache = { neon: { released: {}, unsubscribe: function () { window.__unexpectedUnsubscribe = true; } } };
      window._callCF = function () { return Promise.resolve({ data: { changed: true, publishedPublicly: false } }); };
      window.showNotification = function () {};
      window._rerenderBracket = function () {};
    ` });
    await page.addScriptTag({ path: bracketLogic });
    await page.evaluate(() => window._publishPendingDraw('neon'));
    await expect(page.evaluate(() => ({
      unsubscribed: !!window.__unexpectedUnsubscribe,
      listenerPresent: !!window._bracketCourtReleaseCache.neon
    }))).resolves.toEqual({ unsubscribed: false, listenerPresent: true });
  });
});
