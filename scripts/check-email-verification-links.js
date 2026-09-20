#!/usr/bin/env node
'use strict';
/* Garante que o cliente só lê o documento de confirmação por token conhecido. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.claude', 'vendor', 'dist', 'build', 'coverage'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(js|mjs|cjs|html)$/.test(entry.name)) files.push(file);
  }
})(ROOT);
const failures = [], reads = [];
for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (/^(functions|tests|scripts|docs)\//.test(rel) || rel.endsWith('.md')) continue;
  const source = fs.readFileSync(file, 'utf8');
  const re = /collection\(\s*['"]emailVerificationLinks['"]\s*\)/g;
  let hit;
  while ((hit = re.exec(source))) {
    const tail = source.slice(hit.index + hit[0].length, hit.index + hit[0].length + 180).split(';')[0];
    const line = source.slice(0, hit.index).split('\n').length;
    if (/^\s*\.doc\s*\([^)]*\)\s*\.get\s*\(/.test(tail) && !/\.(where|orderBy|limit|onSnapshot)\s*\(/.test(tail)) reads.push(rel + ':' + line);
    else failures.push(rel + ':' + line + ' não usa .doc(token).get()');
  }
}
if (!reads.some(x => x.startsWith('js/'))) failures.push('resolver web ausente');
if (failures.length) { console.error('✗ emailVerificationLinks: ' + failures.join('; ')); process.exit(1); }
console.log('✓ emailVerificationLinks: ' + reads.length + ' leitura(s) por token conhecido');
