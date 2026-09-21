'use strict';
const C = require('./category-eligibility-core'); let fail = 0, pass = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }
const definitions = [
  { id: 'skill-b', label: 'B', dimension: 'skill', exclusivityGroup: 'skill', criteria: { skill: { allowed: ['B'] } } },
  { id: 'skill-c', label: 'C', dimension: 'skill', exclusivityGroup: 'skill', criteria: { skill: { allowed: ['C'] } } },
  { id: 'age-50', label: '50+', dimension: 'age', exclusivityGroup: 'age', criteria: { age: { minYears: 50 } } },
  { id: 'open', label: 'Aberta', dimension: 'custom', exclusivityGroup: null }
];
ok('preserva IDs, não rótulos como chave', C.normalizeCategoryDefinitions(definitions)[0].id === 'skill-b');
bad('rejeita ID duplicado', () => C.normalizeCategoryDefinitions([definitions[0], definitions[0]]));
bad('rejeita campo arbitrário', () => C.normalizeCategoryDefinitions([{ id: 'x', label: 'X', dimension: 'custom', injected: true }]));
const profile = { birthDate: '1970-01-01', skillBySport: { 'Beach Tennis': 'B' } };
const at = new Date('2026-09-21T12:00:00Z');
let r = C.decideEnrollment({ definitions, rigor: 'official', categoryIds: ['skill-b', 'age-50'], profile, sport: 'Beach Tennis', now: at });
ok('oficial aprova categorias paralelas elegíveis', r.outcome === 'accepted' && r.validationState === 'approved');
r = C.decideEnrollment({ definitions, rigor: 'official', categoryIds: ['skill-b', 'skill-c'], profile, sport: 'Beach Tennis', now: at });
ok('recusa duas categorias do mesmo grupo exclusivo', r.outcome === 'conflict');
r = C.decideEnrollment({ definitions, rigor: 'casual', categoryIds: ['skill-c'], profile, sport: 'Beach Tennis', now: at });
ok('casual não usa perfil como autoridade de bloqueio', r.outcome === 'accepted');
r = C.decideEnrollment({ definitions, rigor: 'moderate', categoryIds: ['skill-c'], profile, sport: 'Beach Tennis', now: at });
ok('moderado aceita pendente para revisão', r.outcome === 'accepted' && r.validationState === 'pending_review' && r.reasons.includes('skill-not-eligible'));
r = C.decideEnrollment({ definitions, rigor: 'official', categoryIds: ['age-50'], profile: {}, now: at });
ok('oficial recusa sem nascimento', r.outcome === 'rejected' && r.reasons.includes('missing-birth-date'));
r = C.decideEnrollment({ definitions, rigor: 'casual', categoryIds: ['skill-b'], existingCategoryIds: ['skill-b'], profile, sport: 'Beach Tennis', now: at });
ok('repetir categoria existente é idempotente', r.outcome === 'accepted');
r = C.decideEnrollment({ definitions, rigor: 'casual', categoryIds: ['age-50'], existingCategoryIds: ['skill-b'], profile, sport: 'Beach Tennis', now: at });
ok('categoria paralela nova continua válida', r.outcome === 'accepted');
r = C.decideEnrollment({ definitions, rigor: 'casual', categoryIds: ['skill-c'], existingCategoryIds: ['skill-b'], profile, sport: 'Beach Tennis', now: at });
ok('categoria nova do mesmo grupo conflita', r.outcome === 'conflict');
console.log((fail ? '❌' : '✅') + ' category-eligibility-core: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(fail ? 1 : 0);
