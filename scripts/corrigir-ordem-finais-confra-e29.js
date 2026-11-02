#!/usr/bin/env node
'use strict';

// Lote administrativo E29: apenas a numeração de dois jogos da Ouro de Confra.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token.js');
const { stable } = require('./backup-torneio-operacional-core.js');
const split = require('../functions/vendor/tournament-split-core.js');
const mirror = require('../functions/match-result-mirror-core.js');
const core = require('./corrigir-ordem-finais-confra-e29-core.js');

const PROJECT = 'scoreplace-app';
const BACKUP_DIR = '/Users/rtb/Documents/Codex/backups-operacionais';
const MANIFEST = path.resolve(__dirname, '../.claude/tmp/e29-ordem-confra-manifest.json');
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value :
  JSON.stringify(stable(value))).digest('hex');

function loadBackup(filename, requireFresh = true) {
  const source = path.resolve(filename);
  if (!source.startsWith(BACKUP_DIR + path.sep) || !source.endsWith('.json')) throw Error('backup fora da pasta privada');
  const body = fs.readFileSync(source, 'utf8');
  const sidecar = JSON.parse(fs.readFileSync(source + '.manifest.json', 'utf8'));
  const data = JSON.parse(body);
  const sha256 = hash(body);
  const createdAtMs = Date.parse(data.createdAt);
  if (sidecar.sha256 !== sha256 || data.project !== PROJECT || sidecar.project !== PROJECT ||
      sidecar.tournamentId !== data.tournamentId || data.tournament?.data?.name !== core.NAME ||
      data.tournament?.data?.id !== data.tournamentId ||
      data.schema !== 'scoreplace/tournament-operational-backup/1' ||
      !Number.isFinite(createdAtMs) || (requireFresh && Date.now() - createdAtMs > 3600000) ||
      createdAtMs > Date.now() ||
      !Array.isArray(data.subcollections?.matches) || !Array.isArray(data.subcollections?.results) ||
      !Array.isArray(data.subcollections?.inscritos)) throw Error('backup E29 inválido ou antigo');
  core.classify(data.tournament.data, data.subcollections.matches, data.subcollections.results,
    data.subcollections.inscritos.length, 'before');
  return { data, sha256 };
}

