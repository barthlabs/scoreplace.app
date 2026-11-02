#!/usr/bin/env node
'use strict';

// E24: traduz apenas as duas raízes vazias identificadas pelo censo E23.
// --preview é somente leitura; --apply exige manifesto e autorização próprios.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const { stable, digest, buildOperationalBackup } = require('./backup-torneio-operacional-core');
const C = require('./migrar-fmt2-core');
const { _window } = require('../functions-autodraw/draw-core');

const PROJECT = 'scoreplace-app';
const IDS = Object.freeze([
  'tour_1793559174575_ea6d5e750d5249ecd36d27850edb10d6',
  'tour_1793559261113_8c40438529c786c0bb0ae85ac6930f51'
]);
// Autorização específica do proprietário para estas duas raízes, recebida
// depois da prévia E24. O manifesto dos 73 do dia 27/10 não as contém.
// Outra prévia/digest requer nova autorização e atualização revisada do gate.
const APPROVED_DIGEST = 'bf9d0ed6ae4c5ccbd4fcc2e75e86fa1f3b468ff02cd1cf31357015a70d2fc624';
const APPROVAL_REF = 'conversa/E24/call_3bfdce8fe88347108615d20e798f6463/1';
const BACKUPS = '/Users/rtb/Documents/Codex/backups-operacionais';
const PRIVATE = path.resolve(__dirname, '../.claude/tmp');
const same = (a, b) => isDeepStrictEqual(stable(a), stable(b));

