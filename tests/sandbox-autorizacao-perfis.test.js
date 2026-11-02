'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const boundary = require('../functions/canonical-registration-boundary-core');
const registrationCore = require('../functions/registration-core');

const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const autodraw = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const start = source.indexOf('async function _sandboxAutorizado(');
const end = source.indexOf('const _partesPerm', start);
assert.ok(start >= 0 && end > start, 'helper de sandbox presente');
const context = {
  HttpsError: class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } },
  _isTournamentOrgCaller: (t, uid) => t.creatorUid === uid || (t.adminUids || []).includes(uid),
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '\nthis.authorize = _sandboxAutorizado;', context);

const original = { exists: true, data: () => ({ creatorUid: 'organizador' }) };
const db = { collection(name) { assert.equal(name, 'tournaments'); return { doc() { return original; } }; } };
const read = async (ref) => ref;
const sandbox = (overrides = {}) => ({ exists: true, data: () => ({
  isSandbox: true, sbState: 'ready', notificationsMuted: true,
  sandboxOf: 'original', sandboxOwnerUid: 'organizador', ...overrides,
}) });

(async () => {
  await context.authorize(db, sandbox(), 'organizador', read);
  for (const [label, snap, caller] of [
    ['outro usuário', sandbox(), 'terceiro'],
    ['sem supressão', sandbox({ notificationsMuted: false }), 'organizador'],
    ['cópia incompleta', sandbox({ sbState: 'creating' }), 'organizador'],
    ['sem origem', sandbox({ sandboxOf: '' }), 'organizador'],
  ]) {
    await assert.rejects(context.authorize(db, snap, caller, read), { code: 'not-found' }, label);
  }
  original.data = () => ({ creatorUid: 'ex-organizador' });
  await assert.rejects(context.authorize(db, sandbox(), 'organizador', read), { code: 'not-found', message: 'torneio não existe' }, 'organizador removido perde acesso sem revelar sandbox');
  assert.ok(source.indexOf('const origRef = db.collection("tournaments").doc(origId)', source.indexOf('exports.createSandbox')) <
    source.indexOf('const jaTem = await db.collection("sandboxes")', source.indexOf('exports.createSandbox')), 'original autorizado antes do retorno idempotente');
  // A callable tem um único dono; publicar autodraw não pode substituir a
  // fronteira de registrations nem reabrir o sandbox para UIDs copiados.
  assert.equal((source.match(/^exports\.getCanonicalTournamentRoster\s*=/gm) || []).length, 1);
  assert.equal((autodraw.match(/^exports\.getCanonicalTournamentRoster\s*=/gm) || []).length, 0);
  const rosterCall = source.slice(source.indexOf('exports.getCanonicalTournamentRoster'), source.indexOf('exports.getTournamentEnrollmentProfiles'));
  for (const required of ['_sandboxAutorizado(', 'verifiedRoster(', 'standbyParticipants']) {
    assert.ok(rosterCall.includes(required), 'callable canônica conserva a guarda: ' + required);
  }
  assert.match(source.slice(start, end), /sandboxOwnerUid/);
  // O Firestore guarda o ID na chave do documento, não necessariamente no corpo.
  // A Análise deve projetá-lo antes de entrar na fronteira canônica tanto no
  // original quanto na cópia que preserva os registrationIds do original.
  const profileCall = source.slice(source.indexOf('exports.getTournamentEnrollmentProfiles'), source.indexOf('// ─── getOwnEmailMergeCandidates'));
  assert.match(profileCall, /id: sandbox \? String\(tournament\.sandboxOf\) : tournamentId/);
  const originalBody = { canonicalRegistrationMigration: { fingerprint: 'teste', registrationCount: 1 } };
  const account = {
    registrationId: registrationCore.registrationId('uid:u1', 'cat-a'),
    tournamentId: 't1', categoryId: 'cat-a', participantKey: 'uid:u1',
    participantKind: 'account', participantUid: 'u1', manualParticipantId: null,
    status: 'confirmed', validationState: 'approved', fixedPairId: null,
  };
  assert.equal(boundary.verifiedRoster({ ...originalBody, id: 't1' }, [account]).participants.length, 1);
  assert.equal(boundary.verifiedRoster({ ...originalBody, sandboxOf: 't1', id: 't1' }, [account]).participants.length, 1);
  assert.throws(() => boundary.verifiedRoster(originalBody, [account]), /torneio sem identidade estável/);
  console.log('✅ autorização sandbox/perfis: 17 verificações');
})().catch((error) => { console.error(error); process.exitCode = 1; });
