#!/usr/bin/env node
'use strict';

const { createRequire } = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const backendRequire = createRequire(path.join(root, 'functions-autodraw', 'package.json'));
const { initializeApp, applicationDefault, getApps } = backendRequire('firebase-admin/app');
const { getFirestore, FieldValue } = backendRequire('firebase-admin/firestore');
const { autodrawExports } = require('./backend-publication-core');
const { buildReadyDocument } = require('./end-court-readiness-core');
const { digestForCommit } = require('./central-source-digest');
const { sourceDescriptor, sourceDigest } = require('./operation-source-digest');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function safeRepoFile(relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error('caminho do manifesto deve ser relativo ao repositório');
  const file = path.resolve(root, relative);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('manifesto fora do repositório');
  return file;
}

async function main() {
  const [mode, manifestArg, ...extra] = process.argv.slice(2);
  if (mode === '--invalidate' && !manifestArg && extra.length === 0) {
    if (!getApps().length) initializeApp({ credential:applicationDefault(), projectId:'scoreplace-app' });
    const ref = getFirestore().collection('operationRuntimeCapabilities').doc('endMatchOnCourt');
    await ref.set({ ready:false, invalidatedAt:FieldValue.serverTimestamp() }, { merge:true });
    console.log('✓ readiness de endMatchOnCourt invalidada antes da publicação');
    return;
  }
  if (mode !== '--ready' || !manifestArg || extra.length !== 0) {
    throw new Error('uso: end-court-readiness.js --invalidate | --ready <manifestoRequerido>');
  }

  // Todas as fontes e receipts são validados antes da inicialização/escrita no Firestore.
  const requiredManifest = readJson(safeRepoFile(manifestArg));
  const sourceCommit = requiredManifest.backendCommit;
  const receipt = readJson(path.join(root, '.backend-publicado-autodraw-funcoes.json'));
  const exportedNames = autodrawExports(fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8'));
  const regionalManifests = {
    v2:readJson(path.join(root, '.claude/tmp/operation-regions-manifest-v2.json')),
    v3:readJson(path.join(root, '.claude/tmp/operation-regions-manifest-v3.json'))
  };
  const regionalDigest = sourceDigest('endMatchOnCourt', sourceCommit,
    sourceDescriptor('functions-autodraw', sourceCommit, true));
  const centralSourceDigest = digestForCommit(sourceCommit, root);
  const ready = buildReadyDocument({ requiredManifest, receipt, exportedNames, regionalManifests,
    sourceDigest:regionalDigest, centralSourceDigest });

  if (!getApps().length) initializeApp({ credential:applicationDefault(), projectId:'scoreplace-app' });
  const ref = getFirestore().collection('operationRuntimeCapabilities').doc('endMatchOnCourt');
  await ref.set({ ...ready, updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  console.log('✓ readiness habilitada depois de verificar receipt e oito portas v2/v3');
}

if (require.main === module) main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});

module.exports = { safeRepoFile };
