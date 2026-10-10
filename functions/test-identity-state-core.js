'use strict';
const core = require('./identity-state-core.js');
let okCount = 0, failures = 0;
function ok(label, value) {
  if (value) { okCount++; console.log('  ✓ ' + label); }
  else { failures++; console.error('  ✗ ' + label); }
}

console.log('\n──── identity-state-core ────');
const started = core.initial('2026-10-10T12:00:00.000Z');
ok('perfil novo nasce em auditoria legacy', started.state === 'legacy' && started.identityEpoch === 0 && started.canonicalUid === null);
ok('legado sem documento permanece não bloqueante', core.read(null, 'uid-a').state === 'legacy' && core.read(null, 'uid-a').auditOnly === true);
ok('estado desconhecido falha fechado para legacy', core.read({ state: 'inventado', identityEpoch: -1 }, 'uid-a').state === 'legacy');
const redirect = core.read({ state: 'duplicate_review', canonicalUid: 'uid-b', identityEpoch: 4 }, 'uid-a');
ok('revisão expõe somente redirecionamento próprio necessário', redirect.canonicalUid === 'uid-b' && redirect.isCanonical === false && redirect.identityEpoch === 4);
ok('UID espúrio não vaza em estado operacional', core.read({ state: 'verified', canonicalUid: 'uid-b' }, 'uid-a').canonicalUid === null);

console.log('\n' + okCount + ' asserts OK, ' + failures + ' falha(s)');
process.exit(failures ? 1 : 0);
