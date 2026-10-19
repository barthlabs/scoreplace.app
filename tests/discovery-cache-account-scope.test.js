'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
const auth = fs.readFileSync(path.join(root, 'js/views/auth.js'), 'utf8');
const db = fs.readFileSync(path.join(root, 'js/firebase-db.js'), 'utf8');
const explore = fs.readFileSync(path.join(root, 'js/views/explore.js'), 'utf8');

const start = auth.indexOf('window._clearDiscoveryCache = function () {');
const end = auth.indexOf('\n};', start);
assert(start > -1 && end > start, 'limpeza da descoberta existe');
const items = new Map([
  ['scoreplace_discoverable_v1_old', '{"users":["old"]}'],
  ['scoreplace_discoverable_v1_new', '{"users":["new"]}'],
  ['scoreplace_totalPessoas_old', '5'],
  ['unrelated', 'keep'],
]);
const localStorage = {
  get length() { return items.size; },
  key(index) { return Array.from(items.keys())[index] || null; },
  removeItem(key) { items.delete(key); },
};
const window = { _invitableUsersCache: { uid: 'old' }, _exploreInvitableCache: ['old'], _exploreInvitableCacheUid: 'old' };
vm.runInNewContext(auth.slice(start, end + 3), { window, localStorage });
window._clearDiscoveryCache();
assert.strictEqual(window._invitableUsersCache, null);
assert.strictEqual(window._exploreInvitableCache, null);
assert.strictEqual(window._exploreInvitableCacheUid, '');
assert.deepStrictEqual(Array.from(items.entries()), [['unrelated', 'keep']]);
assert(auth.includes("if (typeof window._clearDiscoveryCache === 'function') window._clearDiscoveryCache();"), 'logout limpa o cache');
assert(db.includes('scopedCache.uid === viewerUid'), 'cache de rede confere a conta');
assert(db.includes("!== viewerUid) return []"), 'resposta atrasada de outra conta é descartada');
assert(explore.includes("'scoreplace_discoverable_v1_' + String(myUid || '')"), 'persistência usa UID');
assert(explore.includes("!== String(myUid || '')) return;"), 'resposta atrasada do Explore é descartada');
console.log('✓ descoberta: cache isolado e apagado na troca de conta');
