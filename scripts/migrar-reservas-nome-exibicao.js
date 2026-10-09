'use strict';
/*
 * Converte perfis legados em displayNameClaims.
 *
 * Por padrão só audita. `--apply` grava reservas ativas para nomes únicos e
 * reservas de conflito + casos de revisão para homônimos. Nunca renomeia,
 * mescla, tombstona ou transfere inscrições.
 *
 * Uso:
 *   node scripts/migrar-reservas-nome-exibicao.js
 *   node scripts/migrar-reservas-nome-exibicao.js --apply
 */
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const { planDisplayNameClaims } = require(path.join(__dirname, '..', 'functions', 'display-name-claim-migration-core.js'));

const APPLY = process.argv.includes('--apply');

async function main() {
  admin.initializeApp();
  const db = admin.firestore();
  const snapshot = await db.collection('users').get();
  const profiles = snapshot.docs.map((doc) => ({ uid: doc.id, data: doc.data() || {} }));
  const plan = planDisplayNameClaims(profiles);
  console.log('▶ reservas de nome: ' + plan.scanned + ' perfis lidos · ' + plan.active.length +
    ' nomes únicos · ' + plan.conflicts.length + ' colisões');
  plan.conflicts.forEach((item) => console.log('  ⛔ ' + item.displayName + ' → ' + item.uids.join(', ')));
  if (!APPLY) {
    console.log('DRY-RUN: nenhuma escrita. Use --apply somente após revisar as colisões.');
    return;
  }

  const writes = [];
  plan.active.forEach((item) => writes.push({ ref: db.collection('displayNameClaims').doc(item.id), data: item.document }));
  plan.conflicts.forEach((item) => {
    writes.push({ ref: db.collection('displayNameClaims').doc(item.id), data: item.document });
    const caseId = crypto.createHash('sha256').update('legacy_display_name_collision\n' + item.id).digest('hex');
    writes.push({ ref: db.collection('identityReviewCases').doc(caseId), data: {
      status: 'pending', source: 'legacy_display_name_collision', field: 'displayName',
      subjectUids: item.uids, displayNameKey: item.key,
      firstSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      sightings: admin.firestore.FieldValue.increment(1),
    } });
  });
  for (let start = 0; start < writes.length; start += 400) {
    const batch = db.batch();
    writes.slice(start, start + 400).forEach((write) => batch.set(write.ref, write.data, { merge: true }));
    await batch.commit();
  }
  console.log('✓ ' + writes.length + ' documentos gravados de forma idempotente; nenhuma conta foi alterada.');
}

main().catch((error) => { console.error('✗ migração abortada:', error && error.message ? error.message : error); process.exit(1); });
