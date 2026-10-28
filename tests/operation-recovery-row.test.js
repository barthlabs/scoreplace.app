'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkRecovery } = require('../scripts/check-operation-recovery-row');

test('recuperação de placar exige a mesma imagem da porta regional nova', () => {
  const newImage = 'score@sha256:' + 'a'.repeat(64);
  const oldImage = 'score@sha256:' + 'b'.repeat(64);
  const regionalName = 'sp-op-score-v2';
  const name = 'applymatchresult-run-recovery';
  const source = [{ name: regionalName, region: 'us-east1', image: newImage }];
  const gate = { recovery: [{ name, image: newImage, revision: 'score-00002', url: 'https://score.example' }] };
  const service = image => ({
    spec: { template: { spec: { containers: [{ image }] } } },
    status: { url: 'https://score.example', traffic: [{ revisionName: 'score-00002', percent: 100 }] },
  });
  assert.equal(checkRecovery(service(newImage), source, gate, name, regionalName), gate.recovery[0]);
  assert.throws(() => checkRecovery(service(oldImage), source, gate, name, regionalName),
    /imagem recovery diverge/);
  const staleGate = { recovery: [{ ...gate.recovery[0], image: oldImage }] };
  assert.throws(() => checkRecovery(service(oldImage), source, staleGate, name, regionalName),
    /imagem recovery diverge/);
});
