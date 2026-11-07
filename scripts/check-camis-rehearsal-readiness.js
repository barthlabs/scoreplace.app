#!/usr/bin/env node
'use strict';

// Auditoria somente de leitura. Não imprime nomes nem dados pessoais.
const fs = require('node:fs');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const { projectedSize } = require('../functions-autodraw/tournament-rehearsal');

const id = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const credential = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(credential), projectId: 'scoreplace-app' });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(id);

async function readTree(parent, prefix = '') {
  const rows = [];
  for (const collection of await parent.listCollections()) {
    for (const doc of (await collection.get()).docs) {
      const path = prefix + collection.id + '/' + doc.id;
      rows.push({ path, data: doc.data() });
      rows.push(...await readTree(doc.ref, path + '/'));
    }
  }
  return rows;
}

(async () => {
  const root = await ref.get();
  if (!root.exists) throw Error('CAMIS não encontrado');
  const t = root.data();
  const tree = await readTree(ref);
  const summary = await db.collection('tournaments_summary').doc(id).get();
  const regs = tree.filter(x => x.path.startsWith('registrations/') && x.path.split('/').length === 2);
  const categories = new Map((t.categoryDefinitions || []).map(x => [x.id, x.label]));
  const counts = {};
  for (const x of regs) {
    const label = categories.get(x.data.categoryId) || 'categoria-desconhecida';
    counts[label] = (counts[label] || 0) + 1;
  }
  const otherCollections = [...new Set(tree.filter(x => !x.path.startsWith('registrations/'))
    .map(x => x.path.split('/')[0]))].sort();
  const flags = {
    private: t.isPublic === false && t.organizerOnly === true,
    open: t.status === 'open',
    noDraw: !(t.drawFirstDate || t.nextDrawAt || t.pendingDraw || t.drawCompleted ||
      t.drawSelectionDone || t._canonicalDraw || (t.matches || []).length ||
      (t.rounds || []).length || (t.groups || []).length || (t.woLog || []).length ||
      Number(t._nPartes?.matches || 0)),
    manualOnly: regs.every(x => x.data.participantKind === 'manual' && !x.data.participantUid &&
      Number.isSafeInteger(Number(x.data.enrollSeq)) && Number(x.data.enrollSeq) > 0),
    canonicalCount: t.canonicalRegistrationMigration?.registrationCount === regs.length,
    noPlaceholderReservations: !(t.placeholderReservations || []).length,
  };
  const bytes = projectedSize({ root: t, tree, summary: summary.exists ? summary.data() : null });
  console.log(JSON.stringify({ registrations: regs.length, categories: counts, otherCollections,
    projectedBaselineBytes: bytes, maxBytes: 512 * 1024, checks: flags }, null, 2));
  if (regs.length !== 144 || Object.values(flags).some(x => !x) || bytes >= 512 * 1024) process.exitCode = 1;
})().catch(e => { console.error('Auditoria falhou: ' + e.message); process.exitCode = 1; });
