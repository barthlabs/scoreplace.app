#!/usr/bin/env node
'use strict';

// E08: um torneio por transação. --check é somente leitura; --apply exige
// corte E20, autorização do lote, backup integral, CAS e pós-auditoria.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath, accessTokenForServiceAccount } = require('./firebase-service-account-token.js');
const { stable, digest, buildOperationalBackup } = require('./backup-torneio-operacional-core.js');
const planner = require('./planejar-indice-canonico-e08.js');
const core = require('./aplicar-indice-canonico-e08-core.js');
const { releaseGate } = require('./aplicar-pares-e05.js');
const { verifyPublishedReader } = require('./aplicar-jogos-inline-e05.js');

const MANIFEST = path.resolve(__dirname, '../.claude/tmp/e08-indice-canonico-manifest-private.json');
const RECEIPT_DIR = path.resolve(__dirname, '../.claude/tmp');
const BACKUP_DIR = '/Users/rtb/Documents/Codex/backups-operacionais';
const PROJECT = 'scoreplace-app';

function readPlan(id, filename = MANIFEST) {
  const plans = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (!Array.isArray(plans)) throw new Error('[E08] manifesto privado inválido');
  const candidates = plans.filter(plan => plan.root.endsWith('/tournaments/' + id));
  if (candidates.length !== 1) throw new Error('[E08] alvo ausente ou repetido no manifesto');
  core.validatePlan(candidates[0]);
  return candidates[0];
}

function requireRelease(receiptFile = process.env.SCOREPLACE_E08_STAGE3_RELEASE_RECEIPT, mainCommit) {
  if (!receiptFile || !path.isAbsolute(receiptFile)) throw new Error('[E08] recibo E20 ausente');
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  try { releaseGate(receipt, mainCommit); }
  catch (_) { throw new Error('[E08] corte E20 ou leitor publicado não comprovados'); }
  return receipt;
}

async function requirePublishedRelease(receiptFile = process.env.SCOREPLACE_E08_STAGE3_RELEASE_RECEIPT,
  hooks = {}) {
  if (!hooks.mainCommit) execFileSync('git', ['fetch', 'origin', 'main'],
    { cwd: path.resolve(__dirname, '..'), stdio: 'ignore', timeout: 30000 });
  const mainCommit = hooks.mainCommit || execFileSync('git', ['rev-parse', 'origin/main'],
    { cwd: path.resolve(__dirname, '..'), encoding: 'utf8' }).trim();
  const receipt = requireRelease(receiptFile, mainCommit);
  await (hooks.verifyReader || verifyPublishedReader)(receipt);
  return receipt;
}

function requireApproval(plan, id, filename = process.env.SCOREPLACE_E08_APPROVAL_FILE) {
  if (!filename || !path.isAbsolute(filename)) throw new Error('[E08] autorização específica ausente');
  const approval = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (approval.schema !== 'scoreplace/e08-index-approval/1' || approval.project !== PROJECT ||
      approval.tournamentId !== id || approval.digest !== plan.digest ||
      typeof approval.authorizationRef !== 'string' || !approval.authorizationRef.trim() ||
      typeof approval.authorizedBy !== 'string' || !approval.authorizedBy.trim()) {
    throw new Error('[E08] autorização não corresponde ao lote atual');
  }
  return approval;
}

async function freshPlan(id, plan, fetchImpl = fetch) {
  const token = await accessTokenForServiceAccount();
  const readTime = new Date(Date.now() - 6000).toISOString();
  const current = await planner.preview(fetchImpl, token, readTime);
  const candidates = current.plans.filter(item => item.root.endsWith('/tournaments/' + id));
  if (candidates.length !== 1 || candidates[0].eligible !== true ||
      candidates[0].digest !== plan.digest) throw new Error('[E08] prévia mudou; gere e autorize novo lote');
  return { digest: plan.digest, tournamentId: id, candidates: plan.targets.length,
    readTime, productionWrites: 0 };
}

