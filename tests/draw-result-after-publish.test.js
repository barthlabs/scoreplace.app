'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const draw = fs.readFileSync('js/views/tournaments-draw.js', 'utf8');
assert.match(draw, /_mostrarResultado = !d\.redraw && isCurrentDrawMonarch/, 'a intenção de abrir o resultado independe de matches no documento raiz');
assert.match(draw, /window\.location\.hash\.split\('\?'\)\[0\] === _destinoSorteio[\s\S]{0,330}_refreshDrawnTournamentHere/, 'na mesma rota, o sorteio atualiza a página sem esperar hashchange');
assert.match(draw, /__drawResultAfterPublish[\s\S]{0,180}window\.location\.hash = _destinoSorteio/, 'em outra rota, o sorteio abre o detalhe sem ir às chaves');

const listeners = new Map();
const frames = [];
const timers = [];
const calls = { opened:0, dismissed:0, painted:0, loadingHidden:0, busyDone:0, gridFinished:0, gridErrors:[], notices:[] };
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
  _phaseGridDrawFinished(id, error) { assert.equal(id, 'camis'); calls.gridFinished++; if (error) calls.gridErrors.push(error); },
  _hideLoading() { calls.loadingHidden++; }, _drawBtnDone() { calls.busyDone++; },
  showNotification(title, message) { calls.notices.push({ title, message }); },
  _showLoading() {}, _reflowChrome() {}, _log() {}, _warn() {}, scrollTo() {},
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

// Redraw não abre a prévia inicial; o progresso da grade termina somente
// depois que o detalhe do torneio foi pintado na rota de destino.
delete W.__drawResultAfterPublish;
const paintedBeforeRedraw = calls.painted;
const finishedBeforeRedraw = calls.gridFinished;
W._ultimaRotaPintada = '#other|1|';
W.location.hash = '#tournaments/camis';
route();
assert.equal(calls.painted, paintedBeforeRedraw + 1);
assert.equal(calls.gridFinished, finishedBeforeRedraw + 1,
  'sem prévia inicial, o loader da grade termina após o render do redraw');
const finishedBeforeMainSwitch = calls.gridFinished;
W._ultimaRotaPintada = '#dashboard|1|';
route();
assert.equal(calls.gridFinished, finishedBeforeMainSwitch + 1,
  'a transição principal também solta a grade somente depois de pintar o torneio');

W.__drawResultAfterPublish = { id:'camis', at:Date.now() };
W._publishedInitialDrawData = () => null;
W._ultimaRotaPintada = '#other|1|';
const finishedBeforeMissingResult = calls.gridFinished;
route();
assert.equal(calls.gridFinished, finishedBeforeMissingResult + 1,
  'resultado ainda indisponível encerra a espera com erro visível');
assert.match(calls.gridErrors.at(-1), /chave ainda não carregou/);
delete W.__drawResultAfterPublish;
W._publishedInitialDrawData = t => t.matches.length ? { draft:{ matches:t.matches } } : null;

// CAMIS real: sorteio feito no mesmo #tournaments/id e jogos divididos em
// subcoleção. A resposta pode ter _nPartes.matches=108 e matches:[] na raiz.
delete W.__drawResultAfterPublish;
W.location.hash = '#tournaments/camis';
tournament.matches = [];
tournament._nPartes = { matches:108 };
let freshReads = 0;
W._ensureTournamentLoaded = function (id, done, forceFresh) {
  assert.equal(id, 'camis');
  assert.equal(forceFresh, true, 'lê as partes atuais do servidor');
  freshReads++;
  tournament.matches = [{ id:'jogo-1', isMonarch:true }];
  done(tournament);
};
W.initRouter = context.initRouter;
const paintedBefore = calls.painted;
W._refreshDrawnTournamentHere('camis', true);
assert.equal(W.location.hash, '#tournaments/camis', 'não depende de uma mudança de hash');
assert.equal(freshReads, 1);
assert.equal(calls.painted, paintedBefore + 1, 'substitui os cards pré-sorteio pelo detalhe atualizado');
assert.equal(calls.opened, 2, 'abre o resultado com os jogos carregados');

W._ensureTournamentLoaded = function (_id, done, forceFresh) {
  assert.equal(forceFresh, true);
  done(null);
};
W._refreshDrawnTournamentHere('camis', true);
assert.equal(calls.opened, 2, 'falha de leitura não finge ter aberto o resultado');
assert.equal(calls.notices.at(-1).title, 'Sorteio salvo', 'avisa que a gravação deu certo e só a tela falhou');
assert.ok(calls.loadingHidden && calls.busyDone, 'encerra o loading após falha de leitura');
console.log('Resultado do sorteio: outra rota e mesma rota com torneio dividido');
