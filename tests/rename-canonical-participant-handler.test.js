'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../functions/rename-canonical-participant-core');
const { registrationId } = require('../functions/registration-core');

const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const start = source.indexOf('exports.renameTournamentParticipant = onCall');
const end = source.indexOf('/* ═══ GRUPO GERAL', start);
assert(start >= 0 && end > start);
const handlerSource = source.slice(start, end);
const authStart = source.indexOf('function _isTournamentOrgCaller(');
const authEnd = source.indexOf('function _hasCanonicalTournamentDraw(', authStart);
assert(authStart >= 0 && authEnd > authStart);
const isTournamentOrgCaller = vm.runInNewContext(
  source.slice(authStart, authEnd) + '\n_isTournamentOrgCaller;');
const reg = { registrationId: registrationId('manual:m1', 'cat-a'), tournamentId: 't1',
  categoryId: 'cat-a', participantKey: 'manual:m1', participantKind: 'manual',
  participantUid: null, manualParticipantId: 'm1', manualDisplayName: 'Kelly Cristina',
  status: 'confirmed', validationState: 'approved', fixedPairId: null };
const request = (uid) => ({ auth: { uid }, data: { tournamentId: 't1',
  manualParticipantId: 'm1', oldName: 'Kelly Cristina', newName: 'Kelly Barth' } });

function fixture(root, records) {
  const writes = [];
  const rootRef = { path: 'root', collection(name) {
    return { path: name, limit() { return { path: name, limited: true }; } };
  } };
  const db = { collection(name) {
    if (name === 'tournaments') return { doc() { return rootRef; } };
    return { doc(uid) { return { path: 'user:' + uid }; } };
  }, async runTransaction(fn) {
    return fn({ async get(ref) {
      if (ref.path === 'root') return { exists: true, data: () => root };
      if (ref.path === 'registrations') {
        return { empty: records.length === 0, docs: records.map((item) => ({ id: item.registrationId,
          ref: { path: 'reg:' + item.registrationId }, data: () => item })) };
      }
      return { empty: true, docs: [] };
    }, update(ref, patch) { writes.push({ kind: 'update', path: ref.path, patch }); },
    set(ref, data) { writes.push({ kind: 'set', path: ref.path, data }); } });
  } };
  const ctx = { exports: {}, onCall(_opts, fn) { return fn; }, APP_ORIGINS: [],
    admin: { firestore: () => db }, HttpsError: class HttpsError extends Error {
      constructor(code, message) { super(message); this.code = code; }
    }, _isTournamentOrgCaller: isTournamentOrgCaller,
    _assertNoRehearsalEnrollment() {},
    _canonicalRegistrationBoundary: require('../functions/canonical-registration-boundary-core'),
    _renameCanonicalParticipant: core,
    _tSplitFn: { colecaoDaParte: (name) => name },
    _FV: { serverTimestamp: () => 'server-time', delete: () => 'delete-marker' },
    _splitParts: { async hidratar(_tx, _ref, data) { return { ...data, hydrated: true }; },
      gravar(_tx, _ref, before, update) { writes.push({ kind: 'legacy', before, update }); } },
    _participantRename: { renameTournamentParticipant(t) {
      assert.equal(t.hydrated, true); return { changed: true, update: { participants: [] } };
    } }, Date, Promise, Object, String, Set, Array, console };
  vm.runInNewContext(handlerSource, ctx, { filename: 'rename-handler' });
  return { handler: ctx.exports.renameTournamentParticipant, writes };
}

(async () => {
  const canonical = fixture({ creatorUid: 'org', participants: [{ manualParticipantId: 'm1',
    displayName: 'Kelly Cristina' }], canonicalRegistrationMigration: {
    fingerprint: 'fp', registrationCount: 1 } }, [reg]);
  await assert.rejects(canonical.handler(request('intruso')), (err) => err.code === 'permission-denied');
  assert.equal(canonical.writes.length, 0);
  const result = await canonical.handler(request('org'));
  assert.equal(result.changed, true);
  assert(canonical.writes.some((w) => w.path === 'reg:' + reg.registrationId &&
    w.patch.manualDisplayName === 'Kelly Barth'));
  assert.equal(canonical.writes.find((w) => w.path === 'root').patch.participants[0].displayName,
    'Kelly Barth');

  const cohost = fixture({ creatorUid: 'org', coHosts: [{ uid: 'cohost', status: 'active' }],
    participants: [{ manualParticipantId: 'm1', displayName: 'Kelly Cristina' }],
    canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 1 } }, [reg]);
  assert.equal((await cohost.handler(request('cohost'))).changed, true,
    'coorganizador ativo é autorizado pelos campos do documento pai antes da hidratação');

  const emptyProbe = fixture({ creatorUid: 'org', participants: [],
    canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 1 } }, []);
  await assert.rejects(emptyProbe.handler(request('org')), (err) => err.code === 'failed-precondition');
  assert.equal(emptyProbe.writes.length, 0);

  const legacy = fixture({ creatorUid: 'org', participants: [{ manualParticipantId: 'm1',
    displayName: 'Kelly Cristina' }] }, []);
  await legacy.handler(request('org'));
  assert(legacy.writes.some((w) => w.kind === 'legacy' && w.before.hydrated === true));
  console.log('✓ rename-canonical-participant-handler: autorização, espelho, recibo e legado');
})().catch((err) => { console.error(err); process.exitCode = 1; });
