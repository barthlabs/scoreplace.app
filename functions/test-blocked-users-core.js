'use strict';

const { normalizeBlockedUserMutation } = require('./blocked-users-core');
let failed = 0;
function ok(value, label) {
  console.log((value ? '✓ ' : '✗ ') + label);
  if (!value) failed++;
}
function rejects(data, ownUid) {
  try { normalizeBlockedUserMutation(data, ownUid); return false; } catch (_) { return true; }
}

const valid = normalizeBlockedUserMutation({ targetUid: 'alvo_123', block: true }, 'eu_123');
ok(valid.targetUid === 'alvo_123' && valid.block === true, 'normaliza bloqueio válido');
ok(normalizeBlockedUserMutation({ targetUid: 'alvo_123', block: false }, 'eu_123').block === false,
  'normaliza desbloqueio válido');
ok(rejects({ targetUid: '', block: true }, 'eu_123'), 'recusa alvo ausente');
ok(rejects({ targetUid: 'eu_123', block: true }, 'eu_123'), 'recusa auto-bloqueio');
ok(rejects({ targetUid: 'alvo_123', block: 'true' }, 'eu_123'), 'recusa ação fora do booleano');
ok(rejects({ targetUid: 'x'.repeat(129), block: true }, 'eu_123'), 'recusa UID maior que o limite do Auth');

process.exitCode = failed ? 1 : 0;
