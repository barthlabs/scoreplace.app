'use strict';
const assert = require('assert/strict');
const core = require('./own-library-core');

assert.deepEqual(core.normalizeTemplate({ name: 'Noite', scoring: { sets: 3 }, _id: 'forjado', ownerUid: 'outro' }), {
  name: 'Noite', scoring: { sets: 3 }
});
assert.throws(() => core.normalizeTemplate([]), /inválido/);
assert.throws(() => core.normalizeTemplate({ blob: 'x'.repeat(core.MAX_TEMPLATE_BYTES + 1) }), /limite/);
assert.deepEqual(core.normalizeNotificationIds(['a_1', 'a_1', 'b-2']), ['a_1', 'b-2']);
assert.throws(() => core.normalizeNotificationIds([]), /inválida/);
assert.throws(() => core.normalizeNotificationIds(['../outra-caixa']), /inválido/);
assert.equal(core.normalizeDocumentId('tpl-123', 'templateId'), 'tpl-123');
assert.throws(() => core.normalizeDocumentId('a/b', 'templateId'), /inválido/);
console.log('✅ own-library-core: 8 verificações');
