#!/usr/bin/env node
'use strict';

// E05: somente --apply escreve no Firestore, após release, autorização e CAS.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token.js');
const { stable, digest, buildOperationalBackup } = require('./backup-torneio-operacional-core.js');
const { verifyPublishedReader } = require('./aplicar-jogos-inline-e05.js');
const { assertRetired: assertMirrorWritersRetired } = require('./check-e05-mirror-functions.js');
const core = require('./aplicar-pares-e05-core.js');

const PROJECT = 'scoreplace-app';
const PRIVATE = path.resolve(__dirname, '../.claude/tmp');
const BACKUPS = '/Users/rtb/Documents/Codex/backups-operacionais';
const manifestFile = id => path.join(PRIVATE, 'e05-pairs-' + id + '-manifest-private.json');
const receiptFile = (id, sha) => path.join(PRIVATE, 'e05-pairs-' + id + '-' + sha + '-receipt-private.json');

function releaseGate(receipt, mainCommit) {
  if (!receipt || receipt.schema !== 'scoreplace/stage3-release/1' ||
      receipt.project !== PROJECT || receipt.stage3Published !== true ||
      receipt.mirrorExportsRetired !== true ||
      !/^[a-f0-9]{40}$/i.test(receipt.hostingCommit || '') ||
      receipt.hostingCommit !== mainCommit ||
      !/^[a-f0-9]{64}$/i.test(receipt.readerSha256 || '') ||
      !/^[a-f0-9]{64}$/i.test(receipt.indexSha256 || '')) {
    throw new Error('[E05] corte E20 não comprovado');
  }
  return receipt;
}

function approvalGate(approval, plan, now = Date.now()) {
  if (!approval || approval.schema !== 'scoreplace/e05-pair-approval/1' ||
      approval.project !== PROJECT || approval.tournamentId !== plan.tournamentId ||
      approval.digest !== plan.digest || !approval.authorizedBy || !approval.authorizationRef ||
      !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= now) {
    throw new Error('[E05] autorização específica ausente, divergente ou expirada');
  }
  return approval;
}

function writePrivate(filename, object) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + '.partial-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(temporary, JSON.stringify(object, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporary, filename); fs.chmodSync(filename, 0o600); }
  catch (error) { try { fs.unlinkSync(temporary); } catch (_) {} throw error; }
}

function saveReceipt(plan, backup, approval, status, reason = '', filename = receiptFile(plan.tournamentId, plan.digest)) {
  const body = { schema: 'scoreplace/e05-pair-apply-receipt/1', project: PROJECT,
    tournamentId: plan.tournamentId, planDigest: plan.digest, backupSha256: backup.sha256,
    authorizationRef: approval.authorizationRef, authorizedBy: approval.authorizedBy,
    status, observedAt: new Date().toISOString(),
    ...(reason ? { failure: String(reason).slice(0, 240) } : {}) };
  writePrivate(filename, body);
  return body;
}

async function capture(db, id) {
  if (!core.validId(id)) throw new Error('[E05] ID inválido ou sandbox');
  const ref = db.collection('tournaments').doc(id);
  const root = await ref.get();
  if (!root.exists) throw new Error('[E05] torneio ausente');
  const physicalCollectionNames = (await ref.listCollections()).map(col => col.id).sort();
  const collections = {};
  for (const name of physicalCollectionNames) collections[name] = (await ref.collection(name).get()).docs;
  return { ref, root, collections, physicalCollectionNames };
}

