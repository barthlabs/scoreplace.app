'use strict';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Emuladores Firestore e Auth obrigatórios.');
  process.exit(2);
}
const assert = require('assert');
const admin = require('firebase-admin');
const CF = require('./index');
const registration = require('./registration-core');
const db = admin.firestore();
const owner = 'owner-monarch-test';
const tourId = 'tour_1793220000000_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sandboxId = 'sb_' + tourId + '_test';
const individuals = Array.from({ length: 48 }, (_, i) => ({
  manualParticipantId: 'slot-' + (i + 1), name: 'Jogador ' + (i + 1),
  displayName: 'Jogador ' + (i + 1), isPlaceholder: true,
}));
const base = { creatorUid: owner, organizerUid: owner, enrollmentMode: 'individual',
  currentPhaseIndex: 0, phases: [{ reiRainha: true, drawMode: 'rei_rainha' }, { drawMode: 'sorteio' }],
  placeholderReservations: individuals, participants: [], teamSize: 2 };
async function invoke(id, opts, caller = owner) {
  try {
    const value = await CF.formPair.run({ data: { tournamentId: id, sandbox: id.startsWith('sb_'), ...opts },
      auth: { uid: caller, token: { uid: caller } }, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true, value };
  } catch (e) { return { ok: false, code: e.code, message: e.message }; }
}
(async () => {
  const source = db.collection('tournaments').doc(tourId);
  const sb = db.collection('sandboxes').doc(sandboxId);
  await source.set(base);
  await sb.set({ ...base, isSandbox: true, sbState: 'ready', notificationsMuted: true,
    sandboxOf: tourId, sandboxOwnerUid: owner });
  const payloads = [
    { manualId1: 'slot-1', manualId2: 'slot-2', changeRule: true },
    { uid1: 'uid-a', uid2: 'uid-b', changeRule: true },
    { manualId1: 'slot-1', manualId2: 'slot-2' },
  ];
  for (const id of [tourId, sandboxId]) {
    const ref = id === tourId ? source : sb;
    const before = (await ref.get()).data();
    for (const opts of payloads) {
      const result = await invoke(id, opts);
      assert.strictEqual(result.ok, false, id + ' deve bloquear formPair');
      assert.match(result.message, /fase inicial Rei\/Rainha/);
      assert.strictEqual(result.code, 'failed-precondition');
      assert.deepStrictEqual((await ref.get()).data(), before, 'documento intacto');
      assert.strictEqual((await ref.collection('registrations').get()).size, 0, 'fase 0 não cria inscrição');
    }
  }
  const fp = 'fp-monarch-test';
  const members = ['uid-a', 'uid-b'];
  const registrations = members.map(uid => ({
    registrationId: registration.registrationId('uid:' + uid, 'a'),
    tournamentId: tourId, categoryId: 'a', participantKey: 'uid:' + uid,
    participantKind: 'account', participantUid: uid, status: 'confirmed',
    validationState: 'approved', migrationFingerprint: fp, fixedPairId: null
  }));
  for (const item of registrations) await source.collection('registrations').doc(item.registrationId).set(item);
  const frozenClassification = { phaseIndex: 0, order: members.slice(), score: [21, 18] };
  await source.update({ currentPhaseIndex: 1, classification: frozenClassification,
    canonicalRegistrationMigration: { fingerprint: fp, registrationCount: 2 },
    categoryDefinitions: [{ id: 'a', label: 'A' }], memberUids: [owner, ...members] });
  const later = await invoke(tourId, { uid1: members[0], uid2: members[1], categoryId: 'a' });
  assert.strictEqual(later.ok, true, later.message || 'fase 1 forma dupla real');
  assert.strictEqual(later.value.outcome, 'paired');
  assert.deepStrictEqual((await source.get()).data().classification, frozenClassification,
    'classificação consolidada não muda após formar dupla');
  assert.strictEqual((await source.get()).data().placeholderReservations.length, 48,
    'reservas seguem separadas das inscrições reais');
  const after = (await source.collection('registrations').get()).docs.map(doc => doc.data());
  assert.strictEqual(after.length, 2);
  assert(after[0].fixedPairId && after[0].fixedPairId === after[1].fixedPairId);
  // O modo manual do fmt2 não concede permissão: ela vem do campo top-level.
  // Cada tentativa usa um documento próprio para não depender de desfazer dupla.
  for (const [policy, actor, allowed] of [
    ['organizer_only', owner, true], ['organizer_only', 'uid-b', false],
    ['athletes_only', owner, false], ['athletes_only', 'uid-b', true],
    ['open', owner, true], ['open', 'uid-b', true]
  ]) {
    const policyId = 'tour_1793220000000_' + String(policy + '-' + actor).split('').map(c => c.charCodeAt(0).toString(16)).join('').slice(0, 32).padEnd(32, '0');
    const ref = db.collection('tournaments').doc(policyId);
    await ref.set({ creatorUid:owner, organizerUid:owner, enrollmentMode:'teams', teamSize:2,
      fmt2:{ formatCode:'elim', formacaoDupla:'manual' }, manualPairing:policy,
      participants:[], categoryDefinitions:[{ id:'a', label:'A' }],
      canonicalRegistrationMigration:{ fingerprint:fp, registrationCount:2 },
      pairRequests:[{ id:'a-b', inviterUid:'uid-a', inviteeUid:'uid-b' }] });
    for (const item of registrations) await ref.collection('registrations').doc(item.registrationId).set({ ...item, tournamentId:policyId });
    const result = await invoke(policyId, { uid1:'uid-a', uid2:'uid-b', categoryId:'a' }, actor);
    assert.equal(result.ok, allowed, policy + ' / ' + actor + ': ' + (result.message || ''));
    if (allowed) assert.equal(result.value.outcome, 'paired');
    else assert.equal((await ref.collection('registrations').get()).docs.every(doc => !doc.data().fixedPairId), true,
      'recusa não forma dupla');
    for (const item of registrations) await ref.collection('registrations').doc(item.registrationId).delete();
    await ref.delete();
  }
  const invitedOrgId = 'tour_1793220000000_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const invitedOrgRef = db.collection('tournaments').doc(invitedOrgId);
  await invitedOrgRef.set({ creatorUid:owner, organizerUid:owner, enrollmentMode:'teams', teamSize:2,
    fmt2:{ formatCode:'elim', formacaoDupla:'manual' }, manualPairing:'athletes_only',
    participants:[], categoryDefinitions:[{ id:'a', label:'A' }],
    canonicalRegistrationMigration:{ fingerprint:fp, registrationCount:2 },
    pairRequests:[{ id:'a-owner', inviterUid:'uid-a', inviteeUid:owner }] });
  const invitedRegistrations = ['uid-a', owner].map(uid => ({
    ...registrations[0], registrationId:registration.registrationId('uid:' + uid, 'a'),
    participantKey:'uid:' + uid, participantUid:uid, tournamentId:invitedOrgId
  }));
  for (const item of invitedRegistrations) await invitedOrgRef.collection('registrations').doc(item.registrationId).set(item);
  const invitedOrg = await invoke(invitedOrgId, { uid1:'uid-a', uid2:owner, categoryId:'a' });
  assert.equal(invitedOrg.ok, true, invitedOrg.message || 'organizador convidado aceita como atleta');
  assert.equal(invitedOrg.value.outcome, 'paired');
  for (const item of invitedRegistrations) await invitedOrgRef.collection('registrations').doc(item.registrationId).delete();
  await invitedOrgRef.delete();
  for (const item of registrations) await source.collection('registrations').doc(item.registrationId).delete();
  await source.delete();
  await sb.delete();
  console.log('✓ formPair bloqueou fase 0 sem inscrições; fase 1 formou dupla real sem alterar classificação nem 48 reservas');
})().catch((e) => { console.error(e); process.exitCode = 1; });
