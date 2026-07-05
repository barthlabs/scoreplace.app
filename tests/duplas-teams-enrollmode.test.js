/* TRAVA ANTI-REGRESSÃO — node tests/duplas-teams-enrollmode.test.js
 *
 * O BUG QUE VOLTA: torneio de dupla-formada criado pelo format2 grava
 * enrollmentMode='teams' (ver format2.js:208/237). O legado usa 'time'. Todo gate
 * de "é torneio de equipe/dupla?" que compara `enrollmentMode === 'time'` cru fica
 * CEGO a 'teams' → o torneio cai no grid individual misturado em vez do card canônico
 * de duplas (seções "Sem dupla" no topo / "Duplas formadas" abaixo). Já regrediu 2×
 * (v4.4.96 e de novo depois). Esta trava QUEBRA O BUILD se o padrão voltar.
 *
 * Contrato canônico (project_enrollmode_teams_vs_time_drift): SEMPRE rotear "é equipe?"
 * por window._isTeamEnrollMode(mode) — que trata 'time' | 'teams' | 'misto' como
 * sinônimos. NUNCA comparar `enrollmentMode === 'time'` sem incluir 'teams' junto.
 *
 * A máquina não esquece. Se este teste falhar, um gate cego a 'teams' voltou:
 * roteie pelo helper (ou inclua '|| ... === "teams"' num branch de rótulo) —
 * NÃO afrouxe o teste.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function jsFiles(dir, acc) {
  fs.readdirSync(dir).forEach(function (f) {
    var p = path.join(dir, f);
    var st = fs.statSync(p);
    if (st.isDirectory()) { if (f !== 'node_modules') jsFiles(p, acc); }
    else if (f.endsWith('.js') && !f.endsWith('.test.js')) acc.push(p);
  });
  return acc;
}
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

// Remove a parte comentada (// ...) da linha, pra não flagar exemplo em comentário.
function stripComment(ln) {
  var ci = ln.indexOf('//');
  return ci === -1 ? ln : ln.slice(0, ci);
}

// ── 1. O helper canônico existe em tournaments-utils.js ──
(function () {
  var utils = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-utils.js'), 'utf8');
  ok(/window\._isTeamEnrollMode\s*=/.test(utils),
    'window._isTeamEnrollMode (helper canônico time|teams|misto) existe');
})();

// ── 2. O helper realmente trata 'teams' como equipe (contrato de comportamento) ──
(function () {
  global.window = global.window || {};
  require('../js/views/tournaments-utils.js');
  var f = global.window._isTeamEnrollMode;
  ok(typeof f === 'function', 'helper é função carregável');
  ok(f && f('teams') === true, "_isTeamEnrollMode('teams') === true (format2)");
  ok(f && f('time') === true, "_isTeamEnrollMode('time') === true (legado)");
  ok(f && f('misto') === true, "_isTeamEnrollMode('misto') === true");
  ok(f && f('individual') === false, "_isTeamEnrollMode('individual') === false");
})();

// ── 3. ZERO gate de equipe cego a 'teams' em TODO js/ ──
// Assinatura do bug: uma expressão que compara enrollmentMode a 'time' E a 'misto'
// (o par clássico do gate de equipe) mas NÃO menciona 'teams'. woScope usa 'time'
// mas nunca pareia com 'misto', então não é flagado. Precisão cirúrgica.
(function () {
  var violations = [];
  jsFiles(path.join(ROOT, 'js'), []).forEach(function (p) {
    var r = rel(p);
    fs.readFileSync(p, 'utf8').split('\n').forEach(function (ln, i) {
      var code = stripComment(ln);
      var hasTime = /['"]time['"]/.test(code);
      var hasMisto = /['"]misto['"]/.test(code);
      var hasTeams = /['"]teams['"]/.test(code);
      if (hasTime && hasMisto && !hasTeams) violations.push(r + ':' + (i + 1));
    });
  });
  ok(violations.length === 0,
    "NENHUM gate de equipe comparando 'time'+'misto' sem 'teams' (use _isTeamEnrollMode) " +
    '[violações: ' + JSON.stringify(violations) + ']');
})();

// ── 4. O gate DO CARD (a regressão exata do screenshot) usa o helper ──
// _isDoublesTournament decide Layout A (Sem dupla / Duplas formadas) vs grid individual.
// Ele TEM que passar pelo helper — não pode voltar a comparar 'time'||'misto' cru.
(function () {
  var src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments.js'), 'utf8');
  var m = src.match(/_isDoublesTournament\s*=\s*([^;]+);/);
  ok(!!m, '_isDoublesTournament (gate do card de duplas) existe em tournaments.js');
  if (m) {
    ok(/_isTeamEnrollMode\s*\(/.test(m[1]),
      '_isDoublesTournament roteia por window._isTeamEnrollMode (não compara enrollmentMode cru)');
  }
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' duplas-teams-enrollmode: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
