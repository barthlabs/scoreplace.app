/* A DICA NUNCA APARECE NO PLACAR EM QUADRA — node tests/dica-nunca-no-placar.test.js
 *
 * BUG REAL (ago/2026, relato do dono): "a tela fica escura e aparece uma dica"
 * durante o placar ao vivo. Ordem, repetida: "isso não pode acontecer. nunca".
 *
 * CAUSA: a trava existia SÓ no js/hints.js (_hintFreeZoneIds). Quem escurece a
 * tela é o js/coachmarks.js — as .coach-mask são 4 retângulos rgba(2,6,23,0.70)
 * em volta do alvo — e ele nasceu DEPOIS, sem saber que o placar existe. Pior:
 * é o próprio coachmarks que faz `window._HINTS_ENABLED = true`, ou seja ele
 * religa o hints.js e ainda assim ficava de fora da regra.
 *
 * POR QUE JUSTAMENTE ALI: 'live-scoring-overlay' e 'casual-match-overlay' são
 * full-screen SEM hash próprio, então o `hashchange` que para o tour NUNCA
 * dispara — o tour da tela de trás segue armado e cai por ociosidade em cima de
 * quem está marcando ponto. O toque no botão só suspende por 3 min (SUSPEND_MS)
 * e um jogo dura muito mais que isso.
 *
 * Este teste roda o coachmarks.js REAL num DOM falso com relógio controlado.
 * Contra o código anterior, os blocos 2, 3 e 5 ficam VERMELHOS.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── DOM falso ───────────────────────────────────────────────────────────────
function mkEl(tag) {
  const e = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '', className: '', innerHTML: '', textContent: '',
    style: { cssText: '' },
    children: [], parentNode: null,
    _qsCache: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; },
    addEventListener() {}, removeEventListener() {},
    scrollIntoView() {},
    getBoundingClientRect() { return { left: 10, top: 10, width: 120, height: 44, right: 130, bottom: 54 }; },
    contains() { return false; },
    offsetWidth: 260, offsetHeight: 120,
    querySelector(sel) { if (!this._qsCache[sel]) this._qsCache[sel] = mkEl('div'); return this._qsCache[sel]; },
    querySelectorAll() { return []; }
  };
  return e;
}
function findById(node, id) {
  if (!node) return null;
  if (node.id === id) return node;
  for (let i = 0; i < node.children.length; i++) {
    const f = findById(node.children[i], id);
    if (f) return f;
  }
  return null;
}

// relógio controlado: nada roda sozinho, o teste decide quando o tempo passa
let timers = [], seq = 1;
function runTimers(rounds) {
  for (let r = 0; r < (rounds || 1); r++) {
    const due = timers.slice();
    timers = [];
    due.forEach(t => { try { t.fn(); } catch (e) { console.error('  ! timer:', e.message); } });
  }
}

const store = {};
const body = mkEl('body'); body.id = 'body';
const head = mkEl('head'); head.id = 'head';
const hamburger = mkEl('button'); hamburger.className = 'hamburger-btn';

let observers = [];
function MutationObserverStub(cb) { this._cb = cb; observers.push(this); }
MutationObserverStub.prototype.observe = function () {};
MutationObserverStub.prototype.disconnect = function () {};
function fireObservers() { observers.forEach(o => { try { o._cb([], o); } catch (e) {} }); }

const sandbox = {
  console,
  MutationObserver: MutationObserverStub,
  setTimeout: (fn, ms) => { const id = seq++; timers.push({ id, fn, ms }); return id; },
  clearTimeout: (id) => { timers = timers.filter(t => t.id !== id); },
  setInterval: (fn, ms) => { const id = seq++; return id; },
  clearInterval: () => {},
  requestAnimationFrame: (fn) => { fn(); return 1; },
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  },
  document: {
    body, head,
    getElementById: (id) => findById(body, id) || findById(head, id),
    querySelector: (sel) => (sel === '.hamburger-btn' ? hamburger : null),
    querySelectorAll: () => [],
    createElement: (t) => mkEl(t),
    addEventListener() {}, removeEventListener() {}
  }
};
sandbox.window = sandbox;
sandbox.window.innerWidth = 390;
sandbox.window.innerHeight = 844;
sandbox.window.location = { hash: '#dashboard' };
sandbox.window.addEventListener = function () {};
sandbox.window.removeEventListener = function () {};
sandbox.window.getComputedStyle = function () { return { display: 'block', visibility: 'visible', opacity: '1' }; };
sandbox.window.AppStore = { currentUser: { uid: 'u1', email: 'a@b.c', displayName: 'Teste' } };

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'coachmarks.js'), 'utf8'),
  sandbox, { filename: 'coachmarks.js' });

const COACH = sandbox.window._coach;
ok(!!COACH, 'window._coach não existe');
ok(typeof COACH._inCourt === 'function', 'window._coach._inCourt não existe (a zona sem dica não foi criada)');

// tolerante de propósito: contra o código ANTIGO (sem a trava) o teste precisa
// chegar nas asserções de COMPORTAMENTO, não morrer na primeira chamada.
const COURT_IDS = COACH._courtOverlayIds || ['live-scoring-overlay', 'casual-match-overlay'];
function inCourt() {
  if (typeof COACH._inCourt === 'function') return COACH._inCourt();
  return COURT_IDS.some(id => !!findById(body, id));
}

function openCourt(id) { const o = mkEl('div'); o.id = id; body.appendChild(o); return o; }
function closeCourt(id) { const o = findById(body, id); if (o) body.removeChild(o); }
function coachOnScreen() { return !!findById(body, 'coach-overlay'); }
function resetTour() { COACH._stop(); COACH.reset(); timers = []; }

// ── 1. CONTROLE: sem placar aberto, a dica APARECE ──────────────────────────
// Sem este bloco o teste seria vazio — provaria só que nada acontece nunca.
(function () {
  resetTour();
  COACH.autoStartDashboard();
  ok(timers.length > 0, 'o tour nem armou o relógio de ociosidade');
  runTimers(2);
  ok(coachOnScreen(), 'CONTROLE: sem placar, a dica deveria aparecer (o harness não está disparando)');
})();

// ── 2. PLACAR AO VIVO ABERTO: nenhuma dica nasce ────────────────────────────
(function () {
  resetTour();
  const node = findById(body, 'coach-overlay'); if (node) body.removeChild(node);
  openCourt('live-scoring-overlay');
  ok(inCourt() === true, '_inCourt() não reconheceu live-scoring-overlay');
  COACH.autoStartDashboard();
  runTimers(3);
  ok(!coachOnScreen(), 'REGRESSÃO: dica nasceu com o PLACAR AO VIVO aberto');
  ok(timers.length > 0, 'o relógio não foi re-armado — o tour morre e não volta quando o placar fechar');
  closeCourt('live-scoring-overlay');
})();

// ── 3. PARTIDA CASUAL ABERTA: nenhuma dica nasce ────────────────────────────
(function () {
  resetTour();
  openCourt('casual-match-overlay');
  ok(inCourt() === true, '_inCourt() não reconheceu casual-match-overlay');
  COACH.autoStartDashboard();
  runTimers(3);
  ok(!coachOnScreen(), 'REGRESSÃO: dica nasceu com a PARTIDA CASUAL aberta');
  closeCourt('casual-match-overlay');
})();

// ── 4. Placar fechou → o tour VOLTA (a trava não é um kill permanente) ──────
(function () {
  resetTour();
  openCourt('live-scoring-overlay');
  COACH.autoStartDashboard();
  runTimers(2);
  ok(!coachOnScreen(), 'dica apareceu com o placar aberto (bloco 4)');
  closeCourt('live-scoring-overlay');
  ok(inCourt() === false, '_inCourt() continuou true depois de fechar o placar');
  runTimers(3);
  ok(coachOnScreen(), 'depois de FECHAR o placar o tour não voltou — a trava virou kill permanente');
})();

// ── 5. Dica JÁ na tela e o placar abre → ela morre na hora ──────────────────
// O toque no botão que abre o placar só suspende por 3 min (SUSPEND_MS) e o
// jogo dura mais que isso: quem manda é a PRESENÇA do overlay, não o gesto.
(function () {
  resetTour();
  let node = findById(body, 'coach-overlay'); if (node) body.removeChild(node);
  COACH.autoStartDashboard();
  runTimers(2);
  ok(coachOnScreen(), 'pré-condição do bloco 5: a dica precisa estar na tela');
  openCourt('live-scoring-overlay');
  fireObservers();
  runTimers(2); // o _hide() remove o nó num setTimeout (fade-out)
  ok(!coachOnScreen(), 'REGRESSÃO: a dica que já estava na tela sobreviveu à abertura do placar');
  closeCourt('live-scoring-overlay');
})();

// ── 6. Os ids batem com os que o app REALMENTE cria ─────────────────────────
// Declaração apodrece: se alguém renomear o overlay em bracket-ui.js e não
// atualizar a lista, a trava volta a ser decorativa e ninguém percebe.
(function () {
  const bui = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');
  (COACH._courtOverlayIds || []).forEach(id => {
    ok(bui.indexOf("'" + id + "'") !== -1, 'o id "' + id + '" não existe mais em bracket-ui.js — lista desatualizada');
  });
  ok((COACH._courtOverlayIds || []).length === 2, 'a lista de overlays de quadra mudou de tamanho — revise a trava');

  // hints.js (o outro sistema de dicas, religado pelo próprio coachmarks via
  // window._HINTS_ENABLED) precisa cobrir EXATAMENTE os mesmos overlays.
  const hints = fs.readFileSync(path.join(__dirname, '..', 'js', 'hints.js'), 'utf8');
  (COACH._courtOverlayIds || []).forEach(id => {
    ok(hints.indexOf("'" + id + "'") !== -1, 'hints.js não trava "' + id + '" — os dois sistemas divergiram');
  });
})();

console.log((fail === 0 ? '✅' : '❌') + ' dica-nunca-no-placar: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
