#!/usr/bin/env node
'use strict';

// Renomeia somente os metadados do CAMIS, incluindo a fotografia usada no reset.
// Sem --apply, confere as pré-condições e mostra o plano, sem escrever.
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const { fingerprint, projectedSize } = require('../functions-autodraw/tournament-rehearsal');

const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const OWNER = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const OLD = 'Camis no Beyond';
const NAME = 'Camis Day';
const apply = process.argv.includes('--apply');
if (process.argv.length > (apply ? 3 : 2)) throw Error('Uso: node scripts/rename-camis-day.js [--apply]');

admin.initializeApp({ credential: admin.credential.cert(require(credentialPath(process.env))), projectId: 'scoreplace-app' });
const db = admin.firestore();
const rootRef = db.doc('tournaments/' + ID);
const baseRef = db.doc('tournamentRehearsalBaselines/' + ID);
const summaryRef = db.doc('tournaments_summary/' + ID);
const feedRef = db.doc('discoveryFeed/' + ID);

async function run(tx) {
  const [rootSnap, baseSnap, summarySnap, feedSnap] = await Promise.all([
    tx.get(rootRef), tx.get(baseRef), tx.get(summaryRef), tx.get(feedRef)
  ]);
  if (!rootSnap.exists || !baseSnap.exists || !summarySnap.exists || feedSnap.exists) throw Error('Documentos do CAMIS inesperados');
  const root = rootSnap.data(), base = baseSnap.data(), summary = summarySnap.data();
  if (root.creatorUid !== OWNER || root.isPublic !== false || root.organizerOnly !== true ||
      root.isSandbox === true || root.rehearsal?.state !== 'active' || root.rehearsal?.mode !== 'postDraw' ||
      base.state !== 'active' || base.mode !== 'postDraw' || base.epoch !== root.rehearsal.epoch ||
      base.hash !== root.rehearsal.hash || !Array.isArray(base.tree) ||
      fingerprint({ root: base.root, tree: base.tree, summary: base.summary || null }) !== base.hash ||
      !base.summary || ![OLD, NAME].includes(root.name) || ![OLD, NAME].includes(base.root.name) ||
      ![OLD, NAME].includes(summary.name) || ![OLD, NAME].includes(base.summary.name)) {
    throw Error('Identidade, privacidade ou fotografia do CAMIS divergente; nenhuma escrita');
  }
  if ([root.name, base.root.name, summary.name, base.summary.name].every(name => name === NAME)) {
    console.log('CAMIS já se chama Camis Day; fotografia íntegra.');
    return;
  }
  if ([root.name, base.root.name, summary.name, base.summary.name].some(name => name !== OLD)) {
    throw Error('Renomeação parcial; nenhuma escrita');
  }
  const nextRoot = { ...base.root, name: NAME };
  const nextSummary = { ...base.summary, name: NAME };
  const hash = fingerprint({ root: nextRoot, tree: base.tree, summary: nextSummary });
  if (projectedSize({ root: nextRoot, tree: base.tree, summary: nextSummary }) > 900 * 1024) {
    throw Error('Fotografia excede limite seguro');
  }
  if (!apply) {
    console.log('Pronto para renomear Camis no Beyond → Camis Day no torneio, resumo e fotografia; jogos intactos.');
    return;
  }
  tx.update(rootRef, { name: NAME, 'rehearsal.hash': hash });
  tx.update(summaryRef, { name: NAME });
  tx.update(baseRef, { root: nextRoot, summary: nextSummary, hash });
  console.log('Renomeação transacional preparada; jogos e inscrições não alterados.');
}

db.runTransaction(run).then(() => process.exit(0)).catch(error => {
  console.error(error.message);
  process.exit(1);
});
