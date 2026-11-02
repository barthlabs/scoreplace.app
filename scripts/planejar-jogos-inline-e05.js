#!/usr/bin/env node
'use strict';

// E05: GET-only. Este arquivo não oferece comando de escrita no Firestore.
const fs = require('node:fs');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token.js');
const core = require('./planejar-jogos-inline-e05-core.js');

const BACKUP_DIR = '/Users/rtb/Documents/Codex/backups-operacionais';
const MANIFEST = path.resolve(__dirname, '../.claude/tmp/e05-inline-manifest-private.json');

function loadBackups(directory = BACKUP_DIR) {
  const candidates = fs.readdirSync(directory).filter(name => name.endsWith('.json.manifest.json'));
  const byName = new Map();
  for (const sidecarName of candidates) {
    const filename = path.join(directory, sidecarName.slice(0, -'.manifest.json'.length));
    const sidecar = JSON.parse(fs.readFileSync(path.join(directory, sidecarName), 'utf8'));
    const raw = fs.readFileSync(filename, 'utf8');
    const body = JSON.parse(raw);
    const target = core.TARGETS.find(item => item.name === body.tournament?.data?.name);
    if (!target) continue;
    const old = byName.get(target.name);
    if (!old || body.createdAt > old.body.createdAt) byName.set(target.name, { body, sidecar, raw });
  }
  if (byName.size !== core.TARGETS.length) throw new Error('backup de alvo ausente');
  for (const item of byName.values()) item.hash = core.verifyBackup(item.body, item.sidecar, item.raw);
  return byName;
}

async function preview(db, backups) {
  const targets = [];
  for (const target of core.TARGETS) {
    const query = await db.collection('tournaments').where('name', '==', target.name).get();
    if (query.size !== 1) throw new Error('alvo ausente ou duplicado');
    const root = query.docs[0];
    const collections = {};
    for (const collection of await root.ref.listCollections()) {
      const snapshot = await collection.get();
      collections[collection.id] = snapshot.docs;
    }
    const backup = backups.get(target.name);
    if (!backup) throw new Error('backup de alvo ausente');
    targets.push(core.validateTarget(target, root, collections, backup.body, backup.hash));
  }
  return core.buildManifest(targets);
}

function saveManifest(manifest, filename = MANIFEST) {
  const body = JSON.stringify(manifest, null, 2) + '\n';
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temporary = filename + '.partial';
  fs.writeFileSync(temporary, body, { flag: 'wx', mode: 0o600 });
  try {
    fs.renameSync(temporary, filename);
    fs.chmodSync(filename, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch (_) {}
    throw error;
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--preview') throw new Error('somente --preview é permitido');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('emulador ativo');
  const keyFile = credentialPath(process.env);
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== 'scoreplace-app') throw new Error('credencial/projeto inválido');
  const backups = loadBackups();
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: 'scoreplace-app' });
  const manifest = await preview(admin.firestore(), backups);
  saveManifest(manifest);
  process.stdout.write(JSON.stringify(core.publicReport(manifest), null, 2) + '\n');
}

module.exports = { loadBackups, preview, saveManifest, main };
if (require.main === module) main().catch(() => {
  console.error('prévia E05 interrompida; nenhum manifesto parcial ou escrita de produção');
  process.exitCode = 1;
});
