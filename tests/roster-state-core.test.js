'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { reconcileRosterStates } = require('../functions-autodraw/roster-state-core.js');

const paula = 'pY4a8a3H9YW1I6xm7b5sqlUcCKz1';
const vanessa = '5TxVeRIiT1crULiD2PETGBCr6Ek2';
const grouped = 'grouped-uid';
const historical = 'historical-uid';
const tournament = {
  participants: [{ p1Uid: vanessa, p2Uid: paula }], groups: [{ playersUids: [grouped] }],
  matches: [{ id: 'future-167', team1Uids: [vanessa, paula], team2Uids: ['opponent-uid'] }, { id: 'past-1', p1Uid: historical, p2Uid: 'past-opponent', winner: historical }],
  waitlist: [{ uid: paula }, historical, { uid: 'queue-only' }],
  standbyParticipants: [{ uid: grouped }, { uid: 'standby-only' }],
  monarchWaitlist: { Power: [{ uid: vanessa }, { uid: historical }], Light: [{ uid: 'monarch-only' }] }
};
const result = reconcileRosterStates(tournament);
assert.deepStrictEqual(tournament.waitlist.map((entry) => typeof entry === 'string' ? entry : entry.uid), [historical, 'queue-only']);
assert.deepStrictEqual(tournament.standbyParticipants.map((entry) => entry.uid), ['standby-only']);
assert.deepStrictEqual(tournament.monarchWaitlist.Power.map((entry) => entry.uid), [historical]);
assert.deepStrictEqual(tournament.monarchWaitlist.Light.map((entry) => entry.uid), ['monarch-only']);
assert.ok(result.assignedUids.includes(paula));
assert.ok(result.assignedUids.includes(grouped));
assert.strictEqual(result.removed, 3);
const callableSource = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
assert.ok(callableSource.includes('_rosterState.reconcileRosterStates(tDepois'));
console.log('roster-state-core: OK');
