'use strict';

const assert = require('node:assert/strict');
const admin = require('./node_modules/firebase-admin');
const checkpoint = require('./tournament-draw-checkpoint');

const UID = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
admin.initializeApp({ projectId:'demo-scoreplace-draw-checkpoint' });
const db = admin.firestore();
const HttpsError = class extends Error { constructor(code, message) { super(message); this.code = code; } };
const service = checkpoint.makeService({ db, HttpsError });
const id = `tour_checkpoint_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const manifestRef = tournamentId => db.collection('tournamentDrawCheckpoints').doc(tournamentId);
const fixtures = [];
async function deleteRecursively(docRef) {
  for (const collection of await docRef.listCollections()) {
    const snapshot = await collection.get();
    for (const doc of snapshot.docs) await deleteRecursively(doc.ref);
  }
  await docRef.delete().catch(() => {});
}
const seed = async (name) => {
  const tournamentId = `${id}_${name}`;
  const tournamentRef = db.collection('tournaments').doc(tournamentId);
  fixtures.push({ tournamentRef, tournamentId });
  const epoch = checkpoint.prepareDraw({ testModeEnabled:true, preserveDrawOnTestReset:true, isSandbox:false });
  const tournament = {
    id:tournamentId, name, creatorUid:UID, testModeEnabled:true, preserveDrawOnTestReset:true,
    isSandbox:false, isPublic:false, organizerOnly:true, status:'closed', participants:['A','B','C','D'],
    rounds:[{ round:1, matches:['A1 x B1'] }], groups:[{ id:'A1', players:['A','B'] }, { id:'B1', players:['C','D'] }],
    matches:[{ id:'final-1', team1:['A','B'], team2:['C','D'], score:null }],
    drawCheckpoint:{ state:'capturing', epoch, hash:'' }
  };
  await tournamentRef.set(tournament);
  await tournamentRef.collection('matches').doc('final-1').set({ id:'final-1', score:null, called:false });
  await tournamentRef.collection('groups').doc('A1').set({ id:'A1', players:['A','B'] });
  await tournamentRef.collection('groups').doc('A1').collection('participants').doc('a').set({ uid:'A', rank:null });
  await tournamentRef.collection('paymentSecrets').doc('untouched').set({ token:'secret-before' });
  assert.deepEqual((await tournamentRef.listCollections()).map(collection => collection.id).sort(),
    ['groups', 'matches', 'paymentSecrets'], 'fixture creates the expected tournament subcollections');
  assert.equal((await tournamentRef.collection('groups').doc('A1').get()).exists, true, 'group document exists before checkpoint');
  await service.capture(tournamentId, epoch);
  const afterCapture = (await tournamentRef.get()).data();
  assert.equal(checkpoint.marker(afterCapture), 'active');
  return { tournamentId, tournamentRef, epoch, tournament };
};

async function restore(tournamentId) {
  return service.restore({ auth:{ uid:UID }, data:{ tournamentId } });
}

(async () => {
  try {
    // The same reset can be repeated; every run starts at the same post-draw state.
    const normal = await seed('repeatable');
    const checkpointRef = manifestRef(normal.tournamentId).collection('snapshots').doc(normal.epoch).collection('entries');
    for (let run = 0; run < 2; run++) {
      await normal.tournamentRef.update({ status:'active', matches:[{ id:'final-1', score:[6,4] }], rounds:[{ round:1, result:'later' }] });
      await normal.tournamentRef.collection('matches').doc('final-1').update({ score:[6,4], called:true });
      await normal.tournamentRef.collection('matches').doc('created-after-draw').set({ id:'extra', score:[1,0] });
      await normal.tournamentRef.collection('paymentSecrets').doc('untouched').update({ token:`secret-${run}` });
      const result = await restore(normal.tournamentId);
      assert.equal(result.mode, 'testModePostDraw');
      assert.equal(result.hash, (await normal.tournamentRef.get()).data().drawCheckpoint.hash);
      const restored = (await normal.tournamentRef.get()).data();
      assert.equal(restored.status, 'closed');
      assert.deepEqual(restored.groups, normal.tournament.groups);
      assert.deepEqual(restored.matches, normal.tournament.matches);
      assert.equal(checkpoint.marker(restored), 'active');
      assert.deepEqual((await normal.tournamentRef.collection('matches').doc('final-1').get()).data(), { id:'final-1', score:null, called:false });
      assert.equal((await normal.tournamentRef.collection('matches').doc('created-after-draw').get()).exists, false);
      assert.equal((await normal.tournamentRef.collection('groups').doc('A1').collection('participants').doc('a').get()).data().rank, null);
      assert.equal((await normal.tournamentRef.collection('paymentSecrets').doc('untouched').get()).data().token, `secret-${run}`);
    }
    const savedSnapshot = await manifestRef(normal.tournamentId).collection('snapshots').doc(normal.epoch).get();
    const savedPaths = (await checkpointRef.get()).docs.map(doc => doc.data().path).sort();
    assert.equal(savedPaths.length, savedSnapshot.data().count,
      'a fotografia persiste todas as entradas do manifesto e exclui paymentSecrets');
    assert.deepEqual(savedPaths, ['groups/A1', 'groups/A1/participants/a', 'matches/final-1'],
      'a fotografia percorre subcoleções recursivamente e deixa paymentSecrets de fora');

    // If capture was interrupted before its immutable snapshot was written, an orphaned
    // capture marker takes a fresh, locked post-draw snapshot, then restores it.
    const interruptedCapture = await seed('capture-recovery');
    await deleteRecursively(manifestRef(interruptedCapture.tournamentId)
      .collection('snapshots').doc(interruptedCapture.epoch));
    await interruptedCapture.tournamentRef.update({ drawCheckpoint:{ state:'capturing', epoch:interruptedCapture.epoch, hash:'' } });
    await restore(interruptedCapture.tournamentId);
    assert.equal(checkpoint.marker((await interruptedCapture.tournamentRef.get()).data()), 'active');

    // An interrupted restore resumes from the immutable active snapshot.
    const interruptedRestore = await seed('restore-recovery');
    await interruptedRestore.tournamentRef.update({ status:'active', drawCheckpoint:{ state:'resetting', epoch:interruptedRestore.epoch, hash:'' } });
    await interruptedRestore.tournamentRef.collection('matches').doc('final-1').update({ score:[4,6] });
    await restore(interruptedRestore.tournamentId);
    assert.deepEqual((await interruptedRestore.tournamentRef.collection('matches').doc('final-1').get()).data(), { id:'final-1', score:null, called:false });
    assert.equal(checkpoint.marker((await interruptedRestore.tournamentRef.get()).data()), 'active');

    // Corrupt data must never unlock or replace the live tournament.
    const corrupt = await seed('corrupt-snapshot');
    const entries = await manifestRef(corrupt.tournamentId).collection('snapshots').doc(corrupt.epoch).collection('entries').get();
    await entries.docs[0].ref.update({ data:{ corrupted:true } });
    await corrupt.tournamentRef.update({ drawCheckpoint:{ state:'resetting', epoch:corrupt.epoch, hash:'' }, status:'active' });
    await assert.rejects(restore(corrupt.tournamentId), error => error.code === 'data-loss');
    assert.equal(checkpoint.marker((await corrupt.tournamentRef.get()).data()), 'resetting');
    assert.equal((await corrupt.tournamentRef.get()).data().status, 'active', 'falha de hash não sobrescreve dados ao vivo');

    console.log('✅ checkpoint pós-sorteio: reset repetível, recuperação e integridade no Firestore Emulator');
  } finally {
    for (const fixture of fixtures) await deleteRecursively(fixture.tournamentRef);
    for (const fixture of fixtures) await deleteRecursively(manifestRef(fixture.tournamentId));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
