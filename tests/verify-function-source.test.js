'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateMetadata, compareTrees, expectedNames } = require('../scripts/verify-function-source');

test('metadados da Function exigem nome, estado, data e geração corretos', () => {
  const f = { state: 'ACTIVE', updateTime: '2026-10-28T05:00:00Z', buildConfig: {
    entryPoint: 'drawRound', source: { storageSource: {
      bucket: 'gcf-v2-sources-382268772878-us-central1', object: 'drawRound/function-source.zip', generation: '1793163473203409'
    } }
  } };
  assert.equal(validateMetadata(f, 'drawRound', '2026-10-23T00:00:00Z').generation, '1793163473203409');
  for (const bad of [
    { ...f, state: 'FAILED' },
    { ...f, updateTime: '2026-10-22T00:00:00Z' },
    { ...f, buildConfig: { ...f.buildConfig, entryPoint: 'autoDraw' } },
    { ...f, buildConfig: { ...f.buildConfig, source: { storageSource: { ...f.buildConfig.source.storageSource, generation: 'wrong' } } } },
    { ...f, buildConfig: { ...f.buildConfig, source: { storageSource: { ...f.buildConfig.source.storageSource, object: 'other/function-source.zip' } } } }
  ]) assert.throws(() => validateMetadata(bad, 'drawRound', '2026-10-23T00:00:00Z'), /divergentes/);
});

test('árvore do ZIP exige conjunto exato e bytes idênticos', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-source-test-'));
  try {
    const expected = path.join(dir, 'expected'), actual = path.join(dir, 'actual');
    fs.mkdirSync(expected); fs.mkdirSync(actual);
    fs.writeFileSync(path.join(expected, 'a.js'), 'same');
    fs.writeFileSync(path.join(actual, 'a.js'), 'same');
    assert.match(compareTrees(['a.js'], expected, actual), /^[a-f0-9]{64}$/);
    fs.writeFileSync(path.join(actual, 'extra.js'), 'x');
    assert.throws(() => compareTrees(['a.js'], expected, actual), /lista/);
    fs.rmSync(path.join(actual, 'extra.js'));
    fs.writeFileSync(path.join(actual, 'a.js'), 'different');
    assert.throws(() => compareTrees(['a.js'], expected, actual), /bytes/);
    assert.throws(() => compareTrees(['a.js', 'missing.js'], expected, actual), /lista/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('política de embalagem inclui testes em functions mas não em autodraw', () => {
  // O SHA curto de release é resolvido pelo teste sem depender do conteúdo do checkout.
  const { execFileSync } = require('node:child_process');
  const full = execFileSync('git', ['rev-parse', '40be907df'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
  assert.equal(full.length, 40);
  assert(expectedNames(full, 'functions').some(x => x.startsWith('test-')));
  assert(!expectedNames(full, 'functions-autodraw').some(x => x.startsWith('test-')));
});
