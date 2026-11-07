'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const admin = require('node:module').createRequire(path.join(__dirname, '../functions-autodraw/index.js'))('firebase-admin');
const { makeService, fingerprint, OWNER_UID } = require('../functions-autodraw/tournament-rehearsal');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Este teste exige Firestore Emulator.');
process.env.GCLOUD_PROJECT = 'demo-scoreplace';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const service = makeService({ db, HttpsError });

(async () => {
  const id = `tour_${Date.now()}_${'a'.repeat(32)}`;
  const ref = db.collection('tournaments').doc(id);
  const summary = db.collection('tournaments_summary').doc(id);
  const root = {
    id, creatorUid: OWNER_UID, isPublic: false, organizerOnly: true, status: 'open',
    canonicalRegistrationMigration: { fingerprint: 'native:test', registrationCount: 144 },
    categoryDefinitions: [{ id: 'diamante' }, { id: 'ouro' }, { id: 'prata' }],
    participants: [], matches: [], rounds: [], groups: [], updatedAt: 'before-rehearsal'
  };
  await ref.set(root);
  await summary.set({ tournamentId: id, label: 'pré ensaio' });
  const categories = Array.from({ length: 144 }, (_, i) => i < 32 ? 'diamante' : i < 96 ? 'ouro' : 'prata');
  for (let i = 0; i < 144; i += 400) {
    const batch = db.batch();
    categories.slice(i, i + 400).forEach((categoryId, offset) => {
      const number = i + offset + 1;
      batch.set(ref.collection('registrations').doc(`r${number}`), {
        registrationId: `r${number}`, participantKind: 'manual', participantUid: null,
        categoryId, enrollSeq: number, name: `Jogador ${number}`
      });
    });
    await batch.commit();
  }
  await ref.collection('history').doc('preexisting').set({ action: 'configured' });
  const request = (uid = OWNER_UID) => ({ auth: { uid }, data: { tournamentId: id } });
  await assert.rejects(service.activate(request('stranger')), error => error.code === 'permission-denied');
  const activated = await service.activate(request());
  assert.equal(activated.ok, true);
  assert.equal(activated.count, 144);
  const baseline = (await db.collection('tournamentRehearsalBaselines').doc(id).get()).data();
  assert.equal(baseline.hash, fingerprint({ root, tree: baseline.tree, summary: { tournamentId: id, label: 'pré ensaio' } }));
  await ref.update({ matches: [{ id: 'm1', score: '6x4', wo: true }], status: 'running' });
  await ref.collection('history').doc('score').set({ action: 'score', score: '6x4' });
  await ref.collection('matches').doc('m1').set({ winner: 'a', wo: true });
  await ref.collection('inscritos').doc('mirror').set({ score: '6x4', wo: true });
  await ref.collection('grupos').doc('mirror').set({ draw: true });
  await ref.collection('woLog').doc('mirror').set({ matchId: 'm1' });
  await ref.collection('resultQueue').doc('pending').set({ score: '6x4' });
  await ref.collection('matches').doc('m1').collection('events').doc('called').set({ at: 10 });
  await summary.set({ tournamentId: id, label: 'sorteado' });
  const reset = await service.restore(request());
  assert.equal(reset.ok, true);
  assert.equal(reset.count, 144);
  assert.deepEqual((await ref.get()).data(), root);
  assert.deepEqual((await summary.get()).data(), { tournamentId: id, label: 'pré ensaio' });
  assert.equal((await ref.collection('registrations').get()).size, 144);
  assert.deepEqual((await ref.collection('history').get()).docs.map(doc => doc.id), ['preexisting']);
  assert.equal((await ref.collection('matches').get()).empty, true);
  assert.equal((await ref.collection('inscritos').get()).empty, true);
  assert.equal((await ref.collection('grupos').get()).empty, true);
  assert.equal((await ref.collection('woLog').get()).empty, true);
  assert.equal((await ref.collection('resultQueue').get()).empty, true);
  assert.equal((await ref.collection('matches').doc('m1').collection('events').get()).empty, true);
  await assert.rejects(service.restore(request()), error => error.code === 'failed-precondition');
  // A final activation check can fail after the full baseline was saved.
  // This state must remain recoverable from the same restore action.
  const retry = await service.activate(request());
  await db.collection('tournamentRehearsalBaselines').doc(id).update({ state: 'capturing', step: 'verification-failed' });
  await ref.update({ rehearsal: { state: 'capturing', step: 'verification-failed', epoch: retry.epoch, hash: retry.hash } });
  await ref.collection('matches').doc('after-failed-capture').set({ score: '6x4' });
  const protectedBaseline = (await db.collection('tournamentRehearsalBaselines').doc(id).get()).data();
  await assert.rejects(service.activate(request()), error => error.code === 'failed-precondition');
  assert.deepEqual((await db.collection('tournamentRehearsalBaselines').doc(id).get()).data(), protectedBaseline);
  const recovered = await service.restore(request());
  assert.equal(recovered.ok, true);
  assert.deepEqual((await ref.get()).data(), root);
  assert.equal((await ref.collection('matches').get()).empty, true);
  // Force more than one write batch, including nested documents.
  // Throw after Firestore commits a batch to emulate the function dying before
  // it can acknowledge progress. The same callable must safely resume.
  await ref.collection('fixture').doc('root').set({ before: true });
  for (let i = 0; i < 420; i += 400) {
    const batch = db.batch();
    for (let j = i; j < Math.min(i + 400, 420); j++) {
      batch.set(ref.collection('fixture').doc('root').collection('slots').doc(String(j).padStart(3, '0')), { number: j });
    }
    await batch.commit();
  }
  function interruptedService(failOnBatch) {
    let count = 0;
    const faultDb = new Proxy(db, { get(target, property) {
      if (property === 'batch') return () => {
        const batch = target.batch();
        const commit = batch.commit.bind(batch);
        batch.commit = async () => {
          const result = await commit();
          if (++count === failOnBatch) throw new Error('interrupção simulada após commit');
          return result;
        };
        return batch;
      };
      const value = target[property];
      return typeof value === 'function' ? value.bind(target) : value;
    }});
    return makeService({ db: faultDb, HttpsError });
  }
  const expectedTree = (await service.activate(request()),
    (await db.collection('tournamentRehearsalBaselines').doc(id).get()).data().tree);
  assert.ok(expectedTree.length > 400);
  await ref.collection('matches').doc('temporary').set({ score: '6x4' });
  await assert.rejects(interruptedService(1).restore(request()), /interrupção simulada/);
  assert.equal((await ref.get()).data().rehearsal.state, 'resetting');
  assert.equal((await ref.collection('registrations').get()).size, 144);
  assert.ok((await ref.collection('matches').doc('temporary').get()).exists);
  assert.equal((await service.restore(request())).ok, true);
  assert.deepEqual((await ref.get()).data(), root);
  assert.equal((await ref.collection('fixture').doc('root').collection('slots').get()).size, 420);
  assert.equal((await ref.collection('matches').get()).empty, true);

  await service.activate(request());
  await ref.collection('matches').doc('temporary').set({ wo: true });
  // Two write batches, then the extras deletion. No original registration is
  // ever removed, even when the process stops after that deletion commits.
  await assert.rejects(interruptedService(3).restore(request()), /interrupção simulada/);
  assert.equal((await ref.get()).data().rehearsal.state, 'resetting');
  assert.equal((await ref.collection('registrations').get()).size, 144);
  assert.equal((await service.restore(request())).ok, true);
  assert.deepEqual((await ref.get()).data(), root);
  assert.equal((await ref.collection('fixture').doc('root').collection('slots').get()).size, 420);
  assert.equal((await ref.collection('matches').get()).empty, true);
  console.log('ensaio real: 144 inscrições intactas; reset completo e retomada após interrupções na exclusão e na gravação');
  await admin.app().delete();
})().catch(error => { console.error(error); process.exitCode = 1; });
