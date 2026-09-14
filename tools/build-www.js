#!/usr/bin/env node
// scoreplace.app — assembla o app estático em www/ pro Capacitor EMBARCAR no app nativo.
//
// O scoreplace é um site estático flat (sem build). O Capacitor precisa de um webDir único
// com só os assets que o navegador carrega. Este script copia esses assets pra www/ e deixa
// de fora tudo que é infra (functions/, infra/, tests/, tools/, docs/, node_modules, etc).
//
// Rodar antes de `npx cap sync`. www/ é gerado — está no .gitignore (a fonte de verdade é a raiz).
// Uso: node tools/build-www.js [--hosting]  (ou: npm run build:www / npm run build:hosting)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { verify: verifyWebEntry } = require('../scripts/check-web-entry-contract');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const MANIFEST = '.scoreplace-build.json';
const HOSTING = process.argv.slice(2).includes('--hosting');
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== '--hosting');
if (unknownArgs.length) {
  console.error('[build-www] Uso: node tools/build-www.js [--hosting]');
  process.exit(2);
}

// Antes de copiar tudo, confirma que o shell servido aponta só para arquivos presentes e
// preserva as dependências explícitas entre o domínio tipado e a ponte clássica.
if (!verifyWebEntry(ROOT)) process.exit(1);

/* Vite é agora o orquestrador de build. A cópia dos scripts clássicos é feita pelo plugin
 * versionado em vite.config.mjs, que preserva a ordem do HTML enquanto a migração para
 * módulos avança por domínio. */
const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) {
  console.error('[build-www] ERRO: Vite não está instalado. Rode npm ci.');
  process.exit(1);
}
const vite = spawnSync(process.execPath, [viteBin, 'build', '--config', 'vite.config.mjs'], {
  cwd: ROOT,
  stdio: 'inherit'
});
if (vite.status !== 0) process.exit(vite.status || 1);

// index.html é obrigatório — sem ele o Capacitor não tem entrypoint.
if (!fs.existsSync(path.join(WWW, 'index.html'))) {
  console.error('[build-www] ERRO: www/index.html não foi gerado. Abortando.');
  process.exit(1);
}

/* O mesmo shell serve web e Capacitor, mas os seus árbitros de atualização são diferentes.
 * No Hosting, estes arquivos fazem parte do contrato público e são copiados para o artefato.
 * No pacote nativo, `version.txt` deliberadamente NÃO entra: o aplicativo instalado precisa
 * consultar a versão remota, nunca a própria cópia local. */
if (HOSTING) {
  ['version.txt', 'ext-version.txt', 'native-update-policy.json', 'favicon.ico'].forEach((file) => {
    const source = path.join(ROOT, file);
    if (!fs.existsSync(source)) {
      console.error('[build-www] ERRO: artefato obrigatório do Hosting ausente: ' + file);
      process.exit(1);
    }
    fs.copyFileSync(source, path.join(WWW, file));
  });
}

const bytes = (function dirSize(d) {
  let total = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return total;
})(WWW);

/* O bundle web precisa ser reproduzível: uma mesma árvore-fonte gera a mesma lista de
 * arquivos e os mesmos hashes, sem relógio ou dado local escondido no artefato. O manifesto
 * não é usado pelo app em execução (a política de update nativo continua remota); ele é a
 * evidência verificável do que o Capacitor receberia quando uma build nativa for autorizada. */
const files = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).forEach((entry) => {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(WWW, absolute).split(path.sep).join('/');
    if (relative === MANIFEST) return;
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) {
      files.push({
        path: relative,
        bytes: fs.statSync(absolute).size,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
      });
    }
  });
})(WWW);
fs.writeFileSync(path.join(WWW, MANIFEST), JSON.stringify({ schema: 1, files }, null, 2) + '\n');

console.log('[build-www] ✓ www/ montado por Vite' + (HOSTING ? ' para Hosting' : ' para Capacitor') + ' — ' +
  (bytes / 1024 / 1024).toFixed(1) + ' MB, manifesto de ' + files.length + ' arquivos');
