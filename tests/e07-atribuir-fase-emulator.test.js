'use strict';

const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const { stable } = require('../scripts/backup-torneio-operacional-core.js');
const core = require('../scripts/atribuir-fase-e07-core.js');
const runner = require('../scripts/atribuir-fase-e07.js');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('teste requer emulador Firestore');
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();

async function seed() {
  for (let i = 0; i < 2; i++) {
    const root = db.collection('tournaments').doc('e07-' + i);
    await root.set({ name: core.TARGET_NAMES[i], phases: [{ name: 'Fase 1' }], _nPartes: { matches: 7 } });
    for (let n = 0; n < 7; n++) {
      await root.collection('matches').doc('m' + n).set({
        _loc: { tipo: 'matches', mi: n }, jogo: { id: 'm' + n, scoreP1: n + 1, scoreP2: 6 - n }
      });
    }
    for (let n = 0; n < (i ? 19 : 8); n++) {
      await root.collection('results').doc('r' + n).set({ matchId: 'm' + (n % 7), scoreP1: n, winner: 'a' });
    }
  }
}

async function snapshotPlan() {
  const before = await runner.readTargets(db);
  const backups = before.map(({ root, matches, results }, i) => ({
    hash: 'b'.repeat(64 - i) + (i ? 'a' : ''),
    data: {
      project: 'scoreplace-app', tournamentId: root.id,
      tournament: { updateTime: stable(root.updateTime), data: stable(root.data()) },
      subcollections: {
        matches: matches.map(doc => ({ id: doc.id, data: stable(doc.data()) })),
        results: results.map(doc => ({ id: doc.id, data: stable(doc.data()) }))
      }
    }
  }));
  core.validate(before, backups.map(x => x.data));
  return { before, backups, plan: core.manifest(before, backups.map(x => x.hash)) };
}

async function reset() {
  for (let i = 0; i < 2; i++) {
    const root = db.collection('tournaments').doc('e07-' + i);
    for (const name of ['matches', 'results']) {
      const docs = await root.collection(name).get();
      for (const doc of docs.docs) await doc.ref.delete();
    }
    await root.delete();
  }
}

(async () => {
  await seed();
  try {
    let state = await snapshotPlan();
    await assert.rejects(runner.applyVerified(db, { ...state.plan, digest: '0'.repeat(64) }, state.backups), /prévia obsoleta/);
    assert.equal((await db.doc('tournaments/e07-0/matches/m0').get()).data()._phaseIndex, undefined);

    await db.doc('tournaments/e07-0/results/r0').update({ jogo: { id: 'm0' } });
    await assert.rejects(runner.applyVerified(db, state.plan, state.backups), /resultado divergente/);
    await db.doc('tournaments/e07-0/results/r0').update({ jogo: admin.firestore.FieldValue.delete() });

    state = await snapshotPlan();
    await db.doc('tournaments/e07-0/results/r0').update({ phaseIndex: 0 });
    await assert.rejects(runner.applyVerified(db, state.plan, state.backups), /resultado divergente/);
    await db.doc('tournaments/e07-0/results/r0').update({ phaseIndex: admin.firestore.FieldValue.delete() });

    state = await snapshotPlan();
    await db.doc('tournaments/e07-0/matches/m1').update({ 'jogo.scoreP1': 99 });
    await assert.rejects(runner.applyVerified(db, state.plan, state.backups), /jogo divergente/);
    assert.equal((await db.doc('tournaments/e07-1/matches/m0').get()).data()._phaseIndex, undefined);
    await db.doc('tournaments/e07-0/matches/m1').update({ 'jogo.scoreP1': 2 });

    state = await snapshotPlan();
    await db.doc('tournaments/e07-1').update({ extra: true });
    await assert.rejects(runner.applyVerified(db, state.plan, state.backups), /raiz divergente/);
    await db.doc('tournaments/e07-1').update({ extra: admin.firestore.FieldValue.delete() });

    state = await snapshotPlan();
    await db.doc('tournaments/e07-1/matches/extra').set({ _loc: { tipo: 'matches', mi: 7 }, jogo: { id: 'extra' } });
    await assert.rejects(runner.applyVerified(db, state.plan, state.backups), /contagem de documentos mudou/);
    await db.doc('tournaments/e07-1/matches/extra').delete();

    state = await snapshotPlan();
    await db.collection('tournaments').doc('e07-duplicado').set({ name: core.TARGET_NAMES[0] });
    await assert.rejects(runner.applyVerified(db, state.plan, state.backups), /nome de torneio ausente ou duplicado/);
    await db.collection('tournaments').doc('e07-duplicado').delete();

    state = await snapshotPlan();
    const applied = await runner.applyVerified(db, state.plan, state.backups);
    assert.equal(applied.matchesUpdated, 14);
    assert.equal(applied.resultsPreserved, 27);
    await assert.rejects(runner.applyVerified(db, state.plan, state.backups), /jogo divergente ou já atribuído/);
    const first = (await db.doc('tournaments/e07-0/matches/m0').get()).data();
    assert.equal(first.jogo.scoreP1, 1);
    assert.equal(first.jogo.scoreP2, 6);
    assert.equal(first.jogo.phaseIndex, 0);
    assert.equal(first._phaseIndex, 0);
    console.log('E07 emulator: 14 jogos, 27 resultados, CAS e reexecução OK');
  } finally { await reset(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
