'use strict';

const { createRequire } = require('node:module');
const path = require('node:path');
const backendRequire = createRequire(path.join(__dirname, '..', 'functions-autodraw', 'package.json'));
const { initializeApp, applicationDefault, getApps } = backendRequire('firebase-admin/app');
const { getFirestore } = backendRequire('firebase-admin/firestore');

async function main() {
  const root = path.join(__dirname, '..');
  if (!getApps().length) initializeApp({ credential:applicationDefault(), projectId:'scoreplace-app' });
  const capability = (await getFirestore().collection('operationRuntimeCapabilities').doc('endMatchOnCourt').get()).data() || {};
  const sourceCommit = capability.sourceCommit;
  const { sourceDescriptor, sourceDigest } = require('../scripts/operation-source-digest.js');
  const regionalDigest = sourceDigest('endMatchOnCourt', sourceCommit,
    sourceDescriptor('functions-autodraw', sourceCommit));
  const centralDigest = require('../functions-autodraw/court-capability-digest.js').digestFor(path.join(root,'functions-autodraw'));
  const v2 = require(path.join(root,'operation-regions.json'));
  const v3 = require(path.join(root,'operation-regions-v3.json'));
  const services = [v2.services && v2.services['sp-op-end-court-v2'], v3.services && v3.services['sp-op-end-court-v3']];
  if (capability.ready !== true ||
      capability.sourceDigest !== regionalDigest || capability.centralSourceDigest !== centralDigest ||
      services.some(service => !service || service.digest !== regionalDigest || service.centralSourceDigest !== centralDigest)) {
    throw new Error('endMatchOnCourt não está pronto para a nova tela; deploy central, refresh v2/v3 e os dois digests precisam coincidir.');
  }
  console.log('✓ readiness e digests central/regional coincidem');
}
main().catch(error => { console.error('✗ gate endMatchOnCourt:', error.message); process.exitCode = 1; });
