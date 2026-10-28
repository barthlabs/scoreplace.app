'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { sourceDescriptor, sourceDigest } = require('../scripts/operation-source-digest');
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
  ['scripts/operation-source-digest.js', 'functions-autodraw', 'endMatchOnCourt', current, '--from-git'],
  { cwd: root }).toString().trim();
const scoreDigest = skipReason ? '' : execFileSync('node',
  ['scripts/operation-source-digest.js', 'functions-autodraw', 'applyMatchResult', current, '--from-git'],
  { cwd: root }).toString().trim();

for (const version of ['v2', 'v3']) {
  const run = (rows, allowLegacyCourt = false, extraEnv = {}, requireCurrent = false) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-region-test-'));
    const file = path.join(dir, 'manifest.json');
    fs.writeFileSync(file, JSON.stringify(rows));
    try { return spawnSync('node', [script, version, ...(allowLegacyCourt ? ['--allow-legacy-court'] : []), ...(requireCurrent ? ['--require-current'] : [])],
      { cwd: root, env: { ...process.env, ...extraEnv, SP_REGION_MANIFEST: file }, encoding: 'utf8' }); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  test(`${version}: corte antigo e atualização só da quadra`, { skip: skipReason }, () => {
    const original = JSON.parse(fs.readFileSync(path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`)));
    assert.equal(run(original).status, 0, 'revisões regionais registradas continuam válidas após novos commits');
    const legacy = structuredClone(original);
    const legacyCommit = legacy.find(row => row.name === `sp-op-court-${version}`).commit;
    const legacyDigest = execFileSync('node', ['scripts/operation-source-digest.js', 'functions-autodraw',
      'endMatchOnCourt', legacyCommit, '--from-git'], { cwd: root }).toString().trim();
    for (const row of legacy.filter(row => row.name === `sp-op-end-court-${version}`)) {
      row.commit = legacyCommit;
      row.sourceDigest = legacyDigest;
    }
    const legacyScoreDigest = execFileSync('node', ['scripts/operation-source-digest.js', 'functions-autodraw',
      'applyMatchResult', legacyCommit, '--from-git'], { cwd: root }).toString().trim();
    for (const row of legacy.filter(row => row.name === `sp-op-score-${version}`)) {
      row.commit = legacyCommit;
      row.sourceDigest = legacyScoreDigest;
    }
    assert.equal(run(legacy, true).status, 0);
    assert.notEqual(run(legacy).status, 0, 'Hosting barra quadra antiga');
    assert.notEqual(run(legacy, false, {}, true).status, 0, 'release barra qualquer fonte antiga');
    const mixed = structuredClone(legacy);
    for (const row of mixed.filter(row => row.name === `sp-op-end-court-${version}`)) {
      row.commit = current;
      row.sourceDigest = digest;
    }
    assert.equal(run(mixed).status, 0);
    const scoreOnly = structuredClone(legacy);
    for (const row of scoreOnly.filter(row => row.name === `sp-op-score-${version}`)) {
      row.commit = current;
      row.sourceDigest = scoreDigest;
    }
    assert.equal(run(scoreOnly).status, 0, 'placar pode ser atualizado sozinho');
    const both = structuredClone(mixed);
    for (const row of both.filter(row => row.name === `sp-op-score-${version}`)) {
      row.commit = current;
      row.sourceDigest = scoreDigest;
    }
    assert.equal(run(both).status, 0, 'placar e encerramento podem ter a mesma revisão nova');
    const wrongService = structuredClone(mixed);
    wrongService.find(row => row.name === `sp-op-score-${version}`).commit = current;
    assert.notEqual(run(wrongService).status, 0);
    const objects = path.resolve(root, execFileSync('git', ['rev-parse', '--git-path', 'objects'], { cwd: root }).toString().trim());
    const objectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-region-objects-'));
    const objectEnv = { GIT_OBJECT_DIRECTORY: objectDir, GIT_ALTERNATE_OBJECT_DIRECTORIES: objects };
    try {
      const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root }).toString().trim();
      for (const parents of [[], ['-p', 'HEAD']]) {
        const unrelated = execFileSync('git', ['commit-tree', tree, ...parents], {
          cwd: root, env: { ...process.env, ...objectEnv,
            GIT_AUTHOR_NAME: 'Regional test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
            GIT_COMMITTER_NAME: 'Regional test', GIT_COMMITTER_EMAIL: 'test@example.invalid' },
          input: 'regional ancestry test\n'
        }).toString().trim();
        const invalid = structuredClone(mixed);
        for (const row of invalid.filter(row => row.name === `sp-op-score-${version}`)) row.commit = unrelated;
        assert.notEqual(run(invalid, false, objectEnv).status, 0,
          parents.length ? 'commit futuro é recusado' : 'commit não ancestral é recusado');
      }
    } finally { fs.rmSync(objectDir, { recursive: true, force: true }); }
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
  test(`${version}: seis portas alinhadas no código atual`, { skip: skipReason }, () => {
    const original = JSON.parse(fs.readFileSync(path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`)));
    const commit = execFileSync('git', ['rev-parse', '40be907df'], { cwd: root }).toString().trim();
    const descriptors = new Map();
    const aligned = original.map(row => {
      if (!descriptors.has(row.codebase)) descriptors.set(row.codebase, sourceDescriptor(row.codebase, commit, true));
      return { ...row, commit, sourceDigest: sourceDigest(row.target, commit, descriptors.get(row.codebase)) };
    });
    assert.equal(run(aligned).status, 0);
    assert.equal(run(aligned, false, {}, true).status, 0, 'release exige as seis portas no commit atual');
    const unexpected = structuredClone(aligned);
    unexpected[0].region = 'europe-west1';
    assert.notEqual(run(unexpected).status, 0);
    const wrongDigest = structuredClone(aligned);
    wrongDigest[0].sourceDigest = '0'.repeat(64);
    assert.notEqual(run(wrongDigest).status, 0);
  });
}
