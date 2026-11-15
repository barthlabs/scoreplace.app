/* A aparência única não oferece escolhas de tema na interface. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [
  ['seletor da topbar ausente', !/id="theme-toggle-btn"/.test(read('index.html'))],
  ['seletor do perfil ausente', !/data-theme-val=|theme-btn-group/.test(read('js/views/auth.js'))],
  ['dica sobre temas ausente', !/id: 'ps_theme'|id: 'menu_tema'/.test(read('js/coachmarks.js'))],
  ['manual descreve aparência única', /Aparência<\/b> — Azul padrão/.test(read('js/main.js'))],
];
let failed = 0;
for (const [label, pass] of checks) { console.log((pass ? '✓ ' : '✗ ') + label); if (!pass) failed++; }
process.exitCode = failed ? 1 : 0;
