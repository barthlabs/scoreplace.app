'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const { stable, buildOperationalBackup } = require('../scripts/backup-torneio-operacional-core.js');
const preview = require('../scripts/planejar-jogos-inline-e05-core.js');
const cli = require('../scripts/aplicar-jogos-inline-e05.js');
const split = require('../js/views/tournament-split-core.js');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('teste exige emulador Firestore');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const groupTarget = preview.TARGETS[1];
let seq = 0;

async function fixture(target) {
  const id = 'e05-inline-emu-' + process.pid + '-' + (++seq);
  const ref = db.collection('tournaments').doc(id);
  const games = Array.from({ length: target.count }, (_, i) => ({ id: id + '-game-' + i,
    p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 4, winner: 'A' }));
  const root = { name: target.name, _semPesados: ['matches'], _nPartes: { matches: 0 },
    _nJogos: 0 };
  if (target.kind === 'groupRounds') {
    root.groups = [{ label: 'Grupo A', rounds: [{ label: 'Rodada 1', matches: games }] }];
  } else root.thirdPlaceMatch = games[0];
  await ref.create(root);
  for (const game of games) await ref.collection('results').doc(game.id).create({ matchId: game.id });
  const snap = await ref.get();
  const resultSnaps = await Promise.all(games.map(game => ref.collection('results').doc(game.id).get()));
  const entries = preview.inlineGames(root, target.kind).map(({ game, loc }, i) => ({
    id: game.id, loc, game, gameHash: preview.hash(game),
    destination: ref.path + '/matches/' + game.id,
    result: { path: ref.path + '/results/' + game.id,
      updateTime: stable(resultSnaps[i].updateTime), hash: preview.hash(resultSnaps[i].data()) }
  }));
  const entry = { name: target.name, root: { path: ref.path,
    updateTime: stable(snap.updateTime), hash: preview.hash(root) },
    existingMatches: 0, entries };
  return { ref, root, games, entry };
}

async function batchFixture() {
  const fixtures = [];
  const backups = new Map(), entries = [];
  for (const target of preview.TARGETS) {
    const item = await fixture(target);
    const root = await item.ref.get(), collections = {}, serialized = {};
    for (const collection of await item.ref.listCollections()) {
      const docs = (await collection.get()).docs;
      collections[collection.id] = docs;
      serialized[collection.id] = docs.map(doc => ({ id: doc.id, data: stable(doc.data()) }));
    }
    const backup = buildOperationalBackup(root, serialized, new Date().toISOString(), 'scoreplace-app');
    backups.set(target.name, { body: backup.payload, hash: backup.sha256 });
    entries.push(preview.validateTarget(target, root, collections, backup.payload, backup.sha256));
    fixtures.push(item);
  }
  return { fixtures, backups, manifest: preview.buildManifest(entries) };
}

async function cleanup(fixtures) {
  for (const item of fixtures) {
    for (const collection of await item.ref.listCollections()) {
      for (const doc of (await collection.get()).docs) await doc.ref.delete();
    }
    await item.ref.delete();
  }
}

async function withBatch(fn) {
  const data = await batchFixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e05-inline-batch-'));
  try { await fn(data, path.join(directory, 'receipt.json')); }
  finally { await cleanup(data.fixtures); fs.rmSync(directory, { recursive: true, force: true }); }
}

