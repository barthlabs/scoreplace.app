'use strict';

const { planDisplayNameClaims } = require('./display-name-claim-migration-core.js');
let failures = 0;
function ok(value, message) { if (!value) { failures++; console.error('✗ ' + message); } }

const plan = planDisplayNameClaims([
  { uid: 'uid-a', data: { displayName: 'Ana Silva' } },
  { uid: 'uid-b', data: { displayName: '  ana   silva ' } },
  { uid: 'uid-c', data: { displayName: 'Bruno Lima' } },
  { uid: 'uid-dead', data: { displayName: 'Bruno Lima', mergedInto: 'uid-c' } },
  { uid: 'uid-empty', data: { displayName: '' } },
]);

ok(plan.active.length === 1 && plan.active[0].document.uid === 'uid-c',
  'nome legado único recebe reserva ativa');
ok(plan.conflicts.length === 1 && plan.conflicts[0].document.state === 'conflict',
  'homônimos legados viram reserva de conflito, não ganham vencedor arbitrário');
ok(JSON.stringify(plan.conflicts[0].uids) === JSON.stringify(['uid-a', 'uid-b']),
  'conflito guarda todos os UIDs vivos de modo determinístico');
ok(plan.active.concat(plan.conflicts).every((entry) => entry.id.indexOf('/') === -1),
  'identificador de reserva nunca cria subcaminho por barra no nome');

console.log(failures ? '❌ display-name-claim-migration-core: ' + failures + ' falha(s)' : '✅ display-name-claim-migration-core: 4 ok, 0 falhas');
process.exit(failures ? 1 : 0);
