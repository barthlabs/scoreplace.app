'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const { stable } = require('../scripts/backup-torneio-operacional-core.js');
const cli = require('../scripts/aplicar-results-obsoletos-e05.js');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore Emulator obrigatório');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e05-obsolete-test-'));
let serial = 0;

async function fixture(target, options = {}) {
  const suffix = ++serial;
  const rootPath = target === 'neon' ? 'tournaments/neon-ghost-test-' + suffix :
    'sandboxes/sb-ghost-test-' + suffix;
  const ref = db.doc(rootPath);
  const rootData = target === 'neon'
    ? { name: 'Neon test', format: 'Fase de Grupos',
      phases: [{ kind: options.elimination ? 'elimination' : 'classification',
        classification: { structure: 'groups' } }] }
    : { sandboxOf: 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44' };
  await ref.set(rootData);
  const other = ref.collection('matches').doc('preserved');
  await other.set({ jogo: { id: 'preserved', scoreP1: 6, scoreP2: 1 } });
  const collection = target === 'neon' ? 'results' : 'resultsSandbox';
  const count = target === 'neon' ? 2 : 98;
  const batch = db.batch();
  for (let n = 0; n < count; n++) {
    const data = target === 'neon'
      ? { matchId: 'ghost-' + n, roundLabel: 'bui.thirdPlaceMatch', winner: null,
        ...(n === 1 ? { p1: 'A', p2: 'B' } : {}),
        ...(options.scored && n === 1 ? { scoreP1: 6 } : {}) }
      : { matchId: 'copy-' + n, winner: n % 2 ? 'A' : 'B' };
    batch.set(ref.collection(collection).doc(target === 'neon' ? 'ghost-' + n : 'copy-' + n), data);
  }
  await batch.commit();
  const before = await cli.capture(db, rootPath);
  const backup = {
    project: 'demo-scoreplace',
    root: { data: stable(before.root.data()), updateTime: stable(before.root.updateTime) },
    subcollections: Object.fromEntries(Object.entries(before.collections).map(([name, docs]) =>
      [name, docs.map(doc => ({ id: doc.id, data: stable(doc.data()),
        updateTime: stable(doc.updateTime) }))])),
  };
  const plan = { rootUpdateTime: stable(before.root.updateTime), rootHash: hash(before.root.data()),
    docs: before.collections[collection].map(doc => ({ id: doc.id,
      updateTime: stable(doc.updateTime), hash: hash(doc.data()) })) };
  const input = { config: { collection, count, backupSha256: 'test' }, backup, plan,
    rootPath, savedRoot: backup.root };
  return { ref, input, collection, other };
}

async function run() {
  const neon = await fixture('neon');
  const receipt = path.join(tmp, 'neon.json');
  const applied = await cli.apply(db, 'neon', neon.input, { authorizationRef: 'emulator' }, receipt);
  assert.equal(applied.status, 'APPLIED_AUDITED');
  assert.equal(applied.deleted, 2);
  assert.equal((await neon.ref.collection('results').get()).size, 0);
  assert.deepEqual((await neon.other.get()).data(), { jogo: { id: 'preserved', scoreP1: 6, scoreP2: 1 } });
  await assert.rejects(() => cli.apply(db, 'neon', neon.input,
    { authorizationRef: 'emulator' }, receipt), /recibo anterior/);

  const sandbox = await fixture('sandbox');
  const sbApplied = await cli.apply(db, 'sandbox', sandbox.input,
    { authorizationRef: 'emulator' }, path.join(tmp, 'sandbox.json'));
  assert.equal(sbApplied.deleted, 98);
  assert.equal((await sandbox.ref.collection('resultsSandbox').get()).size, 0);
  assert.deepEqual((await sandbox.other.get()).data(), { jogo: { id: 'preserved', scoreP1: 6, scoreP2: 1 } });

  const race = await fixture('neon');
  await race.ref.collection('results').doc('ghost-1').update({ scoreP1: 6 });
  await assert.rejects(() => cli.apply(db, 'neon', race.input,
    { authorizationRef: 'emulator' }, path.join(tmp, 'race.json')), /backup|prévia/);
  assert.equal((await race.ref.collection('results').get()).size, 2);

  const extra = await fixture('neon');
  await extra.ref.collection('results').doc('extra').set({ roundLabel: 'bui.thirdPlaceMatch' });
  await assert.rejects(() => cli.apply(db, 'neon', extra.input,
    { authorizationRef: 'emulator' }, path.join(tmp, 'extra.json')), /backup|prévia|mudou/);
  assert.equal((await extra.ref.collection('results').get()).size, 3);

  const scored = await fixture('neon', { scored: true });
  await assert.rejects(() => cli.apply(db, 'neon', scored.input,
    { authorizationRef: 'emulator' }, path.join(tmp, 'scored.json')), /placar/);
  assert.equal((await scored.ref.collection('results').get()).size, 2);

  const elimination = await fixture('neon', { elimination: true });
  await assert.rejects(() => cli.apply(db, 'neon', elimination.input,
    { authorizationRef: 'emulator' }, path.join(tmp, 'elimination.json')), /grupo/);
  assert.equal((await elimination.ref.collection('results').get()).size, 2);
  console.log('E05: Neon 2 e sandbox 98 auditados; corrida, extra, placar e fase recusados antes de escrita');
}
run().then(() => fs.rmSync(tmp, { recursive: true, force: true }))
  .catch(error => { console.error(error); process.exitCode = 1; });
