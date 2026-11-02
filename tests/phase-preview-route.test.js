'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.style = {};
    this.classList = { add() {}, remove() {}, contains() { return false; } };
    this.events = {};
    this._html = '';
    this.textContent = '';
  }
  set innerHTML(value) { this._html = String(value); this.children = []; }
  get innerHTML() { return this._html; }
  get firstElementChild() { return this.children[0] || (this._html ? {} : null); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; this._html = ''; }
  addEventListener(name, fn) { this.events[name] = fn; }
  click() { return this.events.click && this.events.click.call(this, { stopPropagation() {} }); }
}
const container = new Element('main');
const listeners = new Map();
const calls = [];
const root = { name: 'Torneio público', currentPhaseIndex: 1,
  phases: [{ name: 'Grupos' }, { name: 'Final' }] };
const partial = (n) => ({ mode: 'partial', readOnly: true, phaseIndex: n, root,
  games: [{ jogo: { id: 'm' + n, p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 4 } }] });
let next = (index) => Promise.resolve(partial(index === 'current' ? 1 : index));
const store = { currentUser: { uid: 'u1' }, _invitedTournamentIds: [], tournaments: [] };
const W = {
  location: { hash: '#phase-preview/tour_safe', search: '' }, AppStore: store,
  FirestoreDB: {
    loadTournamentPhaseGames(id, index, options) {
      calls.push({ id, index, options });
      return next(index);
    }
  },
  _authStateResolved: true, _log() {}, _warn() {}, scrollTo() {},
  addEventListener(name, fn) { listeners.set(name, fn); },
  removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
};
W.window = W;
const document = {
  documentElement: { scrollTop: 0 }, body: { scrollTop: 0 },
  visibilityState: 'visible',
  querySelectorAll() { return []; },
  getElementById(id) { return id === 'view-container' ? container : null; },
  createElement(tag) { return new Element(tag); }
};
const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
let landing = 0;
const context = vm.createContext({
  window: W, document, history: { scrollRestoration: 'auto' },
  localStorage: storage, sessionStorage: storage,
  setTimeout() { return 1; }, clearTimeout() {}, requestAnimationFrame() {},
  renderLanding() { landing++; }, console
});
const repo = path.join(__dirname, '..');
for (const file of ['js/views/tournament-phase-preview.js', 'js/router.js']) {
  vm.runInContext(fs.readFileSync(path.join(repo, file), 'utf8'), context, { filename: file });
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function visit(hash) {
  W.location.hash = hash;
  listeners.get('hashchange')();
}
function texts(element) {
  return [element.textContent, ...element.children.flatMap(texts)].filter(Boolean);
}
(async () => {
  context.initRouter();
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].index, 'current');
  assert.equal(calls[0].options.skipFullFallback, true);
  assert.match(texts(container).join(' '), /Torneio público.*Final.*m1/s);
  assert.equal(store.tournaments.length, 0, 'prévia não entra na store');
  let buttons = container.children[0].children[2].children;
  assert.equal(buttons[0].textContent, 'Detalhes completos');
  assert.equal(buttons[1].textContent, 'Fase 1');
  await buttons[1].click();
  assert.equal(calls[1].index, 0, 'histórica só é lida após clique');
  assert.match(texts(container).join(' '), /Grupos.*m0/s);

  next = () => Promise.resolve({ mode: 'fullFallback', readOnly: true, tournament: null });
  visit('#phase-preview/tour_safe');
  await flush();
  assert.equal(W.location.hash, '#tournaments/tour_safe', 'fallback navega ao detalhe integral');

  let resolveLate;
  next = () => new Promise((resolve) => { resolveLate = resolve; });
  visit('#phase-preview/tour_safe');
  visit('#dashboard');
  resolveLate(partial(1));
  await flush();
  assert.equal(W.location.hash, '#dashboard', 'resposta tardia não troca a rota');
  assert.doesNotMatch(texts(container).join(' '), /Torneio público/);

  store.currentUser = null;
  next = () => { throw Error('deslogado iniciou leitura'); };
  visit('#phase-preview/tour_safe');
  assert.equal(landing, 1, 'visitante sem login cai no gate existente');
  assert.equal(calls.length, 4);

  store.currentUser = { uid: 'u2' };
  next = () => Promise.resolve(partial(1));
  visit('#phase-preview/tour_safe');
  await flush();
  buttons = container.children[0].children[2].children;
  await buttons[0].click();
  assert.equal(W.location.hash, '#tournaments/tour_safe');
  console.log('phase-preview-route: login, fase histórica, fallback e navegação OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
