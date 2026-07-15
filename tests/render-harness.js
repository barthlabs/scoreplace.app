/* Harness de RENDER — estende o headless carregando a camada de render REAL
 * (store.js, tournaments.js, bracket.js) com stubs de DOM/timers/sessionStorage.
 *
 * POR QUÊ: o headless só carrega js/views/* de LÓGICA. Mas TODOS os bugs que
 * pegamos à mão no simulado do Casais viviam na camada de RENDER/SEMÂNTICA:
 *   • estrutura por rodada da chave inferior (3,4,3,2,1 vs 3,4,2,2,1,1)
 *   • nome das rodadas ("Semifinal" vs "Linha"/"Rodada 5"/"Quartas")
 *   • "Linha 1/2/3" na classificação (bracket 'grand' vs 'grandfinal')
 *   • ordem da classificação (1º venc GF, 2º perd GF, 3º perd final inferior…)
 *   • pódio presente + box escuro
 * Nenhum teste exercitava isso porque store.js/bracket.js não carregavam headless
 * (tickers + document.body.addEventListener). Este harness destrava a camada.
 *
 * Uso:  const { window, buildDupla, simulate } = require('./render-harness');
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const h = require('./headless');
const sandbox = h.sandbox;
const noop = function () {};

// timers → noop: store.js inicia tickers no load; com timers reais eles disparam
// e batem em document/AppStore inexistentes. Não precisamos executá-los.
sandbox.setInterval = function () { return 0; };
sandbox.clearInterval = noop;
sandbox.setTimeout = function () { return 0; };
sandbox.clearTimeout = noop;
sandbox.requestAnimationFrame = function () { return 0; };
sandbox.cancelAnimationFrame = noop;

function el() {
  return {
    style: {}, dataset: {}, setAttribute: noop, getAttribute: function () { return null; },
    appendChild: noop, removeChild: noop, insertBefore: noop, remove: noop,
    addEventListener: noop, removeEventListener: noop, cloneNode: el,
    classList: { add: noop, remove: noop, toggle: noop, contains: function () { return false; } },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; },
    innerHTML: '', textContent: '', firstChild: null, children: [], parentNode: null, focus: noop
  };
}
sandbox.document = {
  getElementById: function () { return null; }, querySelector: function () { return null; },
  querySelectorAll: function () { return []; }, body: el(), documentElement: el(), head: el(),
  addEventListener: noop, removeEventListener: noop, createElement: el, createDocumentFragment: el,
  cookie: '', hidden: false, visibilityState: 'visible'
};
sandbox.window.addEventListener = noop;
sandbox.window.removeEventListener = noop;
sandbox.window.matchMedia = function () { return { matches: false, addEventListener: noop, addListener: noop }; };
var _ss = {};
sandbox.sessionStorage = {
  getItem: function (k) { return (k in _ss) ? _ss[k] : null; },
  setItem: function (k, v) { _ss[k] = String(v); }, removeItem: function (k) { delete _ss[k]; }, clear: function () { _ss = {}; }
};
sandbox.navigator = sandbox.navigator || { userAgent: 'node', share: undefined };
sandbox.location = sandbox.location || { hash: '', href: 'http://localhost/', reload: noop, replace: noop };
sandbox._nameWithCrown = sandbox._nameWithCrown || function (n) { return String(n == null ? '' : n); };
sandbox._fitPodiumNames = noop;
sandbox._playerPhotoCache = {};
sandbox._profileAvatarUrl = function (n) { return 'avatar://' + n; };
sandbox.AppStore = sandbox.AppStore || { tournaments: [], logAction: noop, sync: noop, currentUser: null };

var ROOT = path.join(__dirname, '..', 'js');
function loadAbs(full) { vm.runInContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full }); }

// i18n REAL — pra os nomes de rodada saírem em pt-BR ("Semifinais"/"Final"/"Quartas de Final")
// em vez da chave crua ("bracket.semiFinal"). i18n.js define window._t + _translations;
// i18n-pt.js popula _translations['pt']. Assim o teste assere a string que o usuário VÊ.
sandbox._initialLang = 'pt';
loadAbs(path.join(ROOT, 'i18n.js'));
loadAbs(path.join(ROOT, 'i18n-pt.js'));

// camada de render (tournaments-draw já veio? não — headless não carrega). Ordem: draw →
// tournaments (_buildPodiumHtml) → store (_renderPodiumsAndClassif) → bracket (nomes de rodada).
loadAbs(path.join(ROOT, 'views', 'tournaments-draw.js'));
loadAbs(path.join(ROOT, 'views', 'tournaments.js'));
// identity-core: cânone de identidade por uid, extraído do store.js (jul/2026) — o store.js
// não define mais _participantUids/_memberUidByName/_idMap*/_entryHasVip. Antes do store.js,
// como no index.html.
loadAbs(path.join(ROOT, 'views', 'identity-core.js'));
loadAbs(path.join(ROOT, 'store.js'));
// bracket-model: schema Rei/Rainha — o PAR _foldMonarchGroups (grava só matchIds) +
// _hydrateMonarchGroups (relê como refs). O hydrate saiu do bracket.js (v1.2.25) pra cá,
// então sem este load o store.js/firebase-db chamariam um `undefined` guardado = no-op
// silencioso, e o harness deixaria de exercitar a hidratação. Como no index.html.
loadAbs(path.join(ROOT, 'views', 'bracket-model.js'));
loadAbs(path.join(ROOT, 'views', 'bracket.js'));

