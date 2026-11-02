#!/usr/bin/env node
'use strict';

// E05: um torneio por transação. Prévia e check não escrevem no Firestore.
// Aplicação real depende de recibo E20 e autorização específica do digest/alvo.
const fs = require('node:fs');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const core = require('./migrar-uid-jogos-e05-core');
const { buildOperationalBackup, digest, stable } = require('./backup-torneio-operacional-core');
const { credentialPath } = require('./firebase-service-account-token');

const PROJECT = 'scoreplace-app';
const MANIFEST = path.resolve(__dirname, '../.claude/tmp/e05-uid-index-manifest-private.json');
const RECEIPT_DIR = path.resolve(__dirname, '../.claude/tmp');
const BACKUP_DIR = '/Users/rtb/Documents/Codex/backups-operacionais';
const RELEASE_ENV = 'SCOREPLACE_E05_STAGE3_RELEASE_RECEIPT';

function privateFile(filename, body) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = filename + '.partial-' + process.pid;
  fs.writeFileSync(temporary, body, { flag: 'wx', mode: 0o600 });
  try { fs.renameSync(temporary, filename); fs.chmodSync(filename, 0o600); }
  catch (error) { try { fs.unlinkSync(temporary); } catch (_) {} throw error; }
  if ((fs.statSync(filename).mode & 0o077) !== 0 || fs.readFileSync(filename, 'utf8') !== body) {
    throw new Error('arquivo privado não confirmado');
  }
}

function releaseGate(env = process.env) {
  const filename = env[RELEASE_ENV];
  if (!filename || !path.isAbsolute(filename)) throw new Error('recibo E20 ausente');
  const receipt = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (receipt.schema !== 'scoreplace/stage3-release/1' || receipt.project !== PROJECT ||
      receipt.stage3Published !== true || !/^[a-f0-9]{40}$/i.test(receipt.hostingCommit || '')) {
    throw new Error('recibo E20 inválido');
  }
  return receipt;
}

function readManifest(filename = MANIFEST) {
  const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (value.schema !== 'scoreplace/e05-uid-index-batch/1' || value.project !== PROJECT ||
      !Array.isArray(value.targets) || value.digest !== core.hash(value.targets) ||
      (fs.statSync(filename).mode & 0o077) !== 0) throw new Error('manifesto privado inválido');
  return value;
}

async function readRelevant(ref, tx) {
  const get = item => tx ? tx.get(item) : item.get();
  const root = await get(ref);
  if (!root.exists) throw new Error('torneio ausente');
  const matches = await get(ref.collection('matches'));
  const results = await get(ref.collection('results'));
  return { root, matches: matches.docs, results: results.docs };
}

async function preview(db, filename = MANIFEST) {
  const roots = await db.collection('tournaments').get();
  const targets = [], blocked = [];
  for (const root of roots.docs) {
    if ((root.data() || {}).isSandbox === true) continue;
    const matches = await root.ref.collection('matches').get();
    if (!matches.size) continue;
    const results = await root.ref.collection('results').get();
    try {
      const target = core.classify(root, matches.docs, results.docs);
      if (target.counts.candidates) targets.push(target);
    } catch (error) {
      blocked.push({ name: (root.data() || {}).name || '', reason: error.message });
    }
  }
  const manifest = { schema: 'scoreplace/e05-uid-index-batch/1', project: PROJECT,
    createdAt: new Date().toISOString(), targets, digest: core.hash(targets) };
  privateFile(filename, JSON.stringify(manifest, null, 2) + '\n');
  return { digest: manifest.digest, targets: targets.map(target => ({ name: target.name,
    matches: target.counts.matches, candidates: target.counts.candidates,
    scoredCandidates: target.counts.scoredCandidates })),
    blocked: blocked.length, productionWrites: 0 };
}

async function check(db, manifest) {
  const targets = [];
  for (const expected of manifest.targets) {
    const current = await readRelevant(db.doc(expected.root.path));
    const actual = core.classify(current.root, current.matches, current.results);
    core.assertSame(actual, expected);
    targets.push({ name: expected.name, candidates: expected.counts.candidates });
  }
  return { digest: manifest.digest, targets, productionWrites: 0 };
}

