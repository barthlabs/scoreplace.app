'use strict';
/* Regressão da troca de nome: uma conta nunca toma nem libera a reserva de
 * outra. O teste é puro para exercitar a decisão que a transação usa de fato. */
const C = require('./profile-name-claim-core');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('✓ ' + msg); } else { fail++; console.error('✗ ' + msg); } }
function claim(uid) { return { exists: true, data: () => ({ uid }) }; }
const absent = { exists: false, data: () => ({}) };

let r = C.decide({ uid: 'ana', oldClaim: claim('ana'), newClaim: claim('bia'), sameClaim: false });
ok(r.conflict && !r.releaseOld, 'reserva de outro UID bloqueia sem soltar o nome antigo');

r = C.decide({ uid: 'ana', oldClaim: claim('ana'), newClaim: absent, sameClaim: false });
ok(!r.conflict && r.releaseOld, 'troca livre libera somente a reserva antiga da própria conta');

r = C.decide({ uid: 'ana', oldClaim: claim('bia'), newClaim: absent, sameClaim: false });
ok(!r.conflict && !r.releaseOld, 'reserva legada de terceiro nunca é apagada');

r = C.decide({ uid: 'ana', oldClaim: claim('ana'), newClaim: claim('ana'), sameClaim: true });
ok(!r.conflict && !r.releaseOld, 'mesma reserva não é apagada durante atualização');

console.log((fail ? '❌' : '✅') + ' profile-name-claim-core: ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
