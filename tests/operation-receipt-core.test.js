'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../functions/operation-receipt-core');

const base = { operationId: '387638c7-0f33-45eb-a217-1314bfe68d73', actorUid: 'actor',
  parentPath: 'tournaments/tour_test', kind: 'score', target: 'game', action: 'apply',
  payload: { sets: [{ p1: 6, p2: 2 }], note: 'final' } };
const prepared = core.prepare(base);
assert.equal(prepared.hash, core.prepare({ ...base, payload: { note: 'final', sets: [{ p2: 2, p1: 6 }] } }).hash,
  'ordem das chaves não altera a intenção');
for (const change of [{ actorUid: 'other' }, { parentPath: 'sandboxes/tour_test' },
  { target: 'other' }, { action: 'reset' }, { payload: { sets: [] } }]) {
  assert.notEqual(prepared.hash, core.prepare({ ...base, ...change }).hash);
}
assert.throws(() => core.prepare({ ...base, operationId: 'not-a-uuid' }));
const now = Date.UTC(2026, 9, 23);
const doc = core.document(prepared, { ok: true, outcome: 'applied' }, now);
assert(core.matches(doc, prepared));
assert(!core.matches(doc, core.prepare({ ...base, target: 'other' })));
assert.equal(doc.expireAt.getTime() - doc.committedAt.getTime(), 90 * 24 * 60 * 60 * 1000);
const indexConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../firestore.indexes.json'), 'utf8'));
assert.deepEqual(indexConfig.fieldOverrides.filter(item => item.collectionGroup === 'operationReceipts' && item.fieldPath === 'expireAt'),
  [{ collectionGroup: 'operationReceipts', fieldPath: 'expireAt', ttl: true, indexes: [] }],
  'a política TTL precisa estar declarada no manifesto de índices');
const ttlDeploy = fs.readFileSync(path.join(__dirname, '../scripts/deploy-operation-receipts-ttl.sh'), 'utf8');
assert(ttlDeploy.includes('gcloud firestore fields ttls update "$FIELD"') &&
  ttlDeploy.includes('gcloud firestore fields ttls list --collection-group="$GROUP"') &&
  ttlDeploy.includes("state !== 'ACTIVE'"),
  'o runbook publica somente o TTL do recibo e exige confirmação de estado ativo');
assert(!ttlDeploy.includes('firebase deploy --only firestore:indexes'),
  'o TTL não deve alterar outros índices em produção');
assert.deepEqual(core.replay(doc), { ok: true, outcome: 'applied', replayed: true, requiresRefresh: true });
// Gate B1: ainda não se envia operationId nestas quatro operações. O Gate B2
// deve trocar estas asserções por testes de releitura canônica após replay.
for (const file of ['js/store.js', 'js/views/bracket.js', 'js/views/participants.js']) {
  assert(!fs.readFileSync(path.join(__dirname, '..', file), 'utf8').includes('operationId'),
    file + ' não pode ativar replay antes de implementar requiresRefresh');
}
const autodrawConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../functions-autodraw/firebase.json'), 'utf8'));
assert(!autodrawConfig.functions.ignore.some(pattern => pattern.includes('operation-receipt-core')),
  'o contrato de recibo precisa acompanhar o deploy do autodraw');
assert.equal(fs.readFileSync(path.join(__dirname, '../functions-autodraw/operation-receipt-core.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '../functions/operation-receipt-core.js'), 'utf8'));
console.log('✓ recibo canônico, colisões, replay, retenção e paridade');
