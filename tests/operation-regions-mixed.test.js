'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { sourceDescriptor, sourceDigest } = require('../scripts/operation-source-digest');
const { legacyFixtureAvailability, legacyFixtureRows } = require('./operation-regions-legacy-fixture');
const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts/check-operation-regions-mixed.js');
const gitRepo = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
const gitLog = gitRepo.status === 0
  ? spawnSync('git', ['log', '-1', '--format=%H', '--', 'functions-autodraw'], { cwd: root, encoding: 'utf8' })
  : null;
const current = gitLog?.status === 0 ? gitLog.stdout.trim() : '';
const manifestsPresent = ['v2', 'v3'].every(version =>
  fs.existsSync(path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`)));
const historyPath = path.join(root, '.claude/tmp/operation-regions-current-sync.json');
const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : null;
const legacyAvailability = legacyFixtureAvailability();
const baselineRows = version => {
  if (history?.originals?.[version]) return history.originals[version];
  // O manifesto operacional evolui por porta. Para testar o corte histórico,
  // normalize a fixture ao commit da release antes de derivar o pai: depois
  // da atualização só de placar, a lista real já é mista e não seria traduzida.
  const rows = JSON.parse(fs.readFileSync(path.join(root,
    `.claude/tmp/operation-regions-manifest-${version}.json`)));
  return legacyFixtureRows(rows.map(row => ({ ...row,
    commit: '40be907dfc593db2eb4de1d6ed9783493b301787' })), legacyAvailability.parent);
};
const skipReason = gitRepo.status !== 0 ? 'sem histórico Git (cópia git archive)'
  : !current ? 'sem commit de functions-autodraw no histórico Git'
    : !manifestsPresent ? 'manifestos regionais ignorados pelo git archive' : false;
const historicalSkipReason = skipReason || (!history?.originals && legacyAvailability.skipReason);
const digest = skipReason ? '' : execFileSync('node',
  ['scripts/operation-source-digest.js', 'functions-autodraw', 'endMatchOnCourt', current, '--from-git'],
  { cwd: root }).toString().trim();

for (const version of ['v2', 'v3']) {
  const run = (rows, allowLegacyCourt = false, extraEnv = {}, requireCurrent = false, requireScoreRefresh = false) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-region-test-'));
    const file = path.join(dir, 'manifest.json');
    fs.writeFileSync(file, JSON.stringify(rows));
    try { return spawnSync('node', [script, version, ...(allowLegacyCourt ? ['--allow-legacy-court'] : []), ...(requireCurrent ? ['--require-current'] : []), ...(requireScoreRefresh ? ['--require-score-refresh'] : [])],
      { cwd: root, env: { ...process.env, ...extraEnv, SP_REGION_MANIFEST: file }, encoding: 'utf8' }); }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  test(`${version}: corte antigo e atualização só da quadra`, { skip: historicalSkipReason }, () => {
    const original = baselineRows(version);
    assert.equal(run(original, true).status, 0,
      'manifesto histórico íntegro é válido somente na verificação que permite legado');
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
    assert.notEqual(run(aligned, false, {}, false, true).status, 0, 'corte dirigido recusa placar antigo');
    const recordedScoreCommit = '822cbc2ad7fc5839b20a986f5133af9e9ef6f7e6';
    const recordedScoreDigest = sourceDigest('applyMatchResult', recordedScoreCommit,
      sourceDescriptor('functions-autodraw', recordedScoreCommit, true));
    const scoreFresh = original.filter(row => row.name === `sp-op-score-${version}`)
      .every(row => row.commit === recordedScoreCommit && row.sourceDigest === recordedScoreDigest);
    assert.equal(run(original, false, {}, false, true).status === 0, scoreFresh,
      'corte dirigido só aceita placar na revisão atual do backend');
    assert.notEqual(run(original, true, {}, false, true).status, 0, 'flags incompatíveis são recusadas');
    assert.notEqual(run(original, false, {}, true, true).status, 0, 'dois modos obrigatórios são recusados');
    const wrongOther = structuredClone(original);
    const scoreCommit = original.find(row => row.name === `sp-op-score-${version}`).commit;
    const courtDigest = sourceDigest('assignMatchCourt', scoreCommit,
      sourceDescriptor('functions-autodraw', scoreCommit, true));
    for (const row of wrongOther.filter(row => row.name === `sp-op-court-${version}`)) {
      row.commit = scoreCommit;
      row.sourceDigest = courtDigest;
    }
    assert.notEqual(run(wrongOther, false, {}, false, true).status, 0,
      'porta não-score em commit novo é recusada');
    const wrongRegion = structuredClone(original);
    wrongRegion.find(row => row.name === `sp-op-score-${version}`).commit = commit;
    assert.notEqual(run(wrongRegion, false, {}, false, true).status, 0,
      'região de placar divergente é recusada');
    const unexpected = structuredClone(aligned);
    unexpected[0].region = 'europe-west1';
    assert.notEqual(run(unexpected).status, 0);
    const wrongDigest = structuredClone(aligned);
    wrongDigest[0].sourceDigest = '0'.repeat(64);
    assert.notEqual(run(wrongDigest).status, 0);
  });
}
