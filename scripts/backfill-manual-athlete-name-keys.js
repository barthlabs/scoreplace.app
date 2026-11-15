#!/usr/bin/env node
'use strict';

// Índice de sugestão das vagas manuais existentes. A prévia fornece um hash
// reproduzível; --apply exige esse hash, salva backup integral dos documentos
// afetados e usa uma transação com CAS por updateTime. Nenhum UID ou placar muda.
const admin = require('../functions/node_modules/firebase-admin');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { nameKey } = require('../functions/historical-athlete-claim-core');
const { makeCodec } = require('./firestore-backup-codec');

const apply = process.argv.includes('--apply');
const tournamentArg = process.argv.indexOf('--tournament');
const tournamentId = tournamentArg >= 0 ? String(process.argv[tournamentArg + 1] || '') : '';
if (!tournamentId || tournamentId.includes('/') || tournamentId.length > 180) {
  console.error('Use --tournament <id> em prévia e aplicação.');
  process.exit(2);
}
const expected = process.argv.indexOf('--expect');
const expectedHash = expected >= 0 ? String(process.argv[expected + 1] || '') : '';
if (apply && !/^[a-f0-9]{64}$/.test(expectedHash)) {
  console.error('Use --apply --expect <sha256 da prévia somente leitura>.');
  process.exit(2);
}
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'scoreplace-app' });

function version(snapshot) {
  return snapshot.updateTime.seconds + '.' + snapshot.updateTime.nanoseconds;
}

(async () => {
  const db = admin.firestore();
  const codec = makeCodec(admin, db);
  const tournament = await db.collection('tournaments').doc(tournamentId).get();
  if (!tournament.exists) throw new Error('Torneio não encontrado: ' + tournamentId);
  const tournaments = { size: 1, docs: [tournament] };
  const targets = [], backups = new Map();
  const keyCounts = new Map();
  let scanned = 0, manual = 0;
  for (const tournament of tournaments.docs) {
    const registrations = await tournament.ref.collection('registrations').get();
    for (const doc of registrations.docs) {
      scanned++;
      const data = doc.data() || {};
      if (data.participantKind !== 'manual') continue;
      manual++;
      const key = nameKey(data.manualDisplayName);
      if (key) keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
      if (!key || data.manualNameKey === key) continue;
      targets.push({ ref: doc.ref, doc, key, oldVersion: version(doc) });
      if (!backups.has(tournament.id)) {
        const encodedRoot = codec.encode(tournament.data());
        assert.deepStrictEqual(codec.decode(encodedRoot), tournament.data());
        backups.set(tournament.id, {
          tournament: { path: tournament.ref.path, data: encodedRoot }, registrations: [],
        });
      }
    }
    if (backups.has(tournament.id)) {
      backups.get(tournament.id).registrations = registrations.docs.map((doc) => {
        const encoded = codec.encode(doc.data());
        assert.deepStrictEqual(codec.decode(encoded), doc.data());
        return { path: doc.ref.path, updateTime: version(doc), data: encoded };
      });
    }
  }
  targets.sort((a, b) => a.ref.path.localeCompare(b.ref.path));
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify(targets.map((item) =>
    [item.ref.path, item.oldVersion, item.key]))).digest('hex');
  const summary = { mode: apply ? 'apply' : 'dry-run', tournamentId, tournaments: tournaments.size,
    affectedTournaments: backups.size, scanned, manual, changed: targets.length, fingerprint,
    maxPerKey: Math.max(0, ...keyCounts.values()),
    keysAtLeast100: [...keyCounts.values()].filter((count) => count >= 100).length };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); return; }
  if (fingerprint !== expectedHash) throw new Error('Prévia mudou; rode novamente sem --apply e revise o novo fingerprint.');
  if (summary.keysAtLeast100) throw new Error('Nome com 100 ou mais inscrições; ajuste o paginador antes da migração.');
  if (targets.length > 450) throw new Error('Mais de 450 documentos: dividir em lotes com novo plano de migração.');

  for (const [id, backup] of backups) {
    const matches = await db.collection('tournaments').doc(id).collection('matches').get();
    backup.matches = matches.docs.map((doc) => {
      const encoded = codec.encode(doc.data());
      assert.deepStrictEqual(codec.decode(encoded), doc.data());
      return { path: doc.ref.path, updateTime: version(doc), data: encoded };
    });
  }

  const backupBase = path.join(os.homedir(), '.local', 'share', 'scoreplace', 'manual-name-index-backups');
  fs.mkdirSync(backupBase, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupBase, 0o700);
  const backupDir = fs.mkdtempSync(path.join(backupBase, 'backup-'));
  fs.chmodSync(backupDir, 0o700);
  for (const [id, backup] of backups) {
    const file = path.join(backupDir, encodeURIComponent(id) + '.json');
    fs.writeFileSync(file,
      JSON.stringify(backup, null, 2), { mode: 0o600 });
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const encoded of [saved.tournament, ...saved.registrations, ...saved.matches]) {
      const roundTrip = codec.encode(codec.decode(encoded.data));
      if (JSON.stringify(roundTrip) !== JSON.stringify(encoded.data)) {
        throw new Error('Backup não restaurável: ' + encoded.path);
      }
    }
  }
  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    ...summary, ownerAuthorization: 'Tenho certeza que agora nós podemos identificar com base nos nomes dos atletas, os atletas que já têm cadastro aqui no Scoreplace. E aí sugerir para ele assumir a posição no torneio Camis quando ele entrar uma próxima vez.',
    scope: { tournamentId, field: 'manualNameKey', paths: targets.map((item) => item.ref.path) },
    backedUpMatches: [...backups.values()].reduce((count, backup) => count + backup.matches.length, 0),
    paths: targets.map((item) => item.ref.path),
  }, null, 2), { mode: 0o600 });
  const backupManifestSha256 = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  const receiptPath = path.join(backupDir, 'receipt.json');
  function writeReceipt(receipt) {
    const temporary = receiptPath + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, receiptPath);
  }
  // O recibo preparado já permite um rollback seguro se o processo cair no
  // intervalo entre o commit da transação e a releitura de confirmação.
  writeReceipt({ ...summary, status: 'prepared', written: targets.length,
    backupDir, backupManifestSha256 });

  // Uma transação evita migração parcial. A conferência do updateTime é o CAS:
  // se alguém mudou qualquer inscrição depois da prévia, não escrevemos nada.
  if (targets.length) await db.runTransaction(async (tx) => {
    const fresh = await tx.getAll(...targets.map((item) => item.ref));
    fresh.forEach((snap, index) => {
      const item = targets[index];
      if (!snap.exists || version(snap) !== item.oldVersion ||
          nameKey(snap.data().manualDisplayName) !== item.key) {
        throw new Error('Inscrição mudou desde o censo: ' + item.ref.path);
      }
    });
    targets.forEach((item) => tx.update(item.ref, { manualNameKey: item.key }));
  });
  writeReceipt({ ...summary, status: 'committed', written: targets.length,
    backupDir, backupManifestSha256 });
  const after = targets.length ? await db.getAll(...targets.map((item) => item.ref)) : [];
  const verified = after.filter((snap, index) => snap.exists &&
    snap.data().manualNameKey === targets[index].key).length;
  const receipt = { ...summary, status: 'verified', written: targets.length, verified, backupDir,
    backupManifestSha256,
    finishedAt: new Date().toISOString() };
  writeReceipt(receipt);
  console.log(JSON.stringify(receipt, null, 2));
  if (verified !== targets.length) throw new Error('Pós-verificação incompleta; confira o backup e o recibo.');
})().catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => admin.app().delete());
