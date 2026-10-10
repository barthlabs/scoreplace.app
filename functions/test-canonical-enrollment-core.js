'use strict';
const C = require('./canonical-enrollment-core');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
const base = { id: 't1', status: 'open', categoryDefinitions: [{ id: 'fem-a', label: 'Fem A', dimension: 'skill', exclusivityGroup: 'skill', criteria: {} }], enrollmentRigor: 'casual' };
const input = { tournament: base, registrations: [], participant: { uid: 'u1', categoryIds: ['fem-a'] }, nowMs: Date.UTC(2026, 0, 1) };
let result = C.decide(input);
ok('aceita inscrição tipada e cria registro confirmado', result.outcome === 'enrolled' && result.enrollment.creates.length === 1 && result.enrollment.creates[0].participantUid === 'u1');
const confirmed = result.enrollment.creates[0];
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, { matches: [{ id: 'm1' }], format: 'liga', ligaOpenEnrollment: true }) }));
ok('fase sorteada com inscrição tardia manda para espera', result.outcome === 'waitlisted' && result.enrollment.creates[0].status === 'waitlisted');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, { maxParticipants: 1 }), registrations: [confirmed], participant: { uid: 'u2', categoryIds: ['fem-a'] } }));
ok('capacidade confirmada bloqueia entrada antes do sorteio', result.outcome === 'capacityFull');
result = C.decide(Object.assign({}, input, { tournament: Object.assign({}, base, { maxParticipants: 1 }), registrations: [confirmed] }));
ok('repetição idêntica vence teto de vagas e continua idempotente', result.outcome === 'alreadyRegistered');
try { C.decide(Object.assign({}, input, { participant: { uid: 'u1', categories: ['Fem A'] } })); ok('nunca usa rótulo legado na porta canônica', false); } catch (_) { ok('nunca usa rótulo legado na porta canônica', true); }
try { C.decide(Object.assign({}, input, { participant: { uid: 'u1', p2Uid: 'u2', categoryIds: ['fem-a'] } })); ok('dupla não entra pela porta solo', false); } catch (_) { ok('dupla não entra pela porta solo', true); }
console.log((fail ? '❌' : '✅') + ' canonical-enrollment-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
