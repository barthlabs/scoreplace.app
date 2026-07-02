/* TRAVA ANTI-REGRESSÃO — node tests/no-format-regression.test.js
 *
 * Conceitos que o dono ENTERROU não podem voltar entre sessões. Este teste QUEBRA O BUILD se:
 *  1. generateDrawFunction (sorteio inicial) voltar a ter branch por formato `if (t.format===...)`.
 *     A geração de TODO formato passa pelo motor único window._phasesEngine.generatePhase.
 *     (contrato project_unify_initial_phase_canonical — não existe "fase 0" especial.)
 *  2. Qualquer código comparar `t.format === 'Rei/Rainha da Praia'` em QUALQUER lugar. Rei/Rainha é
 *     MODO de sorteio (drawMode/ligaRoundFormat), NÃO formato → use window._isMonarchFormat(t). A
 *     string de formato foi APAGADA por completo na campanha kill-monarch-format (jul/2026): o
 *     detector canônico é 100% drawMode-first e nenhum código lê/compara o format antigo.
 *     (project_rei_rainha_is_drawmode_not_format / project_kill_monarch_format_campaign.)
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

// ── 2. comparação `t.format === 'Rei/Rainha da Praia'` PROIBIDA em qualquer lugar ──
(function () {
  // Zero tolerância: o format monarch foi apagado. Nenhum código pode comparar a string —
  // "é Rei/Rainha?" resolve SEMPRE por window._isMonarchFormat(t) (drawMode/ligaRoundFormat).
  var CMP = /[=!]==\s*'Rei\/Rainha da Praia'|'Rei\/Rainha da Praia'\s*[=!]==/; // comparação (não atribuição `= '...'`)
  var violations = [];
  jsFiles(path.join(ROOT, 'js'), []).forEach(function (p) {
    var r = rel(p);
    fs.readFileSync(p, 'utf8').split('\n').forEach(function (ln, i) {
      // ignora se a string está depois de um // (comentário)
      var ci = ln.indexOf('//');
      var si = ln.indexOf("'Rei/Rainha da Praia'");
      if (ci !== -1 && si > ci) return;
      if (CMP.test(ln)) violations.push(r + ':' + (i + 1));
    });
  });
  ok(violations.length === 0, "NENHUMA comparação t.format==='Rei/Rainha da Praia' (format monarch apagado — roteie por _isMonarchFormat) [violações: " + JSON.stringify(violations) + ']');
})();

// ── 3. o detector canônico existe (consumidores têm de usar ele, não a string) ──
(function () {
  var utils = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-utils.js'), 'utf8');
  ok(/window\._isMonarchFormat\s*=/.test(utils), 'window._isMonarchFormat (detector canônico drawMode-first) existe');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' no-format-regression: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
