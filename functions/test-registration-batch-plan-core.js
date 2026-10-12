'use strict';

const assert = require('assert');
const core = require('./registration-batch-plan-core');

const now = '2026-10-11T12:00:00.000Z';
const itemA = {
  tournamentId: 'tour_b', fingerprint: 'f-b', updateTime: '2026-10-11T11:00:00.000Z',
  registrations: 4, formedPairs: 1, creates: 4, already: 0, existing: 0
};
const itemB = {
  tournamentId: 'tour_a', fingerprint: 'f-a', updateTime: '2026-10-11T10:00:00.000Z',
  registrations: 2, formedPairs: 0, creates: 0, already: 2, existing: 2
};

const plan = core.planBatch([itemA, itemB], now);
assert.deepStrictEqual(plan.tournaments.map((item) => item.tournamentId), ['tour_a', 'tour_b']);
assert.deepStrictEqual(plan.totals, { tournaments: 2, registrations: 6, formedPairs: 1, creates: 4, already: 2, historicalExisting: 0 });
assert.strictEqual(core.verifyPlan(JSON.parse(JSON.stringify(plan))).manifestFingerprint, plan.manifestFingerprint);
assert.throws(() => core.planBatch([itemA, Object.assign({}, itemA)], now), /duplicado/);
assert.throws(() => core.planBatch([Object.assign({}, itemA, { conflicts: 1 })], now), /exceção/);
assert.throws(() => core.planBatch([Object.assign({}, itemA, { existing: 1, unexpectedExisting: 1 })], now), /exceção/);
assert.throws(() => core.planBatch([Object.assign({}, itemA, { creates: 3 })], now), /contagem/);
const tampered = JSON.parse(JSON.stringify(plan));
tampered.tournaments[0].fingerprint = 'alterado';
assert.throws(() => core.verifyPlan(tampered), /adulterado/);

const fromPreviews = core.planFromMigrationPreviews([
  { tournamentId: 'tour_b', fingerprint: 'f-b', updateTime: itemA.updateTime, summary: { registrations: 4, formedPairs: 1, conflicts: 0, unsupported: 0, divergent: 0, creates: 4, already: 0 } },
  { tournamentId: 'tour_a', fingerprint: 'f-a', updateTime: itemB.updateTime, summary: { registrations: 2, formedPairs: 0, conflicts: 0, unsupported: 0, divergent: 0, creates: 0, already: 2 } }
], now);
assert.deepStrictEqual(fromPreviews.totals, plan.totals);
const withHistory = core.planBatch([Object.assign({}, itemB, { existing: 3, historicalExisting: 1 })], now);
assert.strictEqual(withHistory.tournaments[0].historicalExisting, 1);
assert.throws(() => core.planFromMigrationPreviews([{ tournamentId: 'tour_bad', summary: { conflicts: 1 } }], now), /incompleto|exceção/);

console.log('✅ registration-batch-plan-core: manifesto determinístico, validado e sem exceções');
