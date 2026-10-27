'use strict';
const fs = require('fs');
const assert = require('assert');
const crypto = require('crypto');
const { ORIGINAL, assertNeonEmulatorTarget } = require('./neon-sandbox-guard');

const id = 'sb_' + ORIGINAL + '_' + Date.now();
assertNeonEmulatorTarget({
  projectId: process.env.GCLOUD_PROJECT,
  firestoreHost: process.env.FIRESTORE_EMULATOR_HOST,
  authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  functionsHost: process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST,
  tournamentId: id, sandbox: true
});
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Credencial de produção no ambiente do teste.');
const backup = JSON.parse(fs.readFileSync(process.env.NEON_BACKUP_PATH, 'utf8'));
if (backup.project !== 'scoreplace-app' || backup.tournamentId !== ORIGINAL ||
    (backup.subcollections.matches || []).length !== 96) throw new Error('Backup não é o Neon esperado.');

const admin = require(process.env.ADMIN_PATH);
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
if (admin.app().options.projectId !== 'demo-scoreplace') throw new Error('SDK apontou a outro projeto.');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((out, key) => {
    out[key] = canonical(value[key]); return out;
  }, {});
  return value;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }

(async () => {
  const root = db.doc('sandboxes/' + id);
  await root.create({ ...backup.tournament.data, id, isSandbox: true, sandboxOf: ORIGINAL,
    sandboxOwnerUid: String(backup.tournament.data.creatorUid || ''), sbState: 'ready' });
  for (const [name, docs] of Object.entries(backup.subcollections)) {
    const targetName = name === 'results' ? 'resultsSandbox' : name;
    for (let start = 0; start < docs.length; start += 400) {
      const batch = db.batch();
      docs.slice(start, start + 400).forEach(item => batch.create(root.collection(targetName).doc(item.id), item.data));
      await batch.commit();
    }
  }
  const originalData = backup.tournament.data;
  const copiedData = (await root.get()).data();
  for (const key of Object.keys(originalData)) {
    if (key === 'id') continue; // identidade técnica da réplica
    assert.strictEqual(digest(copiedData[key]), digest(originalData[key]), 'campo ' + key);
  }
  for (const [name, docs] of Object.entries(backup.subcollections)) {
    const targetName = name === 'results' ? 'resultsSandbox' : name;
    const copied = await root.collection(targetName).get();
    assert.strictEqual(copied.size, docs.length, 'subcoleção ' + name);
    for (const item of docs) {
      const found = copied.docs.find(doc => doc.id === item.id);
      assert(found, 'documento ausente em ' + name);
      assert.strictEqual(digest(found.data()), digest(item.data), 'dado alterado em ' + name);
    }
  }
  assert.strictEqual((await root.collection('matches').get()).size, 96);
  assert.strictEqual((await db.collection('tournaments').doc(ORIGINAL).get()).exists, false,
    'O torneio real nunca pode existir no emulador de teste');
  console.log('NEON_EMULATOR_COPY_OK: 96 jogos, ' + Object.values(backup.subcollections).reduce((sum, docs) => sum + docs.length, 0) +
    ' subdocumentos iguais no emulador; torneio real ausente.');
  await admin.app().delete();
})().catch(err => { console.error('Cópia local falhou:', err.message); process.exitCode = 1; });
