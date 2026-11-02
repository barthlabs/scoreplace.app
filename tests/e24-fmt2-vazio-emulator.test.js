'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const M = require('../scripts/migrar-fmt2-vazio-e24');
const C = require('../scripts/migrar-fmt2-core');
const { stable } = require('../scripts/backup-torneio-operacional-core');

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('teste exige Firestore Emulator');
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();
const base = '/Users/rtb/Documents/Codex/backups-operacionais';

function rootData(id) {
  return { id, format: 'Eliminatórias Simples', status: 'open', sport: 'Beach Tennis',
    teamSize: 2, enrollmentMode: 'individual', participants: [], matches: [], rounds: [],
    groups: [], standbyParticipants: [], _nJogos: 0, _nPartes: { matches: 0 } };
}
async function seed() {
  for (const id of M.IDS) {
    const ref = db.collection('tournaments').doc(id);
    await ref.set(rootData(id));
    await ref.collection('history').doc('created').set({ event: 'created' });
  }
}
function authorization(file, digest) {
  fs.writeFileSync(file, JSON.stringify({ schema: 'scoreplace/e24-fmt2-empty-approval/1',
    project: 'scoreplace-app', digest, scope: 'E24-two-empty-tournaments',
    targetIds: [...M.IDS], authorizedBy: 'emulator',
    authorizationRef: 'fixture', expiresAt: '2100-01-01T00:00:00Z' }), { mode: 0o600 });
}

(async () => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIRESTORE_EMULATOR_HOST;
  try {
    const evidence = { schema: 'scoreplace/e24-fmt2-empty-approval/1', project: 'scoreplace-app',
      digest: M.APPROVED_DIGEST, scope: 'E24-two-empty-tournaments', targetIds: [...M.IDS],
      authorizedBy: 'proprietario', authorizationRef: M.APPROVAL_REF,
      expiresAt: '2100-01-01T00:00:00Z' };
    assert.doesNotThrow(() => M.approvalGate(evidence, { digest: M.APPROVED_DIGEST }));
    assert.throws(() => M.approvalGate({ ...evidence, authorizationRef: 'conversa/E24/outra' },
      { digest: M.APPROVED_DIGEST }), /autorização/);
    assert.throws(() => M.approvalGate({ ...evidence, digest: '0'.repeat(64) },
      { digest: '0'.repeat(64) }), /autorização/);
    assert.throws(() => M.approvalGate({ ...evidence, expiresAt: '2000-01-01T00:00:00Z' },
      { digest: M.APPROVED_DIGEST }), /autorização/);
  } finally { process.env.FIRESTORE_EMULATOR_HOST = emulatorHost; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e24-'));
  fs.mkdirSync(base, { recursive: true, mode: 0o700 });
  const backupDir = fs.mkdtempSync(path.join(base, 'e24-test-' + process.pid + '-'));
  try {
    await seed();
    const first = db.collection('tournaments').doc(M.IDS[0]);
    await first.collection('matches').doc('unexpected').set({ jogo: { scoreP1: 6, scoreP2: 4 } });
    await assert.rejects(() => M.preview(db, path.join(tmp, 'invalid.json'), backupDir), /subcoleção não vazia/);
    await first.collection('matches').doc('unexpected').delete();

    const staleManifest = path.join(tmp, 'stale.json');
    const stale = await M.preview(db, staleManifest, backupDir);
    const staleApproval = path.join(tmp, 'stale-approval.json');
    authorization(staleApproval, stale.digest);
    await first.update({ note: 'changed after preview' });
    await assert.rejects(() => M.apply(db, staleManifest, staleApproval,
      path.join(tmp, 'stale-receipts')), /prévia desatualizada/);
    assert.equal((await first.get()).data().fmt2, undefined);

    const manifestFile = path.join(tmp, 'ready.json');
    const ready = await M.preview(db, manifestFile, backupDir);
    assert.equal(ready.targets.length, 2);
    assert(ready.targets.every(t => t.mask.includes('politicaDaChave')));
    const approval = path.join(tmp, 'approval.json');
    authorization(approval, ready.digest);
    const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    const backupFile = manifest.targets[1].backup.file;
    const originalBackup = fs.readFileSync(backupFile, 'utf8');
    fs.appendFileSync(backupFile, ' ');
    await assert.rejects(() => M.apply(db, manifestFile, approval,
      path.join(tmp, 'tampered-receipts')), /backup SHA divergente/);
    fs.writeFileSync(backupFile, originalBackup, { mode: 0o600 });
    assert.equal((await first.get()).data().fmt2, undefined);

    const receiptDir = path.join(tmp, 'receipts');
    await assert.rejects(() => M.apply(db, manifestFile, approval, receiptDir, {
      beforeTarget: id => { if (id === M.IDS[1]) throw new Error('falha simulada antes do segundo alvo'); }
    }), /falha simulada/);
    const firstReceipt = JSON.parse(fs.readFileSync(path.join(receiptDir, M.IDS[0] + '.json')));
    const secondReceipt = JSON.parse(fs.readFileSync(path.join(receiptDir, M.IDS[1] + '.json')));
    assert.equal(firstReceipt.status, 'APPLIED_AUDITED');
    assert.equal(secondReceipt.status, 'PENDING');
    const secondFile = path.join(receiptDir, M.IDS[1] + '.json');
    fs.writeFileSync(secondFile, JSON.stringify({ ...secondReceipt, status: 'PREPARED' }));
    await assert.rejects(() => M.apply(db, manifestFile, approval, receiptDir), /revisão manual/);
    assert.equal((await db.collection('tournaments').doc(M.IDS[1]).get()).data().fmt2, undefined);
    fs.writeFileSync(secondFile, JSON.stringify(secondReceipt));
    const firstUpdateTime = (await first.get()).updateTime;
    const resumed = await M.apply(db, manifestFile, approval, receiptDir);
    assert.deepEqual(resumed.map(x => x.status), ['ALREADY_AUDITED', 'APPLIED_AUDITED']);
    assert(C.sameTimestamp(stable((await first.get()).updateTime), stable(firstUpdateTime)));
    for (const id of M.IDS) {
      const ref = db.collection('tournaments').doc(id);
      const data = (await ref.get()).data();
      assert.equal(data.fmt2 != null, true);
      assert.equal(data.phases.length, 1);
      assert.equal(data.politicaDaChave, 'repescagem');
      assert.equal((await ref.collection('history').get()).size, 1);
      assert.equal((await ref.collection('matches').get()).size, 0);
    }
    console.log('E24 emulador: dois CAS, backup, obsolescência, vazio obrigatório e retomada 2/2');
  } finally {
    fs.rmSync(backupDir, { recursive: true, force: true });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
