'use strict';
const assert = require('node:assert/strict');
const { classify, assertRetired, RETIRED_WRITERS } = require('../scripts/check-e05-mirror-functions.js');

assert.deepEqual(classify({ status: 'success', result: [
  { id: RETIRED_WRITERS[0] }, { id: RETIRED_WRITERS[1] }, { id: 'applyMatchResult' },
] }).active, RETIRED_WRITERS);
assert.deepEqual(classify({ status: 'success', result: [{ id: 'applyMatchResult' }] }).retired,
  RETIRED_WRITERS);
assert.deepEqual(classify({ status: 'success', result: [{ id: 'applyMatchResult' },
  { id: 'syncSplitMatchResultExtra' }, { id: 'backfillMatchResultDocs2' }] }).retired,
RETIRED_WRITERS);
assert.deepEqual(assertRetired({ status: 'success', result: [{ id: 'applyMatchResult' }] }).retired,
  RETIRED_WRITERS);
assert.throws(() => assertRetired({ status: 'success', result: [
  { id: 'applyMatchResult' }, { id: RETIRED_WRITERS[0] }] }), /ainda publicados/);
for (const invalid of ['', '{}', '{"result":{}}', { status: 'error', result: [
  { id: 'applyMatchResult' }] }, { status: 'success', result: [] },
{ status: 'success', result: [null] }, { status: 'success', result: [{}] },
{ status: 'success', result: [{ id: 'otherFunction' }] }]) {
  assert.throws(() => classify(invalid));
}
console.log('E05: 13 verificações de censo remoto/falha fechada passaram');
