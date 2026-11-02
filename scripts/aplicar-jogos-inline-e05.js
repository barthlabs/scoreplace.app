#!/usr/bin/env node
'use strict';

// Aplicador do lote E05. --check é GET-only; --apply exige recibo web E20.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const { stable } = require('./backup-torneio-operacional-core.js');
const { credentialPath } = require('./firebase-service-account-token.js');
const preview = require('./planejar-jogos-inline-e05-core.js');
const previewCli = require('./planejar-jogos-inline-e05.js');
const core = require('./aplicar-jogos-inline-e05-core.js');

const MANIFEST = path.resolve(__dirname, '../.claude/tmp/e05-inline-manifest-private.json');
const RECEIPT = path.resolve(__dirname, '../.claude/tmp/e05-inline-apply-receipt-private.json');
const RELEASE_ENV = 'SCOREPLACE_E05_STAGE3_RELEASE_RECEIPT';

function releaseGate(digest, env = process.env) {
  const filename = env[RELEASE_ENV];
  if (!filename || !path.isAbsolute(filename)) throw new Error('recibo E20 ausente');
  const receipt = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (receipt.schema !== 'scoreplace/stage3-release/1' ||
      receipt.project !== 'scoreplace-app' || receipt.manifestDigest !== digest ||
      receipt.stage3Published !== true ||
      !/^[a-f0-9]{40}$/i.test(receipt.hostingCommit || '') ||
      !/^[a-f0-9]{64}$/i.test(receipt.readerSha256 || '') ||
      !/^[a-f0-9]{64}$/i.test(receipt.indexSha256 || '')) {
    throw new Error('recibo E20 incompleto ou divergente');
  }
  return receipt;
}

async function verifyPublishedReader(receipt, fetchImpl = fetch,
  publicDir = path.resolve(__dirname, '../www')) {
  const sha = body => crypto.createHash('sha256').update(body).digest('hex');
  for (const [asset, key] of [['index.html', 'indexSha256'],
    ['js/views/tournament-split-core.js', 'readerSha256']]) {
    const local = fs.readFileSync(path.join(publicDir, asset), 'utf8');
    if (sha(local) !== receipt[key]) throw new Error('[E05] artefato web local diverge do recibo E20');
    const response = await fetchImpl('https://scoreplace.app/' + asset + '?e05=' + Date.now(),
      { method: 'GET', cache: 'no-store' });
    if (!response.ok || sha(await response.text()) !== receipt[key]) {
      throw new Error('[E05] web publicada diverge do recibo E20');
    }
  }
  const reader = fs.readFileSync(path.join(publicDir, 'js/views/tournament-split-core.js'), 'utf8');
  const index = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  if (!reader.includes('_inlineGamesExternalized') ||
      !index.includes('js/views/tournament-split-core.js')) {
    throw new Error('[E05] leitor web externo não comprovado');
  }
  return true;
}

function readManifest(filename = MANIFEST) {
  const manifest = JSON.parse(fs.readFileSync(filename, 'utf8'));
  core.validateManifest(manifest);
  return manifest;
}

async function inspectTarget(db, target, entry, backup) {
  const query = await db.collection('tournaments').where('name', '==', target.name).get();
  if (query.size !== 1) throw new Error('[E05] alvo ausente ou duplicado');
  const root = query.docs[0];
  if (root.ref.path !== entry.root.path) throw new Error('[E05] caminho do alvo mudou');
  const collections = {};
  for (const collection of await root.ref.listCollections()) {
    const snap = await collection.get();
    collections[collection.id] = snap.docs;
  }
  if (root.data()._inlineGamesExternalized === true) {
    const physical = collections.matches || [];
    if (physical.length !== entry.existingMatches + target.count) {
      throw new Error('[E05] número de jogos físicos divergente');
    }
    core.validateApplied(root.data(), new Map(physical.map(doc => [doc.id, doc.data()])), target, entry);
    return { status: 'done', root };
  }
  const fresh = preview.validateTarget(target, root, collections, backup.body, backup.hash);
  if (!preview.same(fresh, entry)) throw new Error('[E05] prévia desatualizada');
  core.proposed(root.data(), target, entry);
  return { status: 'ready', root };
}

