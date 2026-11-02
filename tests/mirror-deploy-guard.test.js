'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
assert.doesNotMatch(source, /exports\.(syncSplitMatchResult|syncSplitEnrollmentResults|retryMirrorReconcilePending|sweepMirrorReconcilePending)\s*=/,
  'exports exclusivos do espelho saíram');
for (const retired of ['mirror-transaction-core.js', 'mirror-reconcile-queue-core.js']) {
  assert.equal(fs.existsSync(path.join(root, 'functions', retired)), false,
    retired + ' não pode voltar ao runtime');
}
function dry(target, ...args) {
  return spawnSync('bash', ['scripts/deploy-functions.sh', target, ...args, '--dry-run'],
    { cwd: root, encoding: 'utf8' });
}
const deployScript = fs.readFileSync(path.join(root, 'scripts/deploy-functions.sh'), 'utf8');
assert.match(deployScript, /tests\/espelho-results-segue-jogo-dividido\.test\.js/,
  'o deploy do gatilho de roster exige a prova de que results não é regravado');
const roster = dry('main', '--only', 'syncMatchRosters');
assert.equal(roster.status, 0, roster.stderr);
assert.match(roster.stdout, /functions:syncMatchRosters/);
for (const name of ['syncSplitMatchResult', 'syncSplitEnrollmentResults',
  'retryMirrorReconcilePending', 'sweepMirrorReconcilePending']) {
  const result = dry('main', '--only', name);
  assert.notEqual(result.status, 0, name);
  assert.match(result.stderr, /export inexistente/, name);
}
for (const target of ['main', 'all']) {
  const result = dry(target, '--all');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /functions:syncMatchRosters/, target);
}
const unrelated = dry('main', '--only', 'cleanupOldNotifications');
assert.equal(unrelated.status, 0, unrelated.stderr);
console.log('✓ guarda E05 prova fonte física antes de alvejar roster; exports de espelho ausentes');
