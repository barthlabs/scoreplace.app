#!/usr/bin/env node
// scoreplace.app — assembla o app estático em www/ pro Capacitor EMBARCAR no app nativo.
//
// O scoreplace é um site estático flat (sem build). O Capacitor precisa de um webDir único
// com só os assets que o navegador carrega. Este script copia esses assets pra www/ e deixa
// de fora tudo que é infra (functions/, infra/, tests/, tools/, docs/, node_modules, etc).
//
// Rodar antes de `npx cap sync`. www/ é gerado — está no .gitignore (a fonte de verdade é a raiz).
// Uso: node tools/build-www.js   (ou: npm run build:www)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

// Só o que o browser realmente carrega. Paths no index.html são relativos (js/…, css/…),
// então funcionam sob o esquema capacitor://localhost sem reescrever nada.
const ASSETS = [
  'index.html',
  'sw.js',
  'manifest.json',
  'robots.txt',
  'sitemap.xml',
  'css',
  'js',
  'icons'
];

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });

let copied = 0;
let missing = 0;
for (const asset of ASSETS) {
  const src = path.join(ROOT, asset);
  if (!fs.existsSync(src)) {
    console.warn('[build-www] AVISO: asset ausente, pulando →', asset);
    missing++;
    continue;
  }
  fs.cpSync(src, path.join(WWW, asset), { recursive: true });
  copied++;
}

// index.html é obrigatório — sem ele o Capacitor não tem entrypoint.
if (!fs.existsSync(path.join(WWW, 'index.html'))) {
  console.error('[build-www] ERRO: www/index.html não foi gerado. Abortando.');
  process.exit(1);
}

const bytes = (function dirSize(d) {
  let total = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
})(WWW);

console.log('[build-www] ✓ www/ montado — ' + copied + ' assets (' + missing + ' ausentes), ' + (bytes / 1024 / 1024).toFixed(1) + ' MB');
