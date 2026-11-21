'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { autodrawExports, checkTargetedPublication } = require('../scripts/backend-publication-core');

const root = path.join(__dirname, '..');
const exported = autodrawExports('exports.drawRound = onCall(() => {});\nexports.review = onCall(() => {});\n');
const sha = 'a'.repeat(40);
const manifest = { schema:1, backendCommit:sha, functions:['drawRound'] };
const receipt = { schema:1, entries:{ drawRound:{ backendCommit:sha, deployedAt:'2026-10-17T00:00:00Z', result:'success', mode:'only' } } };
assert(checkTargetedPublication(manifest, receipt, sha, exported).ok);
assert.strictEqual(checkTargetedPublication(manifest, receipt, sha, exported).unverified, 1);
assert(!checkTargetedPublication(manifest, { schema:1, entries:{} }, sha, exported).ok);
assert(!checkTargetedPublication(manifest, { schema:1, entries:{ drawRound:{...receipt.entries.drawRound, backendCommit:'b'.repeat(40)} } }, sha, exported).ok);
assert(!checkTargetedPublication({ ...manifest, functions:[] }, receipt, sha, exported).ok);
assert(!checkTargetedPublication({ ...manifest, functions:['missing'] }, receipt, sha, exported).ok);
assert(!checkTargetedPublication(manifest, receipt, 'b'.repeat(40), exported).ok);
assert(!checkTargetedPublication(manifest, { schema:1, entries:{ drawRound:{...receipt.entries.drawRound, mode:'dry-run'} } }, sha, exported).ok);

// O ensaio não pode produzir recibo, mesmo com alvos válidos.
const receiptPath = path.join(root, '.backend-publicado-autodraw-funcoes.json');
const before = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath) : null;
const dry = spawnSync('bash', ['scripts/deploy-functions.sh', 'autodraw', '--only', 'drawRound', '--dry-run'], { cwd:root, encoding:'utf8' });
assert.strictEqual(dry.status, 0, dry.stderr);
assert(!dry.stdout.includes('--force'), 'export sem retry não deve receber --force');
const after = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath) : null;
assert.deepStrictEqual(after, before);

const autodrawSource = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const retryExports = autodrawSource.split(/(?=^exports\.[A-Za-z0-9_]+\s*=)/m)
  .filter(block => /retry:\s*true/.test(block))
  .map(block => (block.match(/^exports\.([A-Za-z0-9_]+)\s*=/m) || [])[1])
  .filter(Boolean);
const wrapper = fs.readFileSync(path.join(root, 'scripts/deploy-functions.sh'), 'utf8');
const configuredRetry = (wrapper.match(/local retry_exports='([^']+)'/) || [])[1]
  .split(/\s+/).filter(Boolean).sort();
assert.deepStrictEqual(configuredRetry, [...new Set(retryExports)].sort(),
  'a lista de retry do deploy deve acompanhar exatamente os exports retry:true');

const retryDry = spawnSync('bash', ['scripts/deploy-functions.sh', 'autodraw', '--only', 'tournamentSummaryMatch', '--dry-run'], { cwd:root, encoding:'utf8' });
assert.strictEqual(retryDry.status, 0, retryDry.stderr);
assert.match(retryDry.stdout, /--only functions:tournamentSummaryMatch --force/);
const mainDry = spawnSync('bash', ['scripts/deploy-functions.sh', 'main', '--only', 'cleanupOldNotifications', '--dry-run'], { cwd:root, encoding:'utf8' });
assert.strictEqual(mainDry.status, 0, mainDry.stderr);
assert(!mainDry.stdout.includes('--force'), 'codebase principal nunca deve receber --force');
const broadDry = spawnSync('bash', ['scripts/deploy-functions.sh', 'autodraw', '--all', '--dry-run'], { cwd:root, encoding:'utf8' });
assert.strictEqual(broadDry.status, 0, broadDry.stderr);
assert(!broadDry.stdout.includes('--force'), 'deploy amplo/recuperação nunca deve receber --force');
const allDry = spawnSync('bash', ['scripts/deploy-functions.sh', 'all', '--all', '--dry-run'], { cwd:root, encoding:'utf8' });
assert.strictEqual(allDry.status, 0, allDry.stderr);
assert(!allDry.stdout.includes('--force'), 'caminho all nunca deve receber --force');
console.log('✓ carimbo direcionado: 9 verificações');
