'use strict';
// node tests/e05-wo-patch-replay-emulator.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const fs = require('node:fs');
  const os = require('node:os');
  const { spawnSync, execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e05-wo-'));
  try {
    const port = Number(execFileSync(process.execPath, ['-e',
      "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"],
    { encoding: 'utf8' }).trim());
    const config = path.join(dir, 'firebase.json');
    fs.writeFileSync(config, JSON.stringify({ firestore: {
      rules: path.join(root, 'tests/concurrency/firestore.allow.rules') },
      emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false },
        singleProjectMode: true } }));
    const result = spawnSync('firebase', ['emulators:exec', '--only', 'firestore',
      '--config', config, '--project', 'demo-scoreplace',
      'node tests/e05-wo-patch-replay-emulator.test.js'],
    { cwd: root, encoding: 'utf8', timeout: 120000,
      env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH } });
    process.stdout.write((result.stdout || '') + (result.stderr || ''));
    if (result.error) console.error(result.error);
    process.exit(result.status === 0 ? 0 : 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST));
process.env.GCLOUD_PROJECT = 'demo-scoreplace';
const admin = require('node:module').createRequire(path.join(root, 'functions/index.js'))('firebase-admin');
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const core = require('../functions/wo-split-reconcile-core.js');

(async () => {
  const match = { id: 'm', label: 'R1 Grupo A • Jogo 1', roundIndex: 0,
    p1: 'Ana / Bia', p2: 'Caio / Dani', team1: ['Ana', 'Bia'],
    team1Uids: ['a', 'b'], team2: ['Caio', 'Dani'], team2Uids: ['c', 'd'],
    scoreP1: null, scoreP2: null };
  const rootRef = db.doc('tournaments/e05-wo-patch');
  const matchRef = rootRef.collection('matches').doc('m');
  await rootRef.set({ _phaseReadCertificate: { count: 1 }, woLog: [] });
  await matchRef.set({ _chave: 'm', _loc: { tipo: 'rounds', ri: 0, mi: 0 },
    jogo: match, playerUids: ['a', 'b', 'c', 'd'] });
  const before = { woLog: [] };
  const after = { woLog: [{ id: 'w', status: 'active', roundIndex: 0,
    groupName: 'R1 Grupo A', absentName: 'Bia', absentUid: 'b',
    subName: 'Reserva', subUid: 'r' }] };
  const snap = await matchRef.get();
  const plan = core.planejar(before, after, [], [{ _id: snap.id, ...snap.data() }]);
  assert.equal(plan.patchesDeJogo.length, 1);
  const replay = { v: 2, points: [{ w: 1 }] };
  await matchRef.update({ 'jogo.replay': replay, 'jogo.scoreP1': 6, 'jogo.scoreP2': 3 });
  const batch = db.batch();
  batch.update(matchRef, plan.patchesDeJogo[0].camposAlterados);
  batch.update(rootRef, { _phaseReadCertificate: FieldValue.delete() });
  await batch.commit();
  const saved = (await matchRef.get()).data();
  assert.deepEqual(saved.jogo.replay, replay);
  assert.equal(saved.jogo.scoreP1, 6);
  assert.equal(saved.jogo.scoreP2, 3);
  assert.equal(saved.jogo.p1, 'Ana / Reserva');
  assert.deepEqual(saved.jogo.team1Uids, ['a', 'r']);
  assert.deepEqual(saved._loc, { tipo: 'rounds', ri: 0, mi: 0 });
  assert.equal((await rootRef.get()).data()._phaseReadCertificate, undefined);

  await rootRef.update({ _phaseReadCertificate: { count: 1 } });
  await matchRef.delete();
  const missing = db.batch();
  missing.update(matchRef, plan.patchesDeJogo[0].camposAlterados);
  missing.update(rootRef, { _phaseReadCertificate: FieldValue.delete() });
  await assert.rejects(missing.commit());
  assert.equal((await matchRef.get()).exists, false);
  assert.deepEqual((await rootRef.get()).data()._phaseReadCertificate, { count: 1 });
  console.log('E05 W.O.: replay/placar concorrentes preservados; remoção falha sem recriar jogo');
  await db.terminate();
})().catch(async (error) => {
  console.error(error);
  await db.terminate();
  process.exitCode = 1;
});
