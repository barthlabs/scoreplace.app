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
assert.deepStrictEqual(plan.totals, { tournaments: 2, registrations: 6, formedPairs: 1, creates: 4, already: 2 });
assert.strictEqual(core.verifyPlan(JSON.parse(JSON.stringify(plan))).manifestFingerprint, plan.manifestFingerprint);
assert.throws(() => core.planBatch([itemA, Object.assign({}, itemA)], now), /duplicado/);
assert.throws(() => core.planBatch([Object.assign({}, itemA, { conflicts: 1 })], now), /exceção/);
assert.throws(() => core.planBatch([Object.assign({}, itemA, { creates: 3 })], now), /contagem/);
const tampered = JSON.parse(JSON.stringify(plan));
tampered.tournaments[0].fingerprint = 'alterado';
assert.throws(() => core.verifyPlan(tampered), /adulterado/);

console.log('✅ registration-batch-plan-core: manifesto determinístico, validado e sem exceções');
