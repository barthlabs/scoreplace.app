'use strict';
// Executa a callable real contra duas coleções independentes. Um sandbox
// validado pela identidade lógica do original NUNCA escreve no original.
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'scoreplace-testes';
const admin = require(path.join(ROOT, 'functions/node_modules/firebase-admin'));
const core = require(path.join(ROOT, 'functions/registration-core.js'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const account = (uid) => ({
  registrationId: core.registrationId('uid:' + uid, 'cat-a'), tournamentId: 't1',
  categoryId: 'cat-a', participantKey: 'uid:' + uid, participantKind: 'account',
  participantUid: uid, manualParticipantId: null, status: 'confirmed',
  validationState: 'approved', fixedPairId: null,
});
const definitions = ['cat-a', 'cat-b'].map((id) => ({ id, label: id, dimension: 'custom' }));
const original = {
  id: 't1', creatorUid: 'org', categoryDefinitions: definitions,
  canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 1 },
  memberUids: ['org', 'u1'],
};
const sandbox = Object.assign({}, clone(original), {
  id: 'sb_t1', isSandbox: true, sandboxOf: 't1', sandboxOwnerUid: 'org',
  sbState: 'ready', notificationsMuted: true,
});
const first = account('u1');
const state = {
  tournaments: { t1: { doc: clone(original), registrations: { [first.registrationId]: clone(first) } } },
  sandboxes: { sb_t1: { doc: clone(sandbox), registrations: { [first.registrationId]: clone(first) } } },
};
function docref(group, id, sub, subid) {
  return { group, id, sub, subid, collection: (name) => subref(group, id, name) };
}
function subref(group, id, name) {
  return { group, id, name, limit: function () { return this; }, doc: (subid) => docref(group, id, name, subid) };
}
function record(r) {
  const parent = state[r.group] && state[r.group][r.id];
  return r.sub ? parent && parent[r.sub] && parent[r.sub][r.subid] : parent && parent.doc;
}
const db = {
  collection: (group) => ({ doc: (id) => docref(group, id) }),
  runTransaction: async (callback) => {
    const writes = [];
    let startedWriting = false;
    const tx = {
      get: async (r) => {
        assert(!startedWriting, 'Firestore proíbe leitura após escrita na transação');
        if (r.name) {
          const entries = (state[r.group][r.id] || {})[r.name] || {};
          return { docs: Object.entries(entries).map(([id, value]) => ({ id, data: () => clone(value) })) };
        }
        const value = record(r);
        return { exists: !!value, data: () => clone(value || {}) };
      },
      update: (r, patch) => {
        startedWriting = true;
        assert(record(r), 'update não pode criar documento: ' + r.group + '/' + r.id);
        writes.push({ kind: 'update', r, patch });
      },
      create: (r, value) => {
        startedWriting = true;
        assert(!record(r), 'create não pode sobrescrever documento');
        writes.push({ kind: 'create', r, value });
      },
    };
    const result = await callback(tx);
    for (const write of writes) {
      const parent = state[write.r.group][write.r.id];
      const target = write.r.sub ? parent[write.r.sub] : parent;
      const key = write.r.sub ? write.r.subid : 'doc';
      target[key] = write.kind === 'create'
        ? Object.assign({}, write.value)
        : Object.assign({}, target[key], write.patch);
    }
    return result;
  },
};
const firestoreStub = () => db;
firestoreStub.FieldPath = admin.firestore.FieldPath;
firestoreStub.FieldValue = admin.firestore.FieldValue;
Object.defineProperty(admin, 'initializeApp', { value: () => ({}), writable: true, configurable: true });
Object.defineProperty(admin, 'firestore', { value: firestoreStub, writable: true, configurable: true });
assert.strictEqual(admin.firestore, firestoreStub);
const CF = require(path.join(ROOT, 'functions/index.js'));
const call = (data, uid = 'org') => CF.reclassifyCanonicalRegistration.run({
  data, auth: { uid, token: { uid } }, rawRequest: { headers: {} }, acceptsStreaming: false,
});
const request = (sandboxFlag) => ({
  tournamentId: 'sb_t1', sandbox: sandboxFlag, userUid: 'u1',
  fromCategoryId: 'cat-a', toCategoryId: 'cat-b',
});
(async () => {
  const originalBefore = clone(state.tournaments);
  const response = await call(request(true));
  assert.strictEqual(response.outcome, 'reclassified');
  assert.deepStrictEqual(clone(state.tournaments), originalBefore, 'sandbox não toca no original');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[first.registrationId].status, 'withdrawn');
  const movedId = core.registrationId('uid:u1', 'cat-b');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[movedId].status, 'confirmed');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[movedId].tournamentId, 't1');
  assert.strictEqual(state.sandboxes.sb_t1.doc.canonicalRegistrationMigration.registrationCount, 2);
  console.log('✓ sandbox muda categoria e recibo sem tocar no original');

  await assert.rejects(call(request(false)), /torneio não existe/);
  await assert.rejects(call({ ...request(true), tournamentId: 't1' }), /torneio não existe/);
  await assert.rejects(call({ ...request(true), fromCategoryId: 'cat-b', toCategoryId: 'cat-a' }, 'intruso'), /torneio não existe/);
  assert.deepStrictEqual(clone(state.tournaments), originalBefore);
  console.log('✓ flag incorreta, ID errado e outro usuário falham fechados');

  state.tournaments.t1.doc.creatorUid = 'outro';
  await assert.rejects(call({ ...request(true), fromCategoryId: 'cat-b', toCategoryId: 'cat-a' }), /torneio não existe/);
  assert.strictEqual(state.sandboxes.sb_t1.registrations[movedId].status, 'confirmed');
  console.log('✓ perda de autorização no original bloqueia a cópia');
})().catch((error) => { console.error(error); process.exitCode = 1; });
