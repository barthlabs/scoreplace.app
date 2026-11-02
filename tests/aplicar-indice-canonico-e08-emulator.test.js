'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const planner = require('../scripts/planejar-indice-canonico-e08-core.js');
const core = require('../scripts/aplicar-indice-canonico-e08-core.js');
const cli = require('../scripts/aplicar-indice-canonico-e08.js');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('teste exige Firestore Emulator');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
let sequence = 0;
const prefix = 'projects/scoreplace-app/databases/(default)/documents/';
function time(value) {
  return new Date(value.seconds * 1000).toISOString().replace(/\.\d{3}Z$/,
    '.' + String(value.nanoseconds).padStart(9, '0') + 'Z');
}
function wire(doc) { return { name: prefix + doc.ref.path, fields: doc.data(), updateTime: time(doc.updateTime) }; }

async function fixture() {
  const id = 'e08-emu-' + process.pid + '-' + (++sequence);
  const ref = db.collection('tournaments').doc(id);
  await ref.create({ id, _semPesados: ['matches', 'participants', 'opponentHistory'],
    _nPartes: { matches: 2, participants: 0, opponentHistory: 0 }, _nJogos: 2 });
  for (let i = 0; i < 2; i++) {
    const name = 'game-' + i;
    await ref.collection('matches').doc(name).create({ _chave: name,
      _loc: { tipo: 'matches', mi: i }, jogo: { id: name, phaseIndex: 0,
        scoreP1: 6, scoreP2: 4 }, ...(i ? { _phaseIndex: 0 } : {}) });
    await ref.collection('results').doc(name).create({ matchId: name,
      scoreP1: 6, scoreP2: 4, playerUids: [] });
  }
  const first = await cli.capture(db, id);
  const extras = { inscritos: [], opponentHistory: [] };
  const plan = await planner.planRoot(wire(first.root), first.collections.matches.map(wire),
    extras, doc => doc.fields);
  assert.equal(plan.eligible, true);
  assert.equal(plan.targets.length, 1);
  const before = await cli.capture(db, id, plan);
  return { ref, before, plan };
}

(async () => {
  const good = await fixture();
  core.verifyPreflight(good.ref, good.plan, good.before.root, good.before.collections);
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e08-backup-'));
  try {
    const backup = cli.privateBackup(good.before, backupDir);
    assert.equal(fs.statSync(backup.filename).mode & 0o777, 0o600);
    assert.equal(JSON.parse(fs.readFileSync(backup.filename + '.manifest.json', 'utf8')).sha256,
      backup.sha256);
  } finally { fs.rmSync(backupDir, { recursive: true, force: true }); }
  const resultBefore = (await good.ref.collection('results').get()).docs.map(doc => doc.data());
  assert.equal(await core.applyPlan(db, good.ref, good.plan, good.before), 1);
  await core.auditPlan(good.ref, good.plan, good.before);
  assert.equal((await good.ref.collection('matches').doc('game-0').get()).data()._phaseIndex, 0);
  assert.deepEqual((await good.ref.collection('results').get()).docs.map(doc => doc.data()), resultBefore);
  assert.equal((await good.ref.get()).data()._nJogos, 2);

  const changedRoot = await fixture();
  await changedRoot.ref.update({ changed: true });
  await assert.rejects(() => core.applyPlan(db, changedRoot.ref, changedRoot.plan, changedRoot.before), /raiz|CAS/);
  assert.equal((await changedRoot.ref.collection('matches').doc('game-0').get()).data()._phaseIndex, undefined);

  const changedResult = await fixture();
  await changedResult.ref.collection('results').doc('game-1').update({ scoreP1: 5 });
  await assert.rejects(() => core.applyPlan(db, changedResult.ref, changedResult.plan,
    changedResult.before), /CAS de parte/);
  assert.equal((await changedResult.ref.collection('matches').doc('game-0').get()).data()._phaseIndex, undefined);

  const inserted = await fixture();
  await inserted.ref.collection('matches').doc('new-game').create({ unrelated: true });
  await assert.rejects(() => core.applyPlan(db, inserted.ref, inserted.plan, inserted.before),
    /conjunto de leitura|contagem/);
  assert.equal((await inserted.ref.collection('matches').doc('game-0').get()).data()._phaseIndex, undefined);

  const divergent = await fixture();
  await divergent.ref.collection('matches').doc('game-0').update({ _phaseIndex: 3 });
  await assert.rejects(() => core.applyPlan(db, divergent.ref, divergent.plan, divergent.before),
    /versão|fase/);

  const afterCommit = await fixture();
  await core.applyPlan(db, afterCommit.ref, afterCommit.plan, afterCommit.before);
  await afterCommit.ref.collection('results').doc('game-0').update({ scoreP1: 5 });
  await assert.rejects(() => core.auditPlan(afterCommit.ref, afterCommit.plan, afterCommit.before),
    /pós-auditoria/);

  console.log('E08 emulador: índice físico, backup, CAS, espelho e pós-auditoria conferidos');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
