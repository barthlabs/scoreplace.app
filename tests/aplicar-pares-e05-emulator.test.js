'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const core = require('../scripts/aplicar-pares-e05-core.js');
const cli = require('../scripts/aplicar-pares-e05.js');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('teste exige Firestore Emulator');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
let seq = 0;

async function fixture(count, orphan = false) {
  const id = 'e05-pairs-emu-' + process.pid + '-' + (++seq);
  const ref = db.collection('tournaments').doc(id);
  await ref.create({ id, _semPesados: ['matches'], _nPartes: { matches: count }, _nJogos: count });
  const batch = db.batch();
  for (let i = 0; i < count; i++) {
    const gameId = 'g' + String(i).padStart(3, '0');
    batch.create(ref.collection('matches').doc(gameId), { _chave: gameId,
      _loc: { tipo: 'matches', mi: i }, jogo: { id: gameId, scoreP1: 6, scoreP2: i % 5,
        court: 'quadra-' + i, date: '2026-11-01' } });
    batch.create(ref.collection('results').doc(gameId), { matchId: gameId,
      tournamentId: id, scoreP1: 6, scoreP2: i % 5 });
  }
  if (orphan) batch.create(ref.collection('results').doc('orphan'),
    { matchId: 'orphan', tournamentId: id, scoreP1: 6, scoreP2: 3 });
  batch.create(ref.collection('auditExtras').doc('anchor'), { state: 'untouched' });
  await batch.commit();
  const before = await cli.capture(db, id);
  const { plan, translated } = await core.makePlan(before);
  return { id, ref, before, plan, translated };
}