var E = sandbox._phasesEngine;

// --- stubs do FLUXO DE SORTEIO (generateDrawFunction) — pra formatos cujo render precisa da
//     estrutura que só o sorteio real monta (Rei/Rainha, Grupos): commit sync, sem Firestore.
function txThen() { return { then: function (cb) { cb && cb(); return { catch: noop }; } }; }
sandbox.AppStore.commitDrawTx = txThen;
sandbox.AppStore.commitInitialDraw = txThen;
sandbox.AppStore.commitTournamentTx = txThen;
sandbox.AppStore.syncImmediate = txThen;
sandbox.AppStore.sync = noop;
sandbox.AppStore.logAction = noop;
sandbox.AppStore.getTournament = function (id) { return sandbox.AppStore.tournaments.find(function (x) { return String(x.id) === String(id); }); };
sandbox._notifyDrawPersonalized = noop;
sandbox._notifyTournamentParticipants = noop;
sandbox.showAlertDialog = noop;
sandbox.checkOddEntries = function () { return { isOdd: false }; };
sandbox.showOddEntriesPanel = noop;
sandbox.checkPowerOf2 = function (t) { var n = (t.participants || []).length; return { count: n, isPowerOf2: (n & (n - 1)) === 0, teamSize: 1 }; };
sandbox.showPowerOf2Panel = noop;

// --- helpers de cenário ---
function mkPool(n) { var a = []; for (var i = 0; i < n; i++) a.push({ displayName: 'D' + i, categories: ['C'] }); return a; }

// monta um torneio pelo SORTEIO REAL (generateDrawFunction) — pro render bater com o app.
function buildViaDraw(format, n, extra) {
  var parts = []; for (var i = 1; i <= n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i, uid: 'u' + i });
  var t = Object.assign({ id: 'DRW', format: format, participants: parts, status: 'open' }, extra || {});
  sandbox.AppStore.tournaments = [t];
  sandbox.generateDrawFunction(t.id);
  return t;
}

// monta uma Dupla Eliminatória com repescagem (n fora de pow2) do zero.
function buildDupla(n) {
  var cfg = { format: 'Dupla Eliminatória', formatCode: 'elim_dupla', teamSize: 2, bracketResolution: 'playin', source: { type: 'enrollment' }, categories: ['C'] };
  var t = { id: 'T', format: 'Dupla Eliminatória', teamSize: 2, matches: [], currentPhaseIndex: 0 };
  var b = E.generatePhase(mkPool(n), cfg, { idPrefix: 'p', ordered: true, t: t, isVip: function () { return false; }, catOf: function (e) { return (e.categories || [])[0]; } });
  E.storePhase(t, 0, b);
  (b.repMetaByCat || [b.repMeta]).forEach(function (mm) { sandbox._buildRepechageDoubleElim(t, mm); });
  return t;
}

