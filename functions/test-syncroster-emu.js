'use strict';
// E05: o gatilho da raiz mantém o roster e o W.O. físico sem projetar results.
// Roda no projeto demo pelos emuladores de Functions, Firestore e Auth.
const assert = require('node:assert/strict');
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(read, predicate, label) {
  for (let i = 0; i < 40; i++) {
    const value = await read();
    if (predicate(value)) return value;
    await sleep(250);
  }
  throw new Error('gatilho não concluiu: ' + label);
}

(async () => {
  const ref = db.doc('tournaments/sync-root-e05');
  const physical = ref.collection('matches').doc('future');
  const historical = ref.collection('matches').doc('historical');
  const result = ref.collection('results').doc('future');
  const side = { id: 'future', label: 'R1 Grupo A • Jogo 1', roundIndex: 0,
    p1: 'Ana / Bia', p2: 'Caio / Dani', team1: ['Ana', 'Bia'], team2: ['Caio', 'Dani'],
    team1Uids: ['a', 'b'], team2Uids: ['c', 'd'], scoreP1: null, scoreP2: null };
  await ref.set({ name: 'Teste E05', participants: [{ uid: 'a', displayName: 'Ana' },
    { uid: 'b', displayName: 'Bia' }], woLog: [],
    _nPartes: { participants: 2, matches: 2 }, _nJogos: 2 });
  await until(async () => (await ref.collection('participants').doc('a').get()).data(),
    (value) => value && value.status === 'enrolled', 'espelho de elenco');
  await ref.collection('inscritos').doc('ua').set({ _k: 'ua', _idx: 0,
    item: { uid: 'a', ligaActive: true, enrollSeq: 1 } });
  await ref.collection('inscritos').doc('ub').set({ _k: 'ub', _idx: 1,
    item: { uid: 'b', ligaActive: true, enrollSeq: 2 } });
  await physical.set({ _chave: 'future', _loc: { tipo: 'rounds', ri: 0, mi: 0 },
    jogo: side, playerUids: ['a', 'b', 'c', 'd'] });
  await historical.set({ _chave: 'historical', _loc: { tipo: 'rounds', ri: 0, mi: 1 },
    jogo: { ...side, id: 'historical', label: 'R1 Grupo A • Jogo 2', scoreP1: 6, scoreP2: 3,
      winner: 'p1' }, playerUids: ['a', 'b', 'c', 'd'] });
  const historicalBefore = (await historical.get()).data();
  await result.set({ matchId: 'future', p1: 'Ana / Bia', scoreP1: 0,
    playerUids: ['a', 'b', 'c', 'd'] });
  const resultBefore = (await result.get()).data();
  await ref.update({ name: 'Teste E05 renomeado', woLog: [{ id: 'wo-e05', status: 'active',
    roundIndex: 0, groupName: 'R1 Grupo A', absentName: 'Bia', absentUid: 'b',
    subName: 'Reserva', subUid: 'r' }] });
  const updated = await until(async () => (await physical.get()).data(),
    (value) => value && value.jogo.p1 === 'Ana / Reserva', 'W.O. no jogo físico');
  assert.deepEqual(updated.jogo.team1Uids, ['a', 'r']);
  assert.deepEqual(updated.playerUids, ['a', 'r', 'c', 'd']);
  assert.equal(updated.jogo.scoreP1, null);
  const substitute = await until(async () => (await ref.collection('inscritos').doc('ur').get()).data(),
    (value) => value && value.item && value.item.uid === 'r', 'substituto em inscritos');
  assert.equal(substitute.item.ligaActive, true);
  const absent = await until(async () => (await ref.collection('inscritos').doc('ub').get()).data(),
    (value) => value && value.item && value.item.ligaActive === false, 'ausente desativada');
  assert.equal(absent.item.uid, 'b');
  assert.deepEqual((await historical.get()).data(), historicalBefore,
    'jogo concluído e placar não mudam');
  assert.deepEqual((await result.get()).data(), resultBefore,
    'gatilho da raiz não regrava espelho histórico');
  assert.equal((await ref.collection('results').get()).size, 1,
    'gatilho não cria espelho para jogo físico');
  console.log('✓ E05 syncMatchRosters: roster e W.O. físicos; results intactos');
  process.exit(0);
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
