/* Rei/Rainha da Praia da Fase 0 roteado pelo núcleo único buildMonarchCore — node tests/phase0-monarch.test.js
 *
 * Increment 9 do motor canônico (swap do Rei/Rainha puro da Fase 0). Roda a
 * generateDrawFunction REAL (tournaments-draw.js) num sandbox headless e confere que
 * os grupos saem do núcleo (buildMonarchCore → _buildMonarchGroup): grupos de 4 com
 * 3 jogos de parceiro rotativo (AB/CD, AC/BD, AD/BC), wrapper da Fase 0 (rounds[0]
 * + individualStandings) e m.group preservado (consumido no save pra avançar a rodada).
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
// gates de pré-sorteio (não relevantes pro Rei/Rainha, mas bypassados por segurança)
window.checkOddEntries = function () { return { isOdd: false }; };
window.showOddEntriesPanel = function () {};
window.checkPowerOf2 = function (t) { var n = (t.participants || []).length; return { count: n, isPowerOf2: (n & (n - 1)) === 0, teamSize: 1 }; };
window.showPowerOf2Panel = function () {};
// FirestoreDB.saveTournament: thenable que NÃO navega (evita disparar #bracket)
window.FirestoreDB = { saveTournament: function () { return { then: function () { return { catch: function () {} }; } }; } };

load('draw-cores.js');      // window._buildMonarchCore
load('tournaments-draw.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function mkT(n) {
  var parts = [];
  for (var i = 1; i <= n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i });
  return { id: 'm', format: 'Rei/Rainha da Praia', participants: parts };
}
function runDraw(t) { _curT = t; window.generateDrawFunction('m'); return t; }
// chave de partição 2+2 (ordenada) — pra checar que os 3 jogos cobrem as 3 divisões distintas
function partKey(m) { return [m.team1.slice().sort().join('+'), m.team2.slice().sort().join('+')].sort().join(' | '); }

// ── 8 jogadores → 2 grupos de 4, 3 jogos rotativos cada, m.group preservado ──
(function () {
  var t = runDraw(mkT(8));
  ok(t.groups && t.groups.length === 2, '8 jogadores → 2 grupos [' + (t.groups ? t.groups.length : 'nenhum') + ']');
  ok(t.currentStage === 'groups' && t.status === 'active', 'stage=groups, status=active');
  var allOk = true, conserved = {};
  (t.groups || []).forEach(function (g, gi) {
    if (!g.players || g.players.length !== 4) allOk = false;
    g.players.forEach(function (p) { conserved[p] = 1; });
    var ms = (g.rounds && g.rounds[0]) ? g.rounds[0].matches : [];
    if (ms.length !== 3) allOk = false;
    // 3 partições distintas, cada uma cobrindo os 4 jogadores do grupo
    var keys = {};
    ms.forEach(function (m) {
      keys[partKey(m)] = 1;
      var four = (m.team1 || []).concat(m.team2 || []).slice().sort().join(',');
      if (four !== g.players.slice().sort().join(',')) allOk = false;
      if (m.group !== gi) allOk = false;          // m.group consumido por _checkGroupRoundComplete
      if (!m.isMonarch) allOk = false;
      if (m.winner !== null) allOk = false;
    });
    if (Object.keys(keys).length !== 3) allOk = false;  // parceiro rotativo = 3 divisões únicas
    if (!g.individualStandings || g.individualStandings.length !== 4) allOk = false;
  });
  ok(allOk, '8 jogadores → cada grupo: 4 players, 3 jogos rotativos distintos, m.group/isMonarch, standings dos 4');
  ok(Object.keys(conserved).length === 8, '8 jogadores → todos os 8 conservados nos grupos');
})();

// ── 12 jogadores → 3 grupos ──────────────────────────────────────────────────
(function () {
  var t = runDraw(mkT(12));
  ok(t.groups && t.groups.length === 3, '12 jogadores → 3 grupos [' + (t.groups ? t.groups.length : 'nenhum') + ']');
  var total = (t.groups || []).reduce(function (a, g) { return a + (g.rounds[0].matches || []).length; }, 0);
  ok(total === 9, '12 jogadores → 9 jogos no total (3 por grupo)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase0-monarch: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