// joga TODOS os jogos jogáveis (winner = p1) até o fim; saldo variado pra desempate.
function simulate(t) {
  var g = 0;
  while (g++ < 8000) {
    var m = t.matches.find(function (x) {
      return x && !x.winner && !x.isBye && x.p1 && x.p2 && x.p1 !== 'TBD' && x.p2 !== 'TBD' &&
        x.p1 !== 'BYE' && x.p2 !== 'BYE' && !/aguard|derrotad|melhor|vencedor/i.test(String(x.p1) + String(x.p2));
    });
    if (!m) break;
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
    sandbox._advanceWinner(t, m);
    if (typeof sandbox._resolveRepFills === 'function') sandbox._resolveRepFills(t);
  }
  return t;
}

// decide TODOS os jogos das rodadas nativas (t.rounds[].matches) — Liga/Suíço/Rei-Rainha
// incremental (o simulate() acima só varre t.matches, que é o storage de eliminatórias).
function simulateRounds(t) {
  var g = 0;
  (t.rounds || []).forEach(function (r) {
    (r && r.matches || []).forEach(function (m) {
      if (m && !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (g++ % 5); }
    });
  });
  return t;
}

// reconstrói t.groups pros FIXTURES dos testes — o render de Rei/Rainha lê subgroups.
// Modelo NOVO (campanha kill-monarch-format): o sorteio grava t.rounds[].monarchGroups
// (motor league incremental) → usa esses grupos direto (matches por REFERÊNCIA: decidir
// a rodada decide o grupo). Fallback: modelo antigo (t.matches isMonarch) — compat.
function hydrateMonarchGroups(t) {
  var fromRounds = [];
  (t.rounds || []).forEach(function (r) {
    ((r && r.monarchGroups) || []).forEach(function (g) { fromRounds.push(g); });
  });
  if (fromRounds.length) { t.groups = fromRounds; return t; }
  var byG = {};
  (t.matches || []).filter(function (m) { return m.isMonarch; }).forEach(function (m) {
    var g = (m.monarchGroup != null) ? m.monarchGroup : 0;
    byG[g] = byG[g] || { name: m.groupName || ('Grupo ' + (g + 1)), players: [], matches: [] };
    byG[g].matches.push(m);
    (m.team1 || []).concat(m.team2 || []).forEach(function (p) { if (byG[g].players.indexOf(p) < 0) byG[g].players.push(p); });
  });
  t.groups = Object.keys(byG).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return byG[k]; });
  return t;
}

// reconstrói t.groups dos matches bracket='group' (Fase de Grupos, round-robin 1v1 p1/p2).
function hydrateGroups(t) {
  var byG = {};
  (t.matches || []).filter(function (m) { return m.bracket === 'group' || (m.groupIdx != null && !m.isMonarch); }).forEach(function (m) {
    var g = (m.groupIdx != null) ? m.groupIdx : 0;
    byG[g] = byG[g] || { name: m.groupName || ('Grupo ' + (g + 1)), players: [], matches: [] };
    byG[g].matches.push(m);
    [m.p1, m.p2].forEach(function (p) { if (p && p !== 'BYE' && p !== 'TBD' && byG[g].players.indexOf(p) < 0) byG[g].players.push(p); });
  });
  t.groups = Object.keys(byG).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return byG[k]; });
  return t;
}

// colunas da chave inferior (nº de jogos por rodada) via _getUnifiedRounds.
function lowerCadence(t) {
  var u = sandbox._getUnifiedRounds(t);
  return u.columns.filter(function (c) { return c.bracket === 'lower'; }).map(function (c) { return (c.matches || []).length; });
}

module.exports = { window: sandbox, sandbox, E: E, buildDupla: buildDupla, buildViaDraw: buildViaDraw, hydrateMonarchGroups: hydrateMonarchGroups, hydrateGroups: hydrateGroups, simulate: simulate, simulateRounds: simulateRounds, lowerCadence: lowerCadence, mkPool: mkPool };
