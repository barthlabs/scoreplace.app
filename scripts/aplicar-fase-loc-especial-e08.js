#!/usr/bin/env node
'use strict';

// E08: lote fechado dos 14 jogos antes embutidos nas três raízes de fase única.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token.js');
const { stable, digest, buildOperationalBackup } = require('./backup-torneio-operacional-core.js');
const { hash, same, entry } = require('./atribuir-fase-e07-core.js');
const { report } = require('./auditar-indice-fases-core.js');
const { capture, requirePublishedRelease } = require('./aplicar-indice-canonico-e08.js');

const PROJECT = 'scoreplace-app';
const DIR = path.resolve(__dirname, '../.claude/tmp');
const SOURCE = path.join(DIR, 'e05-inline-manifest-private.json');
const MANIFEST = path.join(DIR, 'e08-phase14-manifest-private.json');
const RECEIPT = path.join(DIR, 'e08-phase14-receipt-private.json');
const BACKUP_DIR = '/Users/rtb/Documents/Codex/backups-operacionais';
// Manifesto E05: Corpus (3º lugar), Misto (2 grupos × 3 rodadas × 2 jogos),
// Duplas Mistas (3º lugar). Recusar qualquer cardinalidade diferente.
const EXPECTED = Object.freeze([1, 12, 1]);

