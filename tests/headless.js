/* Harness headless pra testar a lógica REAL do app (js/views/*) em node, sem Firebase nem DOM.
 *
 * Como: um contexto vm LIMPO (vm.createContext) cujo objeto global é `sandbox`, com
 * `sandbox.window = sandbox`. Os arquivos do app são carregados no browser via <script>, então
 * `function X(){}` no topo vira global (window.X) e `window.X = ...` idem. Rodando o texto via
 * vm.runInContext nesse sandbox, ambos aterrissam em sandbox — exatamente como no browser.
 * Contexto próprio (não o global poluído do Node) = determinístico: `window`, `firebase`,
 * `localStorage` resolvem como nome livre porque o sandbox É o global do contexto.
 *
 * Testa o código REAL de js/views/ (não a cópia vendor/ do autodraw).
 *
 * Uso:  const { window } = require('./headless');
 *       window._computeStandings(t, cat)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;        // window === global do contexto
sandbox.globalThis = sandbox;
sandbox.console = console;       // _error usa console.error
sandbox.setTimeout = setTimeout;
sandbox.clearTimeout = clearTimeout;

// --- stubs mínimos que os arquivos referenciam em runtime ---
sandbox._t = function (k, vars) {
  if (vars && typeof k === 'string') {
    return k.replace(/\{(\w+)\}/g, (_, n) => (vars[n] != null ? vars[n] : '{' + n + '}'));
  }
  return k;
};
sandbox._warn = function () {};
sandbox._log = function () {};
sandbox._error = function () { console.error.apply(console, arguments); };
sandbox._debug = function () {};
sandbox._safeHtml = (s) => String(s == null ? '' : s);
sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = function () {};
sandbox.firebase = {
  functions: () => ({ httpsCallable: () => (() => Promise.resolve({ data: {} })) }),
  firestore: () => ({}),
};
let _ls = {};
sandbox.localStorage = {
  getItem: (k) => (k in _ls ? _ls[k] : null),
  setItem: (k, v) => { _ls[k] = String(v); },
  removeItem: (k) => { delete _ls[k]; },
  clear: () => { _ls = {}; },
};

vm.createContext(sandbox);

const VIEWS = path.join(__dirname, '..', 'js', 'views');
function load(rel) {
  const full = path.join(VIEWS, rel);
  vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
}

// Ordem importa (mesma do index.html / draw-core.js): utils → categorias → model → logic
load('sport-rules.js');             // window.SPORT_RULES — fonte única das regras das modalidades
load('tournaments-utils.js');       // _isLigaFormat, _calcNextDrawDate
load('tournaments-categories.js');  // _displayCategoryName, _getParticipantCategories, _participantInCategory
load('bracket-model.js');           // _appendCanonicalColumn
load('bracket-logic.js');           // _computeStandings, _advanceWinner, _findMatch, _maybeFinish*, _generateNextRound
load('phases-engine.js');           // window._phasesEngine: buildEntrantsByDest, materializeNextPhase, bracketPhaseGroups…

module.exports = { window: sandbox, sandbox, load, E: sandbox._phasesEngine };
