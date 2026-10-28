'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRecovery } = require('../scripts/check-operation-recovery-row');

const oldImage = 'example/old@sha256:' + 'a'.repeat(64);
const newImage = 'example/new@sha256:' + 'b'.repeat(64);
const regionalName = 'sp-op-score-v2';
const name = 'applymatchresult-run-recovery';
const source = [{ name: regionalName, region: 'us-east1', image: newImage }];
const gate = { recovery: [{ name, image: newImage, revision: 'new-revision', url: 'https://recovery.example' }] };
function service(image = newImage, revision = 'new-revision') {
  return {
    spec: { template: { spec: { containers: [{ image }] } } },
    status: { url: 'https://recovery.example', latestReadyRevisionName: revision,
      traffic: [{ revisionName: revision, percent: 100, latestRevision: true }] },
  };
}
test('score recovery precisa da imagem v2 atual, mesmo com manifesto antigo coerente', () => {
  assert.doesNotThrow(() => checkRecovery(service(), source, gate, name, regionalName));
  const staleGate = { recovery: [{ ...gate.recovery[0], image: oldImage, revision: 'old-revision' }] };
  assert.throws(() => checkRecovery(service(oldImage, 'old-revision'), source, staleGate, name, regionalName), /imagem recovery/);
  assert.throws(() => checkRecovery(service(newImage, 'wrong-revision'), source, gate, name, regionalName), /revisão servida/);
  const split = service();
  split.status.traffic = [{ revisionName: 'new-revision', percent: 50 }, { revisionName: 'old-revision', percent: 50 }];
  assert.throws(() => checkRecovery(split, source, gate, name, regionalName), /Tráfego dividido/);
});
