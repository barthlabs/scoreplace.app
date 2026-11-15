#!/usr/bin/env node
'use strict';

// Reverte APENAS o campo criado pelo backfill. O backup completo fica disponível
// para auditoria, mas jamais sobrescrevemos placares ou outras edições posteriores.
const admin = require('../functions/node_modules/firebase-admin');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { nameKey } = require('../functions/historical-athlete-claim-core');
const { makeCodec } = require('./firestore-backup-codec');

function option(flag) {
  const index = process.argv.indexOf(flag);
  return index < 0 ? '' : String(process.argv[index + 1] || '');
}
const backupDir = option('--backup-dir');
const expected = option('--expect');
const apply = process.argv.includes('--apply');
if (!backupDir || !/^[a-f0-9]{64}$/.test(expected)) {
  console.error('Use --backup-dir <diretório do recibo> --expect <fingerprint> [--apply].');
  process.exit(2);
}
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'scoreplace-app' });

(async () => {
  const db = admin.firestore();
  const codec = makeCodec(admin, db);
  const manifestBytes = fs.readFileSync(path.join(backupDir, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const receipt = JSON.parse(fs.readFileSync(path.join(backupDir, 'receipt.json'), 'utf8'));
  if (manifest.fingerprint !== expected || receipt.fingerprint !== expected ||
      receipt.backupManifestSha256 !== crypto.createHash('sha256').update(manifestBytes).digest('hex') ||
      !['prepared', 'committed', 'verified'].includes(receipt.status) ||
      (receipt.status === 'verified' && receipt.verified !== receipt.written)) {
    throw new Error('Backup ou recibo não confere.');
  }
  const originals = new Map();
  for (const file of fs.readdirSync(backupDir).filter((name) => name.endsWith('.json') &&
    name !== 'manifest.json' && name !== 'receipt.json' && name !== 'rollback-receipt.json')) {
    const saved = JSON.parse(fs.readFileSync(path.join(backupDir, file), 'utf8'));
    for (const item of saved.registrations || []) {
      originals.set(item.path, codec.decode(item.data));
    }
  }
  if (new Set(manifest.paths).size !== manifest.paths.length || manifest.paths.length > 450) {
    throw new Error('Manifesto duplicado ou grande demais.');
  }
  const targets = manifest.paths.map((name) => {
    if (!/^tournaments\/[^/]+\/registrations\/[^/]+$/.test(name) || !originals.has(name)) {
      throw new Error('Documento ausente ou caminho inválido: ' + name);
    }
    const original = originals.get(name);
    return { ref: db.doc(name), original,
      insertedKey: nameKey(original.manualDisplayName) };
  });
  const current = targets.length ? await db.getAll(...targets.map((item) => item.ref)) : [];
  current.forEach((snap, index) => {
    const item = targets[index];
    if (!snap.exists || snap.data().manualNameKey !== item.insertedKey ||
        nameKey(snap.data().manualDisplayName) !== item.insertedKey) {
      throw new Error('Inscrição mudou desde o backfill; rollback interrompido: ' + item.ref.path);
    }
  });
  const summary = { mode: apply ? 'rollback' : 'dry-run', fingerprint: expected,
    checked: targets.length, backupDir };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }
  if (targets.length) await db.runTransaction(async (tx) => {
    const fresh = await tx.getAll(...targets.map((item) => item.ref));
    fresh.forEach((snap, index) => {
      const item = targets[index];
      if (!snap.exists || snap.data().manualNameKey !== item.insertedKey ||
          nameKey(snap.data().manualDisplayName) !== item.insertedKey) {
        throw new Error('Inscrição mudou durante o rollback: ' + item.ref.path);
      }
    });
    targets.forEach((item) => tx.update(item.ref, {
      manualNameKey: Object.prototype.hasOwnProperty.call(item.original, 'manualNameKey')
        ? item.original.manualNameKey : admin.firestore.FieldValue.delete(),
    }));
  });
  const after = targets.length ? await db.getAll(...targets.map((item) => item.ref)) : [];
  const verified = after.filter((snap, index) => {
    const original = targets[index].original;
    return snap.exists && (Object.prototype.hasOwnProperty.call(original, 'manualNameKey')
      ? snap.data().manualNameKey === original.manualNameKey
      : !Object.prototype.hasOwnProperty.call(snap.data(), 'manualNameKey'));
  }).length;
  const result = { ...summary, verified, finishedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(backupDir, 'rollback-receipt.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result, null, 2));
  if (verified !== targets.length) throw new Error('Rollback incompleto; confira o recibo.');
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => admin.app().delete());
