#!/usr/bin/env node
/* Corta UMA versão de produção por promoção ao Hosting.
 *
 * GitHub guarda o trabalho; Firebase Hosting é a publicação. Portanto commits de
 * desenvolvimento não podem consumir patch numbers. Este script só é chamado por
 * deploy-hosting.sh, depois de saber a versão efetivamente servida, e prepara a
 * próxima versão quando existe código público desde o último corte.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(process.env.SP_RELEASE_ROOT || path.join(__dirname, '..'));
const production = String(process.env.SP_RELEASE_PRODUCTION_VERSION || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(production)) throw new Error('SP_RELEASE_PRODUCTION_VERSION inválida.');
const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const current = fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(current)) throw new Error('version.txt inválido.');
const lastCut = git(['log', '-1', '--format=%H', '--', 'version.txt']);
const changed = git(['diff', '--name-only', lastCut + '..HEAD']).split('\n').filter(Boolean)
  .some((file) => /^(?:js|css|assets|public)\//.test(file) || file === 'index.html' || file === 'sw.js' || file === 'manifest.json');
if (!changed) {
  console.log('✓ nenhum código público desde o último corte — versão ' + current + ' preservada');
  process.exit(0);
}
const parts = production.split('.').map(Number);
const next = [parts[0], parts[1], parts[2] + 1].join('.');
const replaceOne = (file, re, value) => {
  const full = path.join(root, file), before = fs.readFileSync(full, 'utf8');
  if (!re.test(before)) throw new Error('não encontrei versão em ' + file);
  fs.writeFileSync(full, before.replace(re, value));
};
replaceOne('js/store.js', /window\.SCOREPLACE_VERSION\s*=\s*'[^']+'/, "window.SCOREPLACE_VERSION = '" + next + "'");
replaceOne('sw.js', /var CACHE_NAME = 'scoreplace-v[^']+'/, "var CACHE_NAME = 'scoreplace-v" + next + "'");
const notes = path.join(root, 'js/release-notes.js');
const note = '// ' + next + ' — Atualização consolidada de produção com as correções validadas desde a última publicação.\n';
fs.writeFileSync(notes, note + fs.readFileSync(notes, 'utf8'));
console.log('✓ corte de produção preparado: ' + current + ' → ' + next + ' (base ' + lastCut.slice(0, 8) + ')');
