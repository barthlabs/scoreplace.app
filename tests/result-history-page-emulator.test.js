'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { execFileSync } = require('node:child_process');
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  { encoding: 'utf8' }).trim());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-result-page-'));
  const config = path.join(dir, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({ firestore: {
    rules: path.join(ROOT, 'firestore.rules'), indexes: path.join(ROOT, 'firestore.indexes.json') },
  emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false },
    singleProjectMode: true } }));
  try {
    const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--config', config,
      '--project', 'demo-scoreplace', 'node tests/result-history-page-emulator.test.js'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH } });
    assert.match(output, /result history page emulator: OK/);
    console.log('result history page emulator: OK');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
} else {
  assert.match(String(process.env.FIRESTORE_EMULATOR_HOST), /^127\.0\.0\.1:\d+$/);
  process.env.GCLOUD_PROJECT = 'demo-scoreplace';
  process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });
  const admin = require('../functions/node_modules/firebase-admin');
  const { readResultHistoryPage } = require('../functions/result-history-page-core');
  (async () => {
    if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
    const db = admin.firestore();
    await db.doc('tournaments/aa_hidden').set({ organizerOnly: true, creatorUid: 'owner' });
    await db.doc('tournaments/zz_public').set({ isPublic: true });
    const batch = db.batch();
    for (let i = 0; i < 50; i++) {
      const id = `m${String(i).padStart(2, '0')}`;
      batch.set(db.doc(`tournaments/aa_hidden/matches/${id}`),
        { playerUids: ['player'], jogo: { id, scoreP1: i, scoreP2: 0 } });
    }
    batch.set(db.doc('tournaments/zz_public/matches/m50'), { playerUids: ['player'],
      jogo: { id: 'm50', scoreP1: 6, scoreP2: 4, p1: 'A', p2: 'B' } });
    batch.set(db.doc('tournaments/zz_public/matches/r0-1'), { playerUids: ['derived'],
      _chave: 'r0-1', jogo: { scoreP1: 6, scoreP2: 4, winner: 'A' } });
    for (let i = 0; i < 50; i++) {
      const id = `s${String(i).padStart(2, '0')}`;
      batch.set(db.doc(`sandboxes/sb/matches/${id}`),
        { playerUids: ['sandbox-player'], jogo: { id } });
    }
    batch.set(db.doc('tournaments/zz_public/matches/s50'),
      { playerUids: ['sandbox-player'], jogo: { id: 's50' } });
    batch.set(db.doc('tournaments/aa_hidden/matches/bad-hidden'),
      { playerUids: ['malformed'], scoreP1: 1 });
    batch.set(db.doc('tournaments/zz_public/matches/bad-public'),
      { playerUids: ['malformed'], scoreP1: 2 });
    await batch.commit();
    const args = { db, fieldPath: admin.firestore.FieldPath, callerUid: 'viewer',
      targetUid: 'player', cursorKey: Buffer.alloc(32, 7) };
    const first = await readResultHistoryPage(args);
    assert.equal(first.items.length, 0);
    assert.ok(first.cursor);
    const second = await readResultHistoryPage({ ...args, cursor: first.cursor });
    assert.deepEqual(second.items.map(item => item.id), ['m50']);
    assert.equal(second.items[0].matchId, 'm50');
    assert.equal(second.items[0].scoreP1, 6);
    assert.equal(second.cursor, null);
    const derived = await readResultHistoryPage({ ...args, targetUid: 'derived' });
    assert.deepEqual(derived.items.map(item => [item.id, item.matchId, item.scoreP1, item.scoreP2]),
      [['r0-1', 'r0-1', 6, 4]], 'jogo físico sem id embutido mantém placar no histórico');
    const sandboxFirst = await readResultHistoryPage({ ...args, targetUid: 'sandbox-player' });
    assert.equal(sandboxFirst.items.length, 0);
    assert.ok(sandboxFirst.cursor);
    const sandboxSecond = await readResultHistoryPage({ ...args,
      targetUid: 'sandbox-player', cursor: sandboxFirst.cursor });
    assert.deepEqual(sandboxSecond.items.map(item => item.id), ['s50']);
    await assert.rejects(readResultHistoryPage({ ...args, targetUid: 'malformed' }),
      error => error.message === 'jogo canônico inválido' && !error.message.includes('aa_hidden'));
    await db.doc('tournaments/zz_public').update({ isPublic: false, organizerOnly: true });
    const hidden = await readResultHistoryPage({ ...args, cursor: first.cursor });
    assert.equal(hidden.items.length, 0);
    console.log('result history page emulator: OK');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
