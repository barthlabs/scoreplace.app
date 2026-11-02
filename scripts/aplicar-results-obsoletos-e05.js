#!/usr/bin/env node
'use strict';

// Migração administrativa E05: apenas os dois fantasmas do Neon e os 98
// resultsSandbox do sandbox de teste. Nenhum modo genérico de exclusão.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const admin = require('../functions/node_modules/firebase-admin');
const { stable, digest } = require('./backup-torneio-operacional-core.js');
const { credentialPath } = require('./firebase-service-account-token.js');

const PROJECT = 'scoreplace-app';
const PRIVATE = path.resolve(__dirname, '../.claude/tmp');
const NEON_ID = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const TARGETS = Object.freeze({
  neon: {
    root: 'tournaments/' + NEON_ID, collection: 'results', count: 2,
    backup: '/Users/rtb/Documents/Codex/backups-operacionais/e05-neon-orphans-8f4b1390c0a6.json',
    backupSha256: '8f4b1390c0a6171b0d1b5e0fc0e109ee10e39aad6dc9509d9b46987aba2e0e99',
    manifest: path.join(PRIVATE, 'e05-neon-ghost-delete-manifest-20261102.json'),
    receipt: path.join(PRIVATE, 'e05-neon-ghost-delete-receipt-20261102.json'),
  },
  sandbox: {
    rootCollection: 'sandboxes', collection: 'resultsSandbox', count: 98,
    backup: '/Users/rtb/Documents/Codex/backups-operacionais/e05-sandbox-full-20261102-e3e7c2deccc7.json',
    backupSha256: 'e3e7c2deccc7932242e0a5292e41e9f22e1c7327019e9f961aeb3ac08ea39e62',
    manifest: path.join(PRIVATE, 'e05-results-sandbox-delete-manifest-20261102.json'),
    receipt: path.join(PRIVATE, 'e05-results-sandbox-delete-receipt-20261102.json'),
  },
});
const same = (a, b) => isDeepStrictEqual(stable(a), stable(b));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');

function readInputs(target, files = TARGETS) {
  const config = files[target];
  if (!config) throw new Error('alvo E05 desconhecido');
  const raw = fs.readFileSync(config.backup);
  if (digest(raw) !== config.backupSha256) throw new Error('backup integral divergiu');
  const backup = JSON.parse(raw);
  const rootPath = target === 'neon' ? config.root : backup.path;
  const savedRoot = target === 'neon' ? backup.tournament : backup.root;
  if (backup.project !== PROJECT || !savedRoot || !backup.subcollections ||
      rootPath.split('/').length !== 2 ||
      (target === 'neon' && (backup.schema !== 'scoreplace/tournament-operational-backup/1' ||
        rootPath !== 'tournaments/' + backup.tournamentId)) ||
      (target === 'sandbox' && (backup.schema !== 'scoreplace/e05-sandbox-operational-backup/1' ||
        !rootPath.startsWith('sandboxes/')))) throw new Error('backup fora do escopo');
  const plan = JSON.parse(fs.readFileSync(config.manifest, 'utf8'));
  const { digest: planDigest, ...withoutDigest } = plan;
  const digestActual = crypto.createHash('sha256').update(JSON.stringify(withoutDigest)).digest('hex');
  if (planDigest !== digestActual || plan.project !== PROJECT ||
      (plan.rootPath || plan.sandboxPath) !== rootPath ||
      plan.backupSha256 !== config.backupSha256 || !Array.isArray(plan.docs) ||
      plan.docs.length !== config.count ||
      !same(plan.rootUpdateTime, savedRoot.updateTime) ||
      plan.rootHash !== hash(savedRoot.data) ||
      plan.docs.some(doc => !doc.id || !doc.updateTime || !doc.hash)) {
    throw new Error('manifesto E05 fora do escopo ou adulterado');
  }
  return { config, backup, plan, rootPath, savedRoot };
}

async function capture(db, rootPath) {
  const ref = db.doc(rootPath);
  const root = await ref.get();
  if (!root.exists) throw new Error('raiz ausente');
  const collections = {};
  for (const col of await ref.listCollections()) collections[col.id] = (await col.get()).docs;
  return { ref, root, collections };
}