function privateBackup(snapshot, outputDir = BACKUPS) {
  const subcollections = Object.fromEntries(Object.entries(snapshot.collections).map(([name, docs]) =>
    [name, docs.map(doc => ({ id: doc.id, data: stable(doc.data()) })).sort((a, b) => a.id.localeCompare(b.id))]));
  const backup = buildOperationalBackup(snapshot.root, subcollections, new Date().toISOString(), PROJECT);
  fs.mkdirSync(outputDir, { recursive: true });
  const filename = path.join(outputDir, 'e05-pairs-' + snapshot.root.id + '-' +
    new Date().toISOString().replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex') + '.json');
  fs.writeFileSync(filename, backup.body, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(filename + '.manifest.json', JSON.stringify(backup.manifest, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  const reread = fs.readFileSync(filename, 'utf8');
  const sidecar = JSON.parse(fs.readFileSync(filename + '.manifest.json', 'utf8'));
  if (digest(reread) !== backup.sha256 || sidecar.sha256 !== backup.sha256 ||
      !core.same(JSON.parse(reread), backup.payload)) throw new Error('[E05] backup inválido');
  return { filename, sha256: backup.sha256 };
}

function readManifest(id, filename = manifestFile(id)) {
  const entry = JSON.parse(fs.readFileSync(filename, 'utf8'));
  core.validatePlan(entry.plan);
  if (entry.plan.tournamentId !== id || !entry.backup || !/^[a-f0-9]{64}$/.test(entry.backup.sha256 || '')) {
    throw new Error('[E05] manifesto inválido');
  }
  const body = fs.readFileSync(entry.backup.filename, 'utf8');
  if (digest(body) !== entry.backup.sha256) throw new Error('[E05] backup de prévia corrompido');
  return entry;
}

async function run(db, id, mode, planDigest = '', env = process.env, hooks = {}) {
  if (!core.validId(id)) throw new Error('[E05] ID inválido ou sandbox');
  if (mode === 'check') {
    const before = await capture(db, id);
    const { plan } = await core.makePlan(before);
    if (!plan.targets.length) return { tournamentId: id, candidates: 0,
      orphanResults: plan.counts.orphans, productionWrites: 0 };
    const backup = privateBackup(before, hooks.backupDir);
    writePrivate(hooks.manifestFile || manifestFile(id), { plan, backup });
    return { tournamentId: id, digest: plan.digest, candidates: plan.targets.length,
      remainingPairs: plan.counts.pairs - plan.targets.length,
      orphanResults: plan.counts.orphans, productionWrites: 0 };
  }
  if (mode !== 'apply') throw new Error('[E05] modo inválido');
  const entry = readManifest(id, hooks.manifestFile || manifestFile(id));
  const plan = entry.plan;
  if (planDigest !== plan.digest) throw new Error('[E05] digest divergente');
  const releaseFile = env.SCOREPLACE_E05_STAGE3_RELEASE_RECEIPT;
  if (!releaseFile || !path.isAbsolute(releaseFile)) throw new Error('[E05] recibo E20 ausente');
  if (!hooks.mainCommit) execFileSync('git', ['fetch', 'origin', 'main'],
    { cwd: path.resolve(__dirname, '..'), stdio: 'ignore', timeout: 30000 });
  const mainCommit = (hooks.mainCommit || execFileSync('git', ['rev-parse', 'origin/main'],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim());
  const release = releaseGate(JSON.parse(fs.readFileSync(releaseFile, 'utf8')), mainCommit);
  (hooks.verifyRetiredWriters || assertMirrorWritersRetired)();
  await (hooks.verifyReader || verifyPublishedReader)(release);
  const approvalFile = env.SCOREPLACE_E05_PAIR_APPROVAL_FILE;
  if (!approvalFile || !path.isAbsolute(approvalFile)) throw new Error('[E05] autorização ausente');
  const approval = approvalGate(JSON.parse(fs.readFileSync(approvalFile, 'utf8')), plan);
  const receipt = hooks.receiptFile || receiptFile(id, plan.digest);
  if (fs.existsSync(receipt)) throw new Error('[E05] recibo anterior existe; revisão manual obrigatória');
  const before = await capture(db, id);
  core.verifyReadSet(before, plan);
  const fresh = await core.makePlan(before);
  if (fresh.plan.digest !== plan.digest) throw new Error('[E05] prévia mudou; gere e autorize novo lote');
  const backup = privateBackup(before, hooks.backupDir);
  saveReceipt(plan, backup, approval, 'PREPARED', '', receipt);
  try {
    await core.applyPlan(db, before.ref, plan, before, hooks);
  } catch (error) {
    const status = String(error.message || '').startsWith('[E05]')
      ? 'FALHA_PRECONDICAO_SEM_ESCRITA' : 'FALHA_APLICACAO_ESTADO_INCERTO';
    saveReceipt(plan, backup, approval, status, error.message, receipt);
    throw error;
  }
  try {
    if (hooks.afterCommit) await hooks.afterCommit();
    await core.auditPlan(before.ref, plan, before, fresh.translated);
    saveReceipt(plan, backup, approval, 'APPLIED_AUDITED', '', receipt);
  } catch (error) {
    saveReceipt(plan, backup, approval, 'FALHA_POS_AUDITORIA', error.message, receipt);
    throw error;
  }
  return { tournamentId: id, digest: plan.digest, applied: plan.targets.length,
    backupSha256: backup.sha256, status: 'APPLIED_AUDITED' };
}

function serviceDb(env = process.env) {
  const key = JSON.parse(fs.readFileSync(credentialPath(env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) throw new Error('[E05] credencial inválida');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
  return admin.firestore();
}

async function main(args = process.argv.slice(2)) {
  const check = args.length === 2 && args[0] === '--check';
  const apply = args.length === 3 && args[0] === '--apply';
  if (!check && !apply) throw new Error('uso: --check <id> | --apply <id> <digest>');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('[E05] emulador ativo na CLI real');
  const id = args[1];
  if (!core.validId(id)) throw new Error('[E05] ID inválido ou sandbox');
  const result = await run(serviceDb(), id, check ? 'check' : 'apply', apply ? args[2] : '');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = { releaseGate, approvalGate, capture, privateBackup, readManifest,
  saveReceipt, run, serviceDb, main };
if (require.main === module) main().catch(error => {
  console.error('[E05] operação interrompida: ' + error.message);
  process.exitCode = 1;
});