function fail(reason) { throw new Error('[E24] ' + reason); }
function writePrivate(filename, value) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = filename + '.partial-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  fs.renameSync(temporary, filename);
  fs.chmodSync(filename, 0o600);
}
async function capture(db, id) {
  if (!IDS.includes(id)) fail('alvo fora dos dois IDs autorizáveis');
  const ref = db.collection('tournaments').doc(id);
  const root = await ref.get();
  if (!root.exists) fail('raiz ausente: ' + id);
  const subcollections = {};
  for (const collection of (await ref.listCollections()).sort((a, b) => a.id.localeCompare(b.id))) {
    subcollections[collection.id] = (await collection.get()).docs.map(doc =>
      ({ id: doc.id, data: stable(doc.data()) })).sort((a, b) => a.id.localeCompare(b.id));
  }
  return { ref, root, subcollections };
}
function assertEmpty(root, subcollections) {
  if (root.id !== root.data().id) fail('ID da raiz divergente');
  const t = stable(root.data());
  if (t.format !== 'Eliminatórias Simples' || t.status !== 'open' ||
      t.sport !== 'Beach Tennis' || t.fmt2 || Object.prototype.hasOwnProperty.call(t, 'phases')) {
    fail('formato/status/projeção do alvo mudou');
  }
  for (const key of ['participants', 'matches', 'rounds', 'groups', 'standbyParticipants']) {
    if (!Array.isArray(t[key]) || t[key].length) fail('raiz contém ' + key);
  }
  if (t._nJogos !== 0 || Object.values(t._nPartes || {}).some(n => n !== 0)) fail('contadores não vazios');
  for (const [name, docs] of Object.entries(subcollections)) {
    if (name !== 'history' || docs.length !== 1) fail('subcoleção não vazia ou inesperada: ' + name);
  }
  if (!Array.isArray(subcollections.history) || subcollections.history.length !== 1) fail('histórico esperado ausente');
  return t;
}
function derivePatch(t) {
  const cfg = _window.FORMAT2.configFromTournament(t, t.sport, {});
  const derived = _window.FORMAT2.compileToPhases(cfg, {
    sport: t.sport, resultEntry: t.resultEntry, lateEnrollment: t.lateEnrollment, newMatchups: t.newMatchups
  });
  if (derived.phases.length !== 1 || derived.phases[0].kind !== 'elimination') fail('fase derivada inesperada');
  const patch = C.buildPatch({ ...t, phases: derived.phases });
  if (patch.fields.politicaDaChave !== 'repescagem' || !patch.mask.includes('politicaDaChave')) {
    fail('política derivada divergente');
  }
  C.buildPatchRequest(t.id, patch, '2026-11-02T00:00:00Z');
  return patch;
}
function backupSnapshot(snapshot, dir = BACKUPS) {
  const b = buildOperationalBackup(snapshot.root, snapshot.subcollections, new Date().toISOString(), PROJECT);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, 'e24-fmt2-' + snapshot.root.id + '-' + Date.now() + '-' +
    crypto.randomBytes(4).toString('hex') + '.json');
  fs.writeFileSync(file, b.body, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(file + '.manifest.json', JSON.stringify(b.manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if (digest(fs.readFileSync(file, 'utf8')) !== b.sha256 ||
      JSON.parse(fs.readFileSync(file + '.manifest.json', 'utf8')).sha256 !== b.sha256) fail('backup inválido');
  return { file, sha256: b.sha256 };
}
function readBackup(entry) {
  const file = entry.backup.file;
  if (!path.isAbsolute(file) || !fs.realpathSync(file).startsWith(BACKUPS + path.sep) ||
      (fs.statSync(file).mode & 0o777) !== 0o600 ||
      (fs.statSync(file + '.manifest.json').mode & 0o777) !== 0o600) fail('backup fora do diretório privado');
  const body = fs.readFileSync(file, 'utf8');
  const sidecar = JSON.parse(fs.readFileSync(file + '.manifest.json', 'utf8'));
  if (digest(body) !== entry.backup.sha256 || sidecar.sha256 !== entry.backup.sha256 ||
      sidecar.tournamentId !== entry.id) fail('backup SHA divergente');
  const payload = JSON.parse(body);
  if (payload.project !== PROJECT || payload.tournamentId !== entry.id ||
      payload.schema !== 'scoreplace/tournament-operational-backup/1') fail('backup de outro projeto/alvo');
  return payload;
}
function target(snapshot, backup) {
  const t = assertEmpty(snapshot.root, snapshot.subcollections);
  const patch = derivePatch(t);
  return { id: snapshot.root.id, updateTime: stable(snapshot.root.updateTime),
    rootHash: C.hash(t), subcollectionHash: C.hash(snapshot.subcollections),
    patchHash: C.hash(patch.fields), mask: patch.mask, backup };
}
function validateManifest(manifest) {
  if (!manifest || manifest.schema !== 'scoreplace/e24-fmt2-empty-preview/1' ||
      manifest.project !== PROJECT || !same(manifest.ids, IDS) ||
      !Array.isArray(manifest.targets) || manifest.targets.length !== 2 ||
      !same(manifest.targets.map(t => t.id), IDS) ||
      !manifest.targets.every(t => t.backup && /^[a-f0-9]{64}$/.test(t.backup.sha256) &&
        /^[a-f0-9]{64}$/.test(t.rootHash) && /^[a-f0-9]{64}$/.test(t.subcollectionHash) &&
        /^[a-f0-9]{64}$/.test(t.patchHash) && Array.isArray(t.mask)) ||
      manifest.digest !== C.hash(Object.fromEntries(Object.entries(manifest).filter(([k]) => k !== 'digest')))) {
    fail('manifesto inválido');
  }
}
async function preview(db, manifestFile, backupDir = BACKUPS) {
  if (fs.existsSync(manifestFile)) fail('manifesto já existe; escolha arquivo novo');
  const targets = [];
  for (const id of IDS) {
    const snapshot = await capture(db, id);
    const t = assertEmpty(snapshot.root, snapshot.subcollections);
    derivePatch(t);
    const backup = backupSnapshot(snapshot, backupDir);
    targets.push(target(snapshot, backup));
  }
  const manifest = { schema: 'scoreplace/e24-fmt2-empty-preview/1', project: PROJECT,
    createdAt: new Date().toISOString(), ids: [...IDS], targets };
  manifest.digest = C.hash(manifest);
  validateManifest(manifest);
  writePrivate(manifestFile, manifest);
  return { digest: manifest.digest, targets: targets.map(t =>
    ({ id: t.id, backupSha256: t.backup.sha256, mask: t.mask })) };
}
function approvalGate(approval, manifest) {
  if (!approval || approval.schema !== 'scoreplace/e24-fmt2-empty-approval/1' ||
      approval.project !== PROJECT || approval.digest !== manifest.digest ||
      approval.scope !== 'E24-two-empty-tournaments' || !same(approval.targetIds, IDS) ||
      !approval.authorizedBy || !approval.authorizationRef ||
      (!process.env.FIRESTORE_EMULATOR_HOST &&
        (manifest.digest !== APPROVED_DIGEST || approval.authorizationRef !== APPROVAL_REF ||
         approval.authorizedBy !== 'proprietario')) ||
      !Number.isFinite(Date.parse(approval.expiresAt)) || Date.parse(approval.expiresAt) <= Date.now()) {
    fail('autorização específica ausente, divergente ou expirada');
  }
}
async function auditOne(db, entry, backup, expectedAfter, afterUpdateTime) {
  const after = await capture(db, entry.id);
  if (!same(stable(after.root.data()), expectedAfter) ||
      !C.sameTimestamp(stable(after.root.updateTime), afterUpdateTime) ||
      C.hash(after.subcollections) !== entry.subcollectionHash ||
      C.hash(backup.subcollections) !== entry.subcollectionHash) fail('pós-auditoria divergente: ' + entry.id);
  return true;
}
async function apply(db, manifestFile, approvalFile, receiptDir, hooks = {}) {
  if ((fs.statSync(manifestFile).mode & 0o777) !== 0o600 ||
      (fs.statSync(approvalFile).mode & 0o777) !== 0o600) fail('manifesto/autorização sem modo 0600');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  validateManifest(manifest);
  approvalGate(JSON.parse(fs.readFileSync(approvalFile, 'utf8')), manifest);
  const prepared = new Map();
  for (const entry of manifest.targets) {
    const backup = readBackup(entry);
    if (C.hash(backup.tournament.data) !== entry.rootHash ||
        C.hash(backup.subcollections) !== entry.subcollectionHash ||
        !C.sameTimestamp(backup.tournament.updateTime, entry.updateTime)) fail('backup e prévia divergiram');
    const patch = derivePatch(assertEmpty({ id: entry.id, data: () => backup.tournament.data }, backup.subcollections));
    if (C.hash(patch.fields) !== entry.patchHash || !same(patch.mask, entry.mask)) fail('patch mudou');
    prepared.set(entry.id, { backup, patch });
  }
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  for (const entry of manifest.targets) {
    const receiptFile = path.join(receiptDir, entry.id + '.json');
    if (!fs.existsSync(receiptFile)) writePrivate(receiptFile,
      { schema: 'scoreplace/e24-fmt2-empty-receipt/1', digest: manifest.digest,
        id: entry.id, backupSha256: entry.backup.sha256, status: 'PENDING' });
  }
  const outcome = [];
  for (const entry of manifest.targets) {
    const { backup, patch } = prepared.get(entry.id);
    const receiptFile = path.join(receiptDir, entry.id + '.json');
    const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    if (receipt.digest !== manifest.digest || receipt.backupSha256 !== entry.backup.sha256 ||
        receipt.id !== entry.id) fail('recibo anterior divergente');
    if (receipt.status === 'APPLIED_AUDITED') {
      await auditOne(db, entry, backup, patch.after, receipt.afterUpdateTime);
      outcome.push({ id: entry.id, status: 'ALREADY_AUDITED' });
      continue;
    }
    // PREPARED/REVIEW_REQUIRED pode significar commit sem recibo final. Nessa
    // situação, comparar raiz/subcoleções com backup e patch antes de criar
    // novo lote; jamais repetir este CAS automaticamente.
    if (receipt.status !== 'PENDING') fail('recibo anterior exige revisão manual');
    if (hooks.beforeTarget) await hooks.beforeTarget(entry.id);
    const before = await capture(db, entry.id);
    const current = target(before, entry.backup);
    if (!same(current, entry)) fail('prévia desatualizada: ' + entry.id);
    writePrivate(receiptFile, { schema: 'scoreplace/e24-fmt2-empty-receipt/1', digest: manifest.digest,
      id: entry.id, backupSha256: entry.backup.sha256, status: 'PREPARED' });
    try {
      await db.runTransaction(async tx => {
        const root = await tx.get(before.ref);
        // listCollections não participa do snapshot transacional. A raiz tem
        // CAS; a pós-auditoria também recusa subcoleção nova ou alterada.
        const names = (await before.ref.listCollections()).map(col => col.id).sort();
        if (!same(names, Object.keys(before.subcollections).sort())) fail('subcoleções mudaram');
        const subs = {};
        for (const name of names) subs[name] = (await tx.get(before.ref.collection(name))).docs.map(doc =>
          ({ id: doc.id, data: stable(doc.data()) })).sort((a, b) => a.id.localeCompare(b.id));
        if (!root.exists || !C.sameTimestamp(stable(root.updateTime), entry.updateTime) ||
            C.hash(stable(root.data())) !== entry.rootHash || C.hash(subs) !== entry.subcollectionHash) {
          fail('CAS recusado: ' + entry.id);
        }
        tx.update(before.ref, patch.fields, { lastUpdateTime: root.updateTime });
      }, { maxAttempts: 1 });
      if (hooks.afterWrite) await hooks.afterWrite(entry.id);
      const after = await capture(db, entry.id);
      await auditOne(db, entry, backup, patch.after, stable(after.root.updateTime));
      writePrivate(receiptFile, { schema: 'scoreplace/e24-fmt2-empty-receipt/1', digest: manifest.digest,
        id: entry.id, backupSha256: entry.backup.sha256, status: 'APPLIED_AUDITED',
        afterUpdateTime: stable(after.root.updateTime) });
      outcome.push({ id: entry.id, status: 'APPLIED_AUDITED' });
    } catch (error) {
      writePrivate(receiptFile, { schema: 'scoreplace/e24-fmt2-empty-receipt/1', digest: manifest.digest,
        id: entry.id, backupSha256: entry.backup.sha256, status: 'REVIEW_REQUIRED',
        reason: String(error.message).slice(0, 240) });
      throw error;
    }
  }
  return outcome;
}
function serviceDb() {
  if (process.env.FIRESTORE_EMULATOR_HOST) fail('emulador ativo na CLI real');
  const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) fail('credencial inválida');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
  return admin.firestore();
}
async function main(args = process.argv.slice(2)) {
  const manifest = args.find(arg => arg.startsWith('--manifest='))?.slice(11) || '';
  const authorization = args.find(arg => arg.startsWith('--authorization='))?.slice(16) || '';
  if (args.includes('--preview') && args.length === 2 && path.isAbsolute(manifest)) {
    return preview(serviceDb(), manifest);
  }
  if (args.includes('--apply') && args.length === 3 && path.isAbsolute(manifest) &&
      path.isAbsolute(authorization)) {
    const preview = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    validateManifest(preview);
    if (!/^[a-f0-9]{64}$/.test(preview.digest)) fail('digest do manifesto inválido');
    return apply(serviceDb(), manifest, authorization,
      path.join(PRIVATE, 'e24-fmt2-receipts-' + preview.digest));
  }
  fail('uso: --preview --manifest=<absoluto> | --apply --manifest=<absoluto> --authorization=<absoluto>');
}
module.exports = { IDS, APPROVED_DIGEST, APPROVAL_REF, capture, assertEmpty, derivePatch, backupSnapshot, readBackup,
  target, validateManifest, preview, approvalGate, auditOne, apply, main };
if (require.main === module) main().then(value => console.log(JSON.stringify(value, null, 2)))
  .catch(error => { console.error(error.stack || error); process.exitCode = 1; });
