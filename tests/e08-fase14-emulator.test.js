'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const admin = require('../functions/node_modules/firebase-admin');
const { capture } = require('../scripts/aplicar-indice-canonico-e08.js');
const { hash } = require('../scripts/atribuir-fase-e07-core.js');
const runner = require('../scripts/aplicar-fase-loc-especial-e08.js');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const child = spawnSync('firebase', ['emulators:exec', '--only', 'firestore',
    '--config', 'firebase.emulator.json', '--project', 'demo-scoreplace',
    'node tests/e08-fase14-emulator.test.js'], {
    cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 120000,
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error || child.status !== 0) throw Error('emulador E08 fase14 falhou');
} else {
  async function run() {
    if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
    const db = admin.firestore();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e08-phase14-'));
    const targets = [1, 12, 1].map((count, index) => ({
      id: 'e08-phase14-' + index, name: 'E08 synthetic ' + index,
      entries: Array.from({ length: count }, (_, i) => ({
        id: 'target-' + index + '-' + i,
        loc: index === 1 ? { tipo: 'groupRounds', gi: 0, ri: 0, mi: i } : { tipo: 'thirdPlace' }
      }))
    }));
    async function seed() {
      for (const [index, target] of targets.entries()) {
        const ref = db.collection('tournaments').doc(target.id);
        const batch = db.batch();
        batch.set(ref, { name: target.name, phases: [{ name: 'Fase 1' }],
          _nPartes: { matches: target.entries.length + (index === 2 ? 8 : 0) } });
        for (const item of target.entries) batch.set(ref.collection('matches').doc(item.id), {
          _loc: item.loc, jogo: { id: item.id, p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 1 }
        });
        if (index === 2) for (let i = 0; i < 8; i++) batch.set(ref.collection('matches').doc('other-' + i), {
          _loc: { tipo: 'matches', mi: i }, jogo: { id: 'other-' + i, phaseIndex: 0,
            scoreP1: 3, scoreP2: 2 }
        });
        batch.set(ref.collection('groups').doc('stable'), { name: 'Grupo estável' });
        await batch.commit();
      }
    }
    async function clear() {
      for (const target of targets) {
        const ref = db.collection('tournaments').doc(target.id);
        for (const name of ['matches', 'groups']) {
          const docs = await ref.collection(name).get();
          const batch = db.batch();
          docs.docs.forEach(doc => batch.delete(doc.ref));
          if (!docs.empty) await batch.commit();
        }
        await ref.delete();
      }
    }
    async function fresh() {
      const snapshots = [];
      for (const target of targets) {
        const snapshot = await capture(db, target.id);
        runner.validate(snapshot, target);
        snapshots.push(snapshot);
      }
      const backups = snapshots.map(item => runner.privateBackup(item, tmp));
      const plan = runner.makePlan(targets, snapshots, backups);
      return { snapshots, backups, plan };
    }
    try {
      await seed();
      let context = await fresh();
      assert.equal(runner.backupsFromPlan(context.plan, tmp).length, 3);
      assert.throws(() => runner.backupsFromPlan({ ...context.plan, entries: context.plan.entries.map((e, i) =>
        i === 0 ? { ...e, backupFile: path.join(tmp, 'ausente.json') } : e) }, tmp), /backup/);
      assert.throws(() => runner.assertPlan({ ...context.plan, digest: '0'.repeat(64) },
        targets, context.snapshots, context.backups), /prévia/);
      const firstRoot = db.collection('tournaments').doc(targets[0].id);
      await firstRoot.update({ concurrent: true });
      await assert.rejects(runner.applyVerified(db, context.plan, targets, context.backups), /backup|prévia/);
      await firstRoot.update({ concurrent: admin.firestore.FieldValue.delete() });
      context = await fresh();
      const extra = db.collection('tournaments').doc(targets[1].id).collection('groups').doc('stable');
      await extra.update({ concurrent: true });
      await assert.rejects(runner.applyVerified(db, context.plan, targets, context.backups), /backup|prévia/);
      await extra.update({ concurrent: admin.firestore.FieldValue.delete() });
      context = await fresh();
      const last = db.collection('tournaments').doc(targets[2].id)
        .collection('matches').doc(targets[2].entries[0].id);
      await last.update({ concurrent: true });
      await assert.rejects(runner.applyVerified(db, context.plan, targets, context.backups), /backup|prévia/);
      assert.equal((await last.get()).data()._phaseIndex, undefined);
      await last.update({ concurrent: admin.firestore.FieldValue.delete() });
      context = await fresh();
      await assert.rejects(runner.applyVerified(db, context.plan, targets, context.backups,
        { afterWrite: n => { if (n === 1) throw Error('falha injetada'); } }), /falha injetada/);
      assert.equal((await db.collection('tournaments').doc(targets[0].id)
        .collection('matches').doc(targets[0].entries[0].id).get()).data()._phaseIndex, undefined);
      context = await fresh();
      const result = await runner.applyVerified(db, context.plan, targets, context.backups);
      assert.equal(result.matchesUpdated, 14);
      const other = await db.collection('tournaments').doc(targets[2].id).collection('matches').doc('other-0').get();
      assert.equal(other.data()._phaseIndex, undefined);
      assert.equal(other.data().jogo.phaseIndex, 0);
      assert.equal(other.data().jogo.scoreP1, 3);
      await assert.rejects(runner.applyVerified(db, context.plan, targets, context.backups), /alvo mudou|recebeu fase/);
      await clear();
      await seed();
      context = await fresh();
      const manifestFile = path.join(tmp, 'manifest.json');
      const receiptFile = path.join(tmp, 'receipt.json');
      const options = { allowEmulator: true, db, skipRelease: true,
        authorized: { authorizationRef: 'e08-emulator', authorizedBy: 'proprietario' },
        targets, backupDir: tmp, manifestFile, receiptFile };
      fs.writeFileSync(manifestFile, JSON.stringify(context.plan));
      await assert.rejects(runner.main(['--apply', '0'.repeat(64)], options), /digest/);
      assert.equal(fs.existsSync(receiptFile), false);
      const missingEntries = context.plan.entries.map((entry, i) => i === 0
        ? { ...entry, backupFile: path.join(tmp, 'e08-phase14-' + entry.id + '-ausente.json') } : entry);
      const missingPlan = { ...context.plan, entries: missingEntries, digest: hash(missingEntries) };
      fs.writeFileSync(manifestFile, JSON.stringify(missingPlan));
      await assert.rejects(runner.main(['--apply', missingPlan.digest], options), /backup/);
      assert.equal(fs.existsSync(receiptFile), false);
      const emptyEntries = context.plan.entries.map((entry, i) => i === 0
        ? { ...entry, backupFile: '' } : entry);
      const emptyPlan = { ...context.plan, entries: emptyEntries, digest: hash(emptyEntries) };
      fs.writeFileSync(manifestFile, JSON.stringify(emptyPlan));
      await assert.rejects(runner.main(['--apply', emptyPlan.digest], options), /backup/);
      assert.equal(fs.existsSync(receiptFile), false);
      fs.writeFileSync(manifestFile, JSON.stringify(context.plan));
      await assert.rejects(runner.main(['--apply', context.plan.digest], {
        ...options, applyHooks: { afterWrite: n => { if (n === 1) throw Error('falha antes do commit'); } }
      }), /falha antes do commit/);
      assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).status, 'INDETERMINATE');
      assert.equal((await db.collection('tournaments').doc(targets[0].id)
        .collection('matches').doc(targets[0].entries[0].id).get()).data()._phaseIndex, undefined);
      fs.unlinkSync(receiptFile);
      await assert.rejects(runner.main(['--apply', context.plan.digest], {
        ...options, applyHooks: { afterCommit: () => { throw Error('pós-commit injetado'); } }
      }), /pós-commit injetado/);
      const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
      assert.equal(receipt.status, 'APPLIED_UNVERIFIED');
      assert.equal(receipt.targetPaths.length, 14);
      assert.equal((await db.collection('tournaments').doc(targets[1].id)
        .collection('matches').doc(targets[1].entries[11].id).get()).data()._phaseIndex, 0);
    } finally {
      await clear();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  run().then(() => console.log('E08 fase14: CAS, rollback e preservação passaram'))
    .catch(error => { console.error(error); process.exitCode = 1; });
}
