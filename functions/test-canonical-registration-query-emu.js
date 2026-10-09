'use strict';

/* Consulta de uma subcoleção concreta por um único campo é atendida pelo
 * índice ascendente automático do Firestore. Este teste existe para impedir
 * que alguém transforme essa leitura O(k) em scan do torneio, ou adicione um
 * índice composto desnecessário por engano. Roda dentro do emulador.
 *
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/test-canonical-registration-query-emu.js
 */
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'demo-scoreplace';
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST não setado — suba o emulador primeiro.');
  process.exit(2);
}
const assert = require('assert/strict');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = admin.firestore();

(async () => {
  const ref = db.collection('tournaments').doc('canonical-query');
  await ref.set({ id: 'canonical-query' });
  const rows = [
    ['uid:ana', 'cat-a'], ['uid:ana', 'cat-b'], ['uid:bia', 'cat-a'],
  ];
  await Promise.all(rows.map(([participantKey, categoryId], index) =>
    ref.collection('registrations').doc('r' + index).set({ participantKey, categoryId })
  ));
  const own = await ref.collection('registrations').where('participantKey', '==', 'uid:ana').get();
  assert.equal(own.size, 2, 'query de igualdade por participantKey usa o índice automático da subcoleção');
  assert.deepEqual(own.docs.map((doc) => doc.data().categoryId).sort(), ['cat-a', 'cat-b']);
  console.log('✓ query canônica por participantKey executa sem índice composto');
})().then(() => process.exit(0), (error) => { console.error(error); process.exit(1); });
