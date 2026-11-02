'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = fs.readFileSync(path.join(__dirname, '../scripts/refresh-score-regions.sh'), 'utf8');
const start = script.indexOf('rollback_traffic() {');
const end = script.indexOf('\nrecord() {', start);
assert.ok(start >= 0 && end > start, 'testar o helper real de reversão do publicador');
const rollback = script.slice(start, end);

function run(failOld, oldCheckFails = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-score-rollback-'));
  const calls = path.join(dir, 'calls');
  const gcloud = path.join(dir, 'gcloud');
  fs.writeFileSync(gcloud, `#!/bin/bash
printf '%s\\n' "$*" >> "$SP_CALLS"
case "$*" in
  *new-rev=100*) exit 17 ;;
  *old-rev=100*) [[ "$SP_FAIL_OLD" == 1 ]] && exit 19 || exit 0 ;;
esac
exit 20
`, { mode: 0o755 });
  const body = `set -euo pipefail
project=scoreplace-app
describe() { printf '{"status":{"url":"https://example.test"}}'; }
check_old() { [[ "\${SP_FAIL_OLD_CHECK}" != 1 ]]; }
${rollback}
if ! gcloud run services update-traffic sp-op-score-v3 --project scoreplace-app --region us-east1 --to-revisions new-rev=100 --quiet; then
  rollback_traffic sp-op-score-v3 us-east1 old-rev
fi
exit 99
`;
  try {
    const result = spawnSync('bash', ['-c', body], { encoding: 'utf8',
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, SP_CALLS: calls,
        SP_FAIL_OLD: failOld ? '1' : '0', SP_FAIL_OLD_CHECK: oldCheckFails ? '1' : '0' } });
    return { status: result.status, stderr: result.stderr,
      calls: fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n') : [] };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const restored = run(false);
assert.equal(restored.status, 1, restored.stderr);
assert.equal(restored.calls.length, 2, 'falha da promoção chama a reversão');
assert.match(restored.calls[0], /new-rev=100/);
assert.match(restored.calls[1], /old-rev=100/);
assert.match(restored.stderr, /tráfego antigo restaurado/);

const rollbackFailed = run(true);
assert.equal(rollbackFailed.status, 78, rollbackFailed.stderr);
assert.equal(rollbackFailed.calls.length, 2);
assert.match(rollbackFailed.stderr, /REVERSÃO NÃO CONFIRMADA/);

const verificationFailed = run(false, true);
assert.equal(verificationFailed.status, 78, verificationFailed.stderr);
assert.equal(verificationFailed.calls.length, 2);
assert.match(verificationFailed.stderr, /REVERSÃO NÃO CONFIRMADA/);

console.log('✓ falha na promoção restaura tráfego; falha na reversão ou conferência sai 78');
