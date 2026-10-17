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
const after = fs.existsSync(receiptPath) ? fs.readFileSync(receiptPath) : null;
assert.deepStrictEqual(after, before);
console.log('✓ carimbo direcionado: 9 verificações');
