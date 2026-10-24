'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts/check-operation-regions-mixed.js');
const gitRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
const gitLog = gitRepo.status === 0
  ? spawnSync('git', ['log', '-1', '--format=%H', '--', 'functions-autodraw'], { cwd: root, encoding: 'utf8' })
  : null;
const current = gitLog?.status === 0 ? gitLog.stdout.trim() : '';
const manifestsPresent = ['v2', 'v3'].every(version =>
  fs.existsSync(path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`)));
const skipReason = gitRepo.status !== 0 ? 'sem histórico Git (cópia git archive)'
  : !current ? 'sem commit de functions-autodraw no histórico Git'
    : !manifestsPresent ? 'manifestos regionais ignorados pelo git archive' : false;
const digest = skipReason ? '' : execFileSync('node',
  ['scripts/operation-source-digest.js', 'functions-autodraw', 'endMatchOnCourt', current],
  { cwd: root }).toString().trim();

for (const version of ['v2', 'v3']) {
  const run = (rows, allowLegacyCourt = false) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-region-test-'));
    const file = path.join(dir, 'manifest.json');
    fs.writeFileSync(file, JSON.stringify(rows));
    try { return spawnSync('node', [script, version, ...(allowLegacyCourt ? ['--allow-legacy-court'] : [])],
      { cwd: root, env: { ...process.env, SP_REGION_MANIFEST: file }, encoding: 'utf8' }); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  test(`${version}: corte antigo e atualização só da quadra`, { skip: skipReason }, () => {
    const original = JSON.parse(fs.readFileSync(path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`)));
    const legacy = structuredClone(original);
    const legacyCommit = legacy.find(row => row.name !== `sp-op-end-court-${version}`).commit;
    const legacyDigest = execFileSync('node', ['scripts/operation-source-digest.js', 'functions-autodraw',
      'endMatchOnCourt', legacyCommit, '--from-git'], { cwd: root }).toString().trim();
    for (const row of legacy.filter(row => row.name === `sp-op-end-court-${version}`)) {
      row.commit = legacyCommit;
      row.sourceDigest = legacyDigest;
    }
    assert.equal(run(legacy, true).status, 0);
    assert.notEqual(run(legacy).status, 0, 'Hosting barra quadra antiga');
    const mixed = structuredClone(original);
    for (const row of mixed.filter(row => row.name === `sp-op-end-court-${version}`)) {
      row.commit = current;
      row.sourceDigest = digest;
    }
    assert.equal(run(mixed).status, 0);
    const wrongService = structuredClone(mixed);
    wrongService.find(row => row.name === `sp-op-score-${version}`).commit = current;
    assert.notEqual(run(wrongService).status, 0);
    const wrongLegacyDigest = structuredClone(mixed);
    for (const row of wrongLegacyDigest.filter(row => row.name === `sp-op-score-${version}`)) row.sourceDigest = '0'.repeat(64);
    assert.notEqual(run(wrongLegacyDigest).status, 0, 'digest de outra porta continua verificado contra o commit antigo');
    const wrongDigest = structuredClone(mixed);
    for (const row of wrongDigest.filter(row => row.name === `sp-op-end-court-${version}`)) row.sourceDigest = '0'.repeat(64);
    assert.notEqual(run(wrongDigest).status, 0);
    const differentImage = structuredClone(mixed);
    differentImage.find(row => row.name === `sp-op-end-court-${version}`).image = 'image@sha256:' + 'f'.repeat(64);
    assert.notEqual(run(differentImage).status, 0);
  });
}
