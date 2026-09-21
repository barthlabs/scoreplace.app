'use strict';
const C = require('./casual-room-pointer-core');
let fail = 0; let pass = 0;
function ok(n, c) { if (c) pass++; else { fail++; console.error('  ✗ ' + n); } }
function bad(n, v) { try { C.normalizeRoomCode(v); ok(n, false); } catch (_) { ok(n, true); } }
ok('normaliza sala válida', C.normalizeRoomCode('ab23cd') === 'AB23CD');
ok('aceita limpeza explícita', C.normalizeRoomCode(null) === null);
bad('rejeita tamanho inválido', 'AB23C');
bad('rejeita caractere ambíguo', 'AB10CD');
bad('rejeita código vazio', '');
bad('rejeita objeto', {});
console.log((fail ? '❌' : '✅') + ' casual-room-pointer-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
