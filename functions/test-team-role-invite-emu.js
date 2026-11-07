'use strict';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Emuladores de Firestore e Auth são obrigatórios');
}
const assert = require('assert');
const admin = require('firebase-admin');
const CF = require('./index');
const db = admin.firestore();
const auth = admin.auth();
const tid = 'tour_team_role_invite_emulator';
const owner = 'team-role-owner';
const recipient = 'team-role-recipient';
const wrong = 'team-role-wrong';

async function call(name, data, uid) {
  return CF[name].run({ data, auth: { uid, token: { uid } }, rawRequest: { headers: {} }, acceptsStreaming: false });
}
async function rejects(name, data, uid, code) {
  await assert.rejects(call(name, data, uid), (err) => err.code === code);
}

(async () => {
  await auth.createUser({ uid: owner, email: 'owner-team@example.com', emailVerified: true });
  await auth.createUser({ uid: recipient, email: 'ref-team@example.com', emailVerified: false,
    phoneNumber: '+5511999998888', displayName: 'Árbitra Teste' });
  await auth.createUser({ uid: wrong, email: 'wrong-team@example.com', emailVerified: true,
    phoneNumber: '+5511888887777' });
  await db.collection('tournaments').doc(tid).set({ creatorUid: owner, adminUids: [owner],
    memberUids: [owner], name: 'Torneio de teste', participants: [], arbitros: [], coHosts: [] });
  await rejects('createTeamEmailInvite', { tournamentId: tid, role: 'referee', email: 'ref-team@example.com' }, wrong, 'permission-denied');
  const created = await call('createTeamEmailInvite', { tournamentId: tid, role: 'referee', email: 'ref-team@example.com' }, owner);
  assert.strictEqual(created.ok, true);
  const invites = await db.collection('teamRoleInvites').get();
  assert.strictEqual(invites.size, 1);
  const inviteDoc = invites.docs[0];
  const mail = (await db.collection('mail').doc(inviteDoc.data().mailId).get()).data();
  const token = mail.message.text.match(/#role-invite\/[^/]+\/([a-f0-9]{64})/)[1];
  assert.ok(!JSON.stringify(inviteDoc.data()).includes(token));
  await rejects('claimTeamInvite', { inviteId: inviteDoc.id, token }, wrong, 'permission-denied');
  await rejects('claimTeamInvite', { inviteId: inviteDoc.id, token }, recipient, 'permission-denied');
  await auth.updateUser(recipient, { emailVerified: true });
  const claimed = await call('claimTeamInvite', { inviteId: inviteDoc.id, token }, recipient);
  assert.strictEqual(claimed.ok, true);
  assert.strictEqual(claimed.role, 'referee');
  const after = (await db.collection('tournaments').doc(tid).get()).data();
  assert.deepStrictEqual(after.refereeUids, [recipient]);
  assert.strictEqual(after.arbitros.length, 1);
  assert.strictEqual((await call('claimTeamInvite', { inviteId: inviteDoc.id, token }, recipient)).alreadyClaimed, true);
  assert.strictEqual((await db.collection('mail').doc(inviteDoc.data().mailId).get()).exists, false);

  const phone = await call('createTeamPhoneInvite', { tournamentId: tid, role: 'cohost',
    ddi: '55', ddd: '11', number: '999998888' }, owner);
  assert.strictEqual(phone.phone, '+5511999998888');
  const phoneInvite = (await db.collection('teamRoleInvites').where('identityKind', '==', 'phone').get()).docs[0];
  const phoneToken = phone.smsText.match(/#role-invite\/[^/]+\/([a-f0-9]{64})/)[1];
  await rejects('claimTeamInvite', { inviteId: phoneInvite.id, token: phoneToken }, wrong, 'permission-denied');
  const phoneClaimed = await call('claimTeamInvite', { inviteId: phoneInvite.id, token: phoneToken }, recipient);
  assert.strictEqual(phoneClaimed.role, 'cohost');
  const final = (await db.collection('tournaments').doc(tid).get()).data();
  assert.deepStrictEqual(final.adminUids.sort(), [owner, recipient].sort());
  assert.strictEqual(final.coHosts.filter((entry) => entry.uid === recipient).length, 1);
  console.log('✓ convites por e-mail e telefone: autorização, prova Auth, consumo e papéis no emulador');
})().catch((error) => { console.error(error); process.exitCode = 1; });