async function applyTarget(db, target, entry) {
  const ref = db.doc(entry.root.path);
  const destinations = entry.entries.map(game => ref.collection('matches').doc(game.id));
  const results = entry.entries.map(game => ref.collection('results').doc(game.id));
  return db.runTransaction(async tx => {
    const root = await tx.get(ref);
    const allMatches = await tx.get(ref.collection('matches'));
    const physical = await Promise.all(destinations.map(doc => tx.get(doc)));
    const result = await Promise.all(results.map(doc => tx.get(doc)));
    if (!root.exists) throw new Error('[E05] raiz desapareceu');
    if (root.data()._inlineGamesExternalized === true) {
      if (allMatches.size !== entry.existingMatches + target.count) {
        throw new Error('[E05] contagem física migrada divergente');
      }
      core.validateApplied(root.data(), new Map(physical.map((doc, i) =>
        [entry.entries[i].id, doc.exists ? doc.data() : null])), target, entry);
      return 'done';
    }
    if (!preview.same(stable(root.updateTime), entry.root.updateTime) ||
        preview.hash(root.data()) !== entry.root.hash) {
      throw new Error('[E05] CAS da raiz falhou');
    }
    if (allMatches.size !== entry.existingMatches) {
      throw new Error('[E05] contagem física mudou desde a prévia');
    }
    for (let i = 0; i < entry.entries.length; i++) {
      const item = entry.entries[i];
      if (physical[i].exists || !result[i].exists ||
          !preview.same(stable(result[i].updateTime), item.result.updateTime) ||
          preview.hash(result[i].data()) !== item.result.hash) {
        throw new Error('[E05] destino ocupado ou resultado mudou');
      }
    }
    const mutation = core.proposed(root.data(), target, entry);
    const records = new Map(mutation.records.map(record => [record._chave, record]));
    for (let i = 0; i < entry.entries.length; i++) {
      tx.create(destinations[i], records.get(entry.entries[i].id));
    }
    const patch = mutation.patch;
    if (target.kind === 'thirdPlace') patch.thirdPlaceMatch = admin.firestore.FieldValue.delete();
    patch.updatedAt = admin.firestore.FieldValue.serverTimestamp();
    tx.update(ref, patch, { lastUpdateTime: root.updateTime });
    return 'applied';
  });
}

