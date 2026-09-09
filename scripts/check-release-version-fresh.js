#!/usr/bin/env node
/* Impede publicar código novo com o mesmo número já presente em origin/main.
 * A coerência shell/JS/SW não basta: sem um número novo, o Service Worker conserva
 * a chave antiga e aparelhos já instalados continuam executando o release anterior. */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const root = path.resolve(process.env.SP_RELEASE_ROOT || path.join(__dirname, '..'));
const git = (args) => {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch (e) { return ''; }
};
const cmp = (a, b) => {
  const aa = String(a).split('.').map(Number), bb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) > (bb[i] || 0) ? 1 : -1;
  }
  return 0;
};
const current = fs.readFileSync(path.join(root, 'version.txt'), 'utf8').trim();
const base = git(['show', 'origin/main:version.txt']);
const ahead = Number(git(['rev-list', '--count', 'origin/main..HEAD']) || 0);
const live = String(process.env.SP_RELEASE_PRODUCTION_VERSION || '').trim();
const baseline = [base, live].filter((v) => /^\d+\.\d+/.test(v)).sort(cmp).pop();
if (!base && !live) {
  console.log('✓ versão fresca: cópia de deploy sem histórico Git; a checagem ocorreu no repositório-fonte');
  process.exit(0);
}
if ((ahead > 0 || live) && baseline && cmp(current, baseline) <= 0) {
  console.error('✗ RELEASE BLOQUEADO — há código novo ou uma versão já no ar, mas version.txt continua em ' + current + '.');
  console.error('  A mesma chave do Service Worker faria aparelhos já instalados manterem o JavaScript anterior.');
  console.error('  Bumpe SCOREPLACE_VERSION, rode npm run prerender e atualize os cache-busters antes de publicar.');
  process.exit(1);
}
console.log('✓ versão fresca: ' + current + ' é maior que a base ' + (baseline || 'sem histórico') + ' (' + ahead + ' commit(s) novo(s))');
