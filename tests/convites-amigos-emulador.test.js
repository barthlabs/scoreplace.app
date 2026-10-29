'use strict';
/* Contrato real das callables de convite: executar SOMENTE no Firestore Emulator. */
const assert = require('assert/strict');
const path = require('path');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('child_process');
  const fs = require('fs'), os = require('os');
  const root = path.join(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-friend-invite-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  { encoding: 'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore: { rules: path.join(root, 'tests/concurrency/firestore.allow.rules') },
    emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false }, singleProjectMode: true }
  }));
  const result = spawnSync('firebase', ['emulators:exec', '--only', 'firestore', '--config', config,
    '--project', 'demo-scoreplace', 'node tests/convites-amigos-emulador.test.js'], {
    cwd: root, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }
  });
  fs.rmSync(temp, { recursive: true, force: true });
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);
  if (result.error) console.error(result.error);
  process.exit(result.status === 0 || /Script exited successfully \(code 0\)/.test(output) ? 0 : 1);
}
assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''), 'somente emulador local');
process.env.GCLOUD_PROJECT = 'demo-scoreplace';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });
const funcs = require('../functions/index.js');
const admin = require('module').createRequire(path.join(__dirname, '../functions/index.js'))('firebase-admin');
const pairId = require('../functions/amizade-authority-core.js').pairId;
const notifId = require('../functions/cohost-core.js').cohostInviteNotifId;