// O lote autorizado é indivisível: os três torneios são lidos e gravados no
// mesmo commit. O aplicador de alvo isolado acima fica para os testes antigos;
// a CLI real passa somente por esta função.
async function applyBatch(db, manifest, backups, options = {}) {
  const candidates = preview.TARGETS.map((target, i) => ({
    target, entry: manifest.targets[i], backup: backups.get(target.name)
  }));
  if (candidates.some(item => !item.backup)) throw new Error('[E05] backup do lote incompleto');
  if (candidates.reduce((n, item) => n + item.entry.entries.length + 1, 0) > 400) {
    throw new Error('[E05] lote supera teto de escritas');
  }
  return db.runTransaction(async tx => {
    const prepared = [];
    let bytes = 0;
    // Todas as leituras precedem todas as escritas, inclusive na terceira raiz.
    for (const item of candidates) {
      const ref = db.doc(item.entry.root.path);
      const root = await tx.get(ref);
      if (!root.exists) throw new Error('[E05] raiz desapareceu');
      const collections = {};
      const names = Object.keys(item.backup.body.subcollections).sort();
      for (const name of names) collections[name] = (await tx.get(ref.collection(name))).docs;
      const fresh = preview.validateTarget(item.target, root, collections,
        item.backup.body, item.backup.hash);
      if (!preview.same(fresh, item.entry)) throw new Error('[E05] prévia desatualizada');
      const mutation = core.proposed(root.data(), item.target, item.entry);
      const records = new Map(mutation.records.map(record => [record._chave, record]));
      bytes += Buffer.byteLength(JSON.stringify({ root: stable(root.data()),
        collections: Object.fromEntries(Object.entries(collections).map(([name, docs]) =>
          [name, docs.map(doc => ({ id: doc.id, data: stable(doc.data()) }))])) }), 'utf8');
      prepared.push({ ...item, ref, root, mutation, records });
    }
    if (bytes > 4 * 1024 * 1024) throw new Error('[E05] lote supera teto de bytes');
    if (typeof options.beforeWrite === 'function') await options.beforeWrite(prepared);
    for (const item of prepared) {
      for (const entry of item.entry.entries) {
        tx.create(item.ref.collection('matches').doc(entry.id), item.records.get(entry.id));
      }
      const patch = { ...item.mutation.patch,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() };
      if (item.target.kind === 'thirdPlace') {
        patch.thirdPlaceMatch = admin.firestore.FieldValue.delete();
      }
      tx.update(item.ref, patch, { lastUpdateTime: item.root.updateTime });
    }
    return 'applied';
  }, { maxAttempts: 1 });
}

function changedFields(expected, actual, prefix = '') {
  if (preview.same(expected, actual)) return [];
  if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object' ||
      Array.isArray(expected) || Array.isArray(actual)) return [prefix || '(documento)'];
  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...keys].sort().flatMap(key => changedFields(expected[key], actual[key],
    prefix ? prefix + '.' + key : key));
}

async function auditBatch(db, manifest, backups) {
  for (let i = 0; i < preview.TARGETS.length; i++) {
    const target = preview.TARGETS[i], entry = manifest.targets[i];
    const backup = backups.get(target.name).body;
    const ref = db.doc(entry.root.path), root = await ref.get();
    if (!root.exists) throw new Error('[E05] pós-auditoria: raiz ausente');
    const original = backup.tournament.data;
    const mutation = core.proposed(original, target, entry);
    const expectedRoot = { ...original, ...mutation.patch, updatedAt: root.data().updatedAt };
    if (target.kind === 'thirdPlace') delete expectedRoot.thirdPlaceMatch;
    if (!preview.same(root.data(), expectedRoot)) {
      throw new Error('[E05] pós-auditoria: raiz divergiu em ' +
        changedFields(expectedRoot, root.data()).join(', '));
    }
    const names = [...new Set([...Object.keys(backup.subcollections), 'matches'])].sort();
    const nowNames = (await ref.listCollections()).map(collection => collection.id).sort();
    if (!preview.same(names, nowNames)) throw new Error('[E05] pós-auditoria: coleções divergiram');
    for (const name of names) {
      const docs = (await ref.collection(name).get()).docs;
      const originals = backup.subcollections[name] || [];
      const old = new Map(originals.map(doc => [doc.id, doc.data]));
      const added = name === 'matches' ? new Map(mutation.records.map(doc => [doc._chave, doc])) : new Map();
      if (docs.length !== old.size + added.size) throw new Error('[E05] pós-auditoria: contagem divergente');
      for (const doc of docs) {
        const expected = old.has(doc.id) ? old.get(doc.id) : added.get(doc.id);
        if (!expected || !preview.same(doc.data(), expected)) {
          throw new Error('[E05] pós-auditoria: documento divergente em ' + name +
            '; campos ' + changedFields(expected, doc.data()).join(', '));
        }
      }
    }
    const physical = (await ref.collection('matches').get()).docs;
    core.validateApplied(root.data(), new Map(physical.map(doc => [doc.id, doc.data()])), target, entry);
  }
  return true;
}

