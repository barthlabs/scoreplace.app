'use strict';

const assert = require('node:assert/strict');
const admin = require('../functions/node_modules/firebase-admin');
const core = require('../scripts/aplicar-historico-e05-core.js');
const cli = require('../scripts/aplicar-historico-e05.js');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('teste exige Firestore Emulator');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
let seq = 0;

async function fixture() {
  const tag = 'e05-history-' + process.pid + '-' + (++seq);
  const tid = tag + '-tour', missing = tag + '-missing';
  const root = db.collection('tournaments').doc(tid);
  const physical = root.collection('matches').doc('m');
  const a = db.collection('users').doc(tag + '-a').collection('matchHistory');
  const b = db.collection('users').doc(tag + '-b').collection('matchHistory');
  await root.set({ name: 'Torneio' });
  await physical.set({ _chave: 'm', playerUids: [tag + '-a', tag + '-b'],
    jogo: { id: 'm', p1: 'A', p2: 'B', team1Uids: [tag + '-a'],
      team2Uids: [tag + '-b'], scoreP1: 6, scoreP2: 4 } });
  await a.doc('t_' + tid + '_m').set({ matchType: 'tournament', tournamentId: tid,
    matchId: 't_' + tid + '_m', scoreSummary: '6-4' });
  await b.doc('unusual_m').set({ matchType: 'tournament', tournamentId: tid,
    matchId: 'unusual_m', players: [{ uid: tag + '-b', team: 2 }], scoreSummary: '6-4' });
  await a.doc('casual').set({ matchType: 'casual', scoreSummary: '2-1' });
  await b.doc('orphan').set({ matchType: 'tournament', tournamentId: missing,
    matchId: 't_' + missing + '_m', scoreSummary: '3-2' });
  return { root, physical, a, b, tid, missing };
}

async function cleanup(item) {
  for (const col of [item.a, item.b]) for (const doc of (await col.get()).docs) await doc.ref.delete();
  await item.physical.delete();
  await item.root.delete();
}

(async () => {
  const one = await fixture();
  try {
    const docs = await cli.capture(db);
    const plan = core.makePlan(docs);
    const coverage = await cli.verifyCoverage(db, docs);
    assert.equal(plan.count, 3);
    assert.equal(coverage.linkedDocs, 2);
    assert.equal(coverage.orphanDocs, 1);
    assert.equal(coverage.nonCanonical, 1);
    assert.deepEqual(coverage.orphanRoots, [one.missing]);
    await core.applyPlan(db, plan, coverage);
    assert.equal((await one.a.doc('casual').get()).exists, true);
    assert.equal((await one.a.doc('t_' + one.tid + '_m').get()).exists, false);
    assert.equal((await one.b.doc('unusual_m').get()).exists, false);
    assert.equal((await one.b.doc('orphan').get()).exists, false);
    assert.equal((await one.physical.get()).data().jogo.scoreP1, 6);
  } finally { await cleanup(one); }

  const two = await fixture();
  try {
    const docs = await cli.capture(db);
    const plan = core.makePlan(docs);
    const coverage = await cli.verifyCoverage(db, docs);
    await two.physical.update({ 'jogo.scoreP1': 7 });
    await assert.rejects(core.applyPlan(db, plan, coverage), /CAS: jogo físico mudou/);
    assert.equal((await two.a.doc('t_' + two.tid + '_m').get()).exists, true);
    assert.equal((await two.b.doc('orphan').get()).exists, true);
  } finally { await cleanup(two); }

  const three = await fixture();
  try {
    const docs = await cli.capture(db);
    const plan = core.makePlan(docs);
    const coverage = await cli.verifyCoverage(db, docs);
    await db.collection('tournaments').doc(three.missing).set({ name: 'Reapareceu' });
    await assert.rejects(core.applyPlan(db, plan, coverage), /CAS: torneio de teste reapareceu/);
    assert.equal((await three.b.doc('orphan').get()).exists, true);
  } finally {
    await db.collection('tournaments').doc(three.missing).delete();
    await cleanup(three);
  }

  const bulkUser = db.collection('users').doc('e05-history-bulk-' + process.pid);
  const bulk = db.batch();
  for (let i = 0; i < 418; i++) bulk.set(bulkUser.collection('matchHistory').doc('t_bulk_' + i),
    { matchType: 'tournament', tournamentId: 'bulk', matchId: 't_bulk_' + i });
  await bulk.commit();
  try {
    const plan = core.makePlan(await cli.capture(db));
    assert.equal(plan.count, 418);
    await core.applyPlan(db, plan, { physical: [], orphanRoots: [] });
    assert.equal((await bulkUser.collection('matchHistory').get()).size, 0);
  } finally {
    for (const doc of (await bulkUser.collection('matchHistory').get()).docs) await doc.ref.delete();
  }

  console.log('✅ E05: histórico 418/418 atômico; casual/placar preservados e CAS recusa corridas');
})().catch(error => { console.error(error); process.exitCode = 1; });
