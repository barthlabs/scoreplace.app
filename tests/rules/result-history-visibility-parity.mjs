import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
assert.equal(host, '127.0.0.1');
assert.equal(Number(port), 8134);
const env = await initializeTestEnvironment({ projectId: 'demo-scoreplace',
  firestore: { rules: readFileSync(process.env.SP_RESULT_PARITY_RULES, 'utf8'),
    host, port: Number(port) } });

try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'tournaments', 'public'), {
      creatorUid: 'owner', isPublic: true, memberUids: ['member']
    });
    await setDoc(doc(db, 'tournaments', 'public', 'matches', 'm1'), {
      jogo: { id: 'm1', scoreP1: 6, scoreP2: 4 }, playerUids: ['member']
    });
    await setDoc(doc(db, 'tournaments', 'public', 'results', 'm1'), {
      matchId: 'm1', playerUids: ['owner', 'member']
    });
    await setDoc(doc(db, 'sandboxes', 'sb_old'), {
      sandboxOwnerUid: 'owner', creatorUid: 'owner', isSandbox: true
    });
    await setDoc(doc(db, 'sandboxes', 'sb_old', 'resultsSandbox', 'm1'), {
      matchId: 'm1', playerUids: ['owner', 'member']
    });
  });

  for (const caller of [null, 'owner', 'member', 'stranger']) {
    const db = caller == null ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(caller).firestore();
    const forbidden = [
      () => getDoc(doc(db, 'tournaments', 'public', 'results', 'm1')),
      () => getDocs(collection(db, 'tournaments', 'public', 'results')),
      () => getDocs(query(collectionGroup(db, 'results'), where('playerUids', 'array-contains', 'member'))),
      () => getDoc(doc(db, 'sandboxes', 'sb_old', 'resultsSandbox', 'm1')),
      () => getDocs(collection(db, 'sandboxes', 'sb_old', 'resultsSandbox')),
      () => setDoc(doc(db, 'tournaments', 'public', 'results', 'new'), { playerUids: [caller] }),
      () => setDoc(doc(db, 'tournaments', 'public', 'results', 'm1'), { scoreP1: 7 }, { merge: true }),
      () => deleteDoc(doc(db, 'tournaments', 'public', 'results', 'm1')),
      () => setDoc(doc(db, 'sandboxes', 'sb_old', 'resultsSandbox', 'new'), { scoreP1: 7 }),
    ];
    for (const operation of forbidden) {
      const error = await assertFails(operation());
      assert.equal(error.code, 'permission-denied', String(caller));
    }
    if (caller === 'owner' || caller === 'member') {
      await assertSucceeds(getDoc(doc(db, 'tournaments', 'public', 'matches', 'm1')));
    }
  }
  console.log('RESULTS: 36 negativas GET/LIST/group/write; matches físico preservado');
} finally {
  await env.cleanup();
}
