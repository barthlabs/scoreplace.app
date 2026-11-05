// Restauração pré-publicação é uma operação destrutiva, mas a tela só pode dizer
// que concluiu depois de receber e aplicar a fotografia canônica da Function.
// Este cenário roda no navegador, sem Firebase e sem escrever em produção.
const path = require('path');
const { test, expect } = require('@playwright/test');

const drawView = path.join(__dirname, '..', '..', 'js', 'views', 'tournaments-draw.js');
const bracketLogic = path.join(__dirname, '..', '..', 'js', 'views', 'bracket-logic.js');

test.describe('Restauração pré-publicação', () => {
  test('substitui imediatamente a chave local pelo recibo limpo da Function', async ({ page }) => {
    await page.setContent('<!doctype html><html><body><main id="view-container">Agenda antiga: jogo-antigo</main><div id="sp-pending-schedule-overlay">Revisão antiga</div></body></html>');
    await page.addScriptTag({ content: `
      window.location.hash = '#tournaments/neon?ref=convite';
      window.AppStore = { tournaments: [{
        id: 'neon', isSandbox: true, allowPrePublicationRestore: true, status: 'ongoing',
        matches: [{ id: 'jogo-antigo', scoreP1: 6, scoreP2: 4 }],
        rounds: [{ matches: [{ id: 'jogo-antigo' }] }]
      }] };
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
          status: 'open', participants: [{ uid: 'u1' }, { uid: 'u2' }],
          matches: [], rounds: [], pendingDraw: null, isSandbox: true, allowPrePublicationRestore: true
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
      title: '↩️ Pré-publicação restaurada', kind: 'success', matchesAtNotice: 0
    });
    await expect.poll(() => page.evaluate(() => window.__call)).toEqual({
      name: 'resetTournamentToEnrollment',
      payload: { tournamentId: 'neon', restoreMode: 'prePublication' }
    });
    await expect.poll(() => page.evaluate(() => window.AppStore.tournaments[0])).toMatchObject({
      id: 'neon', status: 'open', matches: [], rounds: []
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
      window.AppStore = { tournaments: [{ id: 'neon', isSandbox: true, allowPrePublicationRestore: true, matches: [{ id: 'antigo' }] }] };
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