function serviceDb(env = process.env) {
  const key = JSON.parse(fs.readFileSync(credentialPath(env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) {
    throw new Error('[E08] credencial/projeto inválido');
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
  return admin.firestore();
}

async function capture(db, id, plan = null) {
  const ref = db.collection('tournaments').doc(id);
  const root = await ref.get();
  if (!root.exists) throw new Error('[E08] torneio ausente');
  const physical = (await ref.listCollections()).sort((a, b) => a.id.localeCompare(b.id));
  const physicalCollectionNames = physical.map(collection => collection.id);
  const collections = {};
  const names = [...new Set([...physicalCollectionNames,
    ...(plan ? ['matches', ...plan.readSet.extraCollections] : [])])].sort();
  for (const name of names) {
    collections[name] = (await ref.collection(name).get()).docs;
  }
  return { ref, root, collections, physicalCollectionNames };
}

function privateBackup(snapshot, outputDir = BACKUP_DIR) {
  const subcollections = Object.fromEntries(Object.entries(snapshot.collections).map(([name, docs]) =>
    [name, docs.map(doc => ({ id: doc.id, data: stable(doc.data()) }))
      .sort((a, b) => a.id.localeCompare(b.id))]));
  const createdAt = new Date().toISOString();
  const backup = buildOperationalBackup(snapshot.root, subcollections, createdAt, PROJECT);
  const filename = path.join(outputDir, 'e08-' + snapshot.root.id + '-' +
    createdAt.replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex') + '.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filename, backup.body, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(filename + '.manifest.json', JSON.stringify(backup.manifest, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  const reread = fs.readFileSync(filename, 'utf8');
  const sidecar = JSON.parse(fs.readFileSync(filename + '.manifest.json', 'utf8'));
  if (digest(reread) !== backup.sha256 || sidecar.sha256 !== backup.sha256 ||
      !core.same(JSON.parse(reread), backup.payload)) throw new Error('[E08] backup falhou na releitura');
  return { filename, sha256: backup.sha256 };
}

function receiptFile(id) { return path.join(RECEIPT_DIR, 'e08-' + id + '-apply-receipt-private.json'); }
function saveReceipt(id, plan, backup, approval, status, reason = '', filename = receiptFile(id)) {
  const body = { schema: 'scoreplace/e08-index-apply-receipt/1', project: PROJECT,
    tournamentId: id, planDigest: plan.digest, backupSha256: backup.sha256,
    authorizationRef: approval.authorizationRef, authorizedBy: approval.authorizedBy,
    status, ...(reason ? { failure: String(reason).slice(0, 240) } : {}),
    observedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + '.partial-' + process.pid + '-' + crypto.randomBytes(6).toString('hex');
  fs.writeFileSync(temporary, JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporary, filename); fs.chmodSync(filename, 0o600); }
  catch (error) { try { fs.unlinkSync(temporary); } catch (_) {} throw error; }
  return body;
}

async function main(args = process.argv.slice(2)) {
  const check = args.length === 2 && args[0] === '--check';
  const apply = args.length === 3 && args[0] === '--apply';
  if (!check && !apply) throw new Error('uso: --check <tournamentId> | --apply <digest> <tournamentId>');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('[E08] emulador ativo na CLI real');
  const id = check ? args[1] : args[2];
  // Torneios históricos podem preceder o gerador atual de IDs; o manifesto
  // privado fixa o caminho exato. Aqui só vedamos escape de documento.
  if (!/^[A-Za-z0-9_-]{1,240}$/.test(id)) throw new Error('[E08] ID inválido');
  const plan = readPlan(id);
  if (apply) {
    if (args[1] !== plan.digest) throw new Error('[E08] digest do lote divergente');
    await requirePublishedRelease();
    requireApproval(plan, id);
    const prior = receiptFile(id);
    if (fs.existsSync(prior)) throw new Error('[E08] recibo anterior exige auditoria manual antes de retry');
  }
  const fresh = await freshPlan(id, plan);
  if (check) { process.stdout.write(JSON.stringify(fresh, null, 2) + '\n'); return; }
  const approval = requireApproval(plan, id);
  const db = serviceDb();
  const before = await capture(db, id, plan);
  core.verifyPreflight(before.ref, plan, before.root, before.collections);
  const backup = privateBackup(before);
  // O recibo nasce ANTES da transação: queda do processo ou resposta incerta
  // nunca libera uma segunda aplicação cega do mesmo lote.
  saveReceipt(id, plan, backup, approval, 'PREPARED');
  let changed;
  try { changed = await core.applyPlan(db, before.ref, plan, before); }
  catch (error) {
    saveReceipt(id, plan, backup, approval, 'FALHA_APLICACAO_INCERTA', error.message);
    throw error;
  }
  try { await core.auditPlan(before.ref, plan, before); }
  catch (error) {
    saveReceipt(id, plan, backup, approval, 'FALHA_POS_AUDITORIA', error.message);
    throw error;
  }
  saveReceipt(id, plan, backup, approval, 'APPLIED_AUDITED');
  process.stdout.write(JSON.stringify({ tournamentId: id, planDigest: plan.digest,
    backupSha256: backup.sha256, updatedMatches: changed, audited: true }, null, 2) + '\n');
}

module.exports = { readPlan, requireRelease, requirePublishedRelease, requireApproval, freshPlan, serviceDb,
  capture, privateBackup, saveReceipt, main };
if (require.main === module) main().catch(error => {
  console.error('[E08] operação interrompida: ' + error.message);
  process.exitCode = 1;
});
