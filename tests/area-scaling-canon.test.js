/* CÂNONE escala por área — TRAVA anti-regressão.
 *
 * O app escala por área via `zoom` no body (index.html). Sob `zoom`, unidades
 * `vw`/`vh`/`dvh` NÃO acompanham o zoom → um overlay full-screen com 100vw/100vh
 * ESTOURA a tela (scrollbar horizontal, modal descentrado). Todo overlay/modal
 * full-screen DEVE usar `%`, nunca vw/vh/dvh.
 *
 * Este teste varre js/ e css/ e FALHA se alguém reintroduzir o padrão perigoso —
 * assim o `npm test` (gate de deploy) impede a regressão. Ver memória
 * project_web_area_scaling_canon.
 *
 * PERMITIDO de propósito (não são escape — não causam overflow horizontal):
 *   - `min-height: 100vh` (altura de página no body/html; cosmético vertical)
 *   - `max-width: NNvw` (caps limitados, ex.: boot bar, hint balloon)
 *   - `NNvw`/`NNvh` pequenos dentro de clamp()/gap (mobile/live-scoring, zoom=1)
 *   - a fórmula do zoom em index.html (`(100vw - 1400px)`) — index.html não é varrido
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['js', 'css'];

// Padrões PROIBIDOS (overlay/modal full-screen usando vw/vh/dvh):
const BANNED = [
  { re: /width:\s*100vw/gi, name: 'width:100vw (use width:100%)' },
  { re: /(?<!min-)height:\s*100vh\b/gi, name: 'height:100vh (use height:100%)' },
  { re: /height:\s*100dvh\b/gi, name: 'height:100dvh (use height:100%)' },
  { re: /height:\s*calc\(\s*100[vd]h/gi, name: 'height:calc(100vh/dvh...) (use calc(100%...))' },
  { re: /max-height:\s*[0-9]+vh\b/gi, name: 'max-height:NNvh (use NN% — o overlay é 100% do viewport)' },
  { re: /max-height:\s*calc\(\s*100[vd]h/gi, name: 'max-height:calc(100vh...) (use calc(100%...))' },
  { re: /calc\(\s*50%\s*-\s*50vw\s*\)/gi, name: 'calc(50% - 50vw) full-bleed (use margin 0 / % — estoura sob zoom)' },
];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(js|css)$/.test(e.name) && !/\.test\.js$/.test(e.name)) out.push(p);
  }
}

// neutraliza comentários // linha e /* bloco */ pra não falso-positivar em docstrings,
// PRESERVANDO a contagem de linhas (troca o conteúdo do comentário por espaços, mantém \n)
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(Math.max(0, m.length - p1.length)));
}

const files = [];
for (const d of DIRS) { const dir = path.join(ROOT, d); if (fs.existsSync(dir)) walk(dir, files); }

const violations = [];
for (const file of files) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    for (const b of BANNED) {
      b.re.lastIndex = 0;
      if (b.re.test(line)) {
        violations.push(path.relative(ROOT, file) + ':' + (i + 1) + '  → ' + b.name);
      }
    }
  });
}

if (violations.length) {
  console.error('❌ CÂNONE escala por área VIOLADO — ' + violations.length + ' uso(s) de vw/vh/dvh em overlay full-screen:');
  violations.forEach((v) => console.error('   ' + v));
  console.error('\n   Sob `zoom` no body, vw/vh/dvh estouram a tela. Troque por `%`.');
  console.error('   Ver memória project_web_area_scaling_canon.');
  process.exit(1);
}

console.log('✅ escala por área: nenhum overlay full-screen usa vw/vh/dvh (' + files.length + ' arquivos varridos)');
process.exit(0);
