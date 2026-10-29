'use strict';
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Emuladores Firestore e Auth obrigatórios.');
  process.exit(2);
}
const assert = require('assert');
const admin = require('firebase-admin');
const CF = require('./index');
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
async function invoke(id, opts) {
  try {
    await CF.formPair.run({ data: { tournamentId: id, sandbox: id.startsWith('sb_'), ...opts },
      auth: { uid: owner, token: { uid: owner } }, rawRequest: { headers: {} }, acceptsStreaming: false });
    return { ok: true };
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
    }
  }
  await source.update({ currentPhaseIndex: 1 });
  const later = await invoke(tourId, payloads[0]);
  assert.ok(later.ok || !/fase inicial Rei\/Rainha/.test(later.message), 'fase 1 não bloqueada pela guarda');
  await source.delete();
  await sb.delete();
  console.log('✓ formPair real bloqueou fase 0 e preservou 48 reservas; fase 1 liberada');
})().catch((e) => { console.error(e); process.exitCode = 1; });
