'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { sourceDescriptor, sourceDigest } = require('../scripts/operation-source-digest');
const { validateRows, endCourtCommitFromManifest } = require('../scripts/check-operation-regions-mixed');
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
const scoreDigest = skipReason ? '' : execFileSync('node',
  ['scripts/operation-source-digest.js', 'functions-autodraw', 'applyMatchResult', current, '--from-git'],
  { cwd: root }).toString().trim();

test('manifesto de encerramento exige o SHA integral e a função no corte', () => {
  const manifest = { schema:1, backendCommit:'a'.repeat(40), functions:['endMatchOnCourt'] };
  assert.equal(endCourtCommitFromManifest(manifest), manifest.backendCommit);
  assert.throws(() => endCourtCommitFromManifest({ ...manifest, backendCommit:'abc' }), /backendCommit/);
  assert.throws(() => endCourtCommitFromManifest({ ...manifest, schema:2 }), /schema/);
  assert.throws(() => endCourtCommitFromManifest({ ...manifest, functions:['applyMatchResult'] }), /deve incluir endMatchOnCourt/);
});

for (const version of ['v2', 'v3']) {
  const run = (rows, allowLegacyCourt = false, extraEnv = {}, requireCurrent = false, requireScoreRefresh = false, requireCourtControlRefresh = false) => {
    try {
      validateRows(rows, version, { allowLegacyCourt, requireCurrent, requireScoreRefresh,
        requireCourtControlRefresh, gitEnv: { ...process.env, ...extraEnv } });
      return { status: 0, stdout: '' };
    } catch (error) {
      return { status: 1, stderr: String(error && error.message || error) };
    }
  };
  test(`${version}: corte antigo e atualização só da quadra`, { skip: historicalSkipReason }, () => {
    const original = baselineRows(version);
    assert.equal(run(original, true).status, 0,
      'manifesto histórico íntegro é válido somente na verificação que permite legado');
    const legacy = structuredClone(original);
    // O corte atual toma 470c6c97 como base. Nenhuma das quatro portas dirigidas
    // pode continuar nessa base sem uma implantação regional posterior.
    const releaseCommit = '470c6c972130c2d4225952f214755d622595e0a6';
    const directedTargets = {
      court:'assignMatchCourt', score:'applyMatchResult',
      'end-court':'endMatchOnCourt', control:'tournamentOperationControl'
    };
    const releaseSources = sourceDescriptor('functions-autodraw', releaseCommit, true);
    for (const row of legacy) {
      const type = row.name.slice('sp-op-'.length, -(`-${version}`.length));
      if (!directedTargets[type]) continue;
      row.commit = releaseCommit;
      row.sourceDigest = sourceDigest(directedTargets[type], releaseCommit, releaseSources);
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
    const commit = execFileSync('git', ['rev-parse', '470c6c97'], { cwd: root }).toString().trim();
    const descriptors = new Map();
    const aligned = original.map(row => {
      if (!descriptors.has(row.codebase)) descriptors.set(row.codebase, sourceDescriptor(row.codebase, commit, true));
      return { ...row, commit, sourceDigest: sourceDigest(row.target, commit, descriptors.get(row.codebase)) };
    });
    assert.equal(run(aligned).status, 0);
    assert.equal(run(aligned, false, {}, true).status, 0, 'release exige as seis portas no commit atual');
    assert.notEqual(run(aligned, false, {}, false, true).status, 0, 'corte dirigido recusa placar antigo');
    // Este corte regional é uma implantação dirigida histórica. A referência
    // aqui é a revisão REAL das funções sp-op-score nas regiões, registrada
    // nos manifestos operacionais; o backend central em us-central1 tem recibo
    // separado e mais recente. Usar HEAD aqui atestaria uma implantação
    // regional que ainda não ocorreu.
    const recordedScoreCommit = '2ab7d4779913590350d4bcafd32e14fab9b7a5de';
    const recordedScoreDigest = sourceDigest('applyMatchResult', recordedScoreCommit,
      sourceDescriptor('functions-autodraw', recordedScoreCommit, true));
    const scoreFresh = original.filter(row => row.name === `sp-op-score-${version}`)
      .every(row => row.commit === recordedScoreCommit && row.sourceDigest === recordedScoreDigest);
    const recordedCourtCommit = '36a6b3ddae6427ee884ddbf9b7468986913872d3';
    const courtSources = sourceDescriptor('functions-autodraw', recordedCourtCommit, true);
    const courtFresh = original.filter(row => [`sp-op-court-${version}`, `sp-op-control-${version}`].includes(row.name))
      .every(row => row.commit === recordedCourtCommit && row.sourceDigest === sourceDigest(row.target, recordedCourtCommit, courtSources));
    const recordedEndCourtCommit = JSON.parse(fs.readFileSync(path.join(root, '.backend-requerido-autodraw.json'), 'utf8')).backendCommit;
    const endCourtSources = sourceDescriptor('functions-autodraw', recordedEndCourtCommit, true);
    const endCourtFresh = original.filter(row => row.name === `sp-op-end-court-${version}`)
      .every(row => row.commit === recordedEndCourtCommit && row.sourceDigest === sourceDigest(row.target, recordedEndCourtCommit, endCourtSources));
    assert.equal(run(original, false, {}, false, false, true).status === 0, scoreFresh && courtFresh && endCourtFresh,
      'corte dirigido só aceita as revisões de placar, chamada, encerramento e controle efetivamente publicadas');
    const staleEndCourt = 'b159a697d5e5cbe2f5db805ae7d1e3cfd9e7bcb8';
    const staleDigest = sourceDigest('endMatchOnCourt', staleEndCourt,
      sourceDescriptor('functions-autodraw', staleEndCourt, true));
    const previous = original.map(row => row.name === `sp-op-end-court-${version}`
      ? { ...row, commit:staleEndCourt, sourceDigest:staleDigest } : row);
    assert.equal(run(previous).status, 0, 'o corte anterior ainda passa as verificações de integridade');
    const stale = run(previous, false, {}, false, false, true);
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, new RegExp('endMatchOnCourt.*' + recordedEndCourtCommit));
    assert.notEqual(run(original, true, {}, false, true).status, 0, 'flags incompatíveis são recusadas');
    assert.notEqual(run(original, false, {}, true, true).status, 0, 'dois modos obrigatórios são recusados');
    const wrongOther = structuredClone(original);
    const staleCourtCommit = recordedEndCourtCommit;
    const courtDigest = sourceDigest('assignMatchCourt', staleCourtCommit,
      sourceDescriptor('functions-autodraw', staleCourtCommit, true));
    for (const row of wrongOther.filter(row => row.name === `sp-op-court-${version}`)) {
      row.commit = staleCourtCommit;
      row.sourceDigest = courtDigest;
    }
    assert.notEqual(run(wrongOther, false, {}, false, false, true).status, 0,
      'porta não-score em commit novo é recusada');
    const wrongRegion = structuredClone(original);
    wrongRegion.find(row => row.name === `sp-op-score-${version}`).commit = commit;
    assert.notEqual(run(wrongRegion, false, {}, false, false, true).status, 0,
      'região de placar divergente é recusada');
    const unexpected = structuredClone(aligned);
    unexpected[0].region = 'europe-west1';
    assert.notEqual(run(unexpected).status, 0);
    const wrongDigest = structuredClone(aligned);
    wrongDigest[0].sourceDigest = '0'.repeat(64);
    assert.notEqual(run(wrongDigest).status, 0);
  });
}
