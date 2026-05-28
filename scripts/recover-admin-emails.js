/**
 * recover-admin-emails.js
 *
 * One-shot recovery: finds all tournaments where adminEmails is empty or
 * missing (bug introduced by v1.6.66 partial-object save) and repopulates
 * adminEmails + memberEmails from the full document data.
 *
 * Run from the project root:
 *   node scripts/recover-admin-emails.js
 *
 * Requires GOOGLE_APPLICATION_DEFAULT credentials or Application Default
 * Credentials configured (e.g. `firebase login` / ADC).
 */

const admin = require('../functions/node_modules/firebase-admin');

admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

function computeAdminEmails(data) {
  const emails = new Set();
  const add = (e) => { if (e && typeof e === 'string') emails.add(e.toLowerCase().trim()); };

  add(data.creatorEmail);
  add(data.organizerEmail);

  if (Array.isArray(data.coHosts)) {
    data.coHosts.forEach(h => add(typeof h === 'string' ? h : h && h.email));
  }
  if (Array.isArray(data.adminEmails)) {
    data.adminEmails.forEach(e => add(e));
  }

  return Array.from(emails).filter(Boolean);
}

function computeMemberEmails(data) {
  const emails = new Set();
  const add = (e) => { if (e && typeof e === 'string') emails.add(e.toLowerCase().trim()); };

  add(data.creatorEmail);
  add(data.organizerEmail);

  if (Array.isArray(data.coHosts)) {
    data.coHosts.forEach(h => add(typeof h === 'string' ? h : h && h.email));
  }

  const parts = Array.isArray(data.participants) ? data.participants : [];
  parts.forEach(p => {
    if (!p) return;
    if (typeof p === 'string') { add(p); return; }
    add(p.email);
    if (typeof p.name === 'string' && p.name.includes('@')) add(p.name);
    if (typeof p.displayName === 'string' && p.displayName.includes('@')) add(p.displayName);
    // doubles: "email1/email2"
    if (typeof p.name === 'string' && p.name.includes('/')) {
      p.name.split('/').forEach(n => { if (n.includes('@')) add(n); });
    }
  });

  return Array.from(emails).filter(Boolean);
}

async function run() {
  console.log('Fetching all tournaments...');
  const snap = await db.collection('tournaments').get();
  console.log(`Total tournaments: ${snap.size}`);

  let needsRepair = 0;
  let repaired = 0;
  let errors = 0;
  const batch_size = 400;
  let ops = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const adminEmails = data.adminEmails;

    const isEmpty = !Array.isArray(adminEmails) || adminEmails.length === 0;
    if (!isEmpty) continue;

    needsRepair++;
    const newAdmin = computeAdminEmails(data);
    const newMember = computeMemberEmails(data);

    if (newAdmin.length === 0) {
      console.warn(`  SKIP ${doc.id} — no organizer/creator email found (name: ${data.name})`);
      continue;
    }

    ops.push({ ref: doc.ref, newAdmin, newMember, name: data.name });
  }

  console.log(`\nTournaments needing repair: ${needsRepair}`);
  if (ops.length === 0) {
    console.log('Nothing to fix!');
    return;
  }

  // Process in batches of 400 (Firestore batch limit is 500)
  for (let i = 0; i < ops.length; i += batch_size) {
    const chunk = ops.slice(i, i + batch_size);
    const batch = db.batch();
    chunk.forEach(op => {
      batch.update(op.ref, {
        adminEmails: op.newAdmin,
        memberEmails: op.newMember,
      });
    });
    try {
      await batch.commit();
      repaired += chunk.length;
      chunk.forEach(op => {
        console.log(`  ✓ ${op.ref.id} — ${op.name} → adminEmails: [${op.newAdmin.join(', ')}]`);
      });
    } catch (e) {
      errors += chunk.length;
      console.error(`  ✗ batch error:`, e.message);
    }
  }

  console.log(`\nDone. Repaired: ${repaired}, Errors: ${errors}`);
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
