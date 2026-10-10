'use strict';

const vip = require('./tournament-vip-core');
let pass = 0, fail = 0;
function ok(label, condition) {
  if (condition) { pass++; console.log('✓ ' + label); }
  else { fail++; console.error('✗ ' + label); }
}
function throws(label, fn) {
  let didThrow = false;
  try { fn(); } catch (_) { didThrow = true; }
  ok(label, didThrow);
}

const roster = [
  { uid: 'uid-ana' },
  { p1Uid: 'uid-bia', p2ManualId: 'manual-convidada-1' },
];

ok('normaliza UID', vip.normalizeTargets({ uid: ' uid-ana ' })[0].uid === 'uid-ana');
ok('normaliza ID manual', vip.normalizeTargets({ identities: [{ manualParticipantId: ' manual-convidada-1 ' }] })[0].manualParticipantId === 'manual-convidada-1');
throws('recusa nome como alvo VIP', () => vip.normalizeTargets({ participantName: 'Ana' }));
throws('recusa UID e ID manual na mesma identidade', () => vip.normalizeTargets({ uid: 'uid-ana', manualParticipantId: 'manual-ana' }));
throws('recusa duplicata de identidade no mesmo pedido', () => vip.normalizeTargets({ identities: [{ uid: 'uid-ana' }, { uid: 'uid-ana' }] }));
ok('localiza UID no roster estrutural', vip.rosterHasTargets(roster, [{ uid: 'uid-bia' }]) === true);
ok('localiza manual ID no roster estrutural', vip.rosterHasTargets(roster, [{ manualParticipantId: 'manual-convidada-1' }]) === true);
ok('não localiza por nome homônimo', vip.rosterHasTargets(roster, [{ uid: 'uid-inexistente' }]) === false);

const first = vip.toggle({}, [{ uid: 'uid-bia' }, { manualParticipantId: 'manual-convidada-1' }], 123);
ok('grava UID sem chave por nome', first.isVip && first.vips['uid-bia'] === 123 && !first.vips.Bia);
ok('grava manual com prefixo sem colisão', first.vips['manual:manual-convidada-1'] === 123);
const second = vip.toggle(first.vips, [{ uid: 'uid-bia' }, { manualParticipantId: 'manual-convidada-1' }], 456);
ok('reverte atomicamente o mesmo conjunto', !second.isVip && Object.keys(second.vips).length === 0);

console.log((fail ? '✗' : '✓') + ' tournament-vip-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
