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
  const mergedUid = 'merged-import';
  for (const [uid, email] of [[organizer, 'organizer@example.com'], [outsider, 'outsider@example.com'],
    ['claimant-one', 'claimant-one@example.com'], ['claimant-two', 'claimant-two@example.com'],
    ['claimant-three', 'claimant-three@example.com']]) {
    await admin.auth().createUser({ uid, email, password: 'senha123' });
  }
  await db.doc('users/' + linkedUid).set({ displayName: 'Beatriz Teste', displayName_lower: 'beatriz teste' });
  await db.doc('users/' + mergedUid).set({ displayName: 'Betina Antiga', displayName_lower: 'betina antiga', mergedInto: linkedUid });
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
  const mergedCandidates = await call('searchTournamentImportCandidates', { tournamentId: tid, query: 'bet' });
  assert(mergedCandidates.candidates.some((item) => item.uid === linkedUid));
  assert(mergedCandidates.candidates.every((item) => item.uid !== mergedUid));
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
    { name: 'Ana Exemplo', uid: null }, { name: 'Beatriz Teste', uid: mergedUid },
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
  const claimable = await call('listManualClaimInvites', previewData);
  assert(claimable.people.some((person) => person.name === 'Ana Exemplo'));
  assert(claimable.people.every((person) => !Object.prototype.hasOwnProperty.call(person, 'email')));
  const ana = claimable.people.find((person) => person.name === 'Ana Exemplo');
  const cris = claimable.people.find((person) => person.name === 'Cris Exemplo');
  const dani = claimable.people.find((person) => person.name === 'Dani Exemplo');
  const firstInvite = await call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: ana.manualParticipantId });
  assert.match(firstInvite.token, /^[a-f0-9]{64}$/);
  const inviteDoc = await db.doc('tournaments/' + tid + '/manualClaimInvites/' + require('crypto').createHash('sha256').update(ana.manualParticipantId).digest('hex')).get();
  assert(!JSON.stringify(inviteDoc.data()).includes(firstInvite.token), 'token cru nunca vai ao banco');
  const firstPair = saved.find((person) => person.manualParticipantId === ana.manualParticipantId).fixedPairId;
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('outsider@example.com', 'senha123');
  await rejectsCode(call('listManualClaimInvites', previewData), 'permission-denied');
  await rejectsCode(call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: ana.manualParticipantId }), 'permission-denied');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('claimant-one@example.com', 'senha123');
  const previewClaim = await call('previewManualClaimInvite', { tournamentId: tid, manualParticipantId: ana.manualParticipantId, token: firstInvite.token });
  assert.strictEqual(previewClaim.name, 'Ana Exemplo');
  await call('acceptManualClaimInvite', { tournamentId: tid, manualParticipantId: ana.manualParticipantId, token: firstInvite.token });
  await rejectsCode(call('acceptManualClaimInvite', { tournamentId: tid, manualParticipantId: ana.manualParticipantId, token: firstInvite.token }), 'failed-precondition');
  const claimed = (await db.collection('tournaments/' + tid + '/registrations').get()).docs.map((doc) => doc.data());
  const newAna = claimed.find((person) => person.participantUid === 'claimant-one' && person.status === 'confirmed');
  assert(newAna && newAna.fixedPairId && newAna.fixedPairId !== firstPair);
  const partner = claimed.find((person) => person.participantUid === linkedUid && person.status === 'confirmed');
  assert.strictEqual(partner.fixedPairId, newAna.fixedPairId, 'parceira permanece na dupla após o vínculo');
  const retired = claimed.find((person) => person.manualParticipantId === ana.manualParticipantId && person.status === 'withdrawn');
  assert(retired, 'vaga manual fica no histórico como retirada');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('organizer@example.com', 'senha123');
  const oldCris = await call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: cris.manualParticipantId });
  const newCris = await call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: cris.manualParticipantId });
  await rejectsCode(call('previewManualClaimInvite', { tournamentId: tid, manualParticipantId: cris.manualParticipantId, token: oldCris.token }), 'failed-precondition');
  const expiredDani = await call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: dani.manualParticipantId });
  const daniInviteRef = db.doc('tournaments/' + tid + '/manualClaimInvites/' + require('crypto').createHash('sha256').update(dani.manualParticipantId).digest('hex'));
  await daniInviteRef.update({ expiresAtMs: Date.now() - 1 });
  await rejectsCode(call('previewManualClaimInvite', { tournamentId: tid, manualParticipantId: dani.manualParticipantId, token: expiredDani.token }), 'failed-precondition');
  const daniInvite = await call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: dani.manualParticipantId });
  const daniRegistration = claimed.find((person) => person.manualParticipantId === dani.manualParticipantId);
  const daniRegistrationRef = db.doc('tournaments/' + tid + '/registrations/' + daniRegistration.registrationId);
  await daniRegistrationRef.update({ status: 'withdrawn' });
  await rejectsCode(call('previewManualClaimInvite', { tournamentId: tid, manualParticipantId: dani.manualParticipantId, token: daniInvite.token }), 'failed-precondition');
  await daniRegistrationRef.update({ status: 'confirmed' });
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('claimant-one@example.com', 'senha123');
  await rejectsCode(call('acceptManualClaimInvite', { tournamentId: tid, manualParticipantId: dani.manualParticipantId, token: daniInvite.token }), 'failed-precondition');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('claimant-two@example.com', 'senha123');
  await call('acceptManualClaimInvite', { tournamentId: tid, manualParticipantId: cris.manualParticipantId, token: newCris.token });
  await db.doc('tournaments/' + tid).update({ rounds: [{ id: 'round-1' }] });
  await rejectsCode(call('acceptManualClaimInvite', { tournamentId: tid, manualParticipantId: dani.manualParticipantId, token: daniInvite.token }), 'failed-precondition');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('organizer@example.com', 'senha123');
  await rejectsCode(call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: dani.manualParticipantId }), 'failed-precondition');
  await db.doc('tournaments/' + tid).update({ rounds: [] });
  await app.auth().signOut();
  const secondApp = firebase.initializeApp({ apiKey: 'fake', projectId, authDomain: 'localhost' }, 'claim-concurrency');
  secondApp.auth().useEmulator('http://127.0.0.1:9092', { disableWarnings: true });
  secondApp.functions('us-central1').useEmulator('127.0.0.1', 5011);
  await app.auth().signInWithEmailAndPassword('outsider@example.com', 'senha123');
  await secondApp.auth().signInWithEmailAndPassword('claimant-three@example.com', 'senha123');
  const concurrentPayload = { tournamentId: tid, manualParticipantId: dani.manualParticipantId, token: daniInvite.token };
  const race = await Promise.allSettled([call('acceptManualClaimInvite', concurrentPayload),
    secondApp.functions('us-central1').httpsCallable('acceptManualClaimInvite')(concurrentPayload)]);
  assert.strictEqual(race.filter((item) => item.status === 'fulfilled').length, 1, 'somente um dos dois consumidores ganha a vaga');
  await secondApp.delete();
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
