'use strict';
/*
 * ESTADO OPERACIONAL ENTRE DOIS APARELHOS, NO FIRESTORE EMULATOR
 *
 * Não prova um mock: abre duas instâncias independentes do SDK, corta a rede de
 * uma delas e muda elenco + W.O. + jogo na outra. A cliente isolada pode receber
 * cache, mas a porta de frescor não o aplica; ao reconectar, ela só aceita o
 * snapshot remoto completo. Rode por `npm run test:realtime`.
 */
const assert = require('assert/strict');
const path = require('path');
const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');
const Freshness = require(path.join(__dirname, '..', 'js/domain/realtime-freshness.js'));

const hostPort = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const HOST = hostPort[0], PORT = Number(hostPort[1]);
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-scoreplace';
const suffix = String(Date.now()) + '-' + process.pid;
function client(name) {
  const app = firebase.initializeApp({ projectId: PROJECT }, name + '-' + suffix);
  const db = app.firestore();
  db.useEmulator(HOST, PORT);
  return { app, db };
}
function waitFor(predicate, label, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    (function poll() {
      try { if (predicate()) return resolve(); } catch (e) { return reject(e); }
      if (Date.now() - started > timeout) return reject(new Error('tempo esgotado: ' + label));
      setTimeout(poll, 25);
    })();
  });
}

(async () => {
  const A = client('realtime-escritor');
  const B = client('realtime-leitor');
  const id = 'rt-' + suffix;
  const refA = A.db.collection('tournaments').doc(id);
  const refB = B.db.collection('tournaments').doc(id);
  const applied = [];
  const raw = [];
  let unsubscribe = null;
  try {
    await refA.set({
      revision: 1,
      participants: [{ uid: 'angel', displayName: 'Angel Bueno', ligaActive: true }],
      standbyParticipants: [{ uid: 'nathalya', displayName: 'Nathalya Calil', ligaActive: false }],
      woParticipants: [],
      matches: [{ id: '120', p1: 'Angel Bueno / Luigi Perri', p2: 'Andreya / Ana', winner: null }],
    });
    await refB.get(Freshness.serverReadOptions());

    unsubscribe = refB.onSnapshot(Freshness.listenerOptions(), (snapshot) => {
      raw.push({ fromCache: !!(snapshot.metadata && snapshot.metadata.fromCache), revision: snapshot.exists ? snapshot.data().revision : null });
      if (!Freshness.isRemoteSnapshot(snapshot) || !snapshot.exists) return;
      applied.push(snapshot.data());
    });
    await waitFor(() => applied.length === 1 && applied[0].revision === 1, 'primeiro snapshot remoto');
    assert.equal(applied[0].participants[0].displayName, 'Angel Bueno');

    await B.db.disableNetwork();
    await waitFor(() => raw.some((event) => event.fromCache === true), 'marca de cache ao cortar rede');
    const beforeDisconnect = applied.length;

    await refA.update({
      revision: 2,
      participants: [{ uid: 'nathalya', displayName: 'Nathalya Calil', ligaActive: true }],
      standbyParticipants: [],
      woParticipants: [{ uid: 'angel', displayName: 'Angel Bueno', formerMatchId: '120' }],
      matches: [{ id: '120', p1: 'Nathalya Calil / Luigi Perri', p2: 'Andreya / Ana', winner: null }],
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(applied.length, beforeDisconnect,
      'cliente desconectada não aplica cache como se fosse a mudança remota');

    await B.db.enableNetwork();
    await waitFor(() => applied.some((state) => state.revision === 2), 'eco remoto após reconexão');
    const current = applied[applied.length - 1];
    assert.equal(current.participants[0].displayName, 'Nathalya Calil');
    assert.equal(current.standbyParticipants.length, 0);
    assert.equal(current.woParticipants[0].displayName, 'Angel Bueno');
    assert.equal(current.woParticipants[0].formerMatchId, '120');
    assert.match(current.matches[0].p1, /Nathalya Calil/);
    assert.ok(raw.some((event) => !event.fromCache && event.revision === 2),
      'a revisão nova chegou em snapshot confirmado pelo servidor');

    console.log('✅ tempo real em dois clientes: cache recusado, reconexão trouxe W.O., elenco e jogo atuais');
  } finally {
    if (unsubscribe) unsubscribe();
    try { await A.app.delete(); } catch (e) {}
    try { await B.app.delete(); } catch (e) {}
  }
})().catch((error) => {
  console.error('❌ tempo real em dois clientes:', error && error.stack || error);
  process.exit(1);
});
