#!/usr/bin/env node
'use strict';

// Reparação pontual: o Camis Day está encerrado e público, mas ainda carrega
// o marcador de um ensaio que já não pode ser restaurado. Seco por padrão.
// Preparar a conta de serviço antes: source scripts/firebase-credencial-persistente.sh
//   && sp_preparar_credencial_firebase "$PWD" scoreplace-app
// Uso: node scripts/retire-camis-rehearsal-marker.js [--apply]

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const { makeCodec } = require('./firestore-backup-codec');
const { fingerprint } = require('../functions-autodraw/tournament-rehearsal');
const { ID, OWNER } = require('../functions/camis-manual-edit-core');

const PROJECT = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.firebaserc'), 'utf8')).projects.default;
const BACKUP_DIR = path.join(os.homedir(), '.local', 'share', 'scoreplace', 'camis-rehearsal-marker-backups');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) {
  throw new Error('Uso: node scripts/retire-camis-rehearsal-marker.js [--apply]');
}
const apply = args[0] === '--apply';
if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulador ativo; reparo de produção recusado');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  throw new Error('Credencial persistente ausente; prepare-a pelo helper do repositório');
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();
const codec = makeCodec(admin, db);
const rootRef = db.doc('tournaments/' + ID);
const baselineRef = db.doc('tournamentRehearsalBaselines/' + ID);
const feedRef = db.doc('discoveryFeed/' + ID);

function discoverySummary(t) {
  const hasDraw = [t.matches, t.rounds, t.groups].some(value => Array.isArray(value) && value.length > 0);
  return { name:t.name || '', sport:t.sport || '', format:t.format || '', status:t.status || '',
    isPublic:t.isPublic === true, startDate:t.startDate || null, endDate:t.endDate || null, hasDraw };
}

function validate(rootSnap, baselineSnap, feedSnap) {
  assert(rootSnap.exists && baselineSnap.exists && feedSnap.exists, 'root, fotografia ou feed ausente');
  const t = rootSnap.data(), b = baselineSnap.data(), feed = feedSnap.data();
  assert(t.name === 'Camis Day' && t.creatorUid === OWNER && t.isSandbox !== true,
    'identidade do torneio divergente');
  assert(t.status === 'finished' && !!t.finishedAt && t.isPublic === true && t.organizerOnly === false,
    'torneio não está encerrado e público');
  assert(t.rehearsal?.state === 'active' && t.rehearsal?.mode === 'postDraw',
    'marcador residual esperado não está presente');
  assert(b.state === 'active' && b.mode === 'postDraw' && b.epoch === t.rehearsal.epoch &&
    b.hash === t.rehearsal.hash && Array.isArray(b.tree) && b.root &&
    fingerprint({ root:b.root, tree:b.tree, summary:b.summary || null }) === b.hash,
    'fotografia de ensaio divergente');
  assert(t.notificationsMuted === true && b.root.notificationsMuted === t.notificationsMuted,
    'silêncio de notificações não confere com a fotografia');
  const expected = discoverySummary(t);
  for (const [key, value] of Object.entries(expected)) {
    assert.deepStrictEqual(feed[key], value, 'feed público divergente no campo ' + key);
  }
  assert(feed.tid === ID, 'feed público de outro torneio');
  return { tournament:t, baseline:b, feed };
}

function saveBackup(snapshot) {
  fs.mkdirSync(BACKUP_DIR, { recursive:true, mode:0o700 });
  assert((fs.statSync(BACKUP_DIR).mode & 0o077) === 0, 'diretório de backup não é privado');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `camis-root-before-marker-${stamp}.json`);
  const body = JSON.stringify({ project:PROJECT, path:rootRef.path,
    updateTime:{ seconds:snapshot.updateTime.seconds, nanoseconds:snapshot.updateTime.nanoseconds },
    data:codec.encode(snapshot.data()) });
  const fd = fs.openSync(file, 'wx', 0o600);
  try { fs.writeFileSync(fd, body); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  assert((fs.statSync(file).mode & 0o077) === 0, 'arquivo de backup não é privado');
  const restored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(JSON.stringify(restored), body, 'backup divergiu ao reler');
  assert.deepStrictEqual(codec.decode(restored.data), snapshot.data(), 'backup não restaura os tipos Firestore');
  return file;
}

(async () => {
  const [rootSnap, baselineSnap, feedSnap] = await Promise.all([
    rootRef.get(), baselineRef.get(), feedRef.get(),
  ]);
  validate(rootSnap, baselineSnap, feedSnap);
  console.log('✓ prévia: Camis Day encerrado, público, marcador residual e fotografia íntegra');
  console.log('✓ feed público compatível; notificações iguais à fotografia');
  if (!apply) { console.log('Modo seco: nenhuma escrita.'); return; }

  const backupFile = saveBackup(rootSnap);
  console.log('✓ backup privado gravado e relido em ' + backupFile);
  await db.runTransaction(async tx => {
    const [freshRoot, freshBaseline, freshFeed] = await Promise.all([
      tx.get(rootRef), tx.get(baselineRef), tx.get(feedRef),
    ]);
    assert(freshRoot.updateTime.isEqual(rootSnap.updateTime), 'torneio mudou desde o backup');
    validate(freshRoot, freshBaseline, freshFeed);
    tx.update(rootRef, { rehearsal:admin.firestore.FieldValue.delete() },
      { lastUpdateTime:freshRoot.updateTime });
  });

  const [after, afterBaseline, afterFeed] = await Promise.all([
    rootRef.get(), baselineRef.get(), feedRef.get(),
  ]);
  assert(after.exists && after.updateTime.toMillis() > rootSnap.updateTime.toMillis(),
    'updateTime do torneio não avançou');
  const expectedRoot = { ...rootSnap.data() };
  delete expectedRoot.rehearsal;
  assert.deepStrictEqual(codec.encode(after.data()), codec.encode(expectedRoot),
    'algum campo além do marcador mudou');
  assert.deepStrictEqual(codec.encode(afterBaseline.data()), codec.encode(baselineSnap.data()),
    'fotografia foi alterada');
  assert.deepStrictEqual(codec.encode(afterFeed.data()), codec.encode(feedSnap.data()),
    'feed foi alterado');
  assert(after.data().status === 'finished' && after.data().isPublic === true &&
    after.data().notificationsMuted === baselineSnap.data().root.notificationsMuted,
    'estado público ou notificações divergentes');
  console.log('✓ marcador residual removido; confirmação histórica não cai mais na trava de ensaio');
  console.log('✓ documento, fotografia, feed e notificações conferidos após o commit');
})().catch(error => { console.error('✗ reparo abortado:', error.message || error); process.exitCode = 1; });
