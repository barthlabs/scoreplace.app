'use strict';
const C = require('./push-token-core');
let failed = 0;
function ok(value, message) { console.log((value ? '✓ ' : '✗ ') + message); if (!value) failed++; }
function throws(fn, message) { try { fn(); ok(false, message); } catch (_) { ok(true, message); } }
const value = C.normalize({ token: 'x'.repeat(120), platform: 'native-ios' });
ok(value.token.length === 120 && value.platform === 'native-ios', 'aceita token e plataforma nativa válidos');
ok(C.normalize({ token: 'x'.repeat(20), platform: 'web' }).platform === 'web', 'aceita token web válido');
throws(() => C.normalize({ token: 'curto', platform: 'web' }), 'recusa token curto');
throws(() => C.normalize({ token: 'x'.repeat(20), platform: 'desktop' }), 'recusa plataforma fora do contrato');
process.exitCode = failed ? 1 : 0;
