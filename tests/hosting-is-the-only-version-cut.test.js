'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-hosting-cut-'));
const git = (args) => execFileSync('git', args, { cwd: lab, stdio: 'ignore' });
try {
  git(['init']); git(['config', 'user.email', 'test@scoreplace.app']); git(['config', 'user.name', 'Scoreplace test']);
  fs.mkdirSync(path.join(lab, 'js'));
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.3.253\n');
  fs.writeFileSync(path.join(lab, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '2.3.253';\n");
  fs.writeFileSync(path.join(lab, 'sw.js'), "var CACHE_NAME = 'scoreplace-v2.3.253';\n");
  fs.writeFileSync(path.join(lab, 'js', 'release-notes.js'), '// notes\n');
  git(['add', '.']); git(['commit', '-m', 'last hosting cut']);
  fs.writeFileSync(path.join(lab, 'js', 'screen.js'), 'new public screen\n');
  git(['add', '.']); git(['commit', '-m', 'work accumulated']);
  const prep = path.join(root, 'scripts', 'prepare-hosting-release.js');
  const env = { ...process.env, SP_RELEASE_ROOT: lab, SP_RELEASE_PRODUCTION_VERSION: '2.3.253' };
  const first = spawnSync(process.execPath, [prep], { env, encoding: 'utf8' });
  if (first.status !== 0 || !/2\.3\.253 → 2\.3\.254/.test(first.stdout)) throw new Error('não cortou uma única versão: ' + first.stderr);
  const store = fs.readFileSync(path.join(lab, 'js', 'store.js'), 'utf8');
  const sw = fs.readFileSync(path.join(lab, 'sw.js'), 'utf8');
  if (!store.includes("'2.3.254'") || !sw.includes('scoreplace-v2.3.254')) throw new Error('corte não sincronizou app e SW');
  // No deploy real, `npm run prerender` deriva version.txt do store antes do commit.
  fs.writeFileSync(path.join(lab, 'version.txt'), '2.3.254\n');
  git(['add', '.']); git(['commit', '-m', 'hosting cut']);
  const second = spawnSync(process.execPath, [prep], { env: { ...env, SP_RELEASE_PRODUCTION_VERSION: '2.3.254' }, encoding: 'utf8' });
  if (second.status !== 0 || !/versão 2\.3\.254 preservada/.test(second.stdout)) throw new Error('corte vazio inflou a versão');
  console.log('✓ hosting-is-the-only-version-cut: trabalho acumula e só o Hosting corta uma versão');
} finally { fs.rmSync(lab, { recursive: true, force: true }); }
