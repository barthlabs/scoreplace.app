'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-region-v3-'));
const file = path.join(temp, 'manifest.json');
const regions = ['us-east1', 'us-east4', 'us-south1', 'us-central1', 'southamerica-east1'];
const names = ['court', 'score', 'presence', 'presence-wo', 'end-court', 'control'];
const rows = names.flatMap(name => regions.map(region => ({ name: `sp-op-${name}-v3`, region,
  url: `https://${region}.example/${name}`, sourceDigest: 'a'.repeat(64),
  image: `image-${name}@sha256:${'b'.repeat(64)}`, revision: `rev-${name}-${region}`, commit: 'c'.repeat(40),
  env: { SP_SOURCE_DIGEST: 'a'.repeat(64), SP_OPERATION_REGION: region } })));
function check(modify) {
  const copy = structuredClone(rows); modify(copy); fs.writeFileSync(file, JSON.stringify(copy));
  const r = spawnSync(process.execPath, ['scripts/generate-operation-regions-v3-config.js', '--check'],
    { cwd: root, encoding: 'utf8', env: { ...process.env, SP_V3_MANIFEST: file } });
  assert.notEqual(r.status, 0, 'manifesto inválido deve bloquear o gerador');
}
try {
  check(copy => { copy.pop(); });
  check(copy => { copy[0].env.SP_OPERATION_REGION = 'us-west1'; });
  check(copy => { copy[0].sourceDigest = 'd'.repeat(64); copy[0].env.SP_SOURCE_DIGEST = 'd'.repeat(64); });
  check(copy => { copy[0].image = `other@sha256:${'e'.repeat(64)}`; });
  console.log('✓ manifesto v3 incompleto, env cruzado, digest e imagem divergentes são recusados');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
