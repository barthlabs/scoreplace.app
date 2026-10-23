'use strict';
// Fingerprint of the exact source tree used by one operational Cloud Run target.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const [codebase, target, commit] = process.argv.slice(2);
if (!['functions', 'functions-autodraw'].includes(codebase) || !/^[A-Za-z][A-Za-z0-9]*$/.test(target || '') ||
    !/^[0-9a-f]{40}$/.test(commit || '')) {
  throw new Error('uso: node scripts/operation-source-digest.js <functions|functions-autodraw> <target> <commit>');
}
const files = execFileSync('git', ['ls-files', '-z', '--', codebase], { cwd: root })
  .toString().split('\0').filter(Boolean).sort();
if (!files.length) throw new Error('codebase sem arquivos versionados');
const hashes = files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]);
const runtime = JSON.parse(fs.readFileSync(path.join(root, codebase, 'package.json'))).engines.node;
const canonical = JSON.stringify({ target, runtime, commit, hashes });
process.stdout.write(crypto.createHash('sha256').update(canonical).digest('hex'));