function saveReceipt(digest, statuses, filename = RECEIPT, auditStatus = 'APPLIED_AUDITED', reason = '') {
  const payload = { schema: 'scoreplace/e05-inline-apply-receipt/1', project: 'scoreplace-app',
    manifestDigest: digest, observedAt: new Date().toISOString(),
    auditStatus, ...(reason ? { auditFailure: String(reason).slice(0, 240) } : {}),
    authorizedBy: 'proprietário do Scoreplace',
    authorizationRef: 'conversa/2026-11-01/E05-14-jogos-inline',
    targets: statuses.map(item => ({ name: item.name, status: item.status })) };
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + '.partial-' + process.pid;
  fs.writeFileSync(temporary, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    fs.renameSync(temporary, filename);
    fs.chmodSync(filename, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
}

async function run(db, manifest, backups, apply, options = {}) {
  const receiptFile = options.receiptFile || RECEIPT;
  let priorFailure = false;
  if (fs.existsSync(receiptFile)) {
    const previous = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    priorFailure = previous.manifestDigest === manifest.digest &&
      previous.auditStatus === 'FALHA_POS_AUDITORIA';
  }
  if (priorFailure) {
    if (apply) throw new Error('[E05] falha pós-auditoria anterior; revisão manual obrigatória');
    return { manifestDigest: manifest.digest, targets: [], postAuditFailure: true,
      productionGamesCreated: 0, productionRootsUpdated: 0 };
  }
  const statuses = [];
  for (let i = 0; i < preview.TARGETS.length; i++) {
    const target = preview.TARGETS[i];
    const entry = manifest.targets[i];
    const inspected = await inspectTarget(db, target, entry, backups.get(target.name));
    statuses.push({ name: target.name, status: inspected.status });
  }
  if (apply) {
    const ready = statuses.filter(item => item.status === 'ready').length;
    if (ready && ready !== statuses.length) throw new Error('[E05] lote parcialmente migrado; revisão manual obrigatória');
    if (ready) {
      if (typeof options.beforeTransaction === 'function') await options.beforeTransaction();
      await applyBatch(db, manifest, backups, options);
      if (typeof options.afterCommit === 'function') await options.afterCommit();
      try { await auditBatch(db, manifest, backups); }
      catch (error) {
        saveReceipt(manifest.digest, statuses, receiptFile, 'FALHA_POS_AUDITORIA', error.message);
        throw error;
      }
      statuses.forEach(item => { item.status = 'applied'; });
      saveReceipt(manifest.digest, statuses, receiptFile);
    }
  }
  const applied = apply ? statuses.filter(x => x.status === 'applied') : [];
  return { manifestDigest: manifest.digest, targets: statuses,
    postAuditFailure: priorFailure,
    productionGamesCreated: applied.reduce((sum, item) => sum +
      preview.TARGETS.find(target => target.name === item.name).count, 0),
    productionRootsUpdated: applied.length };
}

async function main(args = process.argv.slice(2)) {
  const apply = args.length === 2 && args[0] === '--apply';
  if (!((args.length === 1 && args[0] === '--check') || apply)) {
    throw new Error('uso: --check | --apply <digest-exato>');
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('emulador ativo');
  const manifest = readManifest();
  if (apply) {
    if (args[1] !== manifest.digest) throw new Error('digest autorizado divergente');
    await verifyPublishedReader(releaseGate(manifest.digest));
  }
  const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== 'scoreplace-app') {
    throw new Error('credencial/projeto inválido');
  }
  const backups = previewCli.loadBackups();
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: 'scoreplace-app' });
  const report = await run(admin.firestore(), manifest, backups, apply);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

module.exports = { releaseGate, verifyPublishedReader, readManifest, inspectTarget, applyTarget, applyBatch,
  auditBatch, saveReceipt, run, main };
if (require.main === module) main().catch(error => {
  console.error('[E05] operação interrompida: ' + error.message);
  process.exitCode = 1;
});
