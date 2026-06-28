/* TRAVA ANTI-REGRESSÃO — node tests/no-format-regression.test.js
 *
 * Conceitos que o dono ENTERROU não podem voltar entre sessões. Este teste QUEBRA O BUILD se:
 *  1. generateDrawFunction (sorteio inicial) voltar a ter branch por formato `if (t.format===...)`.
 *     A geração de TODO formato passa pelo motor único window._phasesEngine.generatePhase.
 *     (contrato project_unify_initial_phase_canonical — não existe "fase 0" especial.)
 *  2. Qualquer código comparar `t.format === 'Rei/Rainha da Praia'` fora do allowlist. Rei/Rainha é
 *     MODO de sorteio (drawMode), NÃO formato → use window._isMonarchFormat(t). A string só pode
 *     aparecer como comparação no detector canônico (tournaments-utils) e no load legado do
 *     create-tournament (leitura de dado antigo p/ popular o form de edição).
 *     (project_rei_rainha_is_drawmode_not_format.)
 *
 * Não depende de memória nem da diligência de ninguém — a máquina não esquece. Se este teste falhar,
 * é porque um conceito enterrado voltou; reverta ou roteie pelo helper canônico em vez de afrouxar o teste.
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
    if (st.isDirectory()) jsFiles(p, acc);
    else if (f.endsWith('.js')) acc.push(p);
  });
  return acc;
}
function rel(p) { return path.relative(ROOT, p).split(path.sep).join('/'); }

// ── 1. generateDrawFunction sem switch por formato (geração vai pelo motor único) ──
(function () {
  var src = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw.js'), 'utf8');
  var bad = src.match(/if\s*\(\(?\s*t\.format\s*===/g) || [];
  ok(bad.length === 0, 'tournaments-draw.js sem if(t.format===...) de geração — todo formato vai pelo generatePhase [achou ' + bad.length + ']');
})();

// ── 2. comparação `t.format === 'Rei/Rainha da Praia'` só no allowlist ──
(function () {
  // arquivo → nº MÁXIMO de comparações permitidas (detector canônico = 1; load legado do create = 2)
  var ALLOW = { 'js/views/tournaments-utils.js': 1, 'js/views/create-tournament.js': 2 };
  var CMP = /[=!]==\s*'Rei\/Rainha da Praia'|'Rei\/Rainha da Praia'\s*[=!]==/; // comparação (não atribuição `= '...'`)
  var violations = [];
  jsFiles(path.join(ROOT, 'js'), []).forEach(function (p) {
    var r = rel(p);
    var n = 0;
    fs.readFileSync(p, 'utf8').split('\n').forEach(function (ln, i) {
      // ignora se a string está depois de um // (comentário)
      var ci = ln.indexOf('//');
      var si = ln.indexOf("'Rei/Rainha da Praia'");
      if (ci !== -1 && si > ci) return;
      if (CMP.test(ln)) { n++; if (!(r in ALLOW)) violations.push(r + ':' + (i + 1)); }
    });
    if ((r in ALLOW) && n > ALLOW[r]) violations.push(r + ' tem ' + n + ' comparações (máx ' + ALLOW[r] + ' — uso NOVO? roteie por _isMonarchFormat)');
  });
  ok(violations.length === 0, "comparação t.format==='Rei/Rainha da Praia' só no allowlist (helper + load legado) [violações: " + JSON.stringify(violations) + ']');
})();

// ── 3. o detector canônico existe (consumidores têm de usar ele, não a string) ──
(function () {
  var utils = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-utils.js'), 'utf8');
  ok(/window\._isMonarchFormat\s*=/.test(utils), 'window._isMonarchFormat (detector canônico drawMode-first) existe');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' no-format-regression: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
