'use strict';
const C = require('./phase-config-core'); let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }
const common = { schemaVersion: 1, entrants: { source: 'enrollments', categoryIds: ['open'] }, competition: { teamSize: 2 }, draw: { modality: 'standard', teamFormation: 'random', pairPersistence: 'phase', pairing: 'performance', antiRepeat: { partners: true, opponents: true, sitOuts: true } }, schedule: { mode: 'manual', firstAt: null, intervalDays: null, rounds: 3 }, lateEnrollment: 'waitlist' };
const classification = Object.assign({}, common, { kind: 'classification', structure: 'round_robin' });
const elimination = Object.assign({}, common, { kind: 'elimination', seeding: 'performance', bracketPolicy: 'repescagem' });
ok('aceita classificatória canônica', C.normalizePhaseConfig(classification).structure === 'round_robin');
ok('aceita eliminatória com política explícita', C.normalizePhaseConfig(elimination).bracketPolicy === 'repescagem');
bad('recusa Liga como tipo de fase', () => C.normalizePhaseConfig(Object.assign({}, classification, { kind: 'liga' })));
bad('recusa rei/rainha como eliminatória', () => C.normalizePhaseConfig(Object.assign({}, elimination, { draw: Object.assign({}, common.draw, { modality: 'monarch', pairPersistence: 'round' }) })));
bad('reserva Super 8 até a regra estar definida', () => C.normalizePhaseConfig(Object.assign({}, classification, { draw: Object.assign({}, common.draw, { modality: 'super8' }) })));
bad('recusa política de chave em classificatória', () => C.normalizePhaseConfig(Object.assign({}, classification, { bracketPolicy: 'bye' })));
bad('recusa campo desconhecido', () => C.normalizePhaseConfig(Object.assign({}, classification, { formatCode: 'liga' })));
console.log((fail ? '❌' : '✅') + ' phase-config-core: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(fail ? 1 : 0);
