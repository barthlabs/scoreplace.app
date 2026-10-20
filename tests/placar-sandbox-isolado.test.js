'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = source.indexOf('async function _aplicaPlacarNaTransacao(');
const end = source.indexOf('// ─── Caixa de saída canônica de placar', start);
assert(start >= 0 && end > start);

const writes = [];
const reads = [];
const calls = [];
const ref = (path) => ({
  path,
  id: path.split('/').at(-1),
  collection: (name) => ({ doc: (id) => ref(path + '/' + name + '/' + (id || 'audit-id')) }),
});
const tx = {
  get: async (target) => { reads.push(target.path); return { exists: true, ref: target }; },
  set: (target) => { writes.push(target.path); },
  delete: (target) => { writes.push(target.path); },
};
const db = {
  collection: (name) => ({ doc: (id) => ref(name + '/' + id) }),
  runTransaction: async (fn) => fn(tx),
};
let activeSandbox = false;
let activeTournament;
const context = {
  db,
  _assertSandboxDrawOwner: async () => { calls.push('owner'); },
  _leTorneio: async () => activeTournament,
  _antesDoMotor: () => ({}),
  _enrichParticipantsFromProfiles: () => {},
  _scoreAuditSnapshot: (value) => value,
  _outboxDocIdPart: (value) => value,
  _isTournamentParticipant: () => true,
  _isTournamentAdmin: () => true,
  _hidrataGrupos: () => {},
  assertSurplusMatchMayStartFn: () => {},
  applyResultFn: (t) => { calls.push('motor'); t.matches[0].winner = 'p1'; return { ok: true, outcome: 'applied' }; },
  _reconcileSurplusBeforeWrite: () => {},
  _gravaTorneio: (_tx, target) => {
    calls.push('grava');
    tx.set(target);
    tx.set(target.collection(activeSandbox ? 'resultsSandbox' : 'results').doc('j1'));
    return { clean: {} };
  },
  _scoreAuditPayload: () => ({}),
  _matchHistory: { buildTournamentRecord: () => ({ matchId: 'j1', recipients: ['player'], record: {} }) },
  _scoreNotificationEvent: () => ({ type: 'score-final' }),
  SCORE_NOTIFICATION_CONSOLIDATION_MS: 0,
  PENDING_SCORE_APPROVAL_MS: 0,
  _slotUidsOf: () => [],
  drawWindow: { _findMatch: (t) => t.matches[0] },
  console,
  Date,
};
vm.runInNewContext(source.slice(start, end), context);

(async () => {
  activeSandbox = true;
  activeTournament = { id: 'sb_test', isSandbox: true, matches: [{ id: 'j1' }] };
  const result = await context._aplicaPlacarNaTransacao(db, 'sb_test', 'j1', { action: 'set-score' },
    { uid: 'owner' }, '', true);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, ['owner', 'motor', 'grava']);
  assert.ok(reads.includes('sandboxes/sb_test'));
  assert.ok(writes.length >= 3);
  assert.ok(writes.every((path) => path === 'sandboxes/sb_test' || path.startsWith('sandboxes/sb_test/')));
  assert.ok(writes.includes('sandboxes/sb_test/resultsSandbox/j1'));
  assert.ok(!writes.some((path) => path.includes('/notificationOutbox/') || path.includes('/matchHistory/')));

  reads.length = writes.length = calls.length = 0;
  activeSandbox = false;
  activeTournament = { id: 'tour_test', matches: [{ id: 'j1' }] };
  const production = await context._aplicaPlacarNaTransacao(db, 'tour_test', 'j1', { action: 'set-score' },
    { uid: 'owner' }, '', false);
  assert.equal(production.ok, true);
  assert.deepEqual(calls, ['motor', 'grava']);
  assert.ok(writes.includes('tournaments/tour_test/results/j1'));
  assert.ok(writes.some((path) => path.includes('/notificationOutbox/')));
  assert.ok(writes.some((path) => path.startsWith('users/player/matchHistory/')));
  console.log('✓ mesmo motor de placar; sandbox só grava sob sandboxes e não notifica');
})().catch((error) => { console.error(error); process.exitCode = 1; });