function assertScope(target, root, docs) {
  if (target === 'neon') {
    const data = root.data();
    const phase = Array.isArray(data.phases) && data.phases.length === 1 && data.phases[0];
    if (!phase || phase.kind !== 'classification' ||
        phase.classification?.structure !== 'groups' || data.thirdPlaceMatch ||
        docs.length !== 2 || docs.filter(doc => doc.data().p1 && doc.data().p2).length !== 1) {
      throw new Error('Neon deixou de ser grupo sem disputa de terceiro lugar');
    }
    for (const doc of docs) {
      const item = doc.data();
      if (item.roundLabel !== 'bui.thirdPlaceMatch' || item.winner != null ||
          item.score1 != null || item.score2 != null ||
          item.scoreP1 != null || item.scoreP2 != null ||
          (Array.isArray(item.sets) && item.sets.length) || item.replay != null) {
        throw new Error('resultado do Neon passou a conter placar ou outro jogo');
      }
    }
  } else if (root.data().sandboxOf !== NEON_ID || docs.length !== 98) {
    throw new Error('sandbox de teste fora do escopo');
  }
}

function assertTargetDocs(docs, plan) {
  const expected = new Map(plan.docs.map(doc => [doc.id, doc]));
  if (docs.length !== expected.size) throw new Error('quantidade de documentos mudou');
  for (const doc of docs) {
    const old = expected.get(doc.id);
    if (!old || !same(stable(doc.updateTime), old.updateTime) ||
        hash(doc.data()) !== old.hash) throw new Error('documento mudou desde a prévia');
  }
}

function assertBefore(target, state, input) {
  const { config, backup, plan, savedRoot } = input;
  if (!same(stable(state.root.updateTime), plan.rootUpdateTime) ||
      hash(state.root.data()) !== plan.rootHash ||
      !same(state.root.data(), savedRoot.data)) throw new Error('raiz mudou desde o backup');
  const actual = Object.keys(state.collections).sort();
  const expected = Object.keys(backup.subcollections).sort();
  if (!same(actual, expected)) throw new Error('subcoleções mudaram desde o backup');
  for (const name of expected) {
    const current = state.collections[name] || [];
    const saved = backup.subcollections[name] || [];
    if (current.length !== saved.length) throw new Error('subcoleção mudou: ' + name);
    const byId = new Map(saved.map(item => [item.id, item]));
    for (const doc of current) {
      const old = byId.get(doc.id);
      if (!old || !same(doc.data(), old.data) ||
          (old.updateTime && !same(stable(doc.updateTime), old.updateTime))) {
        throw new Error('documento divergiu do backup: ' + name);
      }
    }
  }
  const docs = state.collections[config.collection] || [];
  assertTargetDocs(docs, plan);
  assertScope(target, state.root, docs);
}

function assertAfter(before, after, collection) {
  if (!same(before.root.data(), after.root.data()) ||
      !same(stable(before.root.updateTime), stable(after.root.updateTime))) {
    throw new Error('pós-auditoria: raiz mudou');
  }
  if ((after.collections[collection] || []).length) throw new Error('pós-auditoria: índice ainda existe');
  const expectedNames = Object.keys(before.collections).filter(name => name !== collection).sort();
  const actualNames = Object.keys(after.collections).filter(name => name !== collection).sort();
  if (!same(expectedNames, actualNames)) throw new Error('pós-auditoria: outras coleções mudaram');
  for (const name of expectedNames) {
    const original = new Map(before.collections[name].map(doc => [doc.id, doc]));
    const current = after.collections[name] || [];
    if (current.length !== original.size) throw new Error('pós-auditoria: contagem mudou em ' + name);
    for (const doc of current) {
      const old = original.get(doc.id);
      if (!old || !same(doc.data(), old.data()) ||
          !same(stable(doc.updateTime), stable(old.updateTime))) {
        throw new Error('pós-auditoria: documento mudou em ' + name);
      }
    }
  }
}

