'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const backendRequire = createRequire(path.join(__dirname, '..', 'functions-autodraw', 'package.json'));
const { initializeApp: initializeBackendApp, applicationDefault: backendApplicationDefault, getApps: getBackendApps } = backendRequire('firebase-admin/app');
const { getFirestore, FieldValue } = backendRequire('firebase-admin/firestore');

async function main() {
  const [mode, sourceDigest, centralSourceDigest, sourceCommit] = process.argv.slice(2);
  if (!['--invalidate', '--ready'].includes(mode)) throw new Error('uso: end-court-readiness.js --invalidate | --ready <sourceDigest> <centralSourceDigest> <sourceCommit>');
  if (!getBackendApps().length) initializeBackendApp({ credential:backendApplicationDefault(), projectId:'scoreplace-app' });
  const ref = getFirestore().collection('operationRuntimeCapabilities').doc('endMatchOnCourt');
  if (mode === '--invalidate') {
    await ref.set({ ready:false, invalidatedAt:FieldValue.serverTimestamp() }, { merge:true });
    console.log('✓ readiness de endMatchOnCourt invalidada antes da publicação');
    return;
  }
  if (!/^[a-f0-9]{64}$/.test(sourceDigest || '') || !/^[a-f0-9]{64}$/.test(centralSourceDigest || '') ||
      !/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('digests/commit inválidos; readiness permanece false');
  await ref.set({ ready:true, sourceDigest, centralSourceDigest, sourceCommit,
    verifiedVersions:['v2','v3'], regions:['us-east1','us-east4','us-south1','us-central1','southamerica-east1'],
    updatedAt:FieldValue.serverTimestamp() }, { merge:true });
  console.log('✓ readiness habilitada depois de verificar as portas v2/v3');
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
