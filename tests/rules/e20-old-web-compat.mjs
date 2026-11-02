import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc } from 'firebase/firestore';

// A versão web antiga ainda pode abrir a raiz e os jogos físicos. Resultados
// diretos foram retirados; o histórico atual passa pela Function paginada.
const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
assert.equal(host, '127.0.0.1');
const env = await initializeTestEnvironment({ projectId: 'demo-scoreplace',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) } });
const dbFor = (uid) => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();

try {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [id, props] of [
      ['public-old-web', { isPublic: true }],
      ['private-old-web', { isPublic: false, organizerOnly: true }]
    ]) {
      await setDoc(doc(db, 'tournaments', id), {
        id, creatorUid: 'e20-org', adminUids: ['e20-org'], memberUids: ['e20-member'],
        membersOnly: false, isSandbox: false, ...props
      });
      await setDoc(doc(db, 'tournaments', id, 'matches', 'm1'), {
        _loc: { tipo: 'matches', mi: 0 }, jogo: { id: 'm1', scoreP1: 6, scoreP2: 1 }
      });
      // E01 retira o índice de UIDs no mesmo commit em que oculta o torneio.
      await setDoc(doc(db, 'tournaments', id, 'results', 'm1'), {
        matchId: 'm1', playerUids: id === 'public-old-web' ? ['e20-member'] : [],
        updatedAt: '2026-11-01T00:00:00.000Z',
        scoreP1: 6, scoreP2: 1
      });
    }
  });
  for (const uid of [null, 'e20-member', 'e20-org']) {
    const db = dbFor(uid);
    await assertSucceeds(getDoc(doc(db, 'tournaments', 'public-old-web')));
    await assertSucceeds(getDocs(collection(db, 'tournaments', 'public-old-web', 'matches')));
    await assertFails(getDocs(query(collection(db, 'tournaments', 'public-old-web', 'results'),
      orderBy('updatedAt', 'desc'), limit(1))));
    await assertFails(getDoc(doc(db, 'tournaments', 'public-old-web', 'results', 'm1')));
  }
  const org = dbFor('e20-org');
  await assertSucceeds(getDoc(doc(org, 'tournaments', 'private-old-web')));
  await assertSucceeds(getDocs(collection(org, 'tournaments', 'private-old-web', 'matches')));
  await assertFails(getDocs(collection(org, 'tournaments', 'private-old-web', 'results')));
  await assertFails(getDoc(doc(dbFor('e20-member'), 'tournaments', 'private-old-web')));
  await assertFails(getDoc(doc(dbFor('e20-member'), 'tournaments', 'private-old-web', 'results', 'm1')));
  console.log('✅ E26: raiz e matches legíveis; results antigos fechados');
} finally { await env.cleanup(); }