(async () => {
  await withBatch(async ({ fixtures, backups, manifest }, receiptFile) => {
    const report = await cli.run(db, manifest, backups, true, { receiptFile });
    assert.equal(report.productionGamesCreated, 14);
    assert.equal(report.productionRootsUpdated, 3);
    assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).auditStatus, 'APPLIED_AUDITED');
    for (let i = 0; i < fixtures.length; i++) {
      const item = fixtures[i];
      const actual = (await item.ref.collection('matches').get()).docs;
      assert.equal(actual.length, preview.TARGETS[i].count);
      assert.deepEqual(actual.map(doc => doc.data().jogo.scoreP1),
        Array(preview.TARGETS[i].count).fill(6));
      assert.equal((await item.ref.collection('results').get()).size, preview.TARGETS[i].count);
    }
    const retry = await cli.run(db, manifest, backups, true, { receiptFile });
    assert.equal(retry.productionGamesCreated, 0, 'retry do lote completo é leitura');
    assert(retry.targets.every(item => item.status === 'done'));
  });

  await withBatch(async ({ fixtures, backups, manifest }, receiptFile) => {
    await assert.rejects(() => cli.run(db, manifest, backups, true, {
      receiptFile, beforeTransaction: async () => {
        await fixtures[1].ref.update({ changedBeforeTransaction: true });
      }
    }), 'mudança de raiz após a prévia aborta o commit inteiro');
    for (const item of fixtures) assert.equal((await item.ref.collection('matches').get()).size, 0);
  });

  await withBatch(async ({ fixtures, backups, manifest }, receiptFile) => {
    await assert.rejects(() => cli.run(db, manifest, backups, true, {
      receiptFile, beforeTransaction: async () => {
        await fixtures[2].ref.collection('matches').doc(fixtures[2].games[0].id)
          .create({ unrelated: true });
      }
    }), 'destino ocupado após a prévia aborta o commit inteiro');
    assert.equal((await fixtures[0].ref.collection('matches').get()).size, 0);
    assert.equal((await fixtures[1].ref.collection('matches').get()).size, 0);
    assert.equal((await fixtures[2].ref.collection('matches').get()).size, 1);
  });

  await withBatch(async ({ fixtures, backups, manifest }, receiptFile) => {
    await assert.rejects(() => cli.run(db, manifest, backups, true, {
      receiptFile, beforeWrite: async prepared => {
        const last = prepared[2], id = last.entry.entries[0].id;
        last.records.set(id, { ...last.records.get(id), oversized: 'x'.repeat(1100000) });
      }
    }), 'escrita inválida no último alvo aborta o commit inteiro');
    for (const item of fixtures) assert.equal((await item.ref.collection('matches').get()).size, 0);
  });

  await withBatch(async ({ fixtures, backups, manifest }, receiptFile) => {
    assert.equal(await cli.applyTarget(db, preview.TARGETS[0], manifest.targets[0]), 'applied');
    await assert.rejects(() => cli.run(db, manifest, backups, true, { receiptFile }), /parcialmente migrado/);
    assert.equal((await fixtures[1].ref.collection('matches').get()).size, 0);
    assert.equal((await fixtures[2].ref.collection('matches').get()).size, 0);
  });

  await withBatch(async ({ fixtures, backups, manifest }, receiptFile) => {
    await assert.rejects(() => cli.run(db, manifest, backups, true, {
      receiptFile, afterCommit: async () => {
        await fixtures[0].ref.collection('matches').doc(fixtures[0].games[0].id)
          .update({ 'jogo.scoreP1': 5 });
      }
    }), /pós-auditoria/);
    const failure = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    assert.equal(failure.auditStatus, 'FALHA_POS_AUDITORIA');
    assert.match(failure.auditFailure, /jogo\.scoreP1/);
    const check = await cli.run(db, manifest, backups, false, { receiptFile });
    assert.equal(check.postAuditFailure, true);
    await assert.rejects(() => cli.run(db, manifest, backups, true, { receiptFile }), /revisão manual/);
  });

  const ok = await fixture(groupTarget);
  assert.equal(await cli.applyTarget(db, groupTarget, ok.entry), 'applied');
  const root = (await ok.ref.get()).data();
  assert.equal(root._inlineGamesExternalized, true);
  assert.equal(root._nPartes.matches, 12);
  assert.equal(root.groups[0].rounds[0].matches.length, 0);
  const physical = await ok.ref.collection('matches').get();
  assert.equal(physical.size, 12);
  const mounted = split.remontar({ config: root, matches: physical.docs.map(doc => doc.data()) });
  assert(mounted);
  assert.deepEqual(mounted.groups, ok.root.groups);
  assert.equal(await cli.applyTarget(db, groupTarget, ok.entry), 'done');
  assert.equal((await ok.ref.collection('matches').get()).size, 12);

  const thirdTarget = preview.TARGETS[0];
  const third = await fixture(thirdTarget);
  assert.equal(await cli.applyTarget(db, thirdTarget, third.entry), 'applied');
  const thirdRoot = (await third.ref.get()).data();
  assert.equal(Object.hasOwn(thirdRoot, 'thirdPlaceMatch'), false);
  assert.equal(thirdRoot._nPartes.matches, 1);
  const thirdPhysical = await third.ref.collection('matches').get();
  assert.equal(thirdPhysical.size, 1);
  assert.deepEqual(split.remontar({ config: thirdRoot,
    matches: thirdPhysical.docs.map(doc => doc.data()) }).thirdPlaceMatch, third.games[0]);
  assert.equal(await cli.applyTarget(db, thirdTarget, third.entry), 'done');

  const stale = await fixture(groupTarget);
  await stale.ref.update({ updatedAt: 'changed' });
  await assert.rejects(() => cli.applyTarget(db, groupTarget, stale.entry), /CAS da raiz/);
  assert.equal((await stale.ref.collection('matches').get()).size, 0);

  const occupied = await fixture(groupTarget);
  await occupied.ref.collection('matches').doc(occupied.games[0].id).create({ unrelated: true });
  await assert.rejects(() => cli.applyTarget(db, groupTarget, occupied.entry), /contagem física mudou|destino ocupado/);
  assert.equal((await occupied.ref.collection('matches').get()).size, 1);
  assert.equal((await occupied.ref.get()).data()._inlineGamesExternalized, undefined);
  console.log('E05 emulador: lote atômico 14/14, backup, CAS, colisão, auditoria e retry OK');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