function fail(message) { throw new Error('[E08 fase14] ' + message); }
function savePrivate(filename, value, exclusive = false) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n',
    { flag: exclusive ? 'wx' : 'w', mode: 0o600 });
  fs.chmodSync(filename, 0o600);
}
function sourceTargets(filename = SOURCE) {
  const source = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (source.schema !== 'scoreplace/e05-inline-preview/1' || source.project !== PROJECT ||
      !Array.isArray(source.targets) || source.targets.length !== 3) fail('manifesto de origem inválido');
  return source.targets.map((target, index) => {
    if (!Array.isArray(target.entries) || target.entries.length !== EXPECTED[index] ||
        !/^tournaments\/[A-Za-z0-9_-]+$/.test(target.root?.path || '')) fail('contagem ou raiz de origem inválida');
    const ids = target.entries.map(item => item.id);
    if (new Set(ids).size !== ids.length || target.entries.some(item =>
      item.destination !== target.root.path + '/matches/' + item.id ||
      !['groupRounds', 'thirdPlace'].includes(item.loc?.tipo))) fail('jogo de origem inválido');
    return { id: target.root.path.split('/').pop(), name: target.name,
      entries: target.entries.map(item => ({ id: item.id, loc: item.loc })) };
  });
}
function snapshotProof(snapshot) {
  return { root: entry(snapshot.root), collectionNames: snapshot.physicalCollectionNames,
    collections: Object.fromEntries(Object.entries(snapshot.collections).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, docs]) => [name, docs.map(entry).sort((a, b) => a.path.localeCompare(b.path))])) };
}
function validate(snapshot, target) {
  const root = snapshot.root.data();
  if (!snapshot.root.exists || snapshot.root.ref.path !== 'tournaments/' + target.id ||
      root?.name !== target.name || !Array.isArray(root.phases) || root.phases.length !== 1 ||
      Array.isArray(root.phaseRounds) && root.phaseRounds.length > 0 ||
      !Number.isSafeInteger(root?._nPartes?.matches)) fail('raiz ou fase mudou');
  const matches = snapshot.collections.matches || [];
  if (matches.length !== root._nPartes.matches ||
      matches.length < target.entries.length) fail('contagem física divergiu');
  const byId = new Map(matches.map(doc => [doc.id, doc]));
  if (byId.size !== matches.length) fail('IDs físicos repetidos');
  for (const expected of target.entries) {
    const doc = byId.get(expected.id), data = doc?.data();
    if (!doc || doc.ref.path !== 'tournaments/' + target.id + '/matches/' + expected.id ||
        !data?.jogo || data.jogo.id !== expected.id || !same(data._loc, expected.loc) ||
        Object.hasOwn(data, '_phaseIndex') || Object.hasOwn(data.jogo, 'phaseIndex')) {
      fail('alvo mudou, recebeu fase ou perdeu identidade');
    }
  }
  const audit = report(root, matches.map(doc => doc.data()));
  if (!audit.counterMatches || audit.counts.ambiguo !== target.entries.length ||
      audit.counts.divergente !== 0) fail('classificação prévia mudou');
  return true;
}
function privateBackup(snapshot, outputDir = BACKUP_DIR) {
  const subcollections = Object.fromEntries(Object.entries(snapshot.collections).map(([name, docs]) =>
    [name, docs.map(doc => ({ id: doc.id, data: stable(doc.data()) }))
      .sort((a, b) => a.id.localeCompare(b.id))]));
  const createdAt = new Date().toISOString();
  const backup = buildOperationalBackup(snapshot.root, subcollections, createdAt, PROJECT);
  const filename = path.join(outputDir, 'e08-phase14-' + snapshot.root.id + '-' +
    createdAt.replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex') + '.json');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(filename, backup.body, { flag: 'wx', mode: 0o600 });
  savePrivate(filename + '.manifest.json', backup.manifest, true);
  if (digest(fs.readFileSync(filename, 'utf8')) !== backup.sha256 ||
      JSON.parse(fs.readFileSync(filename + '.manifest.json', 'utf8')).sha256 !== backup.sha256) {
    fail('backup não foi relido');
  }
  return { filename, sha256: backup.sha256 };
}
async function captureAll(db, targets) {
  const snapshots = [];
  for (const target of targets) {
    const snapshot = await capture(db, target.id);
    validate(snapshot, target);
    snapshots.push(snapshot);
  }
  return snapshots;
}
function makePlan(targets, snapshots, backups) {
  const entries = targets.map((target, index) => ({ id: target.id, name: target.name,
    targets: target.entries, proof: snapshotProof(snapshots[index]),
    backupSha256: backups[index].sha256, backupFile: backups[index].filename }));
  return { schema: 'scoreplace/e08-phase14-plan/1', project: PROJECT, entries,
    digest: hash(entries) };
}
function assertPlan(plan, targets, snapshots, backups) {
  if (plan.schema !== 'scoreplace/e08-phase14-plan/1' || plan.project !== PROJECT ||
      plan.digest !== hash(plan.entries) || !same(plan, makePlan(targets, snapshots, backups))) {
    fail('prévia obsoleta: gerar novo lote');
  }
}
function assertAgainstBackup(snapshots, backups) {
  for (let i = 0; i < snapshots.length; i++) {
    const body = fs.readFileSync(backups[i].filename, 'utf8');
    if (digest(body) !== backups[i].sha256) fail('backup alterado');
    const parsed = JSON.parse(body);
    const snapshot = snapshots[i];
    if (parsed.tournamentId !== snapshot.root.id ||
        !same(parsed.tournament.data, snapshot.root.data()) ||
        !same(parsed.tournament.updateTime, stable(snapshot.root.updateTime))) fail('raiz divergiu do backup');
    const names = Object.keys(snapshot.collections).sort();
    if (!same(names, Object.keys(parsed.subcollections).sort())) fail('subcoleções divergiram');
    for (const name of names) {
      const old = parsed.subcollections[name];
      const now = snapshot.collections[name].map(doc => ({ id: doc.id, data: stable(doc.data()) }))
        .sort((a, b) => a.id.localeCompare(b.id));
      if (!same(old, now)) fail('documento divergiu do backup');
    }
  }
}
function approval(plan, filename = process.env.SCOREPLACE_E08_PHASE14_APPROVAL_FILE) {
  if (!filename || !path.isAbsolute(filename)) fail('autorização específica ausente');
  const body = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (body.schema !== 'scoreplace/e08-phase14-approval/1' || body.project !== PROJECT ||
      body.digest !== plan.digest || body.authorizedBy !== 'proprietario' ||
      typeof body.authorizationRef !== 'string' || !body.authorizationRef.trim()) fail('autorização não cobre o lote');
  return body;
}
function backupsFromPlan(plan, backupDir = BACKUP_DIR) {
  if (!Array.isArray(plan?.entries) || plan.entries.length !== 3) fail('manifesto do lote inválido');
  return plan.entries.map(item => {
    if (typeof item.backupFile !== 'string' || path.dirname(item.backupFile) !== backupDir ||
        !path.basename(item.backupFile).startsWith('e08-phase14-' + item.id + '-') ||
        !fs.existsSync(item.backupFile) || !/^[a-f0-9]{64}$/.test(item.backupSha256)) {
      fail('backup do lote ausente ou inválido');
    }
    return { filename: item.backupFile, sha256: item.backupSha256 };
  });
}
async function preview(db, outputDir = BACKUP_DIR) {
  const targets = sourceTargets();
  const snapshots = await captureAll(db, targets);
  const backups = snapshots.map(item => privateBackup(item, outputDir));
  assertAgainstBackup(snapshots, backups);
  const plan = makePlan(targets, snapshots, backups);
  savePrivate(MANIFEST, plan);
  return { digest: plan.digest, targets: targets.map((item, index) => ({
    name: item.name, count: item.entries.length, backupSha256: backups[index].sha256 })),
    matchesUpdated: 0, productionWrites: 0 };
}
async function applyVerified(db, plan, targets, backups, hooks = {}) {
  const before = await captureAll(db, targets);
  assertAgainstBackup(before, backups);
  assertPlan(plan, targets, before, backups);
  if (Buffer.byteLength(JSON.stringify(before.map(snapshotProof))) > 4 * 1024 * 1024) fail('leitura supera 4 MiB');
  // Leituras feitas por tx.get participam do controle de concorrência do Firestore:
  // raiz e partes lidas são travadas ou verificadas no commit. Escrever um no-op
  // nelas alteraria updateTime e violaria o escopo de dois campos nos 14 jogos.
  await db.runTransaction(async tx => {
    const fresh = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const ref = db.collection('tournaments').doc(target.id);
      // listCollections não participa da transação; conferir a lista antes das
      // leituras transacionais e novamente na pós-auditoria. Documentos lidos
      // via tx.get e o lastUpdateTime abaixo protegem o conjunto conhecido.
      const names = (await ref.listCollections()).map(col => col.id).sort();
      if (!same(names, before[i].physicalCollectionNames)) fail('subcoleção nova ou removida');
      const root = await tx.get(ref);
      const collections = {};
      for (const name of names) {
        collections[name] = (await tx.get(ref.collection(name))).docs;
      }
      const snapshot = { root, collections, physicalCollectionNames: names };
      validate(snapshot, target);
      fresh.push(snapshot);
    }
    assertAgainstBackup(fresh, backups);
    assertPlan(plan, targets, fresh, backups);
    let writes = 0;
    for (let i = 0; i < targets.length; i++) {
      const byId = new Map(fresh[i].collections.matches.map(doc => [doc.id, doc]));
      for (const target of targets[i].entries) {
        const doc = byId.get(target.id);
        tx.update(doc.ref, { 'jogo.phaseIndex': 0, _phaseIndex: 0 }, { lastUpdateTime: doc.updateTime });
        writes++;
        if (hooks.afterWrite) hooks.afterWrite(writes);
      }
    }
  }, { maxAttempts: 1 });
  try {
    if (hooks.afterCommit) await hooks.afterCommit();
    const after = await captureAllAfter(db, targets);
    auditAfter(before, after, targets);
  } catch (error) {
    error.committed = true;
    throw error;
  }
  return { matchesUpdated: 14, audited: true, digest: plan.digest };
}
async function captureAllAfter(db, targets) {
  const snapshots = [];
  for (const target of targets) snapshots.push(await capture(db, target.id));
  return snapshots;
}
function auditAfter(before, after, targets) {
  for (let i = 0; i < targets.length; i++) {
    const prior = before[i], now = after[i];
    if (!same(entry(prior.root), entry(now.root)) ||
        !same(prior.physicalCollectionNames, now.physicalCollectionNames)) fail('pós-auditoria: raiz ou coleções mudaram');
    const targetIds = new Set(targets[i].entries.map(item => item.id));
    for (const name of prior.physicalCollectionNames) {
      const old = new Map(prior.collections[name].map(doc => [doc.id, doc]));
      const current = now.collections[name] || [];
      if (old.size !== current.length) fail('pós-auditoria: contagem mudou');
      for (const doc of current) {
        const previous = old.get(doc.id);
        if (!previous) fail('pós-auditoria: documento novo');
        if (name === 'matches' && targetIds.has(doc.id)) {
          const expected = stable(previous.data());
          expected._phaseIndex = 0;
          expected.jogo.phaseIndex = 0;
          if (!same(expected, doc.data())) fail('pós-auditoria: jogo ou placar mudou');
        } else if (!same(entry(previous), entry(doc))) fail('pós-auditoria: outro documento mudou');
      }
    }
    const audit = report(now.root.data(), now.collections.matches.map(doc => doc.data()));
    if (audit.counts.ambiguo !== 0 || audit.counts.divergente !== 0 ||
        !audit.counterMatches) fail('pós-auditoria: índice incompleto');
  }
}
function serviceDb() {
  const keyFile = credentialPath(process.env);
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) fail('credencial/projeto inválido');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
  return admin.firestore();
}
async function main(args = process.argv.slice(2), hooks = {}) {
  if (process.env.FIRESTORE_EMULATOR_HOST && !hooks.allowEmulator) fail('CLI real não roda no emulador');
  const isPreview = args.length === 1 && args[0] === '--preview';
  const isApply = args.length === 2 && args[0] === '--apply' && /^[a-f0-9]{64}$/.test(args[1]);
  if (!isPreview && !isApply) fail('uso: --preview | --apply <digest>');
  const db = hooks.db || serviceDb();
  if (isPreview) return preview(db);
  const plan = JSON.parse(fs.readFileSync(hooks.manifestFile || MANIFEST, 'utf8'));
  if (plan.digest !== args[1]) fail('digest divergente');
  if (!hooks.skipRelease) await requirePublishedRelease();
  const authorized = hooks.authorized || approval(plan);
  const receiptFile = hooks.receiptFile || RECEIPT;
  // PREPARED pode sobreviver a uma queda após o commit. Não repetir: auditar
  // manualmente os 14 alvos contra o backup e resolver o recibo primeiro.
  if (fs.existsSync(receiptFile)) fail('recibo anterior exige auditoria antes de retry');
  const targets = hooks.targets || sourceTargets();
  const backups = backupsFromPlan(plan, hooks.backupDir || BACKUP_DIR);
  const before = await captureAll(db, targets);
  assertAgainstBackup(before, backups);
  assertPlan(plan, targets, before, backups);
  savePrivate(receiptFile, { status: 'PREPARED', digest: plan.digest,
    backupSha256: backups.map(item => item.sha256), authorizationRef: authorized.authorizationRef,
    at: new Date().toISOString() }, true);
  try {
    const outcome = await applyVerified(db, plan, targets, backups, hooks.applyHooks || {});
    savePrivate(receiptFile, { status: 'APPLIED_AUDITED', ...outcome,
      backupSha256: backups.map(item => item.sha256), authorizationRef: authorized.authorizationRef,
      at: new Date().toISOString() });
    return outcome;
  } catch (error) {
    savePrivate(receiptFile, { status: error.committed ? 'APPLIED_UNVERIFIED' : 'INDETERMINATE',
      digest: plan.digest, backupSha256: backups.map(item => item.sha256),
      targetPaths: plan.entries.flatMap(item => item.targets.map(target =>
        'tournaments/' + item.id + '/matches/' + target.id)),
      authorizationRef: authorized.authorizationRef,
      error: String(error.message).slice(0, 200), at: new Date().toISOString() });
    throw error;
  }
}
module.exports = { sourceTargets, validate, snapshotProof, makePlan, assertPlan, assertAgainstBackup,
  preview, applyVerified, auditAfter, privateBackup, backupsFromPlan, serviceDb, approval, main };
if (require.main === module) main().then(value => process.stdout.write(JSON.stringify(value, null, 2) + '\n'))
  .catch(error => { console.error(String(error.message).replace(/tour_[A-Za-z0-9_-]+/g, '[id]')); process.exitCode = 1; });
