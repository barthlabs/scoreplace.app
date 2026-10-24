'use strict';
const assert = require('node:assert/strict');
const { checkServed, servedRevisionName } = require('../scripts/check-served-operation-revision');

const row = { name: 'sp-op-end-court-v3', region: 'us-east1', revision: 'old-ready',
  sourceDigest: 'a'.repeat(64), image: 'example/image@sha256:' + 'b'.repeat(64), url: 'https://example.test' };
const service = { status: { url: row.url, latestReadyRevisionName: 'new-ready',
  traffic: [{ percent: 100, revisionName: row.revision }] },
  spec: { template: { spec: { containers: [{ image: 'example/new@sha256:' + 'c'.repeat(64) }] } } } };
const revision = { metadata: { name: row.revision, annotations: {} },
  spec: { containers: [{ image: row.image, env: [
    { name: 'SP_SOURCE_DIGEST', value: row.sourceDigest },
    { name: 'SP_OPERATION_REGION', value: row.region }
  ] }] }, status: { conditions: [{ type: 'Ready', status: 'True' }] } };

assert.equal(checkServed(service, revision, row), row.revision,
  'latestReady divergente não altera a revisão que recebe 100% do tráfego');
assert.throws(() => checkServed({ ...service, status: { ...service.status,
  traffic: [{ percent: 100, revisionName: 'new-ready' }] } }, revision, row), /Revisão servida divergente/);
assert.throws(() => servedRevisionName({ status: { traffic: [
  { percent: 90, revisionName: 'a' }, { percent: 10, revisionName: 'b' }] } }), /dividido/);
assert.throws(() => servedRevisionName({ status: { traffic: [{ percent: 100, latestRevision: true }] } }), /não fixado/);
assert.throws(() => checkServed(service, { ...revision, status: { conditions: [{ type: 'Ready', status: 'False' }] } }, row), /não pronta/);
assert.throws(() => checkServed(service, { ...revision, spec: { containers: [{ ...revision.spec.containers[0], image: 'wrong@sha256:' + 'c'.repeat(64) }] } }, row), /Imagem/);
console.log('✓ gate confere a revisão servida, não latestReady, e recusa tráfego dividido ou revisão divergente');
