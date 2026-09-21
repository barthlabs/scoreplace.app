'use strict';
const C = require('./profile-locations-core'); let fail = 0; let pass = 0;
function ok(n, v) { if (v) pass++; else { fail++; console.error('✗ ' + n); } }
function bad(n, v) { try { C.normalizePreferredLocations(v); ok(n, false); } catch (_) { ok(n, true); } }
const out = C.normalizePreferredLocations([{ lat: -23.5, lon: -46.6, label: ' Clube ' }]);
ok('normaliza lon legado em lng', out[0].lng === -46.6 && out[0].label === 'Clube' && !('lon' in out[0]));
ok('aceita lista vazia para remover todos', C.normalizePreferredLocations([]).length === 0);
bad('rejeita mais de cinco locais', Array.from({ length: 6 }, () => ({ lat: 0, lng: 0, label: 'x' })));
bad('rejeita campo arbitrário', [{ lat: 0, lng: 0, label: 'x', uid: 'forjado' }]);
bad('rejeita coordenada fora do intervalo', [{ lat: 91, lng: 0, label: 'x' }]);
console.log((fail ? '❌' : '✅') + ' profile-locations-core: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(fail ? 1 : 0);
