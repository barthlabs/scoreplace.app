'use strict';

const assert = require('assert');
const planner = require('./registration-batch-plan-core');
const core = require('./registration-batch-apply-core');

const plan = planner.planBatch([
  { tournamentId: 'tour_c', fingerprint: 'f-c', updateTime: 't3', registrations: 1, formedPairs: 0, creates: 1, already: 0, existing: 0 },
  { tournamentId: 'tour_a', fingerprint: 'f-a', updateTime: 't1', registrations: 2, formedPairs: 1, creates: 2, already: 0, existing: 0 },
  { tournamentId: 'tour_b', fingerprint: 'f-b', updateTime: 't2', registrations: 3, formedPairs: 0, creates: 3, already: 0, existing: 0 },
], '2026-10-11T00:00:00.000Z');
const first = core.batchPlan(plan, { batchSize: 2 });
assert.deepStrictEqual(first.items.map((item) => item.tournamentId), ['tour_a', 'tour_b']);
assert.strictEqual(first.nextCursor, 'tour_b');
assert.strictEqual(first.complete, false);
const next = core.batchPlan(plan, { batchSize: 2, afterTournamentId: first.nextCursor });
assert.deepStrictEqual(next.items.map((item) => item.tournamentId), ['tour_c']);
assert.strictEqual(next.complete, false);
const done = core.batchPlan(plan, { afterTournamentId: 'tour_c' });
assert.strictEqual(done.complete, true);

const receipt = { results: first.items.map((item) => ({ tournamentId: item.tournamentId, fingerprint: item.fingerprint, outcome: 'migrated', registrations: item.registrations })) };
assert.deepStrictEqual(core.verifyBatchReceipt(first, receipt), { verified: true, tournaments: 2, nextCursor: 'tour_b' });
assert.throws(() => core.verifyBatchReceipt(first, { results: receipt.results.slice(0, 1) }), /incompleto/);
assert.throws(() => core.verifyBatchReceipt(first, { results: receipt.results.map((item) => Object.assign({}, item, { fingerprint: 'outra' })) }), /fingerprint/);
assert.throws(() => core.batchPlan(Object.assign({}, plan, { manifestFingerprint: 'alterado' })), /adulterado/);

console.log('✅ registration-batch-apply-core: lotes ordenados, retomáveis e recibos verificados');
