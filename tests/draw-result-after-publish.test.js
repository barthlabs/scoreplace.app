'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const draw = fs.readFileSync('js/views/tournaments-draw.js', 'utf8');
assert.match(draw, /!d\.redraw[\s\S]{0,220}isMonarch[\s\S]{0,180}__drawResultAfterPublish/, 'o sorteio inicial Rei\/Rainha entrega a intenção de abrir o resultado');
assert.match(draw, /__drawResultAfterPublish[\s\S]{0,220}window\.location\.hash = '#tournaments\/'/, 'o sorteio publicado abre o detalhe, sem ir às chaves');

const listeners = new Map();
const frames = [];
const timers = [];
const calls = { opened:0, dismissed:0, painted:0 };
const classList = { add() {}, remove() {}, contains() { return false; } };
const container = { innerHTML:'', style:{}, classList, get firstElementChild() { return this.innerHTML ? {} : null; } };
const document = {
  body:{ scrollTop:0 }, documentElement:{ scrollTop:0 },
  querySelectorAll() { return []; }, getElementById(id) { return id === 'view-container' ? container : null; }
};
const storage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const tournament = { id:'camis', matches:[{ id:'jogo-1', isMonarch:true }] };
const W = {
  location:{ hash:'#bracket/camis', search:'' },
  AppStore:{ currentUser:{ uid:'org' }, _invitedTournamentIds:[], ouvirJogosDoTorneio() {} },
  _dismissAllOverlays() { calls.dismissed++; },
  _ensureTournamentLoaded(id, done) { assert.equal(id, 'camis'); done(true); },
  _findTournamentById() { return tournament; },
  _publishedInitialDrawData(t) { return t.matches.length ? { draft:{ matches:t.matches } } : null; },
  _openPublishedInitialDrawResult(id) { assert.equal(id, 'camis'); calls.opened++; },
  _hideLoading() {}, _showLoading() {}, _reflowChrome() {}, _log() {}, _warn() {}, scrollTo() {},
  addEventListener(name, fn) { listeners.set(name, fn); },
  removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }
};
W.window = W;
const context = vm.createContext({
  window:W, document, history:{ scrollRestoration:'auto' },
  sessionStorage:storage, localStorage:storage,
  requestAnimationFrame(fn) { frames.push(fn); },
  setTimeout(fn, ms) { timers.push({ fn, ms:Number(ms) || 0 }); return timers.length; }, clearTimeout() {},
  renderTournaments() { calls.painted++; container.innerHTML = '<article>CAMIS</article>'; },
  _t(key) { return key; }, console
});
vm.runInContext(fs.readFileSync('js/router.js', 'utf8'), context, { filename:'router.js' });
function flushUi() {
  for (let i = 0; i < 12; i++) {
    while (frames.length) frames.shift()();
    const due = timers.filter(item => item.ms <= 1200);
    for (const item of due) timers.splice(timers.indexOf(item), 1);
    if (!due.length && !frames.length) return;
    due.forEach(item => item.fn());
  }
}
function route() { listeners.get('hashchange')(); flushUi(); }

W.__drawResultAfterPublish = { id:'camis', at:Date.now() };
context.initRouter();
assert.equal(W.location.hash, '#tournaments/camis');
assert.equal(calls.opened, 0, 'não abre antes da rota final');
route();
assert.equal(calls.painted, 1, 'pinta a página do torneio');
assert.equal(calls.opened, 1, 'abre o resultado depois do render e do loader');
assert.equal(W.__drawResultAfterPublish, undefined, 'consome a intenção uma vez');
route();
assert.equal(calls.opened, 1, 'snapshot e reentrada não reabrem o resultado');

W.__drawResultAfterPublish = { id:'outro', at:Date.now() };
route();
assert.equal(calls.opened, 1, 'intenção de outro torneio não abre no CAMIS');
console.log('Resultado do sorteio: rota abre uma vez após publicar e pintar o torneio');
