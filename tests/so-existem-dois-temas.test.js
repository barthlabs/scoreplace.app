/* SÓ EXISTEM DOIS TEMAS — ESCURO E CLARO (2.0.94)
 * node tests/so-existem-dois-temas.test.js
 *
 * `js/theme.js` diz desde a v2.6.27: _"SÓ 2 temas — escuro e claro (sunset/ocean
 * removidos)"_. Removidos da ESCOLHA — mas o código deles ficou para trás: dois blocos
 * inteiros de variáveis no style.css, regras de balão de dica, e ramos
 * `else if (_theme === 'sunset')` em três views que nunca executaram.
 *
 * Ordem do dono (25/ago/2026), ao me ver escrever "3 temas" num relatório:
 *   _"2 temas, que 3 temas?"_  ·  _"podemos eliminar esse código morto?"_
 *
 * ⛔ Código morto não é só peso — ele MENTE. Eu li o CSS, vi `[data-theme="sunset"]` e
 * reportei três temas ao dono. O próximo leitor erraria igual. Este teste impede a volta.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const semComentario = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── CSS: nenhum seletor de tema morto ────────────────────────────────────────
const cssDir = path.join(ROOT, 'css');
fs.readdirSync(cssDir).filter((f) => f.endsWith('.css')).forEach((f) => {
  const txt = semComentario(fs.readFileSync(path.join(cssDir, f), 'utf8'));
  const mortos = txt.match(/\[data-theme="(sunset|ocean)"\]/g) || [];
  ok(mortos.length === 0, 'css/' + f + ' ainda tem ' + mortos.length + ' seletor(es) de tema morto');
});

// ── JS: nenhum ramo que compare com um tema morto ────────────────────────────
const jsDir = path.join(ROOT, 'js');
const arquivos = [];
(function anda(d) {
  fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'vendor') return;
    const p = path.join(d, e.name);
    if (e.isDirectory()) anda(p); else if (e.name.endsWith('.js')) arquivos.push(p);
  });
})(jsDir);

arquivos.forEach((p) => {
  const txt = semComentario(fs.readFileSync(p, 'utf8'));
  // comparação com o tema, ou chave num mapa de temas — não a palavra solta
  // ("beach sunset" é texto de prompt de imagem e pode ficar)
  const mortos = txt.match(/===\s*['"](sunset|ocean)['"]|['"](sunset|ocean)['"]\s*:/g) || [];
  ok(mortos.length === 0, path.relative(ROOT, p) + ' ainda decide por tema morto: ' + mortos.join(', '));
});

// ── e o app segue oferecendo os DOIS que existem ─────────────────────────────
const theme = fs.readFileSync(path.join(ROOT, 'js', 'theme.js'), 'utf8');
ok(/light/.test(theme) && /dark/.test(theme), 'js/theme.js precisa continuar tratando dark e light');
const style = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
ok(/\[data-theme="light"\]/.test(style), 'css/style.css perdeu o tema CLARO — isso seria regressão de verdade');

console.log((fail ? '✗' : '✓') + ' so-existem-dois-temas: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
