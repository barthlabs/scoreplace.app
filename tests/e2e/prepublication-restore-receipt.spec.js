// Restauração pré-publicação é uma operação destrutiva, mas a tela só pode dizer
// que concluiu depois de receber e aplicar a fotografia canônica da Function.
// Este cenário roda no navegador, sem Firebase e sem escrever em produção.
const path = require('path');
const { test, expect } = require('@playwright/test');

const drawView = path.join(__dirname, '..', '..', 'js', 'views', 'tournaments-draw.js');

test.describe('Restauração pré-publicação', () => {
  test('substitui imediatamente a chave local pelo recibo limpo da Function', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: `
      window.AppStore = { tournaments: [{
        id: 'neon', allowPrePublicationRestore: true, status: 'ongoing',
        matches: [{ id: 'jogo-antigo', scoreP1: 6, scoreP2: 4 }],
        rounds: [{ matches: [{ id: 'jogo-antigo' }] }]
      }] };
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
          matches: [], rounds: [], allowPrePublicationRestore: true
        }});
      }};
    ` });
    await page.addScriptTag({ path: drawView });

    await page.evaluate(() => {
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
  });

  test('não confirma sucesso sem recibo canônico da Function', async ({ page }) => {
    await page.setContent('<!doctype html><html><body></body></html>');
    await page.addScriptTag({ content: `
      window.AppStore = { tournaments: [{ id: 'neon', allowPrePublicationRestore: true, matches: [{ id: 'antigo' }] }] };
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
});