(async () => {
  const good = await fixture(100);
  assert.equal(good.plan.targets.length, 100);
  assert.equal(good.plan.counts.reads, 201);
  assert.deepEqual(good.plan.excludedCollections, ['auditExtras']);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e05-pairs-'));
  try {
    const backup = cli.privateBackup(good.before, tmp);
    assert.equal(fs.statSync(backup.filename).mode & 0o777, 0o600);
    assert.equal(fs.statSync(backup.filename + '.manifest.json').mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(backup.filename + '.manifest.json', 'utf8')).sha256,
      backup.sha256);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  assert.equal(await core.applyPlan(db, good.ref, good.plan, good.before), 100);
  await core.auditPlan(good.ref, good.plan, good.before, good.translated);
  assert.equal((await good.ref.collection('matches').get()).size, 100);
  assert.equal((await good.ref.collection('results').get()).size, 0);
  assert.equal((await good.ref.collection('matches').doc('g099').get()).data().jogo.scoreP2, 4);
  assert.equal((await good.ref.collection('matches').doc('g099').get()).data().jogo.court,
    'quadra-99');
  assert.equal((await good.ref.collection('matches').doc('g099').get()).data().jogo.date,
    '2026-11-01');
  assert.equal((await good.ref.collection('auditExtras').doc('anchor').get()).data().state, 'untouched');

  const stale = await fixture(3);
  await stale.ref.collection('results').doc('g002').update({ scoreP2: 9 });
  await assert.rejects(() => core.applyPlan(db, stale.ref, stale.plan, stale.before), /mudou/);
  assert.equal((await stale.ref.collection('results').get()).size, 3);

  const extra = await fixture(2);
  await core.applyPlan(db, extra.ref, extra.plan, extra.before);
  await extra.ref.collection('auditExtras').doc('anchor').update({ state: 'changed' });
  await assert.rejects(() => core.auditPlan(extra.ref, extra.plan, extra.before,
    extra.translated), /pós-auditoria/);
  assert.equal((await extra.ref.collection('results').get()).size, 0);

  const newCollection = await fixture(1);
  await newCollection.ref.collection('newCollection').doc('x').create({ value: 1 });
  await assert.rejects(() => core.applyPlan(db, newCollection.ref, newCollection.plan,
    newCollection.before), /coleções mudaram/);
  assert.equal((await newCollection.ref.collection('results').get()).size, 1);

  const removed = await fixture(2);
  await removed.ref.collection('matches').doc('g001').delete();
  await assert.rejects(() => core.applyPlan(db, removed.ref, removed.plan, removed.before),
    /coleção mudou/);
  assert.equal((await removed.ref.collection('results').get()).size, 2);

  const orphan = await fixture(1, true);
  assert.equal(orphan.plan.counts.orphans, 1);
  await core.applyPlan(db, orphan.ref, orphan.plan, orphan.before);
  await core.auditPlan(orphan.ref, orphan.plan, orphan.before, orphan.translated);
  assert.equal((await orphan.ref.collection('results').get()).size, 1);
  assert.equal((await orphan.ref.collection('results').doc('orphan').get()).exists, true);

  const after = await fixture(2);
  await core.applyPlan(db, after.ref, after.plan, after.before);
  await after.ref.collection('auditExtras').doc('anchor').update({ state: 'changed' });
  await assert.rejects(() => core.auditPlan(after.ref, after.plan, after.before, after.translated),
    /pós-auditoria/);

  const receiptCase = await fixture(1);
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e05-pair-receipt-'));
  try {
    const manifestFile = path.join(privateDir, 'manifest.json');
    const receiptFile = path.join(privateDir, 'receipt.json');
    const preview = await cli.run(db, receiptCase.id, 'check', '', {},
      { manifestFile, backupDir: privateDir });
    const commit = 'a'.repeat(40);
    const releaseFile = path.join(privateDir, 'release.json');
    const approvalFile = path.join(privateDir, 'approval.json');
    fs.writeFileSync(releaseFile, JSON.stringify({ schema: 'scoreplace/stage3-release/1',
      project: 'scoreplace-app', stage3Published: true, mirrorExportsRetired: true,
      hostingCommit: commit, readerSha256: 'b'.repeat(64), indexSha256: 'c'.repeat(64) }));
    fs.writeFileSync(approvalFile, JSON.stringify({ schema: 'scoreplace/e05-pair-approval/1',
      project: 'scoreplace-app', tournamentId: receiptCase.id, digest: preview.digest,
      authorizedBy: 'fixture', authorizationRef: 'emulator', expiresAt: '2100-01-01T00:00:00Z' }));
    const env = { SCOREPLACE_E05_STAGE3_RELEASE_RECEIPT: releaseFile,
      SCOREPLACE_E05_PAIR_APPROVAL_FILE: approvalFile };
    const hooks = { manifestFile, receiptFile, backupDir: privateDir, mainCommit: commit,
      verifyRetiredWriters: () => true, verifyReader: async () => true,
      afterCommit: async () => { throw new Error('falha no recibo final'); } };
    await assert.rejects(() => cli.run(db, receiptCase.id, 'apply', preview.digest, env,
      { ...hooks, verifyRetiredWriters: () => { throw new Error('escritor antigo ainda publicado'); } }),
    /escritor antigo ainda publicado/);
    await assert.rejects(() => cli.run(db, receiptCase.id, 'apply', preview.digest, env,
      { ...hooks, verifyRetiredWriters: () => { throw new Error('listagem inválida'); } }),
    /listagem inválida/);
    assert.equal(fs.existsSync(receiptFile), false);
    assert.equal((await receiptCase.ref.collection('results').get()).size, 1);
    await assert.rejects(() => cli.run(db, receiptCase.id, 'apply', preview.digest, env, hooks),
      /falha no recibo final/);
    assert.equal((await receiptCase.ref.collection('results').get()).size, 0);
    assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).status, 'FALHA_POS_AUDITORIA');
    await assert.rejects(() => cli.run(db, receiptCase.id, 'apply', preview.digest, env, hooks),
      /recibo anterior existe/);
  } finally { fs.rmSync(privateDir, { recursive: true, force: true }); }
  console.log('E05 emulador: 100 pares, backup, CAS, exclusão atômica e pós-auditoria conferidos');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
