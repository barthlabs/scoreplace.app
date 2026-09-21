'use strict';
const C = require('./profile-update-core');
let failed = 0;
function ok(value, message) { console.log((value ? '✓ ' : '✗ ') + message); if (!value) failed++; }
function throws(fn, message) { try { fn(); ok(false, message); } catch (_) { ok(true, message); } }

const patch = C.normalize({ displayName: ' Ana ', age: 42, city: ' Recife ', preferredSports: ['Beach Tennis', 'Beach Tennis', ''], skillBySport: { beach_tennis: 'B' } });
ok(patch.displayName === 'Ana' && patch.age === 42, 'normaliza identidade e idade permitidas');
ok(patch.city === 'Recife', 'normaliza texto de perfil');
ok(JSON.stringify(patch.preferredSports) === JSON.stringify(['Beach Tennis']), 'deduplica lista de perfil');
ok(patch.skillBySport.beach_tennis === 'B', 'preserva mapa permitido');
throws(() => C.normalize({ mergedInto: 'uid-alheio' }), 'recusa campo privilegiado');
throws(() => C.normalize({ theme: 'dark' }), 'recusa preferência com Function própria');
throws(() => C.normalize({ age: 131 }), 'recusa idade implausível');
ok(JSON.stringify(C.normalizeEraseFields(['city', 'city', 'hrMax'])) === JSON.stringify(['city', 'hrMax']), 'deduplica remoções permitidas');
throws(() => C.normalizeEraseFields(['phone']), 'recusa apagar contato por esta porta');
process.exitCode = failed ? 1 : 0;
