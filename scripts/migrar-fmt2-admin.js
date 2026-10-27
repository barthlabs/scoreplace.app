#!/usr/bin/env node
'use strict';

// Migração de formato, não de inscrições/resultados. Sem --apply explícito,
// este programa só lê produção e grava uma prévia privada no disco local.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { stable, digest } = require('./backup-torneio-operacional-core');
const { accessTokenForServiceAccount, credentialPath } = require('./firebase-service-account-token');
const { listTournaments } = require('./phase-projection-firestore-core');
const C = require('./migrar-fmt2-core');

const ROOT = path.resolve(__dirname, '..');
const BACKUP_ROOT = '/Users/rtb/Documents/Codex/backups-operacionais';
const PREVIEW_DEFAULT = path.join(ROOT, '.claude/tmp/fmt2-preview-private.json');
const AUTHORIZATION = [
  'nao deve ficar nada legado',
  'migre os torneios que estejam legados preservando os dados e traduzindo para o modelo novo',
  'tudo deveria passar pelo motor novo. traduza as coisas para que funcione no motor novo como se nunca tivesse havido outro modelo'
];

function arg(name) {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((item) => item.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}
function preflight() {
  if (process.env.FIRESTORE_EMULATOR_HOST) C.fail('emulador ativo');
  const key = credentialPath(process.env);
  if (!fs.existsSync(key)) C.fail('credencial persistente ausente');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = key;
  const modulePath = path.join(ROOT, 'functions/node_modules/firebase-admin');
  if (!fs.existsSync(modulePath)) C.fail('firebase-admin ausente no checkout do backup');
  const resolved = require.resolve('firebase-admin', { paths: [path.join(ROOT, 'functions')] });
  if (!resolved.startsWith(fs.realpathSync(modulePath) + path.sep)) C.fail('firebase-admin resolve fora da dependência vinculada ao checkout');
  fs.mkdirSync(BACKUP_ROOT, { recursive: true, mode: 0o700 });
  const real = fs.realpathSync(BACKUP_ROOT);
  if (real !== BACKUP_ROOT || real.startsWith(ROOT + path.sep) || /CloudStorage|GoogleDrive/i.test(real)) C.fail('diretório de backup não é local isolado');
  return require(modulePath);
}
function savePrivate(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  if ((fs.statSync(file).mode & 0o777) !== 0o600) C.fail('arquivo privado sem modo 0600');
}
async function readRoot(token, id) {
  const response = await fetch(C.BASE + '/' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) C.fail('leitura REST de ' + id + ': HTTP ' + response.status);
  return C.decodeDocument(await response.json());
}
async function readSubcollections(db, id) {
  const ref = db.collection('tournaments').doc(id);
  const collections = await ref.listCollections();
  const result = {};
  for (const collection of collections.sort((a, b) => a.id.localeCompare(b.id))) {
    const snapshot = await collection.get();
    result[collection.id] = snapshot.docs.map((doc) => ({ id: doc.id, data: stable(doc.data()) }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return result;
}
function validatePreview(preview) {
  if (!preview || preview.schema !== 'scoreplace/fmt2-preview/1' || preview.project !== C.PROJECT ||
      !Array.isArray(preview.approvedTargetIds) || preview.approvedTargetIds.length !== 73 ||
      !isDeepStrictEqual(preview.approvedTargetIds, Object.keys(preview.targets).sort()) ||
      preview.approvedTargetIds.some((id) => C.EXCLUDED_IDS.has(id)) ||
      !isDeepStrictEqual(preview.authorizationSource, AUTHORIZATION)) C.fail('manifesto de escopo inválido');
}
async function preview(file) {
  const token = await accessTokenForServiceAccount();
  const documents = await listTournaments(token);
  const targets = {};
  const changedExistingPhaseKeys = {};
  const changedExistingTopKeys = {};
  for (const document of documents) {
    const { data, updateTime } = C.decodeDocument(document);
    if (data.fmt2) continue;
    const id = document.name.slice(document.name.lastIndexOf('/') + 1);
    if (C.EXCLUDED_IDS.has(id)) C.fail('Neon/Confra sem fmt2: ' + id);
    const patch = C.buildPatch(data);
    C.buildPatchRequest(id, patch, updateTime);
    for (const [key, value] of Object.entries(patch.fields)) {
      if (key === 'phases' || key === 'fmt2' || !Object.prototype.hasOwnProperty.call(data, key)) continue;
      if (!isDeepStrictEqual(stable(data[key]), stable(value))) changedExistingTopKeys[key] = (changedExistingTopKeys[key] || 0) + 1;
    }
    data.phases.forEach((oldPhase, index) => {
      for (const [key, value] of Object.entries(patch.fields.phases[index])) {
        if (!Object.prototype.hasOwnProperty.call(oldPhase, key)) continue;
        if (!isDeepStrictEqual(stable(oldPhase[key]), stable(value))) changedExistingPhaseKeys[key] = (changedExistingPhaseKeys[key] || 0) + 1;
      }
    });
    targets[id] = { updateTime, fingerprint: C.hash(data), fields: Object.keys(data).sort() };
  }
  const approvedTargetIds = Object.keys(targets).sort();
  if (approvedTargetIds.length !== 73) C.fail('censo atual difere dos 73 autorizados: ' + approvedTargetIds.length);
  const manifest = {
    schema: 'scoreplace/fmt2-preview/1', project: C.PROJECT,
    createdAt: new Date().toISOString(), authorizationSource: AUTHORIZATION,
    approvedTargetIds, targets
  };
  validatePreview(manifest);
  savePrivate(file, manifest);
  const fingerprint = digest(fs.readFileSync(file, 'utf8'));
  console.log('Prévia apenas-leitura: 73/73 traduções comprovadas; Neon e Confra excluídos.');
  console.log('Campos estruturais existentes normalizados (topo): ' + JSON.stringify(changedExistingTopKeys));
  console.log('Campos estruturais existentes normalizados (fases): ' + JSON.stringify(changedExistingPhaseKeys));
  console.log('Manifesto privado: ' + file);
  console.log('Fingerprint para --apply: ' + fingerprint);
}
function readBackupFile(file, id) {
  if (!fs.realpathSync(file).startsWith(BACKUP_ROOT + path.sep)) C.fail('backup fora do diretório local');
  if ((fs.statSync(file).mode & 0o777) !== 0o600 || (fs.statSync(file + '.manifest.json').mode & 0o777) !== 0o600) C.fail('backup sem modo 0600');
  const body = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(body);
  const manifest = JSON.parse(fs.readFileSync(file + '.manifest.json', 'utf8'));
  const sha256 = digest(body);
  if (manifest.sha256 !== sha256 || manifest.tournamentId !== id || data.tournamentId !== id ||
      manifest.schema !== 'scoreplace/tournament-operational-backup/1' || data.project !== C.PROJECT) C.fail('backup não íntegro');
  return { file, data, sha256 };
}
function runBackup(id) {
  const result = spawnSync(process.execPath,
    [path.join(ROOT, 'scripts/backup-torneio-operacional.js'), '--tournament=' + id, '--output=' + BACKUP_ROOT],
    { cwd: ROOT, env: process.env, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) C.fail('backup de ' + id + ' falhou: ' + String(result.stderr || result.stdout).slice(-600));
  const match = String(result.stdout).match(/^  arquivo: (.+\.json)$/m);
  if (!match || !match[1].startsWith(BACKUP_ROOT + path.sep)) C.fail('backup não retornou arquivo local');
  return readBackupFile(match[1], id);
}
function verifyIntent(intent, target, backup, current, subcollections) {
  if (!intent || intent.schema !== 'scoreplace/fmt2-intent/1' || intent.id !== target.id ||
      intent.previewFingerprint !== target.fingerprint || intent.backupSha256 !== backup.sha256 ||
      !C.sameTimestamp(intent.beforeUpdateTime, target.updateTime)) C.fail('intenção pendente inválida');
  C.assertBackupMatchesPreview(backup.data, target);
  if (C.hash(subcollections) !== intent.subcollectionHash ||
      C.hash(backup.data.subcollections) !== intent.subcollectionHash) C.fail('subcoleções divergiram da intenção');
  if (current.data.fmt2) {
    if (C.sameTimestamp(current.updateTime, target.updateTime)) C.fail('fmt2 sem CAS detectável');
    C.assertPostcheck(backup.data.tournament.data, current.data, { fields: intent.expectedFields }, target.id);
    return 'patched';
  }
  if (!C.sameTimestamp(current.updateTime, target.updateTime) || C.hash(current.data) !== target.fingerprint) C.fail('raiz mudou desde a intenção');
  const patch = C.buildPatch(current.data);
  if (C.hash(patch.fields) !== C.hash(intent.expectedFields)) C.fail('código/patch mudou desde a intenção');
  return 'pending';
}
async function patchRoot(token, id, patch, updateTime) {
  const request = C.buildPatchRequest(id, patch, updateTime);
  const response = await fetch(request.url, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body)
  });
  if (!response.ok) C.fail('CAS de ' + id + ' recusado: HTTP ' + response.status + ' ' + (await response.text()).slice(0, 180));
  return C.decodeDocument(await response.json());
}
async function apply(file, fingerprint, admin) {
  if (!file || !fingerprint) C.fail('--apply exige --manifest e --fingerprint explícitos');
  if ((fs.statSync(file).mode & 0o777) !== 0o600) C.fail('manifesto não é privado');
  const body = fs.readFileSync(file, 'utf8');
  if (digest(body) !== fingerprint) C.fail('fingerprint do manifesto difere');
  const preview = JSON.parse(body);
  validatePreview(preview);
  if (!admin.apps.length) admin.initializeApp({ projectId: C.PROJECT });
  const db = admin.firestore();
  const receiptDir = path.join(BACKUP_ROOT, 'fmt2-receipts-' + fingerprint.slice(0, 16));
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const census = await listTournaments(await accessTokenForServiceAccount());
  const byId = new Map(census.map((document) => [document.name.slice(document.name.lastIndexOf('/') + 1), C.decodeDocument(document)]));
  const unexpected = [...byId.entries()].filter(([id, entry]) => !entry.data.fmt2 && !preview.approvedTargetIds.includes(id));
  if (unexpected.length) C.fail('censo tem torneio sem fmt2 fora dos 73 IDs autorizados');
  for (const id of preview.approvedTargetIds) {
    const current = byId.get(id);
    if (!current) C.fail('torneio do manifesto desapareceu: ' + id);
    if (current.data.fmt2 && !fs.existsSync(path.join(receiptDir, encodeURIComponent(id) + '.json')) &&
        !fs.existsSync(path.join(receiptDir, encodeURIComponent(id) + '.intent.json'))) {
      C.fail('torneio do manifesto foi convertido fora deste lote: ' + id);
    }
  }
  for (const [index, id] of preview.approvedTargetIds.entries()) {
    const target = { id, ...preview.targets[id] };
    const receipt = path.join(receiptDir, encodeURIComponent(id) + '.json');
    const intentFile = path.join(receiptDir, encodeURIComponent(id) + '.intent.json');
    if (fs.existsSync(receipt)) {
      const prior = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      if (prior.id !== id || prior.previewFingerprint !== target.fingerprint || !prior.postcheck) C.fail('recibo de retomada inválido: ' + id);
      const current = await readRoot(await accessTokenForServiceAccount(), id);
      if (!current.data.fmt2 || !C.sameTimestamp(current.updateTime, prior.afterUpdateTime)) C.fail('torneio migrado mudou depois do recibo: ' + id);
      console.log('Já validado: ' + (index + 1) + '/73');
      continue;
    }
    let backup, intent;
    if (fs.existsSync(intentFile)) {
      if ((fs.statSync(intentFile).mode & 0o777) !== 0o600) C.fail('intenção sem modo 0600');
      intent = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
      backup = readBackupFile(intent.backupFile, id);
    } else {
      const before = await readRoot(await accessTokenForServiceAccount(), id);
      if (!C.sameTimestamp(before.updateTime, target.updateTime) || C.hash(before.data) !== target.fingerprint ||
          !isDeepStrictEqual(Object.keys(before.data).sort(), target.fields)) C.fail('prévia desatualizada: ' + id);
      const patch = C.buildPatch(before.data);
      backup = runBackup(id);
      C.assertBackupMatchesPreview(backup.data, target);
      const subsBefore = await readSubcollections(db, id);
      if (C.hash(subsBefore) !== C.hash(backup.data.subcollections)) C.fail('subcoleções mudaram após backup: ' + id);
      intent = { schema: 'scoreplace/fmt2-intent/1', id, previewFingerprint: target.fingerprint,
        beforeUpdateTime: target.updateTime, expectedFields: patch.fields,
        subcollectionHash: C.hash(subsBefore), backupFile: backup.file, backupSha256: backup.sha256 };
      savePrivate(intentFile, intent);
    }
    const rootBeforeCas = await readRoot(await accessTokenForServiceAccount(), id);
    const subsBeforeCas = await readSubcollections(db, id);
    const state = verifyIntent(intent, target, backup, rootBeforeCas, subsBeforeCas);
    let writtenUpdateTime = null;
    if (state === 'pending') {
      const patch = { fields: intent.expectedFields, mask: Object.keys(intent.expectedFields).sort() };
      const written = await patchRoot(await accessTokenForServiceAccount(), id, patch, target.updateTime);
      C.assertPostcheck(backup.data.tournament.data, written.data, patch, id);
      writtenUpdateTime = written.updateTime;
    }
    const after = await readRoot(await accessTokenForServiceAccount(), id);
    C.assertPostcheck(backup.data.tournament.data, after.data, { fields: intent.expectedFields }, id);
    if (writtenUpdateTime && !C.sameTimestamp(writtenUpdateTime, after.updateTime)) C.fail('raiz mudou após CAS: ' + id);
    const subsAfter = await readSubcollections(db, id);
    if (C.hash(subsAfter) !== intent.subcollectionHash) C.fail('subcoleções mudaram durante CAS: ' + id);
    savePrivate(receipt, { schema: 'scoreplace/fmt2-receipt/1', id, previewFingerprint: target.fingerprint,
      backupFile: backup.file, backupSha256: backup.sha256, beforeUpdateTime: target.updateTime,
      afterUpdateTime: after.updateTime, postcheck: true });
    console.log('Migrado e conferido: ' + (index + 1) + '/73');
  }
  const remaining = (await listTournaments(await accessTokenForServiceAccount())).filter((document) => !C.decodeDocument(document).data.fmt2);
  if (remaining.length) C.fail('censo final ainda tem ' + remaining.length + ' torneio(s) sem fmt2');
  console.log('Concluído: 73/73; censo final sem formato legado.');
}

async function main() {
  const admin = preflight();
  if (process.argv.includes('--preview')) return preview(arg('output') || PREVIEW_DEFAULT);
  if (process.argv.includes('--apply')) return apply(arg('manifest'), arg('fingerprint'), admin);
  C.fail('use --preview ou --apply --manifest=<arquivo> --fingerprint=<sha256>');
}
module.exports = { validatePreview, verifyIntent };
if (require.main === module) {
  main().catch((error) => { console.error(error && error.message || error); process.exitCode = 1; });
}
