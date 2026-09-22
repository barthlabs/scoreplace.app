'use strict';
const C = require('./profile-eligibility-core');
let failed = 0;
function ok(value, message) { console.log((value ? '✓ ' : '✗ ') + message); if (!value) failed++; }
function throws(fn, message) { try { fn(); ok(false, message); } catch (_) { ok(true, message); } }

const intent = C.normalize({ gender: 'feminino', birthDate: '1980-01-01', skillBySport: { 'Beach Tennis': 'B' } });
ok(intent.gender === 'feminino' && intent.skillBySport['Beach Tennis'] === 'B', 'aceita somente os fatos de elegibilidade');
throws(() => C.normalize({ city: 'Recife' }), 'recusa campo de perfil fora do contrato');
throws(() => C.normalize({ birthDate: '2999-01-01' }), 'recusa data futura');
throws(() => C.normalize({ birthDate: '2026-02-31' }), 'recusa data inexistente');
throws(() => C.normalize({ gender: 'qualquer' }), 'recusa gênero livre');
const patch = C.missingOnly({ gender: 'masculino', skillBySport: { Tênis: 'C' } }, intent);
ok(!patch.gender && patch.birthDate === '1980-01-01' && patch.skillBySport.Tênis === 'C' && patch.skillBySport['Beach Tennis'] === 'B', 'só completa fatos ausentes');
process.exitCode = failed ? 1 : 0;