function readApproval(target, input, filename = process.env.SCOREPLACE_E05_OBSOLETE_APPROVAL_FILE) {
  if (!filename || !path.isAbsolute(filename) || (fs.statSync(filename).mode & 0o077)) {
    throw new Error('autorização privada 0600 obrigatória');
  }
  const approval = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (approval.schema !== 'scoreplace/e05-obsolete-results-approval/1' ||
      approval.project !== PROJECT || approval.target !== target ||
      approval.digest !== input.plan.digest || !approval.authorizedBy ||
      !approval.authorizationRef || !Number.isFinite(Date.parse(approval.expiresAt)) ||
      Date.parse(approval.expiresAt) <= Date.now()) {
    throw new Error('autorização específica ausente, divergente ou expirada');
  }
  return approval;
}

function saveReceipt(filename, body, initial) {
  if (initial) {
    fs.writeFileSync(filename, JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return;
  }
  const temp = filename + '.partial-' + process.pid;
  fs.writeFileSync(temp, JSON.stringify(body, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.renameSync(temp, filename);
}

async function apply(db, target, input, approval, receiptFile = input.config.receipt) {
  if (fs.existsSync(receiptFile)) throw new Error('recibo anterior existe; não repetir cegamente');
  const before = await capture(db, input.rootPath);
  assertBefore(target, before, input);
  const receipt = { schema: 'scoreplace/e05-obsolete-results-receipt/1', project: PROJECT,
    target, digest: input.plan.digest, backupSha256: input.config.backupSha256,
    authorizationRef: approval.authorizationRef, status: 'PREPARED',
    startedAt: new Date().toISOString(), deleted: 0 };
  saveReceipt(receiptFile, receipt, true);
  try {
    await db.runTransaction(async tx => {
      const root = await tx.get(before.ref);
      const query = await tx.get(before.ref.collection(input.config.collection));
      if (!root.exists || !same(stable(root.updateTime), input.plan.rootUpdateTime) ||
          hash(root.data()) !== input.plan.rootHash) throw new Error('raiz mudou na transação');
      assertTargetDocs(query.docs, input.plan);
      assertScope(target, root, query.docs);
      for (const doc of query.docs) tx.delete(doc.ref, { lastUpdateTime: doc.updateTime });
    }, { maxAttempts: 1 });
    receipt.deleted = input.config.count;
    const after = await capture(db, input.rootPath);
    assertAfter(before, after, input.config.collection);
    receipt.status = 'APPLIED_AUDITED';
    receipt.finishedAt = new Date().toISOString();
    saveReceipt(receiptFile, receipt, false);
    return receipt;
  } catch (error) {
    receipt.status = 'UNCERTAIN';
    receipt.error = String(error.message || error).slice(0, 240);
    saveReceipt(receiptFile, receipt, false);
    throw error;
  }
}

function serviceDb() {
  const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) throw new Error('credencial inválida');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
  return admin.firestore();
}

async function main(args = process.argv.slice(2)) {
  const check = args.length === 2 && args[0] === '--check';
  const write = args.length === 3 && args[0] === '--apply';
  if (!check && !write) throw new Error('uso: --check neon|sandbox | --apply neon|sandbox <digest>');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('CLI real recusada no emulador');
  const target = args[1], input = readInputs(target);
  if (write && args[2] !== input.plan.digest) throw new Error('digest divergente');
  const approval = write ? readApproval(target, input) : null;
  const db = serviceDb();
  if (check) {
    assertBefore(target, await capture(db, input.rootPath), input);
    console.log(JSON.stringify({ target, count: input.config.count,
      digest: input.plan.digest, backupSha256: input.config.backupSha256, productionWrites: 0 }));
  } else {
    const result = await apply(db, target, input, approval);
    console.log(JSON.stringify({ target, status: result.status, deleted: result.deleted }));
  }
}

module.exports = { TARGETS, readInputs, capture, assertScope, assertTargetDocs,
  assertBefore, assertAfter, readApproval, apply, serviceDb, main };
if (require.main === module) main().catch(error => {
  console.error('[E05] exclusão interrompida:', error.message);
  process.exitCode = 1;
});
