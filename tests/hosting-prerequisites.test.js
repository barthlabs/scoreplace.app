'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCallables } = require('../scripts/check-hosting-prerequisites');

const root = path.join(__dirname, '..');
const deploy = fs.readFileSync(path.join(root, 'scripts/deploy-hosting.sh'), 'utf8');
assert(deploy.indexOf('check-hosting-prerequisites.js') < deploy.indexOf('SP_PREFLIGHT_ATTEST='),
  'pré-checagem deve vir antes da suíte');
assert(deploy.indexOf('check-hosting-prerequisites.js') < deploy.indexOf('git push --force-with-lease='),
  'pré-checagem deve vir antes do push');
const batches = fs.readFileSync(path.join(root, 'scripts/revisar-diff-em-lotes.sh'), 'utf8');
assert(deploy.includes('SP_REVIEW_VALIDATE_FIRST_BATCH=0') &&
  batches.includes('SP_REVIEW_VALIDATE_FIRST_BATCH:-1'),
  'publicador roda a suíte no preflight uma vez; revisão manual preserva validação');

const saved = [{ name: 'applyMatchResult', updateTime: 'antigo' }];
const live = [{ name: 'projects/p/locations/us-central1/functions/applyMatchResult',
  updateTime: 'novo', state: 'ACTIVE', buildConfig: { entryPoint: 'applyMatchResult' } }];
assert.deepEqual(validateCallables(saved, live),
  ['applyMatchResult: recibo da trava regional diverge da Function publicada']);
assert.deepEqual(validateCallables([{ ...saved[0], updateTime: 'novo' }], live), []);
assert.equal(validateCallables(saved, []).length, 1);
console.log('✓ backend pendente é detectado antes da suíte e do push');