(async () => {
  const db = admin.firestore();
  const suffix = Date.now();
  const owner = 'invite-owner-' + suffix;
  const friend = 'invite-friend-' + suffix;
  const outsider = 'invite-outsider-' + suffix;
  const merged = 'invite-merged-' + suffix;
  const id = 'tour_' + suffix + '_' + 'e'.repeat(32);
  const tour = db.doc('tournaments/' + id);
  const friendNotice = db.doc('users/' + friend + '/notifications/' + notifId(id, friend));
  const invoke = (name, uid, action, targetUid, type = 'cohost') => funcs[name].run({
    auth: { uid, token: {} },
    data: name === 'respondHostInvite'
      ? { tournamentId: id, inviteType: type, action }
      : { tournamentId: id, inviteType: type, action, targetUid, friendAccepted: true }
  });
  await Promise.all([
    db.doc('users/' + owner).set({ displayName: 'Organizador Teste' }),
    db.doc('users/' + friend).set({ displayName: 'Amigo Teste' }),
    db.doc('users/' + outsider).set({ displayName: 'Outro Teste' }),
    db.doc('users/' + merged).set({ displayName: 'Absorvido', mergedInto: friend }),
    db.doc('friendships/' + pairId(owner, friend)).set({ status: 'accepted' }),
    db.doc('friendships/' + pairId(owner, merged)).set({ status: 'accepted' }),
    tour.set({ creatorUid: owner, name: 'Torneio Emulador', memberUids: [owner], adminUids: [owner], participants: [], coHosts: [] })
  ]);

  await assert.rejects(invoke('mutateHostOrganization', owner, 'invite', ''), { code: 'invalid-argument' });
  assert.equal((await friendNotice.get()).exists, false);

  await assert.rejects(invoke('mutateHostOrganization', owner, 'invite', outsider), { code: 'failed-precondition' });
  assert.equal((await db.doc('users/' + outsider + '/notifications/' + notifId(id, outsider)).get()).exists, false);
  await assert.rejects(invoke('mutateHostOrganization', owner, 'invite', merged), { code: 'failed-precondition' });
  await db.doc('friendships/' + pairId(owner, friend)).update({ status: 'legacy_unverified' });
  await assert.rejects(invoke('mutateHostOrganization', owner, 'invite', friend), { code: 'failed-precondition' });
  assert.equal((await friendNotice.get()).exists, false);
  await db.doc('friendships/' + pairId(owner, friend)).update({ status: 'accepted' });
  await assert.rejects(invoke('mutateHostOrganization', owner, 'invite', friend, 'transfer'), { code: 'failed-precondition' });
  assert.equal((await friendNotice.get()).exists, false);

  const invited = await invoke('mutateHostOrganization', owner, 'invite', friend);
  assert.equal(invited.changed, true);
  let data = (await tour.get()).data();
  assert.equal(data.coHosts[0].uid, friend);
  assert.equal(data.coHosts[0].status, 'pending');
  assert.equal((data.adminUids || []).includes(friend), false);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'pending');
  assert.equal((await friendNotice.get()).data().fromUid, owner);
  assert.equal((await invoke('mutateHostOrganization', owner, 'invite', friend)).changed, false);
  assert.equal((await db.collection('users/' + friend + '/notifications').get()).size, 1);

  await friendNotice.update({ read: true });
  assert.equal((await invoke('respondHostInvite', friend, 'accept')).applied, true);
  data = (await tour.get()).data();
  assert.equal(data.coHosts[0].status, 'active');
  assert.equal(data.adminUids.includes(friend), true);
  assert.equal(data.memberUids.includes(friend), true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'answered');
  assert.equal((await invoke('respondHostInvite', friend, 'accept')).notFound, true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'answered');
  assert.equal((await invoke('mutateHostOrganization', owner, 'remove', friend)).changed, true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'answered');

  await invoke('mutateHostOrganization', owner, 'invite', friend);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'pending');
  assert.equal((await invoke('mutateHostOrganization', owner, 'cancel', friend)).changed, true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'canceled');
  await invoke('mutateHostOrganization', owner, 'invite', friend);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'pending');
  assert.equal((await invoke('respondHostInvite', friend, 'reject')).applied, true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'answered');

  await invoke('mutateHostOrganization', owner, 'invite', friend);
  await friendNotice.update({ inviteStatus: 'answered' });
  assert.equal((await invoke('mutateHostOrganization', owner, 'cancel', friend)).changed, true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'answered', 'cancelamento não reescreve aviso respondido');

  await friendNotice.update({ inviteStatus: 'pending', read: true });
  assert.equal((await invoke('respondHostInvite', friend, 'accept')).notFound, true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'canceled');
  const sandboxId = 'sandbox_' + suffix + '_' + 's'.repeat(24);
  await db.doc('tournaments/' + sandboxId).set({ creatorUid: owner, name: 'Cópia de teste',
    memberUids: [owner], adminUids: [owner], participants: [], coHosts: [], isSandbox: true });
  const sandboxInvite = await funcs.mutateHostOrganization.run({ auth: { uid: owner, token: {} },
    data: { tournamentId: sandboxId, inviteType: 'cohost', action: 'invite', targetUid: friend } });
  assert.equal(sandboxInvite.changed, true);
  assert.equal((await db.doc('users/' + friend + '/notifications/' + notifId(sandboxId, friend)).get()).exists, false);

  const refereeId = 'referee_' + suffix + '_' + 'r'.repeat(24);
  const refereeTour = db.doc('tournaments/' + refereeId);
  const refereeNotice = db.doc('users/' + friend + '/notifications/referee-invite-' + refereeId);
  await Promise.all([
    refereeTour.set({ creatorUid: owner, name: 'Torneio Arbitragem', memberUids: [owner],
      adminUids: [owner], participants: [], arbitros: [] }),
    db.doc('usersPublic/' + friend).set({ displayName: 'Árbitra Teste' })
  ]);
  const callReferee = (uid, action, tid = refereeId) => funcs.manageTournamentReferee.run({
    auth: { uid, token: {} }, data: { tournamentId: tid, action, uid: friend }
  });
  assert.equal((await callReferee(owner, 'invite')).changed, true);
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'pending');
  assert.equal((await refereeNotice.get()).data().read, false);
  assert.equal((await callReferee(owner, 'invite')).changed, false);
  assert.equal((await db.collection('users/' + friend + '/notifications').where('type', '==', 'referee_invite').get()).size, 1);
  await refereeNotice.update({ read: true });
  assert.equal((await callReferee(friend, 'self-confirm')).changed, true);
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'answered');
  assert.equal((await refereeTour.get()).data().arbitros[0].status, 'confirmed');
  const answered = (await refereeNotice.get()).data();
  const repeat = await callReferee(friend, 'self-confirm');
  assert.equal(repeat.changed, false);
  assert.notEqual(repeat.notFound, true);
  assert.deepEqual((await refereeNotice.get()).data(), answered);
  await callReferee(owner, 'remove');
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'answered');
  await callReferee(owner, 'invite');
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'pending');
  assert.equal((await refereeNotice.get()).data().read, false);
  await callReferee(friend, 'decline');
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'answered');
  assert.equal((await refereeTour.get()).data().arbitros.length, 0);
  await callReferee(owner, 'invite');
  await callReferee(owner, 'remove');
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'canceled');
  await refereeNotice.update({ inviteStatus: 'pending', read: true });
  assert.equal((await callReferee(friend, 'decline')).notFound, true);
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'canceled');
  await refereeTour.delete();
  await refereeNotice.update({ inviteStatus: 'pending', read: true });
  assert.equal((await callReferee(friend, 'self-confirm')).notFound, true);
  assert.equal((await refereeNotice.get()).data().inviteStatus, 'canceled');
  const sandboxRefereeNotice = db.doc('users/' + friend + '/notifications/referee-invite-' + sandboxId);
  await callReferee(owner, 'invite', sandboxId);
  assert.equal((await db.doc('tournaments/' + sandboxId).get()).data().arbitros[0].status, 'invited');
  assert.equal((await sandboxRefereeNotice.get()).exists, false);
  await tour.delete();
  await friendNotice.update({ inviteStatus: 'pending', read: true });
  assert.equal((await invoke('respondHostInvite', friend, 'accept')).notFound, true);
  assert.equal((await friendNotice.get()).data().inviteStatus, 'canceled');
  console.log('✓ Convites de coorganização e arbitragem no emulador: aceite, recusa, cancelamento, órfãos e sandbox');
  await db.terminate();
})().catch((err) => { console.error(err); process.exitCode = 1; });
