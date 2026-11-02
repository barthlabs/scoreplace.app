'use strict';
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
const split = require('./vendor/tournament-split-core');
const visibilityFence = require('./vendor/result-visibility-fence-core');
const mirrorQueue = require('../functions/mirror-reconcile-queue-core');
const mainAdmin = require('../functions/node_modules/firebase-admin');
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const uid = 'e01-owner';
const base = 'http://127.0.0.1:' + (process.env.FUNCTIONS_EMULATOR_PORT || '5001') +
  '/demo-scoreplace/us-central1/updateTournamentConfiguration';
const authUrl = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099') +
  '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';

async function token() {
  await admin.auth().createUser({ uid, email: 'e01-owner@test.local', password: 'senha-de-teste-123' });
  const response = await fetch(authUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'e01-owner@test.local', password: 'senha-de-teste-123', returnSecureToken: true }) });
  const body = await response.json();
  assert(body.idToken, JSON.stringify(body));
  return body.idToken;
}
async function change(id, auth, patch) {
  const response = await fetch(base, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + auth },
    body: JSON.stringify({ data: { tournamentId: id, patch } }) });
  return { status: response.status, body: await response.json() };
}
async function fixture(id, count, withMatch = true, extraMatches = 0) {
  const ref = db.collection('tournaments').doc(id);
  const full = { id, name: 'Fixture E01', creatorUid: uid, adminUids: [uid], memberUids: [uid],
    isPublic: true, membersOnly: false, organizerOnly: false, status: 'open',
    participants: [], history: [], matches: withMatch ? [{ id: 'm', p1: 'Ana', p2: 'Bia', p1Uid: 'ana', p2Uid: 'bia', round: 1 }] : [] };
  for (let i = 0; i < extraMatches; i++) full.matches.push({ id: 'extra-' + i,
    p1: 'Pessoa ' + i, p2: 'Outra ' + i, p1Uid: 'person-' + i, p2Uid: 'other-' + i, round: 1 });
  const parts = split.dividir(full, split.partesDe(full));
  await ref.set(parts.config);
  let partBatch = db.batch(), partCount = 0;
  for (const part of split.partesDe(full)) {
    const collection = split.colecaoDaParte(part);
    for (const record of parts[part] || []) {
      partBatch.set(ref.collection(collection).doc(split.chaveDoRegistro(record)), record);
      if (++partCount % 300 === 0) { await partBatch.commit(); partBatch = db.batch(); }
    }
  }
  if (partCount % 300) await partBatch.commit();
  let batch = db.batch();
  for (let i = 0; i < count; i++) {
    const resultId = i === 0 && withMatch ? 'm' : 'result-' + i;
    batch.set(ref.collection('results').doc(resultId), { playerUids: ['ana'], score: [6, 3], replay: { marker: 'keep' } });
    if (i % 300 === 299 || i === count - 1) { await batch.commit(); batch = db.batch(); }
  }
  return ref;
}
(async () => {
  const auth = await token();
  const ref = await fixture('e01-one', 1);
  const hide = await change(ref.id, auth, { isPublic: false, membersOnly: false, organizerOnly: true });
  assert.equal(hide.status, 200, JSON.stringify(hide));
  assert.equal((await ref.get()).data().organizerOnly, true);
  const hiddenResult = (await ref.collection('results').doc('m').get()).data();
  assert.equal(hiddenResult.playerUids, undefined);
  assert.deepEqual(hiddenResult.score, [6, 3]);
  assert.deepEqual(hiddenResult.replay, { marker: 'keep' });
  const release = await change(ref.id, auth, { isPublic: true, membersOnly: false, organizerOnly: false });
  assert.equal(release.status, 200, JSON.stringify(release));
  assert.deepEqual((await ref.collection('results').doc('m').get()).data().playerUids, ['ana', 'bia']);
  console.log('✓ E01: hide/release atômicos preservam placar e replay no emulador');

  const orphan = await fixture('e01-orphan', 1, false);
  const hideOrphan = await change(orphan.id, auth, { isPublic: false, membersOnly: false, organizerOnly: true });
  assert.equal(hideOrphan.status, 200, JSON.stringify(hideOrphan));
  assert.equal((await orphan.collection('results').doc('result-0').get()).data().playerUids, undefined);
  const releaseOrphan = await change(orphan.id, auth, { isPublic: true, membersOnly: false, organizerOnly: false });
  assert.notEqual(releaseOrphan.status, 200);
  assert.match(String(releaseOrphan.body.error && releaseOrphan.body.error.message), /sem jogo comprovado.*contate o suporte/);
  assert.equal((await orphan.get()).data().organizerOnly, true);
  console.log('✓ E01: órfão perde índice ao ocultar e impede liberação sem prova');

  const empty = await fixture('e01-empty', 0, false);
  assert.equal((await change(empty.id, auth, { isPublic: false, membersOnly: false, organizerOnly: true })).status, 200);
  assert.equal((await change(empty.id, auth, { isPublic: true, membersOnly: false, organizerOnly: false })).status, 200);
  console.log('✓ E01: zero resultados permite ocultar e liberar');

  const normalLoad = await fixture('e01-213', 213, false);
  const hide213 = await change(normalLoad.id, auth, { isPublic: false, membersOnly: false, organizerOnly: true });
  assert.equal(hide213.status, 200, JSON.stringify(hide213));
  const allHidden = await normalLoad.collection('results').get();
  assert.equal(allHidden.size, 213);
  assert(allHidden.docs.every((doc) => !('playerUids' in doc.data())));
  console.log('✓ E01: 213 resultados limpos no mesmo commit');

  // O teto de leitura da transição é sobre results, não sobre jogos físicos
  // necessários à montagem canônica. Uma chave grande com um só resultado não
  // pode ser recusada como se tivesse 751 espelhos para limpar.
  const manyMatches = await fixture('e01-many-matches', 1, true, 751);
  const hideWithManyMatches = await change(manyMatches.id, auth,
    { isPublic: false, membersOnly: false, organizerOnly: true });
  assert.equal(hideWithManyMatches.status, 200, JSON.stringify(hideWithManyMatches));
  assert.equal((await manyMatches.get()).data().organizerOnly, true);
  assert.equal((await manyMatches.collection('results').doc('m').get()).data().playerUids, undefined);
  console.log('✓ E01: 752 jogos e 1 resultado ocultados sem falso teto de leitura');

  const overflow = await fixture('e01-overflow', 401, false);
  const refused = await change(overflow.id, auth, { isPublic: false, membersOnly: false, organizerOnly: true });
  assert.notEqual(refused.status, 200);
  assert.equal((await overflow.get()).data().organizerOnly, false);
  assert.deepEqual((await overflow.collection('results').doc('result-0').get()).data().playerUids, ['ana']);
  console.log('✓ E01: 401 resultados recusados sem mudança parcial');

  const readOverflow = await fixture('e01-751', 751, false);
  const readRefused = await change(readOverflow.id, auth, { isPublic: false, membersOnly: false, organizerOnly: true });
  assert.notEqual(readRefused.status, 200);
  assert.match(String(readRefused.body.error && readRefused.body.error.message), /mais de 750 resultados.*contate o suporte/);
  assert.equal((await readOverflow.get()).data().organizerOnly, false);
  console.log('✓ E01: 751 resultados recusados pela leitura, sem ocultação parcial');

  // Controle negativo: retrato antigo seguido de lote, sem transação nem fence.
  // Prova o UID exposto nesse fluxo; não simula corrida transacional.
  const racing = await fixture('e01-race', 0);
  const late = racing.collection('results').doc('late');
  const rootBeforeRace = await racing.get();
  const portrait = await racing.collection('results').limit(751).get();
  assert.equal(rootBeforeRace.data().organizerOnly, false);
  assert.equal(portrait.docs.some((doc) => doc.id === 'late'), false);
  assert.equal((await late.get()).exists, false);
  await late.set({ playerUids: ['ana'], replay: { marker: 'admin' } });
  const staleBatch = db.batch();
  staleBatch.update(racing, { isPublic: false, organizerOnly: true });
  for (const doc of portrait.docs) {
    staleBatch.update(doc.ref, { playerUids: admin.firestore.FieldValue.delete() });
  }
  await staleBatch.commit();
  const rootAfterRace = (await racing.get()).data();
  const lateAfterRace = await late.get();
  assert.equal(rootAfterRace.organizerOnly, true);
  assert.deepEqual(lateAfterRace.data().playerUids, ['ana']);
  console.log('✓ E01: controle sem fence reproduz raiz oculta e UID exposto');

  const fenced = await fixture('e01-race-fenced', 0);
  const fencedLate = fenced.collection('results').doc('late');
  let releaseFencedHide;
  let observedFencedRead;
  let observedFencedWriter;
  const fencedRead = new Promise((resolve) => { observedFencedRead = resolve; });
  const fencedWriterStart = new Promise((resolve) => { observedFencedWriter = resolve; });
  const fencedResume = new Promise((resolve) => { releaseFencedHide = resolve; });
  let hideAttempts = 0;
  const fencedHide = db.runTransaction(async (tx) => {
    hideAttempts++;
    await tx.get(fenced);
    await visibilityFence.read(tx, fenced);
    const existing = await tx.get(fenced.collection('results').limit(751));
    if (hideAttempts === 1) { observedFencedRead(); await fencedResume; }
    for (const doc of existing.docs) tx.set(doc.ref, { playerUids: admin.firestore.FieldValue.delete() }, { merge: true });
    visibilityFence.write(tx, fenced, admin.firestore.FieldValue);
    tx.update(fenced, { isPublic: false, organizerOnly: true });
  });
  await fencedRead;
  const fencedWriter = db.runTransaction(async (tx) => {
    observedFencedWriter();
    const root = await tx.get(fenced);
    if (!root.exists || root.data().organizerOnly === true) return 'hidden';
    await visibilityFence.read(tx, fenced);
    const current = await tx.get(fencedLate);
    if (!current.exists) {
      visibilityFence.write(tx, fenced, admin.firestore.FieldValue);
      tx.set(fencedLate, { playerUids: ['ana'], replay: { marker: 'writer' } });
    }
    return 'written';
  });
  await fencedWriterStart;
  releaseFencedHide();
  await Promise.all([fencedHide, fencedWriter]);
  assert.equal((await fenced.get()).data().organizerOnly, true);
  const indexed = await fenced.collection('results').where('playerUids', 'array-contains', 'ana').get();
  assert.equal(indexed.size, 0, 'fence impede UID visível após ocultação');
  assert((await visibilityFence.refFor(fenced).get()).data().revision >= 1);
  console.log('✓ E01: fence inicialmente ausente fecha inserção concorrente');

  const stress = await fixture('e01-fence-stress', 213, false);
  await stress.update({ isPublic: false, organizerOnly: true });
  const queueApp = mainAdmin.initializeApp({ projectId: 'demo-scoreplace' }, 'e01-queue');
  const queueDb = mainAdmin.firestore(queueApp);
  const queueTournament = queueDb.collection('tournaments').doc(stress.id);
  const started = Date.now();
  const replayWriters = Array.from({ length: 8 }, (_, i) => db.runTransaction(async tx => {
    const root = await tx.get(stress);
    assert(root.exists);
    await visibilityFence.read(tx, stress);
    const result = stress.collection('results').doc('result-' + i);
    await tx.get(result);
    visibilityFence.write(tx, stress, admin.firestore.FieldValue);
    tx.update(result, { replay: { marker: 'stress-' + i } });
  }, { maxAttempts: 5 }));
  const ordinaryEdits = Array.from({ length: 4 }, (_, i) => db.runTransaction(async tx => {
    const root = await tx.get(stress);
    assert(root.exists);
    await visibilityFence.read(tx, stress);
    tx.update(stress, { name: 'Fixture E01 ' + i });
  }, { maxAttempts: 5 }));
  await mirrorQueue.enqueueRoot(queueDb, queueTournament, { code: 'ABORTED' });
  const pendingRef = queueTournament.collection('mirrorReconcilePending').doc('root');
  const page = mirrorQueue.recoverPending(queueDb, queueTournament, pendingRef);
  const settled = await Promise.allSettled([...replayWriters, ...ordinaryEdits, page]);
  assert(settled.every((item) => item.status === 'fulfilled'),
    settled.map((item, i) => item.status === 'rejected' ? i + ':' + String(item.reason) : null).filter(Boolean).join('; '));
  for (let i = 0; i < 10; i++) {
    const pending = (await pendingRef.get()).data();
    if (pending && pending.permanent === true) break;
    await mirrorQueue.recoverPending(queueDb, queueTournament, pendingRef);
  }
  assert.equal((await pendingRef.get()).data().status, 'completed');
  const durationMs = Date.now() - started;
  if (durationMs > 30_000) console.warn('⚠ E01: contenção do fence excedeu 30 s: ' + durationMs);
  const remaining = await stress.collection('results').where('playerUids', 'array-contains', 'ana').get();
  assert.equal(remaining.size, 0);
  for (let i = 0; i < 8; i++) {
    const result = (await stress.collection('results').doc('result-' + i).get()).data();
    assert.equal(result.replay.marker, 'stress-' + i);
    assert.deepEqual(result.score, [6, 3]);
  }
  console.log('✓ E01: 8 replays, 4 edições e 213 limpezas concorrentes em ' + durationMs + ' ms');
})().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
