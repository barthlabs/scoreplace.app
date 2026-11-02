'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const planner = require('../scripts/planejar-indice-canonico-e08-core.js');
const core = require('../scripts/aplicar-indice-canonico-e08-core.js');
const cli = require('../scripts/aplicar-indice-canonico-e08.js');

const id = 'tour_1793572858010_00000000000000000000000000000001';
const root = 'projects/scoreplace-app/databases/(default)/documents/tournaments/' + id;
const at = '2026-11-01T12:00:00.123456789Z';
const plan = { root, rootUpdateTime: at, rootHash: 'a', eligible: true,
  matchCount: 1, targets: [{ path: root + '/matches/game-1', updateTime: at, phase: 0 }],
  readSet: { matches: [{ path: root + '/matches/game-1', updateTime: at, hash: 'b' }],
    extraCollections: ['inscritos'], extras: [] } };
plan.digest = planner.digestPlan(plan);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e08-apply-gate-'));
async function run() {
try {
  assert.equal(core.validatePlan(plan), id);
  assert(core.sameStamp(at, { seconds: Date.parse('2026-11-01T12:00:00Z') / 1000,
    nanoseconds: 123456789 }));
  assert.throws(() => core.validatePlan({ ...plan, digest: '0'.repeat(64) }), /digest/);

  const manifest = path.join(tmp, 'manifest.json');
  fs.writeFileSync(manifest, JSON.stringify([plan]), { mode: 0o600 });
  assert.equal(cli.readPlan(id, manifest).digest, plan.digest);
  assert.throws(() => cli.readPlan('outro', manifest), /ausente/);

  const releaseFile = path.join(tmp, 'release.json');
  fs.writeFileSync(releaseFile, JSON.stringify({ schema: 'scoreplace/stage3-release/1',
    project: 'scoreplace-app', stage3Published: true, mirrorExportsRetired: false,
    hostingCommit: 'a'.repeat(40) }), { mode: 0o600 });
  assert.throws(() => cli.requireRelease(releaseFile, 'a'.repeat(40)), /não comprovados/);
  const release = { schema: 'scoreplace/stage3-release/1',
    project: 'scoreplace-app', stage3Published: true, mirrorExportsRetired: true,
    hostingCommit: 'a'.repeat(40), readerSha256: 'b'.repeat(64),
    indexSha256: 'c'.repeat(64) };
  fs.writeFileSync(releaseFile, JSON.stringify(release));
  assert.equal(cli.requireRelease(releaseFile, release.hostingCommit).mirrorExportsRetired, true);
  assert.throws(() => cli.requireRelease(releaseFile, 'd'.repeat(40)), /não comprovados/);
  assert.throws(() => cli.requireRelease(releaseFile), /não comprovados/);
  let readerCalled = 0;
  assert.equal((await cli.requirePublishedRelease(releaseFile, { mainCommit: release.hostingCommit,
    verifyReader: async receipt => { readerCalled++; assert.deepEqual(receipt, release); } })).hostingCommit,
    release.hostingCommit);
  assert.equal(readerCalled, 1);
  await assert.rejects(cli.requirePublishedRelease(releaseFile, { mainCommit: release.hostingCommit,
    verifyReader: async () => { throw new Error('leitor publicado divergente'); } }), /leitor publicado divergente/);

  const approvalFile = path.join(tmp, 'approval.json');
  const approval = { schema: 'scoreplace/e08-index-approval/1', project: 'scoreplace-app',
    tournamentId: id, digest: plan.digest, authorizedBy: 'proprietário',
    authorizationRef: 'conversa/lote-E08' };
  fs.writeFileSync(approvalFile, JSON.stringify({ ...approval, digest: '0'.repeat(64) }));
  assert.throws(() => cli.requireApproval(plan, id, approvalFile), /não corresponde/);
  fs.writeFileSync(approvalFile, JSON.stringify(approval));
  assert.equal(cli.requireApproval(plan, id, approvalFile).digest, plan.digest);

  const receiptFile = path.join(tmp, 'receipt.json');
  const backup = { sha256: 'b'.repeat(64) };
  cli.saveReceipt(id, plan, backup, approval, 'PREPARED', '', receiptFile);
  assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).status, 'PREPARED');
  cli.saveReceipt(id, plan, backup, approval, 'APPLIED_AUDITED', '', receiptFile);
  assert.equal(JSON.parse(fs.readFileSync(receiptFile, 'utf8')).status, 'APPLIED_AUDITED');

  const records = path.join(tmp, 'records');
  fs.mkdirSync(records);
  const otherDigest = 'd'.repeat(64);
  assert.equal(path.basename(cli.receiptFile(id, plan.digest, records)),
    `e08-${id}-${plan.digest}-apply-receipt-private.json`);
  assert.throws(() => cli.receiptFile(id, '../invalid', records), /digest/);
  cli.assertPriorReceipts(id, plan.digest, records);
  const legacy = path.join(records, `e08-${id}-apply-receipt-private.json`);
  const prior = { schema: 'scoreplace/e08-index-apply-receipt/1', project: 'scoreplace-app',
    tournamentId: id, planDigest: plan.digest, status: 'APPLIED_AUDITED' };
  fs.writeFileSync(legacy, JSON.stringify(prior));
  assert.throws(() => cli.assertPriorReceipts(id, plan.digest, records), /recibo anterior/);
  fs.writeFileSync(legacy, '{');
  assert.throws(() => cli.assertPriorReceipts(id, plan.digest, records), /ilegível/);
  fs.writeFileSync(legacy, JSON.stringify({ ...prior, planDigest: otherDigest, status: 'PREPARED' }));
  assert.throws(() => cli.assertPriorReceipts(id, plan.digest, records), /recibo anterior/);
  fs.writeFileSync(legacy, JSON.stringify({ ...prior, planDigest: otherDigest }));
  cli.assertPriorReceipts(id, plan.digest, records);
  const otherFile = cli.receiptFile(id, otherDigest, records);
  fs.writeFileSync(otherFile, JSON.stringify({ ...prior, planDigest: otherDigest, status: 'FALHA_POS_AUDITORIA' }));
  assert.throws(() => cli.assertPriorReceipts(id, plan.digest, records), /recibo anterior/);
  fs.writeFileSync(otherFile, JSON.stringify({ ...prior, planDigest: otherDigest }));
  cli.assertPriorReceipts(id, plan.digest, records);
  const newFile = cli.receiptFile(id, plan.digest, records);
  cli.saveReceipt(id, plan, backup, approval, 'PREPARED', '', newFile);
  assert.throws(() => cli.saveReceipt(id, plan, backup, approval, 'PREPARED', '', newFile), /EEXIST/);
  assert.throws(() => cli.assertPriorReceipts(id, plan.digest, records), /recibo anterior/);
  cli.saveReceipt(id, plan, backup, approval, 'APPLIED_AUDITED', '', newFile);
  assert.equal(JSON.parse(fs.readFileSync(newFile, 'utf8')).status, 'APPLIED_AUDITED');
  // Se cair após o wx e antes de completar o JSON, a limpeza exige auditoria manual.
  fs.unlinkSync(legacy);
  fs.unlinkSync(otherFile);
  fs.writeFileSync(path.join(records, path.basename(newFile)), '{');
  assert.throws(() => cli.assertPriorReceipts(id, otherDigest, records), /ilegível/);

  console.log('E08: manifesto, digest, recibo E20 e autorização específica conferidos');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
run().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
