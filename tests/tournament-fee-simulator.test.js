'use strict';

const assert = require('assert');
const { simulateTournamentFees } = require('../functions-autodraw/tournament-fee-simulator.js');

const basic = {
  currency:'BRL', registrationCents:19700, participantCount:48, serviceFeeCents:2000,
  passFinancialFee:false, passServiceFee:false,
};
const method = (kind, rateBps, fixedCents, currency = 'BRL') =>
  ({ kind, currency, rateBps, fixedCents, version:'fixture-2026-10-29', verifiedAt:'2026-10-29' });
const domestic = method('card_domestic', 399, 39);

// Workbook: Simulador!B6/E6/H6 and rows 13–16, with both pass-throughs off.
for (const [rate, expectedFee, expectedOrganizer, expectedEvent] of [
  [domestic, 825, 16875, 810000],
  [method('card_international', 599, 39), 1219, 16481, 791088],
  [method('stripe_pix', 119, 0), 234, 17466, 838368],
  [method('boleto', 0, 345), 345, 17355, 833040],
]) {
  const outcome = simulateTournamentFees({ ...basic, method:rate });
  assert.strictEqual(outcome.ok, true);
  assert.strictEqual(outcome.totalCents, 19700);
  assert.strictEqual(outcome.financialFeeCents, expectedFee);
  assert.strictEqual(outcome.organizerCents, expectedOrganizer);
  assert.strictEqual(outcome.eventOrganizerCents, expectedEvent);
  assert.strictEqual(outcome.eventServiceCents, 96000);
  assert.strictEqual(outcome.eventFinancialCents, expectedFee * 48);
}

// The other checkbox combinations are derived fixtures, not cached workbook values.
const combinations = [
  [false, false, 19700, 825, 16875],
  [false, true, 21700, 905, 18795],
  [true, false, 20559, 859, 17700],
  [true, true, 22642, 942, 19700],
];
for (const [passFinancialFee, passServiceFee, total, fee, organizer] of combinations) {
  const outcome = simulateTournamentFees({ ...basic, passFinancialFee, passServiceFee, method:domestic });
  assert.deepStrictEqual([outcome.totalCents, outcome.financialFeeCents, outcome.organizerCents],
    [total, fee, organizer]);
}

const directPix = simulateTournamentFees({ ...basic, method:{ kind:'pix_proprio', currency:'BRL', rateBps:0, fixedCents:0 } });
assert.strictEqual(directPix.financialFeeCents, 0);
assert.strictEqual(directPix.organizerCents, 17700);
assert.deepStrictEqual(simulateTournamentFees({ ...basic, method:{ kind:'pix_proprio', currency:'USD', rateBps:0, fixedCents:0 } }),
  { ok:false, reason:'invalid_input' });

const free = simulateTournamentFees({ ...basic, registrationCents:0, passFinancialFee:true, method:undefined });
assert.strictEqual(free.totalCents, 0);
assert.strictEqual(free.financialFeeCents, 0);
assert.strictEqual(free.organizerCents, -2000);
assert.strictEqual(free.eventOrganizerCents, -96000);
assert.strictEqual(simulateTournamentFees({ ...basic, registrationCents:0, serviceFeeCents:0,
  passServiceFee:true, method:undefined }).totalCents, 0);
assert.deepStrictEqual(simulateTournamentFees({ ...basic, registrationCents:0, passFinancialFee:true,
  method:method('boleto', 0, 345) }).organizerCents, -2000);
assert.deepStrictEqual(simulateTournamentFees({ ...basic, registrationCents:100, participantCount:0,
  method:domestic }).eventOrganizerCents, 0);
assert.strictEqual(simulateTournamentFees({ ...basic, registrationCents:100, participantCount:1,
  method:domestic }).organizerCents, -1943);

assert.deepStrictEqual(simulateTournamentFees({ ...basic, method:undefined }), { ok:false, reason:'catalog_missing' });
assert.deepStrictEqual(simulateTournamentFees({ ...basic, method:method('card_domestic', 399, 39, 'USD') }),
  { ok:false, reason:'invalid_input' });
assert.deepStrictEqual(simulateTournamentFees({ ...basic, method:method('unknown', 399, 39) }),
  { ok:false, reason:'invalid_input' });
assert.deepStrictEqual(simulateTournamentFees({ ...basic, method:method('card_domestic', 10000, 39) }),
  { ok:false, reason:'invalid_input' });
assert.deepStrictEqual(simulateTournamentFees({ ...basic, registrationCents:1.5, method:domestic }),
  { ok:false, reason:'invalid_input' });

const upperEdge = simulateTournamentFees({ ...basic, registrationCents:19700, serviceFeeCents:0,
  participantCount:1, passFinancialFee:true, method:method('card_domestic', 9999, 0) });
assert.strictEqual(upperEdge.totalCents, 196995001);
assert.strictEqual(upperEdge.totalCents - upperEdge.financialFeeCents, 19700);
assert.deepStrictEqual(simulateTournamentFees({ ...basic, registrationCents:Number.MAX_SAFE_INTEGER,
  passFinancialFee:true, method:method('card_domestic', 9999, 0) }),
  { ok:false, reason:'overflow' });

const noPercent = simulateTournamentFees({ ...basic, passFinancialFee:true,
  method:method('boleto', 0, 345) });
assert.strictEqual(noPercent.totalCents, 20045);
assert.strictEqual(noPercent.financialFeeCents, 345);
const noFee = simulateTournamentFees({ ...basic, passFinancialFee:true,
  method:method('stripe_pix', 0, 0) });
assert.strictEqual(noFee.totalCents, 19700);

const catA = simulateTournamentFees({ ...basic, registrationCents:10000, participantCount:3, method:domestic });
const catB = simulateTournamentFees({ ...basic, registrationCents:25000, participantCount:5, method:domestic });
assert.strictEqual(catA.eventOrganizerCents + catB.eventOrganizerCents,
  catA.organizerCents * 3 + catB.organizerCents * 5);

assert.deepStrictEqual(simulateTournamentFees({ ...basic, registrationCents:Number.MAX_SAFE_INTEGER,
  participantCount:2, serviceFeeCents:0, method:{ kind:'pix_proprio', currency:'BRL', rateBps:0, fixedCents:0 } }),
  { ok:false, reason:'overflow' });

console.log('Simulador de taxas em centavos: fixtures, gross-up e limites OK.');
