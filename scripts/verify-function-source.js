#!/usr/bin/env node
'use strict';
// Confere o ZIP imutável de uma Function com a árvore Git que deveria estar no ar.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const cp = require('node:child_process');

const root = path.join(__dirname, '..');
const excluded = new Set(['.firebaserc', 'firebase.emulator.json', 'firebase.json', 'firestore.emulator.rules']);
function exec(file, args, options = {}) {
  return cp.execFileSync(file, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
}
function validateMetadata(f, name, startedAt) {
  const source = f.buildConfig?.source?.storageSource;
  if (f.state !== 'ACTIVE' || f.buildConfig?.entryPoint !== name ||
      !Number.isFinite(Date.parse(f.updateTime)) || Date.parse(f.updateTime) < Date.parse(startedAt) ||
      !/^gcf-v2-sources-[a-z0-9-]+$/.test(source?.bucket || '') ||
      source?.object !== `${name}/function-source.zip` ||
      !/^\d+$/.test(String(source?.generation || ''))) {
    throw new Error(`metadados da Function divergentes: ${name}`);
  }
  return source;
}
function expectedNames(commit, codebase) {
  if (!['functions', 'functions-autodraw'].includes(codebase) || !/^[0-9a-f]{40}$/.test(commit)) throw new Error('origem inválida');
  return exec('git', ['ls-tree', '-r', '-z', '--name-only', commit, '--', codebase]).split('\0').filter(Boolean)
    .map(name => name.slice(codebase.length + 1))
    .filter(name => !excluded.has(name) && (codebase === 'functions' || !/^test-[^/]+\.js$/.test(name)))
    .sort();
}
function compareTrees(names, expectedDir, actualDir) {
  const actual = walk(actualDir);
  if (new Set(actual).size !== actual.length || names.length !== actual.length || names.some((name, i) => name !== actual[i])) throw new Error('lista de arquivos do pacote divergente');
  const hash = crypto.createHash('sha256');
  for (const name of names) {
    const a = fs.readFileSync(path.join(actualDir, name));
    const b = fs.readFileSync(path.join(expectedDir, name));
    if (!a.equals(b)) throw new Error(`bytes divergentes: ${name}`);
    hash.update(name).update('\0').update(crypto.createHash('sha256').update(a).digest('hex')).update('\n');
  }
  return hash.digest('hex');
}
function walk(dir, base = '') {
  return fs.readdirSync(path.join(dir, base), { withFileTypes: true }).flatMap(entry => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return walk(dir, rel);
    if (!entry.isFile()) throw new Error(`entrada não regular: ${rel}`);
    return [rel];
  }).sort();
}
function verify(name, codebase, commit, startedAt) {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error('nome de Function inválido');
  const f = JSON.parse(exec('gcloud', ['functions', 'describe', name, '--project', 'scoreplace-app', '--region', 'us-central1', '--gen2', '--format=json']));
  const source = validateMetadata(f, name, startedAt);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sp-source-${name}-`));
  try {
    const archive = path.join(dir, 'source.tar');
    fs.writeFileSync(archive, cp.execFileSync('git', ['archive', commit, codebase], { cwd: root, maxBuffer: 32 * 1024 * 1024 }));
    fs.mkdirSync(path.join(dir, 'git'));
    exec('tar', ['-xf', archive, '-C', path.join(dir, 'git')]);
    const zip = path.join(dir, 'source.zip');
    exec('gcloud', ['storage', 'cp', `gs://${source.bucket}/${source.object}#${source.generation}`, zip]);
    const names = exec('unzip', ['-Z1', zip]).trim().split('\n').filter(Boolean);
    if (names.some(n => n.startsWith('/') || n.split('/').includes('..') || n.endsWith('/')) || new Set(names).size !== names.length) throw new Error('entradas ZIP inseguras');
    const expected = expectedNames(commit, codebase);
    if (names.slice().sort().join('\n') !== expected.join('\n')) throw new Error(`nomes do ZIP divergentes: ${name}`);
    fs.mkdirSync(path.join(dir, 'zip'));
    exec('unzip', ['-qq', zip, '-d', path.join(dir, 'zip')]);
    const treeSha256 = compareTrees(expected, path.join(dir, 'git', codebase), path.join(dir, 'zip'));
    return { name, updateTime: f.updateTime, state: f.state, generation: String(source.generation), treeSha256, commit };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
if (require.main === module) {
  const [name, codebase, commit, startedAt] = process.argv.slice(2);
  process.stdout.write(`${JSON.stringify(verify(name, codebase, commit, startedAt))}\n`);
}
module.exports = { validateMetadata, expectedNames, compareTrees, verify };
