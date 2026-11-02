'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const script = path.join(__dirname, '../scripts/retirar-writers-e20.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e20-test-'));
const fixture = path.join(tmp, 'functions.json');
const log = path.join(tmp, 'deletes.log');
const previewFile = path.join(tmp, 'preview.json');
const receiptFile = path.join(tmp, 'receipt.json');
const credential = path.join(tmp, 'dummy-sa.json');
const firebase = path.join(tmp, 'firebase');
const ids = ['applyMatchResult', 'backfillMatchResultDocs', 'syncSplitMatchResult'];
const metadata = (id) => ({ id, region: 'us-central1', platform: 'gcfv2', codebase: 'default',
  state: 'ACTIVE', hash: 'hash-' + id, project: 'scoreplace-app', entryPoint: id });
const original = ids.map(metadata);

fs.writeFileSync(credential, '{}');
fs.writeFileSync(firebase, `#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.SP_E20_FAIL_LIST === '1' && args[0] === 'functions:list') process.exit(9);
const file = process.env.SP_E20_FIXTURE;
const items = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args[0] === 'functions:list' && args.includes('--json') &&
    args.includes('--project') && args.includes('scoreplace-app')) {
  process.stdout.write(JSON.stringify({ status: 'success', result: items }));
} else if (args[0] === 'functions:delete' &&
    ['syncSplitMatchResult', 'backfillMatchResultDocs'].includes(args[1]) &&
    args.includes('--region') && args.includes('us-central1') &&
    args.includes('--project') && args.includes('scoreplace-app') && args.includes('--force')) {
  fs.appendFileSync(process.env.SP_E20_LOG, args[1] + '\\n');
  fs.writeFileSync(file, JSON.stringify(items.filter((item) => item.id !== args[1])));
  process.stdout.write('deleted');
} else process.exit(8);
`, { mode: 0o755 });

const baseEnv = { ...process.env, PATH: tmp + path.delimiter + process.env.PATH,
  GOOGLE_APPLICATION_CREDENTIALS: credential, SP_E20_FIXTURE: fixture, SP_E20_LOG: log };
function run(args, extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8', env: { ...baseEnv, ...extraEnv }
  });
}
function reset() { fs.writeFileSync(fixture, JSON.stringify(original)); fs.rmSync(log, { force: true }); }
function deleted() { return fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : []; }

try {
  reset();
  const badList = run(['--preview', previewFile], { SP_E20_FAIL_LIST: '1' });
  assert.notEqual(badList.status, 0, 'lista falha antes de gerar prévia');
  assert.equal(fs.existsSync(previewFile), false);
  assert.deepEqual(deleted(), []);

  fs.writeFileSync(fixture, JSON.stringify(original.filter((item) => item.id !== 'applyMatchResult')));
  assert.notEqual(run(['--preview', previewFile]).status, 0, 'sentinela ausente aborta');
  fs.writeFileSync(fixture, JSON.stringify(original.map((item) => item.id === 'syncSplitMatchResult'
    ? { ...item, region: 'europe-west1' } : item)));
  assert.notEqual(run(['--preview', previewFile]).status, 0, 'Function fora da região aborta');
  assert.deepEqual(deleted(), []);

  reset();
  const made = run(['--preview', previewFile]);
  assert.equal(made.status, 0, made.stderr);
  const saved = JSON.parse(fs.readFileSync(previewFile, 'utf8'));
  assert.equal(fs.statSync(previewFile).mode & 0o077, 0, 'prévia é 0600');
  assert.deepEqual(saved.functions.map((item) => item.id), ids);
  assert.match(saved.digest, /^[a-f0-9]{64}$/);
  assert.notEqual(run(['--apply', previewFile, '0'.repeat(64), receiptFile]).status, 0,
    'digest divergente aborta antes de qualquer exclusão');
  assert.equal(fs.existsSync(receiptFile), false);
  assert.deepEqual(deleted(), []);

  fs.writeFileSync(fixture, JSON.stringify(original.map((item) => item.id === 'syncSplitMatchResult'
    ? { ...item, hash: 'changed' } : item)));
  assert.notEqual(run(['--apply', previewFile, saved.digest, receiptFile]).status, 0,
    'mudança remota depois da prévia aborta');
  assert.equal(fs.existsSync(receiptFile), false);
  assert.deepEqual(deleted(), []);

  reset();
  const applied = run(['--apply', previewFile, saved.digest, receiptFile]);
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(deleted(), ['syncSplitMatchResult', 'backfillMatchResultDocs']);
  assert.deepEqual(JSON.parse(fs.readFileSync(fixture, 'utf8')).map((item) => item.id), ['applyMatchResult']);
  assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).status, 'VERIFIED');
  assert.notEqual(run(['--apply', previewFile, saved.digest, path.join(tmp, 'retry.json')]).status, 0,
    'retry da prévia antiga falha fechado');
  console.log('E20: prévia privada, digest, lista/sentinela, CAS de metadados e exclusão nominal passaram');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
