'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts/refresh-score-regions.sh'), 'utf8');
const start = script.indexOf('record_stage() {');
const end = script.indexOf('\nfor version in v3 v2;', start);
assert.ok(start >= 0 && end > start, 'testar o registro real da revisão sem tráfego');
assert.match(script.slice(script.indexOf('no_traffic=()'), script.indexOf('for region in')), /no_traffic=\(--no-traffic\)/);
const recordStage = script.slice(start, end);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-score-stage-'));
const manifest = path.join(dir, 'candidate.json');
const row = { name: 'sp-op-score-v3', region: 'us-east1', revision: 'old-rev', url: 'https://score.test' };
const service = { status: { url: row.url, latestCreatedRevisionName: 'new-rev', latestReadyRevisionName: 'old-rev' } };
const revision = { metadata: { name: 'new-rev' }, status: { conditions: [
  { type: 'Ready', status: 'True', reason: 'Retired' }
] }, spec: { containers: [{ image: 'image:sha', env: [
  { name: 'SP_SOURCE_DIGEST', value: 'digest-new' }, { name: 'SP_OPERATION_REGION', value: 'us-east1' }
] }] } };
function run(rev) {
  fs.writeFileSync(manifest, JSON.stringify([row]));
  return spawnSync('bash', ['-c', `set -euo pipefail\nsource_commit=${'a'.repeat(40)}\n${recordStage}\nrecord_stage "$SP_SERVICE" "$SP_REVISION" "$SP_FILE" sp-op-score-v3 us-east1 digest-new new-rev`], {
    cwd: root, encoding: 'utf8', env: { ...process.env, SP_SERVICE: JSON.stringify(service),
      SP_REVISION: JSON.stringify(rev), SP_FILE: manifest }
  });
}
try {
  const ok = run(revision);
  assert.equal(ok.status, 0, ok.stderr);
  const saved = JSON.parse(fs.readFileSync(manifest));
  assert.equal(saved[0].revision, 'new-rev');
  assert.equal(saved[0].sourceDigest, 'digest-new');
  assert.equal(saved[0].image, 'image:sha');
  const bad = structuredClone(revision);
  bad.spec.containers[0].env[0].value = 'stale';
  const rejected = run(bad);
  assert.notEqual(rejected.status, 0, 'digest diferente não registra candidato');
  assert.equal(JSON.parse(fs.readFileSync(manifest))[0].revision, 'old-rev');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log('✓ revisão sem tráfego só registra candidato com digest e região esperados');
