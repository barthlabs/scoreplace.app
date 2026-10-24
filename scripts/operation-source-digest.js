'use strict';
// Fingerprint of the exact source tree used by one operational Cloud Run target.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');

function sourceDescriptor(codebase, commit, fromGit = false) {
  if (!['functions', 'functions-autodraw'].includes(codebase) || !/^[0-9a-f]{40}$/.test(commit || '')) {
    throw new Error('codebase ou commit inválido');
  }
  const files = execFileSync('git', fromGit
    ? ['ls-tree', '-r', '-z', '--name-only', commit, '--', codebase]
    : ['ls-files', '-z', '--', codebase], { cwd: root })
    .toString().split('\0').filter(Boolean).sort();
  if (!files.length) throw new Error('codebase sem arquivos versionados');
  const readFile = file => fromGit
    ? execFileSync('git', ['show', `${commit}:${file}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
    : fs.readFileSync(path.join(root, file));
  return {
    runtime: JSON.parse(readFile(`${codebase}/package.json`)).engines.node,
    hashes: files.map(file => [file, crypto.createHash('sha256').update(readFile(file)).digest('hex')])
  };
}

function sourceDigest(target, commit, descriptor) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(target || '')) throw new Error('target inválido');
  const canonical = JSON.stringify({ target, runtime: descriptor.runtime, commit, hashes: descriptor.hashes });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

if (require.main === module) {
  const [codebase, target, commit, sourceMode] = process.argv.slice(2);
  if (sourceMode && sourceMode !== '--from-git') {
    throw new Error('uso: node scripts/operation-source-digest.js <functions|functions-autodraw> <target> <commit> [--from-git]');
  }
  process.stdout.write(sourceDigest(target, commit, sourceDescriptor(codebase, commit, sourceMode === '--from-git')));
}
module.exports = { sourceDescriptor, sourceDigest };
