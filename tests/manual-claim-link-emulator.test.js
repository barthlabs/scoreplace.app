'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');

async function driver() {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8093';
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9092';
  const admin = require('../functions/node_modules/firebase-admin');
  const fb = require('firebase/compat/app');
  require('firebase/compat/auth'); require('firebase/compat/functions');
  const reg = require('../functions/registration-core');
  const mutations = require('../functions/registration-mutations-core');
  const projectId = 'demo-scoreplace';
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const tid = 'test-shared-claim', sid = 'sb_' + tid;
  const users = [['org-claim', 'org@claim.test', 'Organizador Teste'],
    ['anna-claim', 'anna@claim.test', 'Ana Costa'], ['other-claim', 'other@claim.test', 'Ana Costa'],
    ['bia-claim', 'bia@claim.test', 'Bia Lima']];
  for (const [uid, email, displayName] of users) {
    await admin.auth().createUser({ uid, email, password: 'senha123' });
    await db.doc('users/' + uid).set({ displayName });
  }
  const manual = [['a', 'Ana Costa'], ['b', 'Bia Lima'], ['c', 'Cris Souza'], ['d', 'Dani Melo']]
    .map(([manualParticipantId, manualDisplayName]) => {
      const participantKey = reg.participantKey({ manualParticipantId });
      return { registrationId: reg.registrationId(participantKey, 'fem-light'), tournamentId: tid,
        categoryId: 'fem-light', participantKey, participantKind: 'manual', participantUid: null,
        manualParticipantId, manualDisplayName, status: 'confirmed', validationState: 'approved', fixedPairId: null };
    });
  for (const start of [0, 2]) {
    const pairId = mutations.canonicalPairId(tid, 'fem-light', manual.slice(start, start + 2).map((p) => p.registrationId));
    manual[start].fixedPairId = pairId; manual[start + 1].fixedPairId = pairId;
  }
  const root = { creatorUid: 'org-claim', adminUids: ['org-claim'], memberUids: [], name: 'Teste de vagas',
    categoryDefinitions: [{ id: 'fem-light', label: 'Fem Light' }],
    canonicalRegistrationMigration: { fingerprint: 'test-claim-fixture', registrationCount: 4 },
    rounds: [], matches: [] };
  await db.doc('tournaments/' + tid).set(root);
  await db.doc('sandboxes/' + sid).set({ ...root, isSandbox: true, sbState: 'ready', notificationsMuted: true,
    sandboxOf: tid, sandboxOwnerUid: 'org-claim', pendingDraw: { kind: 'initial', private: true } });
  for (const item of manual) {
    await db.doc('tournaments/' + tid + '/registrations/' + item.registrationId).set(item);
    await db.doc('sandboxes/' + sid + '/registrations/' + item.registrationId).set(item);
  }
  const left = { fixedPair: true, p1ManualId: 'a', p2ManualId: 'b', p1Name: 'Ana Costa', p2Name: 'Bia Lima', fixedPairId: manual[0].fixedPairId };
  const right = { fixedPair: true, p1ManualId: 'c', p2ManualId: 'd', p1Name: 'Cris Souza', p2Name: 'Dani Melo', fixedPairId: manual[2].fixedPairId };
  const draft = { participants: [left, right], matches: [{ id: 'game-1', team1Obj: left, team2Obj: right,
    team1Uids: [], team2Uids: [], p1Uid: null, p2Uid: null }],
    competitionPairAssignments: [{ fixedPairId: left.fixedPairId }, { fixedPairId: right.fixedPairId }] };
  await db.doc('sandboxes/' + sid + '/privateDraws/initial').set({ kind: 'initial', draft });
  const firebase = fb.default || fb;
  const app = firebase.initializeApp({ apiKey: 'fake', projectId, authDomain: 'localhost' });
  app.auth().useEmulator('http://127.0.0.1:9092', { disableWarnings: true });
  app.functions('us-central1').useEmulator('127.0.0.1', 5011);
  const call = (name, data) => app.functions('us-central1').httpsCallable(name)(data).then((r) => r.data);
  const payload = { tournamentId: sid, sandbox: true };
  await app.auth().signInWithEmailAndPassword('org@claim.test', 'senha123');
  const link = await call('createTournamentClaimLink', payload);
  assert.match(link.token, /^[a-f0-9]{64}$/);
  assert(!JSON.stringify((await db.doc('sandboxes/' + sid + '/manualClaimInvites/shared').get()).data()).includes(link.token));
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('anna@claim.test', 'senha123');
  const preview = await call('previewTournamentClaimLink', { ...payload, token: link.token });
  assert.equal(preview.alreadyRegistered, false);
  assert.equal(preview.candidates.length, 1);
  assert.equal(preview.candidates[0].partnerName, 'Bia Lima');
  await call('acceptTournamentClaimLink', { ...payload, token: link.token, manualParticipantId: 'a' });
  const after = await call('previewTournamentClaimLink', { ...payload, token: link.token });
  assert.equal(after.alreadyRegistered, true);
  assert.equal(after.candidates.length, 0);
  assert.equal(after.pair.partnerName, 'Bia Lima');
  const sandboxRegs = (await db.collection('sandboxes/' + sid + '/registrations').get()).docs.map((doc) => doc.data());
  assert(sandboxRegs.some((item) => item.participantUid === 'anna-claim' && item.status === 'confirmed'));
  const originalRegs = (await db.collection('tournaments/' + tid + '/registrations').get()).docs.map((doc) => doc.data());
  assert(originalRegs.some((item) => item.manualParticipantId === 'a' && item.status === 'confirmed'));
  const updatedDraft = (await db.doc('sandboxes/' + sid + '/privateDraws/initial').get()).data().draft;
  assert.equal(updatedDraft.participants[0].p1Uid, 'anna-claim');
  assert.equal(updatedDraft.matches[0].team1Obj.p1Uid, 'anna-claim');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('other@claim.test', 'senha123');
  await assert.rejects(call('acceptTournamentClaimLink', { ...payload, token: link.token, manualParticipantId: 'a' }));
  await db.doc('sandboxes/' + sid + '/grupos/published').set({ id: 'published' });
  await assert.rejects(call('previewTournamentClaimLink', { ...payload, token: link.token }));
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('org@claim.test', 'senha123');
  const originalLink = await call('createTournamentClaimLink', { tournamentId: tid, sandbox: false });
  const split = require('../functions/vendor/tournament-split-core');
  const published = { id: 'published', p1: 'Ana Costa / Bia Lima', p2: 'Cris Souza / Dani Melo',
    team1Obj: left, team2Obj: right,
    team1Uids: [], team2Uids: [], p1Uid: null, p2Uid: null,
    court: '7', scheduledAt: '2026-10-22T18:00:00Z', winner: null };
  const divided = split.dividir({ participants: [left, right], matches: [published] }, ['participants', 'matches']);
  await db.doc('tournaments/' + tid).update({ _semPesados: ['matches', 'participants'], matches: [], participants: [],
    _nPartes: { matches: 1, participants: 2 } });
  for (const part of divided.participants) await db.doc('tournaments/' + tid + '/inscritos/' + split.chaveDoRegistro(part)).set(part);
  await db.doc('tournaments/' + tid + '/matches/published').set(divided.matches[0]);
  await db.doc('tournaments/' + tid + '/results/published').set({ matchId: 'published', playerUids: [], winner: null });
  const listed = await call('listManualClaimInvites', { tournamentId: tid });
  assert.equal(listed.canInvite, false);
  await assert.rejects(call('createManualClaimInvite', { tournamentId: tid, manualParticipantId: 'a' }));
  const postDrawPreview = await call('previewTournamentClaimLink', { tournamentId: tid, token: originalLink.token, sandbox: false });
  assert.equal(postDrawPreview.candidates.length, 0, 'organizer has no matching manual slot');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('anna@claim.test', 'senha123');
  const participantPreview = await call('previewTournamentClaimLink', { tournamentId: tid, token: originalLink.token, sandbox: false });
  assert.equal(participantPreview.candidates.length, 1);
  const notificationCountBefore = (await db.collectionGroup('notifications').get()).size;
  const mailCountBefore = (await db.collection('mail').get()).size;
  await call('acceptTournamentClaimLink', { tournamentId: tid, token: originalLink.token, sandbox: false, manualParticipantId: 'a' });
  const publishedAfter = (await db.doc('tournaments/' + tid + '/matches/published').get()).data().jogo;
  assert.equal(publishedAfter.team1Obj.p1Uid, 'anna-claim');
  assert.equal(publishedAfter.team1Obj.p1ManualId, undefined);
  assert.equal(publishedAfter.court, '7');
  assert.equal(publishedAfter.scheduledAt, '2026-10-22T18:00:00Z');
  const claimedPreview = await call('previewTournamentClaimLink', { tournamentId: tid, token: originalLink.token, sandbox: false });
  assert.equal(claimedPreview.alreadyRegistered, true);
  await assert.rejects(call('acceptTournamentClaimLink', {
    tournamentId: tid, token: originalLink.token, sandbox: false, manualParticipantId: 'a',
  }));
  let resultAfter;
  for (let attempt = 0; attempt < 30; attempt++) {
    resultAfter = (await db.doc('tournaments/' + tid + '/results/published').get()).data();
    if (resultAfter && resultAfter.playerUids.includes('anna-claim')) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert(resultAfter.playerUids.includes('anna-claim'));
  assert.equal((await db.collectionGroup('notifications').get()).size, notificationCountBefore);
  assert.equal((await db.collection('mail').get()).size, mailCountBefore);
  const participantSnapshot = await db.collection('tournaments/' + tid + '/inscritos').get();
  const participantDocs = participantSnapshot.docs.map((doc) => doc.data().item);
  assert(participantDocs.some((item) => item.p1Uid === 'anna-claim' && !item.p1ManualId));
  assert(participantSnapshot.docs.every((doc) => doc.id === split.chaveDoInscrito(doc.data().item)));
  const hydrated = await db.runTransaction(async (tx) => {
    const snap = await tx.get(db.doc('tournaments/' + tid));
    return require('../functions/split-parts').hidratar(tx, snap.ref, snap.data(), ['participants', 'matches']);
  });
  assert.equal(hydrated.participants.length, 2);
  assert.equal(hydrated.matches.length, 1);
  assert.equal(hydrated.matches[0].team1Obj.p1Uid, 'anna-claim');
  assert.equal(hydrated._nPartes.participants, participantSnapshot.size);
  assert.equal(hydrated._nPartes.matches, 1);
  const activeRegs = (await db.collection('tournaments/' + tid + '/registrations').get()).docs.map((doc) => doc.data())
    .filter((item) => item.status === 'confirmed');
  assert(activeRegs.some((item) => item.participantUid === 'anna-claim'));
  assert(!activeRegs.some((item) => item.manualParticipantId === 'a'));
  assert((await db.doc('tournaments/' + tid + '/manualClaimAudits/a').get()).exists);
  const canonicalBoundary = require('../functions/canonical-registration-boundary-core');
  const publishedConfig = (await db.doc('tournaments/' + tid).get()).data();
  const allRegs = (await db.collection('tournaments/' + tid + '/registrations').get()).docs.map((doc) => doc.data());
  assert.equal(publishedConfig.canonicalRegistrationMigration.fingerprint, 'test-claim-fixture');
  assert.equal(canonicalBoundary.verifiedRoster({ ...publishedConfig, id: tid }, allRegs).registrations.length, allRegs.length);
  await db.doc('tournaments/' + tid + '/grupos/with-identity').set({ manualParticipantId: 'b', name: 'Bia Lima' });
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('bia@claim.test', 'senha123');
  await assert.rejects(call('acceptTournamentClaimLink', {
    tournamentId: tid, token: originalLink.token, sandbox: false, manualParticipantId: 'b',
  }), /vaga em chave de grupos/);
  assert.equal((await db.doc('tournaments/' + tid + '/registrations/' + manual[1].registrationId).get()).data().status, 'confirmed');
  await db.doc('tournaments/' + tid + '/grupos/with-identity').delete();
  await db.doc('tournaments/' + tid + '/manualClaimAudits/b').set({ manualParticipantId: 'b', claimedByUid: 'old-account' });
  const auditBlockedPreview = await call('previewTournamentClaimLink', { tournamentId: tid, token: originalLink.token, sandbox: false });
  assert.equal(auditBlockedPreview.candidates.length, 1);
  await assert.rejects(call('acceptTournamentClaimLink', {
    tournamentId: tid, token: originalLink.token, sandbox: false, manualParticipantId: 'b',
  }), /vaga já vinculada antes/);
  assert.equal((await db.doc('tournaments/' + tid + '/registrations/' + manual[1].registrationId).get()).data().status, 'confirmed');
  await app.auth().signOut();
  await app.auth().signInWithEmailAndPassword('anna@claim.test', 'senha123');
  await db.doc('tournaments/' + tid).update({ pendingCanonicalParticipantClaims: [{
    id: 'claim-after-draw', manualParticipantId: 'a', accountUid: 'anna-claim',
  }] });
  assert.equal((await call('resolveCanonicalParticipantClaim', {
    tournamentId: tid, claimId: 'claim-after-draw', action: 'reject',
  })).changed, true);
  assert.equal((await call('resolveCanonicalParticipantClaim', {
    tournamentId: tid, claimId: 'claim-after-draw', action: 'reject',
  })).reason, 'already-resolved');
  console.log('✓ EMULATOR_SHARED_CLAIM_OK: sandbox, UID existente, disputa e chave dividida publicada');
  process.exit(0);
}

if (process.argv.includes('--driver')) driver().catch((error) => { console.error(error.stack || error); process.exit(1); });
else {
  const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore,auth,functions',
    '--config', path.join(ROOT, 'firebase.sandbox.json'), '--project', 'demo-scoreplace',
    'node tests/manual-claim-link-emulator.test.js --driver'], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH },
  });
  assert(output.includes('EMULATOR_SHARED_CLAIM_OK'), output.slice(-4000));
  console.log('✓ link compartilhado validado no Firebase Emulator');
}
