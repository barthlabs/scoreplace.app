'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = { console, setTimeout, clearTimeout, navigator: { userAgent: 'node' },
  document: { getElementById: () => null, addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
context.window = context;
context.globalThis = context;
context._warn = context._log = context._error = context._debug = () => {};
context._participantUids = () => [];
context._mergeMemberUids = (_, prev, next) => Array.from(new Set([].concat(prev || [], next || [])));
context._stripStoredNamesForUidEntries = (items) => items;
context.firebase = { firestore: Object.assign(() => ({}), { FieldValue: { delete: () => '__delete__' } }) };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/firebase-db.js'), 'utf8'),
  context, { filename: 'firebase-db.js' });
const db = context.FirestoreDB;
db._foldMonarchGroups = () => {};
db._cleanUndefined = (value) => JSON.parse(JSON.stringify(value));
db._computeAdminEmails = () => [];
db._computeAdminUids = () => [];
db._computeMemberUids = () => [];
db._ehSandbox = () => false;

const clone = (value) => JSON.parse(JSON.stringify(value));
let stored = { id: 't', creatorUid: 'owner', name: 'Original',
  _phaseReadCertificate: { version: 1, count: 2, digest: 'server' } };
const ref = {
  get: async () => ({ exists: true, data: () => clone(stored) }),
  set: async (data, options) => { stored = options && options.merge
    ? Object.assign({}, stored, clone(data)) : clone(data); }
};
db.db = { collection: () => ({ doc: () => ref }),
  runTransaction: async (fn) => fn({ get: ref.get, set: (_, value) => { stored = clone(value); } }) };

(async () => {
  const stale = Object.assign({}, clone(stored), { name: 'Novo nome',
    _phaseReadCertificate: { version: 1, count: 999, digest: 'stale' } });
  await db.saveTournament(stale);
  assert.equal(stored.name, 'Novo nome');
  assert.equal(stored._phaseReadCertificate.digest, 'server', 'save com merge preserva marca do servidor');
  await db.mutateTournament('t', (data) => {
    data.name = 'Outro nome';
    data._phaseReadCertificate = { version: 1, count: 0, digest: 'forged' };
  });
  assert.equal(stored.name, 'Outro nome');
  assert.equal(stored._phaseReadCertificate.digest, 'server', 'set transacional ignora marca do mutator');
  console.log('phase-certificate-client-write: cache antigo e mutação transacional OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
