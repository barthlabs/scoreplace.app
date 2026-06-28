/* Rei/Rainha (MODO de sorteio) na fase 0 pelo motor canônico — node tests/phase0-monarch.test.js
 *
 * Contrato project_unify_initial_phase_canonical. Roda a generateDrawFunction REAL
 * (tournaments-draw.js) num sandbox headless e confere que Rei/Rainha (modo, NÃO formato)
 * é desenhado pelo MOTOR ÚNICO: t._canonicalDraw, jogos isMonarch taggeados na fase 0
 * (t.matches, bracket='monarch'), grupos de 4 com 3 jogos rotativos (AB/CD, AC/BD, AD/BC),
 * e o avanço lê via prevPhaseGroups. SEM t.groups nativo (era o caminho legado).
 */
const { window, load } = require('./headless.js');

let _curT = null;
window._findTournamentById = function () { return _curT; };
window.AppStore = {
  logAction: function () {},
  getTournament: function () { return _curT; },
  syncImmediate: function () { return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; },
};
window._notifyDrawPersonalized = function () {};
window.showAlertDialog = function () {};
window.showNotification = function () {};
window.document = { getElementById: function () { return null; }, body: { style: {} } };
window.location = { hash: '' };
window.checkOddEntries = function () { return { isOdd: false }; };
window.showOddEntriesPanel = function () {};
window.checkPowerOf2 = function (t) { var n = (t.participants || []).length; return { count: n, isPowerOf2: (n & (n - 1)) === 0, teamSize: 1 }; };
window.showPowerOf2Panel = function () {};
// helpers de identidade do store.js (não carregado no headless)
window._pName = function (p) { return typeof p === 'string' ? p : (p.displayName || p.name || ''); };
window._entryTeamMembers = function () { return null; };
window._entryHasVip = function () { return false; };

load('draw-cores.js');
load('tournaments-draw.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function mkT(n) {
  var parts = [];
  for (var i = 1; i <= n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i });
  return { id: 'm', format: 'Rei/Rainha da Praia', participants: parts };
}
function runDraw(t) { _curT = t; window.generateDrawFunction('m'); return t; }
function partKey(m) { return [m.team1.slice().sort().join('+'), m.team2.slice().sort().join('+')].sort().join(' | '); }
function monMatches(t) { return (t.matches || []).filter(function (m) { return m.isMonarch && (m.phaseIndex || 0) === 0; }); }

// ── 8 jogadores → motor canônico: 2 grupos de 4, 3 jogos rotativos, t.matches taggeado ──
(function () {
  var t = runDraw(mkT(8));
  ok(t._canonicalDraw === true && t.status === 'active', 'Rei/Rainha vai pelo motor canônico (t._canonicalDraw)');
  ok(!t.groups, 'sem t.groups nativo (era o caminho legado)');
  var ms = monMatches(t);
  ok(ms.length === 6, '8 jogadores → 6 jogos monarca taggeados na fase 0 (2 grupos × 3) [' + ms.length + ']');
  // reconstrói os grupos via a leitura canônica (a mesma que o avanço usa)
  var groups = window._phasesEngine.prevPhaseGroups(t);
  ok(groups.length === 2, '8 jogadores → prevPhaseGroups reconstrói 2 grupos [' + groups.length + ']');
  var allOk = true, conserved = {};
  groups.forEach(function (g) {
    if (!g.players || g.players.length !== 4) allOk = false;
    g.players.forEach(function (p) { conserved[p] = 1; });
    if (g.matches.length !== 3) allOk = false;
    var keys = {};
    g.matches.forEach(function (m) {
      keys[partKey(m)] = 1;
      var four = (m.team1 || []).concat(m.team2 || []).slice().sort().join(',');
      if (four !== g.players.slice().sort().join(',')) allOk = false;
      if (!m.isMonarch) allOk = false;
    });
    if (Object.keys(keys).length !== 3) allOk = false; // parceiro rotativo = 3 divisões únicas
  });
  ok(allOk, '8 jogadores → cada grupo: 4 jogadores, 3 jogos rotativos distintos cobrindo os 4, isMonarch');
  ok(Object.keys(conserved).length === 8, '8 jogadores → todos os 8 conservados');
})();

// ── 12 jogadores → 3 grupos (9 jogos) ────────────────────────────────────────
(function () {
  var t = runDraw(mkT(12));
  ok(monMatches(t).length === 9, '12 jogadores → 9 jogos monarca (3 grupos × 3) [' + monMatches(t).length + ']');
  ok(window._phasesEngine.prevPhaseGroups(t).length === 3, '12 jogadores → 3 grupos reconstruídos');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase0-monarch: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
