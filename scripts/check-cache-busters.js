#!/usr/bin/env node
/* check-cache-busters.js — trava de deploy: todo JS ALTERADO tem que ter o cache-buster
 * na versão atual, senão o service worker serve a cópia velha e o deploy é fantasma.
 *
 * POR QUE ISTO EXISTE (14/jul/2026): editei js/views/match-history.js e esqueci de bumpar
 * `?v=` no index.html — ele seguia em `?v=1.1.1`. O arquivo no disco tinha o código novo,
 * os testes passavam, mas o NAVEGADOR carregava a versão antiga do SW. Só apareceu porque
 * fui verificar a tela no browser; nenhum teste unitário pega isso. É a mesma família do
 * incidente do <script> não-fechado (v0.16.11): erro que vive no index.html, não no JS.
 *
 * Compara contra origin/main: qualquer .js sob js/ que mudou precisa de ?v=<versão atual>.
 * Uso:  node scripts/check-cache-busters.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const versao = (store.match(/window\.SCOREPLACE_VERSION\s*=\s*'([^']+)'/) || [])[1];
if (!versao) { console.error('✗ não achei SCOREPLACE_VERSION em js/store.js'); process.exit(1); }

let mudados = [];
try {
  const base = execSync('git merge-base HEAD origin/main', { cwd: root }).toString().trim();
  mudados = execSync('git diff --name-only ' + base + ' -- js/', { cwd: root })
    .toString().split('\n').map((s) => s.trim()).filter((s) => s.endsWith('.js'));
} catch (e) {
  console.log('⚠ sem origin/main pra comparar — pulando (' + (e.message || '').split('\n')[0] + ')');
  process.exit(0);
}

const falhas = [];
mudados.forEach((f) => {
  // regex do caminho exato + ?v=
  const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\?v=([0-9a-zA-Z.\\-]+)', 'g');
  const achados = [...html.matchAll(re)].map((m) => m[1]);
  if (!achados.length) return;   // não referenciado no index (lazy-load, extensão, functions)
  achados.forEach((v) => {
    if (v !== versao) falhas.push(f + ' mudou mas está com ?v=' + v + ' (atual: ' + versao + ')');
  });
});

if (falhas.length) {
  console.error('\n✗ cache-buster desatualizado — o navegador serviria a versão VELHA:\n');
  falhas.forEach((f) => console.error('  • ' + f));
  console.error('\n  Bumpe o ?v= no index.html pra ' + versao + '.\n');
  process.exit(1);
}
console.log('✓ cache-busters ok (' + mudados.length + ' js alterado(s), versão ' + versao + ')');
