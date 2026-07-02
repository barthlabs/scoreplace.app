/* Rei/Rainha (MODO de sorteio) na fase 0 pelo motor canônico — node tests/phase0-monarch.test.js
 *
 * Contrato project_kill_monarch_format_campaign: Rei/Rainha é MODO do PONTOS CORRIDOS —
 * TODO monarch roda no motor league INCREMENTAL. Roda a generateDrawFunction REAL
 * (tournaments-draw.js) num sandbox headless e confere que o sorteio grava o STORAGE
 * NATIVO multi-rodada: t.rounds[0].monarchGroups (grupos de 4 com 3 jogos rotativos
 * AB/CD, AC/BD, AD/BC), ligaRoundFormat='rei_rainha', NADA no modelo antigo (t.matches
 * monarch / t.groups), e o avanço lê via prevPhaseGroups. Rei/Rainha é detectado SÓ por
 * drawMode/ligaRoundFormat='rei_rainha' — o format string 'Rei/Rainha da Praia' foi APAGADO
 * (campanha kill-monarch-format, jul/2026): monarch nunca é formato.
 */
const { window, load } = require('./headless.js');

let _curT = null;
window._findTournamentById = function () { return _curT; };
window.AppStore = {
  logAction: function () {},
  getTournament: function () { return _curT; },
  syncImmediate: function () { return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; },
  // Blindagem: _commitInitialDraw usa commitDrawTx. Teste do MOTOR (asserção sobre a
  // chave no `t` local), não de persistência — prova de corrida em tests/concurrency.
  commitDrawTx: function () { return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; },
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

function mkT(n, shape) {
  var parts = [];
  for (var i = 1; i <= n; i++) parts.push({ displayName: 'J' + i, name: 'J' + i });
  return Object.assign({ id: 'm', participants: parts }, shape);
}
function runDraw(t) { _curT = t; window.generateDrawFunction('m'); return t; }
function partKey(m) { return [m.team1.slice().sort().join('+'), m.team2.slice().sort().join('+')].sort().join(' | '); }
// modelo NOVO: jogos monarca moram nas rodadas nativas (t.rounds[].matches)
function monMatches(t) {
  var out = [];
  (t.rounds || []).forEach(function (r) { (r.matches || []).forEach(function (m) { if (m.isMonarch) out.push(m); }); });
  return out;
}

function checkStructure(label, t, nGroups, nPlayers) {
  ok(t._canonicalDraw === true && t.status === 'active', label + ': vai pelo motor canônico (t._canonicalDraw)');
  ok(!t.groups, label + ': sem t.groups nativo (caminho legado morto)');
  ok((t.matches || []).filter(function (m) { return m.isMonarch; }).length === 0, label + ': NADA no modelo antigo (t.matches monarch)');
  ok(t.ligaRoundFormat === 'rei_rainha', label + ': reroteio marca ligaRoundFormat=rei_rainha');
  ok(Array.isArray(t.rounds) && t.rounds.length === 1, label + ': 1 rodada nativa gerada (multi-rodada habilitado)');
  var mg = (t.rounds[0] && t.rounds[0].monarchGroups) || [];
  ok(mg.length === nGroups, label + ': t.rounds[0].monarchGroups com ' + nGroups + ' grupos [' + mg.length + ']');
  var ms = monMatches(t);
  ok(ms.length === nGroups * 3, label + ': ' + (nGroups * 3) + ' jogos monarca (' + nGroups + ' grupos × 3) [' + ms.length + ']');
  // reconstrói os grupos via a leitura canônica (a mesma que o avanço usa)
  var groups = window._phasesEngine.prevPhaseGroups(t);
  ok(groups.length === nGroups, label + ': prevPhaseGroups reconstrói ' + nGroups + ' grupos [' + groups.length + ']');
  var allOk = true, conserved = {};
  groups.forEach(function (g) {
    if (!g.players || g.players.length !== 4) allOk = false;
    g.players.forEach(function (p) { conserved[typeof p === 'string' ? p : (p.name || p.displayName)] = 1; });
    if (g.matches.length !== 3) allOk = false;
    var keys = {};
    g.matches.forEach(function (m) {
      keys[partKey(m)] = 1;
      var four = (m.team1 || []).concat(m.team2 || []).slice().sort().join(',');
      var gp = g.players.map(function (p) { return typeof p === 'string' ? p : (p.name || p.displayName); });
      if (four !== gp.slice().sort().join(',')) allOk = false;
      if (!m.isMonarch) allOk = false;
    });
    if (Object.keys(keys).length !== 3) allOk = false; // parceiro rotativo = 3 divisões únicas
  });
  ok(allOk, label + ': cada grupo com 4 jogadores, 3 jogos rotativos distintos cobrindo os 4, isMonarch');
  ok(Object.keys(conserved).length === nPlayers, label + ': todos os ' + nPlayers + ' conservados');
}

// ── detecta por ligaRoundFormat='rei_rainha' SEM drawMode explícito ──
(function () {
  var t = runDraw(mkT(8, { format: 'Liga', ligaRoundFormat: 'rei_rainha', drawManual: true }));
  checkStructure('RR via ligaRoundFormat 8', t, 2, 8);
})();

// ── 12 jogadores → 3 grupos (9 jogos) ────────────────────────────────────────
(function () {
  var t = runDraw(mkT(12, { format: 'Liga', drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', drawManual: true }));
  checkStructure('RR 12', t, 3, 12);
})();

// ── shape canônico NOVO: Liga + drawMode='rei_rainha' (o que o create grava hoje) ──
(function () {
  var t = runDraw(mkT(8, { format: 'Liga', drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', drawManual: true }));
  checkStructure('Liga+RR 8', t, 2, 8);
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase0-monarch: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