async function readFullBackup(ref) {
  const relevant = await readRelevant(ref);
  const subcollections = {};
  for (const collection of await ref.listCollections()) {
    const docs = collection.id === 'matches' ? relevant.matches :
      collection.id === 'results' ? relevant.results : (await collection.get()).docs;
    subcollections[collection.id] = docs.map(doc => ({ id: doc.id, data: stable(doc.data()) }));
  }
  // Um backup operacional precisa conter exatamente os documentos que o CAS valida.
  // Uma segunda leitura de matches/results aqui poderia misturar duas versões.
  for (const [name, docs] of [['matches', relevant.matches], ['results', relevant.results]]) {
    if (!subcollections[name] || subcollections[name].length !== docs.length) {
      throw new Error('backup sem coleção canônica completa');
    }
    const expected = new Map(docs.map(doc => [doc.id, core.hash(doc.data())]));
    for (const item of subcollections[name]) {
      if (expected.get(item.id) !== core.hash(item.data)) throw new Error('backup canônico divergente');
    }
  }
  return { relevant, subcollections };
}

function saveBackup(full, filename) {
  const { body, sha256, manifest } = buildOperationalBackup(full.relevant.root,
    full.subcollections, new Date().toISOString(), PROJECT);
  privateFile(filename, body);
  privateFile(filename + '.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  if (digest(fs.readFileSync(filename, 'utf8')) !== sha256 ||
      JSON.parse(fs.readFileSync(filename + '.manifest.json', 'utf8')).sha256 !== sha256) {
    throw new Error('backup SHA-256 não confirmado');
  }
  return sha256;
}

async function applyTarget(db, expected, backupDir = BACKUP_DIR, receiptDir = RECEIPT_DIR) {
  const ref = db.doc(expected.root.path);
  const full = await readFullBackup(ref);
  core.assertSame(core.classify(full.relevant.root, full.relevant.matches, full.relevant.results), expected);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, 'e05-uid-' + expected.root.id + '-' + stamp + '-' +
    require('node:crypto').randomBytes(4).toString('hex') + '.json');
  const backupHash = saveBackup(full, backupFile);
  await db.runTransaction(async tx => {
    const fresh = await readRelevant(ref, tx);
    core.assertSame(core.classify(fresh.root, fresh.matches, fresh.results), expected);
    const docs = new Map(fresh.matches.map(doc => [doc.id, doc]));
    for (const candidate of expected.candidates) {
      const doc = docs.get(candidate.id);
      if (!doc) throw new Error('candidato desapareceu');
      tx.update(doc.ref, { playerUids: candidate.uids }, { lastUpdateTime: doc.updateTime });
    }
  }, { maxAttempts: 1 });
  const after = await readRelevant(ref);
  core.assertAfter(full.relevant, after, expected);
  const receipt = { schema: 'scoreplace/e05-uid-index-receipt/1', project: PROJECT,
    target: expected.root.id, digest: expected.digest, backupFile, backupHash,
    writes: expected.candidates.length, auditedAt: new Date().toISOString() };
  privateFile(path.join(receiptDir, 'e05-uid-index-receipt-' + expected.root.id + '-' +
    expected.digest + '.json'), JSON.stringify(receipt, null, 2) + '\n');
  return { target: expected.name, writes: expected.candidates.length,
    backupSha256: backupHash, audit: 'ok' };
}

async function main(args = process.argv.slice(2)) {
  const mode = args[0];
  if (!(args.length === 1 && (mode === '--preview' || mode === '--check')) &&
      !(args.length === 3 && mode === '--apply' && /^[a-f0-9]{64}$/.test(args[1]))) {
    throw new Error('uso: --preview | --check | --apply <digest> <tournamentId>');
  }
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('emulador ativo; CLI real recusado');
  const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== PROJECT) throw new Error('credencial/projeto inválido');
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT });
  const db = admin.firestore();
  let report;
  if (mode === '--preview') report = await preview(db);
  else {
    const manifest = readManifest();
    if (mode === '--check') report = await check(db, manifest);
    else {
      if (args[1] !== manifest.digest) throw new Error('digest autorizado divergente');
      releaseGate();
      const expected = manifest.targets.find(target => target.root.id === args[2]);
      if (!expected) throw new Error('alvo fora do manifesto');
      report = await applyTarget(db, expected);
    }
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

module.exports = { privateFile, releaseGate, readManifest, readRelevant, preview, check,
  readFullBackup, saveBackup, applyTarget, main };
if (require.main === module) main().catch(error => {
  console.error('[E05 UID] operação interrompida: ' + String(error && error.message || error).replace(/tour_[^\s/]+/g, '[id]') +
    ' Após --apply, audite o estado e o backup antes de repetir; pode ter havido escrita sem recibo.');
  process.exitCode = 1;
});
