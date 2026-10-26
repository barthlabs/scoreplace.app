'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { rodarNoEmulador } = require('./emulador');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-admin-migration-'));
  const config = path.join(dir, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore: { rules: path.join(__dirname, 'concurrency', 'firestore.allow.rules') },
    emulators: { firestore: { host: '127.0.0.1', port: 18173 }, ui: { enabled: false }, singleProjectMode: true },
  }));
  const output = rodarNoEmulador([
    'emulators:exec', '--only', 'firestore', '--config', config, '--project', 'demo-scoreplace',
    'node ' + JSON.stringify(__filename),
  ], { cwd: ROOT, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
  process.stdout.write(output);
  process.exit(0);
}

const admin = require(require.resolve('firebase-admin', { paths: [path.join(__dirname, '..', 'functions')] }));
const migration = require('../scripts/migrar-inscricoes-admin');
const { buildOperationalBackup, digest } = require('../scripts/backup-torneio-operacional-core');

const emptyManifest = require('../scripts/migrar-inscricoes-vazias-manifest.json');
assert.strictEqual(emptyManifest.length, 63);
assert.strictEqual(new Set(emptyManifest).size, 63);
assert.strictEqual(digest(JSON.stringify(emptyManifest.slice().sort())),
  '74487e52724b3eef28ba62c4e5ddaf369ce9d111ac8524570c6ad405b9e7821d');
assert.strictEqual(migration.TARGETS_VAZIOS.size, 63);
assert.throws(() => migration.authorizationForTarget(emptyManifest[0], migration.AUTH_CLI_17), /incompatível/);
assert.throws(() => migration.authorizationForTarget([...migration.TARGETS][0], migration.AUTH_CLI_VAZIOS), /incompatível/);
assert.strictEqual(migration.authorizationForTarget(emptyManifest[0], migration.AUTH_CLI_VAZIOS).emptyRoute, true);

async function fixture(db, id) {
  const ref = db.collection('tournaments').doc(id);
  await ref.set({ name: 'Fixture', participants: [], _semPesados: ['participants'],
    _nPartes: { participants: 1 }, categoryDefinitions: [],
    _nascidoEm: admin.firestore.Timestamp.fromMillis(1700000000000),
    matches: [{ id: 'm1', scoreP1: 6, scoreP2: 4 }], results: [{ id: 'r1', winner: 'u1' }] });
  await ref.collection('inscritos').doc('pair-a').set({ item: {
    p1Uid: 'u1', p2Uid: 'u2', category: 'Livre',
  } });
  const snap = await ref.get();
  const collections = {};
  for (const col of await ref.listCollections()) {
    collections[col.id] = (await col.get()).docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  const { payload, sha256 } = buildOperationalBackup(snap, collections, new Date().toISOString(), 'demo-scoreplace');
  return { ref, backup: { payload, sha256 } };
}

async function emptyFixture(db, id) {
  const ref = db.collection('tournaments').doc(id);
  await ref.set({ name: 'Empty fixture', participants: [], _semPesados: ['participants'],
    _nPartes: { participants: 0 }, categoryDefinitions: [],
    matches: [{ id: 'm-empty', scoreP1: 6, scoreP2: 2 }],
    results: [{ id: 'r-empty', winner: 'legacy' }] });
  await ref.collection('history').doc('h1').set({ kind: 'fixture' });
  const snap = await ref.get();
  const collections = {};
  for (const col of await ref.listCollections()) {
    collections[col.id] = (await col.get()).docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  }
  const { payload, sha256 } = buildOperationalBackup(snap, collections, new Date().toISOString(), 'demo-scoreplace');
  return { ref, backup: { payload, sha256 } };
}

(async () => {
  admin.initializeApp({ projectId: 'demo-scoreplace' });
  const db = admin.firestore();
  const receiptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-admin-receipt-'));
  const receiptFile = path.join(receiptDir, 'intent.json');
  migration.reserveReceipt(receiptFile, { status: 'pending' });
  assert.strictEqual(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).status, 'pending');
  assert.throws(() => migration.reserveReceipt(receiptFile, { status: 'another' }), /EEXIST/);

  const first = await fixture(db, 'legacy-test-1');
  const state = await migration.readState(first.ref, first.backup, null);
  const preview = migration.inspect('legacy-test-1', state, first.backup);
  assert.strictEqual(preview.preview.registrations, 2);
  assert.strictEqual(preview.preview.formedPairs, 1);
  assert.strictEqual(preview.preview.physicalExisting, 0);
  const outcome = await migration.applyMigration(db, first.ref, 'legacy-test-1', first.backup, preview);
  assert.strictEqual(outcome.created, 2);
  await migration.postCheck(first.ref, first.backup, preview, 'legacy-test-1');
  assert.strictEqual((await first.ref.get()).data().matches[0].scoreP1, 6);
  assert.strictEqual((await first.ref.get()).data().results[0].winner, 'u1');
  assert.strictEqual((await first.ref.collection('inscritos').get()).size, 1);
  await first.ref.collection('new-concurrent-collection').doc('x').set({ signal: true });
  await assert.rejects(migration.postCheck(first.ref, first.backup, preview, 'legacy-test-1'), /lista de subcoleções mudou/);
  await assert.rejects(migration.readState(first.ref, first.backup, null), /rota recusada/);

  const changed = await fixture(db, 'legacy-test-2');
  const old = migration.inspect('legacy-test-2', await migration.readState(changed.ref, changed.backup, null), changed.backup);
  await changed.ref.update({ participants: [{ uid: 'unexpected' }] });
  await assert.rejects(migration.applyMigration(db, changed.ref, 'legacy-test-2', changed.backup, old), /mudou desde o backup/);
  assert.strictEqual((await changed.ref.collection('registrations').get()).size, 0);

  const physical = await fixture(db, 'legacy-test-3');
  const oldPhysical = migration.inspect('legacy-test-3', await migration.readState(physical.ref, physical.backup, null), physical.backup);
  await physical.ref.collection('registrations').doc('unexpected').set({ registrationId: 'unexpected' });
  await assert.rejects(migration.applyMigration(db, physical.ref, 'legacy-test-3', physical.backup, oldPhysical), /contagem física/);
  assert.strictEqual((await physical.ref.collection('registrations').get()).size, 1);

  const marked = await fixture(db, 'legacy-test-4');
  await marked.ref.update({ canonicalRegistrationMigration: { fingerprint: 'different', registrationCount: 0 } });
  await assert.rejects(migration.readState(marked.ref, marked.backup, null), /rota recusada: canonical_divergent/);

  const concurrentCollection = await fixture(db, 'legacy-test-5');
  const beforeConcurrent = migration.inspect('legacy-test-5',
    await migration.readState(concurrentCollection.ref, concurrentCollection.backup, null),
    concurrentCollection.backup);
  const originalList = concurrentCollection.ref.listCollections.bind(concurrentCollection.ref);
  concurrentCollection.ref.listCollections = async () => {
    await concurrentCollection.ref.collection('new-before-commit').doc('x').set({ created: true });
    return originalList();
  };
  await assert.rejects(migration.applyMigration(db, concurrentCollection.ref,
    'legacy-test-5', concurrentCollection.backup, beforeConcurrent), /lista de subcoleções mudou antes do commit/);
  assert.strictEqual((await concurrentCollection.ref.collection('registrations').get()).size, 0);

  const empty = await emptyFixture(db, emptyManifest[0]);
  const emptyPreview = migration.inspect(emptyManifest[0],
    await migration.readState(empty.ref, empty.backup, null), empty.backup);
  assert.strictEqual(emptyPreview.preview.creates, 0);
  assert.strictEqual(emptyPreview.preview.registrations, 0);
  assert.ok(emptyPreview.preview.fingerprint);
  const emptyOutcome = await migration.applyMigration(db, empty.ref, emptyManifest[0], empty.backup, emptyPreview);
  assert.strictEqual(emptyOutcome.created, 0);
  await migration.postCheck(empty.ref, empty.backup, emptyPreview, emptyManifest[0]);
  assert.strictEqual((await empty.ref.get()).data().canonicalRegistrationMigration.registrationCount, 0);
  assert.strictEqual((await empty.ref.collection('registrations').get()).size, 0);
  assert.strictEqual((await empty.ref.get()).data().matches[0].scoreP1, 6);
  assert.strictEqual((await empty.ref.get()).data().results[0].winner, 'legacy');

  const changedEmpty = await emptyFixture(db, emptyManifest[1]);
  const changedPreview = migration.inspect(emptyManifest[1],
    await migration.readState(changedEmpty.ref, changedEmpty.backup, null), changedEmpty.backup);
  await changedEmpty.ref.collection('participants').doc('late').set({ item: { uid: 'late' } });
  await assert.rejects(migration.applyMigration(db, changedEmpty.ref, emptyManifest[1],
    changedEmpty.backup, changedPreview), /lista de subcoleções mudou|mudou desde o backup/);
  assert.strictEqual((await changedEmpty.ref.get()).data().canonicalRegistrationMigration, undefined);

  const physicalEmpty = await emptyFixture(db, emptyManifest[2]);
  const physicalPreview = migration.inspect(emptyManifest[2],
    await migration.readState(physicalEmpty.ref, physicalEmpty.backup, null), physicalEmpty.backup);
  await physicalEmpty.ref.collection('registrations').doc('late').set({ registrationId: 'late' });
  await assert.rejects(migration.applyMigration(db, physicalEmpty.ref, emptyManifest[2],
    physicalEmpty.backup, physicalPreview), /contagem física/);
  assert.strictEqual((await physicalEmpty.ref.get()).data().canonicalRegistrationMigration, undefined);
  console.log('✓ migração administrativa: dupla, conservação, concorrência, ID físico e rota divergente');
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
