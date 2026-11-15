/* Há uma única aparência azul ativa. Seletores antigos claro/escuro podem
 * permanecer para compatibilidade, mas não devem decidir a pintura inicial. */
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

// ── a escolha ativa é única, mesmo com preferência antiga salva ────────────
const theme = fs.readFileSync(path.join(ROOT, 'js', 'theme.js'), 'utf8');
ok(/setAttribute\('data-theme', 'dark'\)/.test(theme), 'pré-pintura fixa a aparência azul');
ok(!/scoreplace_theme|localStorage\.getItem\(['"]theme/.test(theme), 'pré-pintura ignora preferência de tema antiga');
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
ok(/_themeOrder = \['dark'\]/.test(store), 'runtime oferece uma única aparência');
ok(!/_toggleTheme\s*=|_applyThemeIcon\s*=/.test(store), 'runtime não oferece alternância');
const style = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
ok(/--sp-blue-top: #348dbb/.test(style) && /--sp-blue-bottom: #145584/.test(style), 'paleta azul oficial presente');

console.log((fail ? '✗' : '✓') + ' tema-unico-azul: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
