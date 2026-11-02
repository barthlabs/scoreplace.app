'use strict';
const assert = require('node:assert/strict');
const { checkServed, servedRevisionName, candidateDecision } = require('../scripts/check-served-operation-revision');

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

const nextImage = 'example/new@sha256:' + 'c'.repeat(64);
const nextDigest = 'd'.repeat(64);
const nextRevisionName = 'new-ready';
const nextService = { status: { ...service.status, latestCreatedRevisionName: nextRevisionName,
  latestReadyRevisionName: row.revision } };
const nextRevision = { metadata: { name: nextRevisionName, annotations: {} },
  spec: { containers: [{ image: nextImage, env: [
    { name: 'SP_SOURCE_DIGEST', value: nextDigest },
    { name: 'SP_OPERATION_REGION', value: row.region }
  ] }] }, status: { conditions: [
    { type: 'Ready', status: 'True' },
    { type: 'ContainerReady', status: 'True' },
    { type: 'Active', status: 'False', reason: 'Retired' }
  ] } };
const expected = { previousRevision: row.revision, revision: nextRevisionName,
  sourceDigest: nextDigest, region: row.region, image: nextImage, url: row.url };
assert.deepEqual(candidateDecision(nextService, nextRevision, expected),
  { action: 'promote', revision: nextRevisionName, image: nextImage },
  'revisão nova pronta mas aposentada aguarda promoção explícita');
assert.throws(() => candidateDecision(nextService, { ...nextRevision,
  status: { conditions: [{ type: 'Ready', status: 'True' }, { type: 'ContainerReady', status: 'False' }] } }, expected), /não pronta/);
assert.throws(() => candidateDecision(nextService, { ...nextRevision,
  spec: { containers: [{ ...nextRevision.spec.containers[0], image: row.image }] } }, expected), /Imagem candidata/);
assert.throws(() => candidateDecision(nextService, nextRevision,
  { ...expected, sourceDigest: 'e'.repeat(64) }), /Fonte ou região candidata/);
assert.throws(() => candidateDecision(nextService, nextRevision,
  { ...expected, sourceDigest: undefined }), /candidata ausente ou divergente/);
assert.throws(() => candidateDecision({ ...nextService, status: { ...nextService.status,
  latestCreatedRevisionName: 'other-build' } }, nextRevision, expected), /candidata ausente ou divergente/);
assert.throws(() => candidateDecision(nextService, nextRevision,
  { ...expected, revision: 'other-build' }), /candidata ausente ou divergente/);
assert.throws(() => candidateDecision({ ...nextService, status: { ...nextService.status,
  traffic: [{ percent: 100, revisionName: 'third-revision' }] } }, nextRevision, expected),
  /Tráfego aponta para revisão inesperada/);
assert.throws(() => checkServed(nextService, nextRevision, { ...row,
  revision: nextRevisionName, image: nextImage, sourceDigest: nextDigest }), /Revisão servida divergente/,
  'promover sem confirmar tráfego não equivale a publicar');
const promoted = { ...nextService, status: { ...nextService.status,
  latestReadyRevisionName: nextRevisionName,
  traffic: [{ percent: 100, revisionName: nextRevisionName }] } };
assert.deepEqual(candidateDecision(promoted, nextRevision, expected),
  { action: 'current', revision: nextRevisionName, image: nextImage },
  'retomada idempotente reconhece revisão já servida');
assert.deepEqual(candidateDecision(promoted, nextRevision, { ...expected, image: undefined }),
  { action: 'current', revision: nextRevisionName, image: nextImage },
  'retomada sem imagem no manifesto antigo usa a imagem SHA da revisão servida');
assert.equal(checkServed(promoted, nextRevision, { ...row,
  revision: nextRevisionName, image: nextImage, sourceDigest: nextDigest }), nextRevisionName);
console.log('✓ gate confere a revisão servida, não latestReady, e recusa tráfego dividido ou revisão divergente');
