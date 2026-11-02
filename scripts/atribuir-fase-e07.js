#!/usr/bin/env node
'use strict';

// Lote administrativo fechado: apenas os 14 jogos dos dois torneios autorizados.
const fs = require('node:fs');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const { digest } = require('./backup-torneio-operacional-core.js');
const { credentialPath } = require('./firebase-service-account-token.js');
const { report } = require('./auditar-indice-fases-core.js');
const core = require('./atribuir-fase-e07-core.js');

const PROJECT = 'scoreplace-app';
const MANIFEST = path.resolve(__dirname, '../.claude/tmp/e07-manifest.json');
const BACKUP_LOG = path.resolve(__dirname, '../.claude/tmp/e07-backup.log');

function fail(message) { throw Error(message); }
function verifiedBackups() {
  const log = fs.readFileSync(BACKUP_LOG, 'utf8');
  const paths = [...log.matchAll(/^  arquivo: (.+\.json)$/gm)].map(x => x[1]);
  const hashes = [...log.matchAll(/^  SHA-256: ([a-f0-9]{64})$/gm)].map(x => x[1]);
  if (paths.length !== 2 || hashes.length !== 2) fail('dois backups não encontrados');
  return paths.map((filename, i) => {
    if (!filename.startsWith('/Users/rtb/Documents/Codex/backups-operacionais/')) fail('caminho de backup inesperado');
    const body = fs.readFileSync(filename, 'utf8');
    const sidecar = JSON.parse(fs.readFileSync(filename + '.manifest.json', 'utf8'));
    if (digest(body) !== hashes[i] || sidecar.sha256 !== hashes[i]) fail('hash do backup não confere');
    const data = JSON.parse(body);
    if (data.schema !== 'scoreplace/tournament-operational-backup/1' ||
        data.tournament?.data?.name !== core.TARGET_NAMES[i] ||
        data.subcollections?.matches?.length !== 7 || !Array.isArray(data.subcollections.results)) fail('backup fora do escopo');
    if (sidecar.tournamentId !== data.tournamentId || sidecar.project !== PROJECT) fail('manifesto do backup divergiu');
    return { data, hash: hashes[i], filename };
  });
}

async function readTargets(db, tx) {
  const roots = await Promise.all(core.TARGET_NAMES.map(name =>
    (tx ? tx.get(db.collection('tournaments').where('name', '==', name)) :
      db.collection('tournaments').where('name', '==', name).get())));
  if (roots.some(snapshot => snapshot.size !== 1)) fail('nome de torneio ausente ou duplicado');
  const tournaments = [];
  for (const rootQuery of roots) {
    const root = rootQuery.docs[0];
    const matchesQuery = await (tx ? tx.get(root.ref.collection('matches')) : root.ref.collection('matches').get());
    const resultsQuery = await (tx ? tx.get(root.ref.collection('results')) : root.ref.collection('results').get());
    tournaments.push({ root, matches: matchesQuery.docs, results: resultsQuery.docs });
  }
  return tournaments;
}

function saveManifest(payload) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(payload, null, 2) + '\n', { flag: 'w', mode: 0o600 });
  fs.chmodSync(MANIFEST, 0o600);
}

async function preview(db) {
  const backups = verifiedBackups();
  const current = await readTargets(db);
  core.validate(current, backups.map(x => x.data));
  const plan = core.manifest(current, backups.map(x => x.hash));
  saveManifest(plan);
  return { tournaments: core.TARGET_NAMES, matches: [7, 7], results: current.map(x => x.results.length),
    backupConfirmed: true, digest: plan.digest, productionWrites: 0 };
}

async function apply(db, suppliedDigest) {
  if (!/^[a-f0-9]{64}$/.test(suppliedDigest)) fail('digest inválido');
  const expected = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (expected.digest !== suppliedDigest) fail('digest não corresponde ao manifesto privado');
  const backups = verifiedBackups();
  return applyVerified(db, expected, backups);
}

async function applyVerified(db, expected, backups) {
  const backupHashes = backups.map(x => x.hash);
  const before = await readTargets(db);
  core.validate(before, backups.map(x => x.data));
  core.assertManifest(core.manifest(before, backupHashes), expected);
  await db.runTransaction(async tx => {
    const fresh = await readTargets(db, tx);
    core.validate(fresh, backups.map(x => x.data));
    core.assertManifest(core.manifest(fresh, backupHashes), expected);
    // Todas as leituras acima precedem a primeira escrita; as 14 mudanças são atômicas.
    for (const tournament of fresh) for (const doc of tournament.matches) {
      tx.update(doc.ref, { 'jogo.phaseIndex': 0, _phaseIndex: 0 });
    }
  }, { maxAttempts: 1 });
  const after = await readTargets(db);
  core.assertAfter(before, after);
  return { tournaments: core.TARGET_NAMES, matchesUpdated: after.reduce((n, item) => n + item.matches.length, 0),
    resultsPreserved: after.reduce((n, item) => n + item.results.length, 0),
    audit: after.map(item => report(item.root.data(), item.matches.map(doc => doc.data()))),
    digest: expected.digest, productionWrites: 14 };
}

async function main() {
  const args = process.argv.slice(2);
  if (!(args.length === 1 && args[0] === '--preview') &&
      !(args.length === 2 && args[0] === '--apply' && /^[a-f0-9]{64}$/.test(args[1]))) fail('use --preview ou --apply <digest>');
  if (process.env.FIRESTORE_EMULATOR_HOST) fail('emulador ativo');
  const keyFile = credentialPath(process.env);
  if (!fs.existsSync(keyFile)) fail('credencial persistente ausente');
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) fail('conta de serviço ou projeto inválido');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = keyFile;
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
  const db = admin.firestore();
  const output = args[0] === '--preview' ? await preview(db) : await apply(db, args[1]);
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
}

module.exports = { verifiedBackups, readTargets, preview, apply, applyVerified };
if (require.main === module) main().catch(error => {
  console.error('E07 interrompida: ' + String(error?.message || 'erro desconhecido').replace(/tour_[^\s/]+/g, '[id]'));
  process.exitCode = 1;
});
