'use strict';
const C = require('./phone-verification-attempt-core');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('  ✗ ' + name); } }
function throws(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }

const sent = C.normalize({ status: 'sent', flow: 'principal', client: 'web' });
ok('aceita intenção mínima', sent.status === 'sent' && sent.flow === 'principal' && sent.client === 'web');
const failed = C.normalize({ status: 'send-failed', flow: 'vinculado', client: 'nativo', errorCode: 'auth/too-many-requests' });
ok('reduz erro a código permitido', failed.errorCode === 'too-many-requests');
throws('recusa telefone no rastro', () => C.normalize({ status: 'sent', flow: 'principal', client: 'web', phone: '+5511999999999' }));
throws('recusa campo arbitrário', () => C.normalize({ status: 'sent', flow: 'principal', client: 'web', admin: true }));
throws('recusa status desconhecido', () => C.normalize({ status: 'inventado', flow: 'principal', client: 'web' }));
console.log('phone-verification-attempt-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
