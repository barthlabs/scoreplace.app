'use strict';
// Sem mutador local, retries do navegador não podem inverter presença.
const H = require('./render-harness'); const W = H.sandbox;
require('./headless').load('participants.js');
let failed = 0; const ok = (v, m) => { if (v) console.log('✓ ' + m); else { failed++; console.error('✗ ' + m); } };
const t = { id: 'IDEMP', participants: [{ uid: 'u1', displayName: 'Fulano' }], checkedIn: {}, absent: {} };
const calls = []; W.AppStore.tournaments = [t]; W.AppStore.mutate = () => { throw new Error('não deve mutar'); };
W.FirestoreDB = { setTournamentPresence(...args) { calls.push(args); return Promise.resolve({ ok: true }); } };
W._presenceBusyUntil = W._reRenderParticipantsStable = () => {};
for (let i = 0; i < 4; i++) W._applyCheckInToggle('IDEMP', 'Fulano', 'u1');
ok(calls.length === 4, 'cada clique apenas despacha uma intenção');
ok(calls.every(c => c[2] === 'present'), 'retries com eco local inalterado preservam a ação absoluta');
ok(Object.keys(t.checkedIn).length === 0, 'cliente não pode inverter mapa de presença');
console.log((failed ? '❌' : '✅') + ' presence-mutator-idempotent'); process.exit(failed ? 1 : 0);
