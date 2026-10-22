'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const router = fs.readFileSync(path.join(root, 'js/router.js'), 'utf8');
const gate = router.match(/if \((view === 'claim-registration' \|\| view === 'tournament-claim')\) _isLegalView = true;/);
assert.ok(gate, 'o link compartilhado deve alcançar seu CTA mesmo sem login');
const log = router.match(/window\._log\('\[scoreplace-router\] route', ([^,]+),/);
assert.ok(log && log[1].includes("view === 'tournament-claim'"), 'token não pode ir ao log do roteador');

const token = 'a'.repeat(64);
let urlHash = '#tournament-claim/tour-test/' + token;
let loginClick;
const calls = [];
const button = { addEventListener(_type, handler) { loginClick = handler; } };
const status = { textContent: '' };
const details = { innerHTML: '', onclick: null };
const page = { querySelector(selector) {
  if (selector === '[data-shared-login]') return button;
  if (selector === '[data-shared-status]') return status;
  if (selector === '[data-shared-details]') return details;
  return null;
} };
const container = { innerHTML: '' };
const location = { pathname: '/', search: '', get hash() { return urlHash; } };
const window = {
  AppStore: { currentUser: null },
  addEventListener() {},
  _renderBackHeader() { return ''; },
  _callCF(name) {
    calls.push(name);
    assert.equal(name, 'previewTournamentClaimLink');
    return Promise.resolve({ data: { tournamentName: 'Teste', candidates: [] } });
  },
};
const context = vm.createContext({ window, document: { getElementById() { return page; } }, location,
  history: { replaceState(_state, _unused, route) { urlHash = route.slice(route.indexOf('#')); } },
  openModal(id) { assert.equal(id, 'modal-login'); }, Promise, String, Array });
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/tournaments-claim.js'), 'utf8'), context);
window.renderTournamentClaimPage(container, 'tour-test', token);
assert.match(container.innerHTML, /Entrar ou criar conta/);
assert.equal(calls.length, 0, 'deslogado não consulta inscritos');
assert.equal(urlHash, '#tournament-claim/tour-test/' + token, 'hash com token aguarda autenticação');
assert.equal(typeof loginClick, 'function'); loginClick();
window.AppStore.currentUser = { uid: 'new-account' };
window.renderTournamentClaimPage(container, 'tour-test', token);
assert.equal(urlHash, '#tournament-claim/tour-test', 'token sai da URL após login');
assert.deepEqual(calls, ['previewTournamentClaimLink']);

let launchHandler;
const nativeWindow = {
  location: { hash: '#dashboard' },
  Capacitor: { isNativePlatform: () => true, Plugins: { App: {
    getLaunchUrl: () => Promise.resolve({ url: 'https://scoreplace.app/#tournament-claim/tour-test/' + token }),
    addListener(name, handler) { if (name === 'appUrlOpen') launchHandler = handler; },
  } } },
};
const nativeDocument = { readyState: 'complete' };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/deep-link.js'), 'utf8'),
  { window: nativeWindow, document: nativeDocument, URL, URLSearchParams, Promise });
setImmediate(() => {
  assert.equal(nativeWindow.location.hash, '#tournament-claim/tour-test/' + token,
    'cold start nativo encaminha o link à mesma rota');
  assert.equal(typeof launchHandler, 'function');
  console.log('✅ entrada do link compartilhado: CTA, login, prévia e deep link');
});
