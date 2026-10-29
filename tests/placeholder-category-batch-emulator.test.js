'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('node:child_process');
  const fs = require('node:fs'), os = require('node:os');
  const root = path.join(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-placeholder-category-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
  { encoding: 'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore: { rules: path.join(root, 'tests/concurrency/firestore.allow.rules') },
    emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false }, singleProjectMode: true }
  }));
  const result = spawnSync('firebase', ['emulators:exec', '--only', 'firestore', '--config', config,
    '--project', 'demo-scoreplace', 'node tests/placeholder-category-batch-emulator.test.js'], {
    cwd: root, encoding: 'utf8', timeout: 180000,
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }
  });
  fs.rmSync(temp, { recursive: true, force: true });
  const output = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(output);
  if (result.error) console.error(result.error);
  process.exit(result.status === 0 || /Script exited successfully \(code 0\)/.test(output) ? 0 : 1);
}
assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || ''));
process.env.GCLOUD_PROJECT = 'demo-scoreplace';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });
const funcs = require('../functions/index.js');
const admin = require('module').createRequire(path.join(__dirname, '../functions/index.js'))('firebase-admin');

(async () => {
  const db = admin.firestore();
  const suffix = Date.now();
  const owner = 'placeholder-owner-' + suffix;
  const id = 'tour_' + suffix + '_' + 'a'.repeat(32);
  const original = db.doc('tournaments/' + id);
  const reservations = Array.from({ length: 16 }, (_, i) => ({
    manualParticipantId: 'manual-' + i, displayName: 'Jogador ' + String(i + 1).padStart(2, '0'), isPlaceholder: true,
  }));
  const definitions = [
    { id: 'retinal', label: 'Retinal', dimension: 'custom', enabled: true },
    { id: 'vitamina-c', label: 'Vitamina C', dimension: 'custom', enabled: true },
  ];
  await original.set({ creatorUid: owner, adminUids: [owner], memberUids: [owner],
    categoryDefinitions: definitions, placeholderReservations: reservations,
    canonicalRegistrationMigration: { fingerprint: 'test-fingerprint', registrationCount: 0 },
    participants: [] });
  const invoke = (uid, tid, manualParticipantIds, toCategoryId, sandbox = false) =>
    funcs.assignCanonicalPlaceholderCategoryBatch.run({ auth: { uid, token: {} },
      data: { tournamentId: tid, manualParticipantIds, toCategoryId, sandbox } });
  const selected = reservations.map((r) => r.manualParticipantId);
  await assert.rejects(invoke('outsider', id, selected, 'retinal'), { code: 'permission-denied' });
  await assert.rejects(invoke(owner, id, selected, 'missing'), { code: 'invalid-argument' });
  assert.equal((await original.collection('registrations').get()).size, 0);
  const sandboxId = 'sb_' + id + '_' + suffix;
  const copy = db.doc('sandboxes/' + sandboxId);
  await copy.set({ creatorUid: owner, sandboxOf: id, isSandbox: true,
    sbState: 'ready', notificationsMuted: true, sandboxOwnerUid: owner,
    categoryDefinitions: definitions, placeholderReservations: reservations,
    canonicalRegistrationMigration: { fingerprint: 'test-fingerprint', registrationCount: 0 },
    participants: [] });
  const first = await invoke(owner, sandboxId, selected, 'retinal', true);
  assert.equal(first.changed, 16);
  assert.equal((await copy.collection('registrations').get()).size, 16);
  assert.equal((await copy.get()).data().canonicalRegistrationMigration.registrationCount, 16);
  assert.equal((await copy.get()).data().placeholderReservations.length, 0);
  assert.equal((await original.collection('registrations').get()).size, 0, 'sandbox não escreve no original');
  const retry = await invoke(owner, sandboxId, selected, 'retinal', true);
  assert.equal(retry.changed, 0);
  assert.equal((await copy.get()).data().canonicalRegistrationMigration.registrationCount, 16);
  await assert.rejects(invoke(owner, sandboxId, ['manual-0'], 'vitamina-c', true), { code: 'already-exists' });
  await copy.update({ placeholderReservations: [reservations[0], reservations[1]] });
  const clean = await invoke(owner, sandboxId, ['manual-0'], 'retinal', true);
  assert.equal(clean.changed, 0, 'reserva residual não cria inscrição duplicada');
  assert.deepEqual((await copy.get()).data().placeholderReservations.map((r) => r.manualParticipantId), ['manual-1']);
  assert.equal((await copy.get()).data().canonicalRegistrationMigration.registrationCount, 16);
  const move = await funcs.reclassifyCanonicalRegistration.run({ auth: { uid: owner, token: {} },
    data: { tournamentId: sandboxId, sandbox: true, manualParticipantId: 'manual-1',
      fromCategoryId: 'retinal', toCategoryId: 'vitamina-c' } });
  assert.equal(move.outcome, 'reclassified');
  assert.equal((await copy.get()).data().placeholderReservations.length, 0,
    'reclassificação limpa a reserva residual no mesmo commit');
  assert.equal((await original.collection('registrations').get()).size, 0);
  const sentinelId = 'sb_' + id + '_sentinel';
  const sentinelCopy = db.doc('sandboxes/' + sentinelId);
  const manualKey = 'manual:sentinel-player';
  const { registrationId } = require('../functions/registration-core.js');
  const sentinelRegistration = {
    registrationId: registrationId(manualKey, '__uncategorized__'), tournamentId: id,
    categoryId: '__uncategorized__', participantKey: manualKey, participantKind: 'manual',
    manualParticipantId: 'sentinel-player', manualDisplayName: 'Jogador sentinela',
    status: 'confirmed', validationState: 'approved', fixedPairId: 'pair-sentinel',
    migrationFingerprint: 'test-fingerprint',
  };
  const sentinelPartner = { ...sentinelRegistration,
    registrationId: registrationId('manual:sentinel-partner', '__uncategorized__'),
    participantKey: 'manual:sentinel-partner', manualParticipantId: 'sentinel-partner',
    manualDisplayName: 'Parceiro sentinela' };
  await sentinelCopy.set({ creatorUid: owner, sandboxOf: id, isSandbox: true,
    sbState: 'ready', notificationsMuted: true, sandboxOwnerUid: owner,
    categoryDefinitions: definitions,
    placeholderReservations: [{ manualParticipantId: 'sentinel-player', displayName: 'Jogador sentinela', isPlaceholder: true }],
    canonicalRegistrationMigration: { fingerprint: 'test-fingerprint', registrationCount: 2 }, participants: [] });
  await sentinelCopy.collection('registrations').doc(sentinelRegistration.registrationId).set(sentinelRegistration);
  await sentinelCopy.collection('registrations').doc(sentinelPartner.registrationId).set(sentinelPartner);
  const stale = await invoke(owner, sentinelId, ['sentinel-player'], 'retinal', true);
  assert.equal(stale.needsReclassification, true);
  assert.equal(stale.changed, 0);
  assert.equal((await sentinelCopy.get()).data().placeholderReservations.length, 0);
  assert.equal((await sentinelCopy.get()).data().canonicalRegistrationMigration.registrationCount, 2);
  assert.equal((await sentinelCopy.collection('registrations').get()).size, 2);
  await copy.update({ matches: [{ id: 'game-1' }] });
  await assert.rejects(invoke(owner, sandboxId, selected, 'retinal', true), { code: 'failed-precondition' });
  assert.equal((await copy.collection('registrations').get()).size, 17);
  console.log('✓ emulador: 16 inscrições individuais, isolamento, recibo, retry, limpeza e bloqueio pós-sorteio');
})().catch((error) => { console.error(error); process.exitCode = 1; });
