'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const { stable } = require('../scripts/backup-torneio-operacional-core.js');
const core = require('../scripts/corrigir-ordem-finais-confra-e29-core.js');
const runner = require('../scripts/corrigir-ordem-finais-confra-e29.js');

function fixture() {
  const root = { id: 'e29-fixture', name: core.NAME, _semPesados: ['matches'], _nPartes: { matches: 213 }, _nJogos: 213 };
  const matches = [];
  const results = [];
  for (let i = 1; i <= 204; i++) {
    const id = 'synthetic-' + i;
    const bracket = i <= 202 ? 'gold' : 'silver';
    const third = i === 202 || i === 203;
    const game = { id, _gameNum: i, p1: 'TBD', p2: 'TBD', winner: null,
      bracket, phaseIndex: 1, round: i >= 201 ? 6 : 1, isThirdPlace: third };
    matches.push({ id, data: { _loc: { tipo: 'matches', mi: i - 1 }, jogo: game } });
    results.push({ id, data: { matchId: id, tournamentId: root.id,
      tournamentName: core.NAME, playerUids: [], winner: null } });
  }
  for (let i = 1; i <= 9; i++) {
    const id = 'sit-' + i;
    matches.push({ id, data: { _loc: { tipo: 'matches', mi: 203 + i },
      jogo: { id, isSitOut: true, _gameNum: null } } });
    results.push({ id, data: { matchId: id, tournamentId: root.id } });
  }
  const inscritos = Array.from({ length: 150 }, (_, i) => ({ id: 'enroll-' + i, data: { ordinal: i } }));
  return { root, matches, results, inscritos };
}

const data = fixture();
const before = core.classify(data.root, data.matches, data.results, data.inscritos.length);
assert.deepEqual(before.counts.numbers, { goldThird: 202, goldFinal: 201, silverThird: 203, silverFinal: 204 });
const afterMatches = core.expectedAfter(data.matches, before);
assert.deepEqual(core.classify(data.root, afterMatches, data.results, data.inscritos.length, 'after').counts.numbers,
  { goldThird: 201, goldFinal: 202, silverThird: 203, silverFinal: 204 });
assert.equal(afterMatches.filter((entry, i) => !core.SAME(entry, data.matches[i])).length, 2);
assert.throws(() => core.classify(data.root, data.matches.map((entry, i) => i === 0 ?
  { ...entry, data: { ...entry.data, jogo: { ...entry.data.jogo, _gameNum: 2 } } } : entry),
data.results, 150), /contígua/);
assert.throws(() => core.classify(data.root, data.matches,
  data.results.map((entry, i) => i === 201 ?
    { ...entry, data: { ...entry.data, scoreP1: 6 } } : entry), 150), /já usado/);

async function emulator() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    const repo = path.join(__dirname, '..');
    const child = spawnSync('firebase', ['emulators:exec', '--only', 'firestore',
      '--config', 'firebase.emulator.json', '--project', 'demo-scoreplace',
      'node tests/e29-ordem-confra.test.js'], {
      cwd: repo, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }
    });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.error || child.status !== 0) throw Error('emulador E29 falhou');
    return;
  }
  if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
  const db = admin.firestore();
  const ref = db.collection('tournaments').doc(data.root.id);
  const batches = [db.batch(), db.batch()];
  batches[0].set(ref, data.root);
  for (const [i, entry] of data.matches.entries()) batches[i < 200 ? 0 : 1]
    .set(ref.collection('matches').doc(entry.id), entry.data);
  for (const [i, entry] of data.results.entries()) batches[i < 200 ? 0 : 1]
    .set(ref.collection('results').doc(entry.id), entry.data);
  for (const [i, entry] of data.inscritos.entries()) batches[i < 99 ? 0 : 1]
    .set(ref.collection('inscritos').doc(entry.id), entry.data);
  await batches[0].commit(); await batches[1].commit();
  try {
    const original = await runner.readCurrent(db, data.root.id);
    const backup = { sha256: 'a'.repeat(64), data: {
      tournamentId: data.root.id, tournament: { data: stable(original.root.data()),
        updateTime: stable(original.root.updateTime) },
      subcollections: { matches: original.matches, results: original.results,
        inscritos: original.inscritos } } };
    const classified = runner.assertBefore(original, backup);
    const digest = runner.digestFor(backup, classified);
    const manifest = { digest, backupSha256: backup.sha256,
      tournamentId: data.root.id,
      targetIds: [classified.finals.goldThird.id, classified.finals.goldFinal.id] };
    await assert.rejects(runner.applyVerified(db, backup, '0'.repeat(64), manifest), /digest/);
    const resultRef = ref.collection('results').doc(classified.finals.goldThird.id);
    await resultRef.update({ previewConflict: true });
    await assert.rejects(runner.applyVerified(db, backup, digest, manifest), /obsoleta/);
    assert.equal((await ref.collection('matches').doc(classified.finals.goldThird.id).get()).data().jogo._gameNum, 202);
    await resultRef.update({ previewConflict: admin.firestore.FieldValue.delete() });
    const refreshed = await runner.readCurrent(db, data.root.id);
    const freshBackup = { ...backup, data: { ...backup.data, subcollections: {
      ...backup.data.subcollections, results: refreshed.results } } };
    const freshBefore = runner.assertBefore(refreshed, freshBackup);
    const freshDigest = runner.digestFor(freshBackup, freshBefore);
    const freshManifest = { ...manifest, digest: freshDigest };
    const applied = await runner.applyVerified(db, freshBackup, freshDigest, freshManifest);
    assert.equal(applied.matchesChanged, 2);
    assert.equal(applied.resultsPreserved, 213);
    assert.deepEqual((await runner.audit(db, freshBackup, freshDigest)).after,
      { goldThird: 201, goldFinal: 202, silverThird: 203, silverFinal: 204 });
    await assert.rejects(runner.applyVerified(db, freshBackup, freshDigest, freshManifest), /obsoleta/);
  } finally {
    for (const name of ['matches', 'results', 'inscritos']) {
      const docs = await ref.collection(name).get();
      for (const doc of docs.docs) await doc.ref.delete();
    }
    await ref.delete();
  }
}

emulator().then(() => console.log('✓ E29 ordem, CAS e preservação')).catch(error => {
  console.error(error); process.exitCode = 1;
});
