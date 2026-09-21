'use strict';
const C = require('./registration-lifecycle-core');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }

const registration = {
  registrationId: 'dWlkOnUx__Y2F0LWE', tournamentId: 't1', categoryId: 'cat-a',
  participantKind: 'account', participantUid: 'u1', status: 'confirmed', validationState: 'approved',
};
const next = C.anonymizeForDeletedAccount(registration, 'u1');
ok('retira a referência direta ao UID', next.participantUid === null);
ok('marca retirada por exclusão', next.participantKind === 'deleted_account' && next.status === 'withdrawn' && next.withdrawnReason === 'account_deleted');
ok('não copia dados de perfil para o histórico', !Object.prototype.hasOwnProperty.call(next, 'displayName') && !Object.prototype.hasOwnProperty.call(next, 'email'));
bad('recusa documento de outra conta', () => C.anonymizeForDeletedAccount(registration, 'u2'));
bad('recusa participante manual', () => C.anonymizeForDeletedAccount(Object.assign({}, registration, { participantKind: 'manual' }), 'u1'));
console.log((fail ? '❌' : '✅') + ' registration-lifecycle-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
