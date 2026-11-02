#!/usr/bin/env node
'use strict';

// E05: GET-only. O manifesto privado não é autorização de escrita.
const fs = require('node:fs');
const path = require('node:path');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token.js');
const core = require('./planejar-sandbox-e05-core.js');

const manifestFile = path.resolve(__dirname, '../.claude/tmp/e05-sandbox-manifest-private.json');

async function directCollections(ref) {
  const out = new Map();
  for (const collection of await ref.listCollections()) {
    const snapshot = await collection.get();
    out.set(collection.id, snapshot.docs);
  }
  return out;
}

async function preview(db) {
  const roots = await db.collection('sandboxes').get();
  const manifests = [];
  for (const sandbox of roots.docs) {
    const data = sandbox.data();
    if (!data || typeof data.sandboxOf !== 'string' || !data.sandboxOf) {
      throw new Error('sandbox sem origem comprovada');
    }
    const origin = await db.collection('tournaments').doc(data.sandboxOf).get();
    if (!origin.exists) throw new Error('origem ausente');
    const [local, source] = await Promise.all([
      directCollections(sandbox.ref), directCollections(origin.ref)
    ]);
    manifests.push(core.classify(sandbox, origin, local.get('matches') || [],
      source.get('matches') || [], local.get('resultsSandbox') || []));
  }
  return { manifests, report: core.publicReport(manifests) };
}

function savePrivate(manifests, filename = manifestFile) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const temp = filename + '.partial';
  if (fs.existsSync(temp)) throw new Error('manifesto parcial preexistente');
  fs.writeFileSync(temp, JSON.stringify(manifests, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    fs.renameSync(temp, filename);
    fs.chmodSync(filename, 0o600);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch (_) {}
    throw error;
  }
}

async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || args[0] !== '--preview') throw new Error('somente --preview é permitido');
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('emulador ativo');
  const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
  if (key.type !== 'service_account' || key.project_id !== 'scoreplace-app') {
    throw new Error('credencial/projeto inválido');
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: 'scoreplace-app' });
  const { manifests, report } = await preview(admin.firestore());
  savePrivate(manifests);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}

module.exports = { preview, savePrivate, main };
if (require.main === module) main().catch(() => {
  console.error('prévia do sandbox indisponível; nenhuma escrita de produção');
  process.exitCode = 1;
});
