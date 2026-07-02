/* REGRESSÃO: Rei/Rainha (MODO) num torneio de DUPLA/misto (Confra) — node tests/phase0-monarch-duplas.test.js
 *
 * Bug real (staging 4.1.61): fase Rei/Rainha numa Confra com teamSize>1 / inscrição
 * misto formava DUPLAS e o gerador juntava 2 duplas num "time de 4" (4×4). Rei/Rainha
 * é MODO INDIVIDUAL de parceiros rotativos — o pool tem que ser de PESSOAS.
 *
 * Este teste dirige a generateDrawFunction REAL (o caminho onde o bug morava — o teste
 * antigo phase0-monarch.test.js stubava _entryTeamMembers→null e fixava teamSize=1, então
 * NUNCA entrava na formação de duplas). Cobre os 2 caminhos que ninguém testava:
 *   (A) inscrição 'misto' com indivíduos  → auto-formaria duplas (bug)
 *   (B) casais PRÉ-formados (p1/p2)        → pool viria como duplas (bug)
 * Asserção-chave: NENHUM jogo monarca tem time com > 2 pessoas. Falha no código antigo.
 * Ver feedback_tests_must_reproduce_real_failure, project_rei_rainha_is_drawmode_not_format.
 */
const { window, load } = require('./headless.js');

let _curT = null;
window._findTournamentById = function () { return _curT; };
window.AppStore = {
  logAction: function () {},
  getTournament: function () { return _curT; },
  syncImmediate: function () { return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; },
  commitDrawTx: function () { return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; },
};
window._notifyDrawPersonalized = function () {};
window.showAlertDialog = function () {};
window.showNotification = function () {};
window.document = { getElementById: function () { return null; }, body: { style: {} } };
window.location = { hash: '' };
window.checkOddEntries = function () { return { isOdd: false }; };
window.showOddEntriesPanel = function () {};
window.checkPowerOf2 = function () { return { isPowerOf2: true }; };
window.showPowerOf2Panel = function () {};
window._pName = function (p) { return typeof p === 'string' ? p : (p.displayName || p.name || ''); };
// _entryTeamMembers FIEL ao store.js (o teste antigo stubava pra null — foi o que escondeu o bug).
window._entryTeamMembers = function (p) {
  if (!p || typeof p !== 'object') return null;
  if (Array.isArray(p.participants) && p.participants.length) {
    return p.participants.map(function (s) { return (s && (s.displayName || s.name)) || String(s || ''); }).filter(Boolean);
  }
  var hasP1 = !!(p.p1Uid || p.p1Name), hasP2 = !!(p.p2Uid || p.p2Name);
  if (hasP1 && hasP2) return [p.p1Name || p.p1Uid || '', p.p2Name || p.p2Uid || ''];
  return null;
};
window._entryHasVip = function () { return false; };
window._isMonarchFormat = function (t) { return !!(t && (t.drawMode === 'rei_rainha' || t.ligaRoundFormat === 'rei_rainha')); };

load('draw-cores.js');
load('tournaments-draw.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function runDraw(t) { _curT = t; window.generateDrawFunction(t.id); return t; }
// modelo NOVO (campanha kill-monarch-format): jogos monarca moram em t.rounds[].matches
// (motor league incremental) — t.matches monarch é o modelo antigo, morto.
function monMatches(t) {
  var out = [];
  (t.rounds || []).forEach(function (r) { (r.matches || []).forEach(function (m) { if (m.isMonarch) out.push(m); }); });
  return out;
}
// conta PESSOAS (não entradas): no bug, um "membro" vinha como "A / B" (dupla colada).
function sidePeople(team) { return (team || []).reduce(function (s, x) { return s.concat(String(x).split(' / ')); }, []); }
function teamMax(m) { return Math.max(sidePeople(m.team1).length, sidePeople(m.team2).length); }
function peopleIn(m) { return sidePeople(m.team1).concat(sidePeople(m.team2)); }
function distinctPeople(t) {
  var set = {}; monMatches(t).forEach(function (m) { peopleIn(m).forEach(function (n) { set[n] = 1; }); });
  return Object.keys(set);
}

// ── (A) 8 indivíduos, inscrição 'misto', fase Rei/Rainha (Confra) ─────────────
(function () {
  var parts = [];
  for (var i = 1; i <= 8; i++) parts.push({ displayName: 'J' + i, name: 'J' + i, uid: 'u' + i });
  var t = {
    id: 'A', format: 'Fase de Grupos + Eliminatórias', drawMode: 'rei_rainha',
    enrollmentMode: 'misto', teamSize: 2, participants: parts,
    phases: [{ format: 'Fase de Grupos + Eliminatórias', drawMode: 'rei_rainha' }, { format: 'Eliminatórias Simples' }]
  };
  runDraw(t);
  var ms = monMatches(t);
  ok(ms.length === 6, '(A) misto+Rei/Rainha: 8 pessoas → 6 jogos monarca (2 grupos × 3) [' + ms.length + ']');
  var maxTeam = 0; ms.forEach(function (m) { maxTeam = Math.max(maxTeam, teamMax(m)); });
  ok(maxTeam <= 2, '(A) NENHUM jogo com time > 2 pessoas (o bug era 4×4) [maxTeam=' + maxTeam + ']');
  ok(distinctPeople(t).length === 8, '(A) 8 pessoas conservadas como indivíduos [' + distinctPeople(t).length + ']');
})();

// ── (B) 8 pessoas como 4 casais PRÉ-formados, fase Rei/Rainha ─────────────────
(function () {
  var parts = [
    { p1Name: 'Silvia', p1Uid: 's', p2Name: 'Ana', p2Uid: 'a' },
    { p1Name: 'Lucia', p1Uid: 'l', p2Name: 'Betânia', p2Uid: 'b' },
    { p1Name: 'Katia', p1Uid: 'k', p2Name: 'Beatriz', p2Uid: 'be' },
    { p1Name: 'Rosângela', p1Uid: 'r', p2Name: 'Luciana', p2Uid: 'lu' },
  ];
  var t = {
    id: 'B', format: 'Fase de Grupos + Eliminatórias', drawMode: 'rei_rainha',
    enrollmentMode: 'time', teamSize: 2, participants: parts,
    phases: [{ format: 'Fase de Grupos + Eliminatórias', drawMode: 'rei_rainha' }, { format: 'Eliminatórias Simples' }]
  };
  runDraw(t);
  var ms = monMatches(t);
  ok(ms.length === 6, '(B) casais pré-formados+Rei/Rainha: 8 pessoas → 6 jogos monarca [' + ms.length + ']');
  var maxTeam = 0; ms.forEach(function (m) { maxTeam = Math.max(maxTeam, teamMax(m)); });
  ok(maxTeam <= 2, '(B) NENHUM jogo com time > 2 pessoas (decompõe casais em indivíduos) [maxTeam=' + maxTeam + ']');
  var ppl = distinctPeople(t);
  ok(ppl.length === 8, '(B) 8 pessoas conservadas [' + ppl.length + ']');
  ok(ppl.indexOf('Silvia') !== -1 && ppl.indexOf('Ana') !== -1, '(B) membros dos casais viram entradas individuais');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase0-monarch-duplas: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