function collectionDocs(snapshot) {
  return snapshot.docs.map(doc => ({ id: doc.id, data: stable(doc.data()) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function readCurrent(db, id, tx) {
  const ref = db.collection('tournaments').doc(id);
  const get = target => tx ? tx.get(target) : target.get();
  const root = await get(ref);
  const matches = await get(ref.collection('matches'));
  const results = await get(ref.collection('results'));
  const inscritos = await get(ref.collection('inscritos'));
  if (!root.exists) throw Error('Confra não encontrada');
  return { root, matches: collectionDocs(matches), results: collectionDocs(results),
    inscritos: collectionDocs(inscritos), ref };
}

function sameEntries(a, b) {
  return core.SAME(a.slice().sort((x, y) => x.id.localeCompare(y.id)),
    b.slice().sort((x, y) => x.id.localeCompare(y.id)));
}

function assertBefore(current, backup) {
  const source = backup.data;
  if (current.root.id !== source.tournamentId ||
      !core.SAME(stable(current.root.updateTime), source.tournament.updateTime) ||
      !core.SAME(stable(current.root.data()), source.tournament.data) ||
      !sameEntries(current.matches, source.subcollections.matches) ||
      !sameEntries(current.results, source.subcollections.results) ||
      !sameEntries(current.inscritos, source.subcollections.inscritos)) throw Error('prévia E29 obsoleta');
  return core.classify(stable(current.root.data()), current.matches, current.results,
    current.inscritos.length, 'before');
}

function assertAfter(current, backup, before) {
  const source = backup.data;
  if (current.root.id !== source.tournamentId ||
      !core.SAME(stable(current.root.updateTime), source.tournament.updateTime) ||
      !core.SAME(stable(current.root.data()), source.tournament.data) ||
      !sameEntries(current.matches, core.expectedAfter(source.subcollections.matches, before)) ||
      !sameEntries(current.results, source.subcollections.results) ||
      !sameEntries(current.inscritos, source.subcollections.inscritos)) throw Error('pós-auditoria E29 divergente');
  return core.classify(stable(current.root.data()), current.matches, current.results,
    current.inscritos.length, 'after');
}

async function assertMirrorSkip(backup, before) {
  const source = backup.data;
  const mounted = await split.montarDoBanco(source.tournament.data, collection =>
    (source.subcollections[collection] || []).map(entry => entry.data));
  for (const key of ['goldThird', 'goldFinal']) {
    const entry = before.finals[key];
    const result = before.resultById.get(entry.id).data;
    if (mirror.planoDoEspelho(mounted, entry.id, result, source.tournamentId,
      new Date().toISOString()).acao !== 'skip') throw Error('gatilho local alteraria espelho');
  }
}

function digestFor(backup, before) {
  return hash({ backupSha256: backup.sha256, tournamentId: backup.data.tournamentId,
    targetIds: [before.finals.goldThird.id, before.finals.goldFinal.id],
    before: before.counts.numbers, after: { goldThird: 201, goldFinal: 202, silverThird: 203, silverFinal: 204 } });
}

async function preview(db, backup) {
  const current = await readCurrent(db, backup.data.tournamentId);
  const before = assertBefore(current, backup);
  await assertMirrorSkip(backup, before);
  const digest = digestFor(backup, before);
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify({ digest, backupSha256: backup.sha256,
    tournamentId: backup.data.tournamentId, targetIds: [before.finals.goldThird.id,
      before.finals.goldFinal.id] }) + '\n', { mode: 0o600 });
  fs.chmodSync(MANIFEST, 0o600);
  return { delivery: 'E29', before: before.counts, after: {
    goldThird: 201, goldFinal: 202, silverThird: 203, silverFinal: 204 },
    backupSha256: backup.sha256, digest, productionWrites: 0 };
}

async function apply(db, backup, suppliedDigest) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return applyVerified(db, backup, suppliedDigest, manifest);
}

async function applyVerified(db, backup, suppliedDigest, manifest) {
  if (!/^[a-f0-9]{64}$/.test(suppliedDigest) || suppliedDigest !== manifest.digest ||
      manifest.backupSha256 !== backup.sha256 || manifest.tournamentId !== backup.data.tournamentId) {
    throw Error('digest E29 inválido');
  }
  const current = await readCurrent(db, backup.data.tournamentId);
  const before = assertBefore(current, backup);
  if (digestFor(backup, before) !== suppliedDigest ||
      !core.SAME(manifest.targetIds, [before.finals.goldThird.id, before.finals.goldFinal.id])) {
    throw Error('manifesto E29 obsoleto');
  }
  await assertMirrorSkip(backup, before);
  await db.runTransaction(async tx => {
    const fresh = await readCurrent(db, backup.data.tournamentId, tx);
    const checked = assertBefore(fresh, backup);
    if (digestFor(backup, checked) !== suppliedDigest) throw Error('CAS E29 recusou concorrência');
    tx.update(fresh.ref.collection('matches').doc(checked.finals.goldThird.id), { 'jogo._gameNum': 201 });
    tx.update(fresh.ref.collection('matches').doc(checked.finals.goldFinal.id), { 'jogo._gameNum': 202 });
  }, { maxAttempts: 1 });
  const after = assertAfter(await readCurrent(db, backup.data.tournamentId), backup, before);
  return { delivery: 'E29', before: before.counts.numbers, after: after.counts.numbers,
    matchesChanged: 2, resultsPreserved: after.counts.results, digest: suppliedDigest, productionWrites: 2 };
}

async function audit(db, backup, suppliedDigest) {
  const before = core.classify(backup.data.tournament.data, backup.data.subcollections.matches,
    backup.data.subcollections.results, backup.data.subcollections.inscritos.length, 'before');
  if (digestFor(backup, before) !== suppliedDigest) throw Error('digest E29 inválido');
  const after = assertAfter(await readCurrent(db, backup.data.tournamentId), backup, before);
  return { delivery: 'E29', audit: 'ok', after: after.counts.numbers,
    matches: after.counts.matches, resultsPreserved: after.counts.results };
}

async function main() {
  const [mode, filename, suppliedDigest] = process.argv.slice(2);
  if (!['--preview', '--apply', '--audit'].includes(mode) || !filename ||
      (mode === '--preview' ? suppliedDigest !== undefined : !/^[a-f0-9]{64}$/.test(suppliedDigest || ''))) {
    throw Error('uso: --preview <backup.json> | --apply <backup.json> <digest> | --audit <backup.json> <digest>');
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw Error('emulador ativo');
  const backup = loadBackup(filename, mode !== '--audit');
  const keyFile = credentialPath(process.env);
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) throw Error('credencial inválida');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();
  const output = mode === '--preview' ? await preview(db, backup) :
    mode === '--apply' ? await apply(db, backup, suppliedDigest) : await audit(db, backup, suppliedDigest);
  console.log(JSON.stringify(output, null, 2));
}

module.exports = { loadBackup, readCurrent, assertBefore, assertAfter, digestFor,
  assertMirrorSkip, preview, apply, applyVerified, audit };
if (require.main === module) main().catch(() => {
  console.error('E29 interrompida; após --apply, execute --audit antes de qualquer repetição');
  process.exitCode = 1;
});
