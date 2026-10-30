'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
function dry(...args) {
  return spawnSync('bash', ['scripts/deploy-functions.sh', 'stripe', ...args, '--dry-run'],
    { cwd: root, encoding: 'utf8' });
}

const selected = dry('--only', 'stripeWebhook');
assert.equal(selected.status, 0, selected.stderr);
assert.match(selected.stdout, /stripe \(functions-stripe\/\): 1 função\(ões\) alvejada\(s\)/);
assert.match(selected.stdout, /--only functions:stripe:stripeWebhook(?:\s|$)/);
assert.doesNotMatch(selected.stdout, /functions:stripe:createCheckoutSession/);

const missing = dry('--only', 'missingWebhook');
assert.notEqual(missing.status, 0);
assert.match(missing.stderr, /export inexistente/);

const implicit = dry();
assert.notEqual(implicit.status, 0);
assert.match(implicit.stderr, /exige --only/);

console.log('✓ deploy Stripe só seleciona o webhook quando --only é usado');
