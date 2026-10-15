'use strict';
// Prova a Function real e a transação do Firestore sem tocar torneios oficiais.
const assert = require('assert');
const path = require('path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');

async function driver() {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8093';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9092';
  const admin = require('../functions/node_modules/firebase-admin');
  const fb = require('firebase/compat/app');
  require('firebase/compat/auth');
  require('firebase/compat/functions');
  const registration = require('../functions/registration-core');
  const mutations = require('../functions/registration-mutations-core');
  const projectId = 'demo-scoreplace';
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const tid = 'test-import-emulator';
  const organizer = 'organizer-import';
  const outsider = 'outsider-import';
  const linkedUid = 'linked-import';
  for (const [uid, email] of [[organizer, 'organizer@example.com'], [outsider, 'outsider@example.com']]) {
    await admin.auth().createUser({ uid, email, password: 'senha123' });
  }
  await db.doc('users/' + linkedUid).set({ displayName: 'Beatriz Teste', displayName_lower: 'beatriz teste' });
  const people = [1, 2, 3, 4].map((number) => {
    const manualParticipantId = 'emulator-slot-' + number;
    const participantKey = registration.participantKey({ manualParticipantId });
    return { registrationId: registration.registrationId(participantKey, 'masc-light'),
      tournamentId: tid, categoryId: 'masc-light', participantKey, participantKind: 'manual',
      participantUid: null, manualParticipantId, manualDisplayName: 'Jogador ' + String(number).padStart(2, '0'),
      status: 'confirmed', validationState: 'approved', fixedPairId: null };
  });
  for (const start of [0, 2]) {
    const pairId = mutations.canonicalPairId(tid, 'masc-light', people.slice(start, start + 2).map((p) => p.registrationId));
    people[start].fixedPairId = pairId;
    people[start + 1].fixedPairId = pairId;
  }
  await db.doc('tournaments/' + tid).set({ creatorUid: organizer, adminUids: [organizer], memberUids: [organizer],
    name: 'Teste de importação isolado', categoryDefinitions: [
      { id: 'masc-light', label: 'Masc Light' }, { id: 'fem-light', label: 'Fem Light' },
    ], canonicalRegistrationMigration: { fingerprint: 'emulator-import-fixture', registrationCount: 4 } });
  for (const p of people) await db.doc('tournaments/' + tid + '/registrations/' + p.registrationId).set(p);

  const firebase = fb.default || fb;
  const app = firebase.initializeApp({ apiKey: 'fake', projectId, authDomain: 'localhost' });
  app.auth().useEmulator('http://127.0.0.1:9092', { disableWarnings: true });
  app.functions('us-central1').useEmulator('127.0.0.1', 5011);
  const call = (name, data) => app.functions('us-central1').httpsCallable(name)(data).then((r) => r.data);
  const rejectsCode = (promise, code) => assert.rejects(promise, (error) =>
    String(error && error.code || '').includes(code));
  const previewData = { tournamentId: tid };
  await app.auth().signInWithEmailAndPassword('outsider@example.com', 'senha123');
  await rejectsCode(call('previewTournamentImport', previewData), 'permission-denied');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('organizer@example.com', 'senha123');
  const initial = await call('previewTournamentImport', previewData);
  assert.strictEqual(initial.slots.length, 2);
  assert.strictEqual(initial.count, 4);
  assert.strictEqual(initial.photoImportEnabled, true);
  const candidates = await call('searchTournamentImportCandidates', { tournamentId: tid, query: 'bea' });
  assert(candidates.candidates.some((item) => item.uid === linkedUid));
  assert(candidates.candidates.every((item) => !Object.prototype.hasOwnProperty.call(item, 'photoURL')));
  const today = new Date().toISOString().slice(0, 10);
  const searchQuotaPath = 'tournamentImports/searchUsage/days/' + today + '_' + organizer;
  await db.doc(searchQuotaPath).set({ uid: organizer, day: today, count: 300 });
  await rejectsCode(call('searchTournamentImportCandidates', { tournamentId: tid, query: 'bea' }), 'resource-exhausted');
  await rejectsCode(call('extractTournamentImportImage', {
    tournamentId: tid, mime: 'image/png', imageBase64: 'aGVsbG8=',
  }), 'failed-precondition');
  await rejectsCode(call('extractTournamentImportImage', {
    tournamentId: tid, mime: 'image/png', imageBase64: 'aGVsbG8=', visionConsent: true,
  }), 'invalid-argument');
  const quotaPath = 'tournamentImports/ocrUsage/days/' + today + '_' + organizer;
  await db.doc(quotaPath).set({ uid: organizer, day: today, count: 50 });
  await rejectsCode(call('extractTournamentImportImage', {
    tournamentId: tid, mime: 'image/png', visionConsent: true,
    imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  }), 'resource-exhausted');
  assert.strictEqual((await db.doc(quotaPath).get()).data().count, 50);
  const importId = 'a1b2c3d4-1234-4123-8123-123456789abc';
  const block0 = [{ pairId: people[0].fixedPairId, categoryId: 'fem-light', people: [
    { name: 'Ana Exemplo', uid: null }, { name: 'Beatriz Teste', uid: linkedUid },
  ] }];
  const first = await call('applyTournamentImportBlock', { ...previewData, importId, blockIndex: 0,
    fingerprint: initial.fingerprint, block: block0 });
  assert.strictEqual(first.alreadyApplied, false);
  const retry = await call('applyTournamentImportBlock', { ...previewData, importId, blockIndex: 0,
    fingerprint: initial.fingerprint, block: block0 });
  assert.strictEqual(retry.alreadyApplied, true);
  assert.strictEqual(retry.fingerprint, first.fingerprint);
  await rejectsCode(call('applyTournamentImportBlock', { ...previewData, importId, blockIndex: 0,
    fingerprint: initial.fingerprint, block: [{ ...block0[0], people: [
      { name: 'Ana Alterada', uid: null }, block0[0].people[1],
    ] }] }), 'already-exists');
  const after = await call('previewTournamentImport', previewData);
  assert.strictEqual(after.slots.length, 1);
  assert.strictEqual(after.count, 4);
  assert.strictEqual(after.fingerprint, first.fingerprint);
  const saved = (await db.collection('tournaments/' + tid + '/registrations').get()).docs.map((d) => d.data());
  assert.strictEqual(saved.filter((p) => p.status !== 'withdrawn' && p.categoryId === 'fem-light').length, 2);
  assert.strictEqual(saved.filter((p) => p.status === 'withdrawn' && p.categoryId === 'masc-light').length, 2);
  assert(saved.some((p) => p.status !== 'withdrawn' && p.categoryId === 'fem-light' && p.participantUid === linkedUid));
  assert((await db.doc('tournaments/' + tid).get()).data().memberUids.includes(linkedUid));
  await rejectsCode(call('applyTournamentImportBlock', { ...previewData, importId, blockIndex: 1,
    fingerprint: initial.fingerprint, block: [{ pairId: people[2].fixedPairId, categoryId: 'masc-light', people: [
      { name: 'Cris Exemplo', uid: null }, { name: 'Dani Exemplo', uid: null },
    ] }] }), 'aborted');
  const second = await call('applyTournamentImportBlock', { ...previewData, importId, blockIndex: 1,
    fingerprint: after.fingerprint, block: [{ pairId: people[2].fixedPairId, categoryId: 'masc-light', people: [
      { name: 'Cris Exemplo', uid: null }, { name: 'Dani Exemplo', uid: null },
    ] }] });
  assert.strictEqual(second.count, 4);
  assert.strictEqual((await call('previewTournamentImport', previewData)).slots.length, 0);
  console.log('✓ EMULATOR_IMPORT_OK: autorização, transação, reclassificação, UID, retry, conflito e 2 blocos');
  process.exit(0);
}

if (process.argv.includes('--driver')) {
  driver().catch((error) => { console.error(error.stack || error); process.exit(1); });
} else {
  const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore,auth,functions',
    '--config', path.join(ROOT, 'firebase.sandbox.json'), '--project', 'demo-scoreplace',
    'node tests/tournament-import-emulator.test.js --driver'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH },
  });
  assert(output.includes('EMULATOR_IMPORT_OK'), output.slice(-4000));
  console.log('✓ importação validada na Function e no Firestore Emulator');
}
