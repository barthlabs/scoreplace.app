'use strict';
const assert = require('node:assert/strict');
const { _window } = require('../functions-autodraw/draw-core');
const C = require('../scripts/migrar-fmt2-core');
const A = require('../scripts/migrar-fmt2-admin');

const F = _window.FORMAT2;
function direct(sport, singles) {
  const cfg = F.defaultConfig(sport);
  cfg.classifAtiva = false;
  cfg.eliminatoria.ativa = true;
  if (singles) { cfg.disputa = 'individual'; cfg.historicalSinglesOverride = true; }
  const built = F.compileToPhases(cfg, { sport });
  const t = { sport, ...built.topLevel, phases: built.phases, format: 'Eliminatórias Simples',
    status: 'finished', matches: [], results: { immutable: true }, arbitraryField: { nested: 'keep' } };
  delete t.drawMode;
  delete t.politicaDaChave;
  t.phases[0].gruposCount = null;
  t.phases[0].gruposClassified = null;
  t.phases[0].drawMode = null;
  t.phases[0].politicaDaChave = null;
  t.phases[0].customResults = { winner: 'keep' };
  t.phases[0].playedAt = { __firestoreType: 'timestamp', seconds: 1793058123, nanoseconds: 123456789 };
  t.phases[0].name = 'Nome histórico';
  t.phases[0].scoring = { sets: 2, keep: true };
  t.phases[0].rounds = 7;
  return t;
}
for (const t of [direct('Beach Tennis', false), direct('Futevôlei', true)]) {
  const original = structuredClone(t);
  const patch = C.buildPatch(t);
  assert.deepEqual(t, original, 'tradução não muta documento antigo');
  assert.deepEqual(patch.after.results, original.results);
  assert.deepEqual(patch.after.arbitraryField, original.arbitraryField);
  assert.equal(patch.after.phases[0].customResults.winner, 'keep');
  assert.deepEqual(patch.after.phases[0].playedAt, original.phases[0].playedAt);
  for (const key of ['name', 'scoring', 'rounds', 'drawMode']) {
    assert.deepEqual(patch.after.phases[0][key], original.phases[0][key], key + ' histórico preservado');
  }
  assert.equal(patch.after.fmt2.historicalSinglesOverride, t.teamSize === 1 ? true : undefined);
  const request = C.buildPatchRequest('tour_test', patch, '2026-10-27T01:02:03.123456789Z');
  const paths = new URL(request.url).searchParams.getAll('updateMask.fieldPaths');
  assert.deepEqual(paths, patch.mask);
  assert.equal(new URL(request.url).searchParams.get('currentDocument.updateTime'), '2026-10-27T01:02:03.123456789Z');
  assert.deepEqual(Object.keys(request.body.fields).sort(), paths);
  assert.ok(request.body.fields.fmt2.mapValue);
  assert.ok(request.body.fields.phases.arrayValue);
  const phaseFields = request.body.fields.phases.arrayValue.values[0].mapValue.fields;
  assert.equal(phaseFields.playedAt.timestampValue, new Date(1793058123 * 1000).toISOString().replace('.000Z', '.123456789Z'));
  assert.ok(!paths.includes('format'));
  C.assertPostcheck(t, patch.after, patch, 'tour_test');
  const corrupted = structuredClone(patch.after);
  corrupted.results.immutable = false;
  assert.throws(() => C.assertPostcheck(t, corrupted, patch, 'tour_test'), /campo protegido/);
}
const fixture = direct('Beach Tennis', false);
const preview = { id: 'tour_test', updateTime: '2026-10-27T01:02:03.123456789Z', fingerprint: C.hash(fixture) };
const backup = { project: C.PROJECT, tournamentId: 'tour_test', tournament: {
  updateTime: { __firestoreType: 'timestamp', seconds: Date.parse('2026-10-27T01:02:03Z') / 1000, nanoseconds: 123456789 }, data: fixture
} };
assert.doesNotThrow(() => C.assertBackupMatchesPreview(backup, preview));
const stale = structuredClone(backup);
stale.tournament.updateTime.nanoseconds++;
assert.throws(() => C.assertBackupMatchesPreview(stale, preview), /updateTime/);
const wrongData = structuredClone(backup);
wrongData.tournament.data.arbitraryField.nested = 'changed';
assert.throws(() => C.assertBackupMatchesPreview(wrongData, preview), /conteúdo/);
assert.throws(() => C.buildPatchRequest('tour_1780009816637', C.buildPatch(fixture), preview.updateTime), /protegido/);
assert.throws(() => C.buildPatchRequest('tour_test', { fields: { fmt2: {}, phases: [], results: [] }, mask: ['fmt2', 'phases', 'results'] }, preview.updateTime), /allowlist/);
const typed = C.decodeDocument({ updateTime: preview.updateTime, fields: {
  name: { stringValue: 'Teste' }, when: { timestampValue: preview.updateTime },
  values: { arrayValue: { values: [{ integerValue: '1' }, { mapValue: { fields: { yes: { booleanValue: true } } } }] } }
} });
assert.equal(typed.data.when.nanoseconds, 123456789);
assert.deepEqual(typed.data.values, [1, { yes: true }]);
assert.throws(() => C.buildPatch({ ...fixture, fmt2: {} }), /canônico/);
const expected = C.buildPatch(fixture);
const target = { ...preview };
const backed = { data: { ...backup, subcollections: {} }, sha256: 'sha-test' };
const intent = { schema: 'scoreplace/fmt2-intent/1', id: target.id,
  previewFingerprint: target.fingerprint, beforeUpdateTime: target.updateTime,
  expectedFields: expected.fields, subcollectionHash: C.hash({}), backupSha256: backed.sha256 };
assert.equal(A.verifyIntent(intent, target, backed, { data: fixture, updateTime: target.updateTime }, {}), 'pending');
assert.equal(A.verifyIntent(intent, target, backed, { data: expected.after, updateTime: '2026-10-27T01:02:04.123456789Z' }, {}), 'patched', 'queda após PATCH é retomável pelo recibo de intenção');
assert.throws(() => A.verifyIntent(intent, target, backed, { data: fixture, updateTime: '2026-10-27T01:02:04.123456789Z' }, {}), /raiz mudou/);
assert.throws(() => A.verifyIntent(intent, target, backed, { data: expected.after, updateTime: '2026-10-27T01:02:04.123456789Z' }, { inscritos: [] }), /subcoleções divergiram/);
const tampered = structuredClone(expected.after);
tampered.results = { immutable: false };
assert.throws(() => A.verifyIntent(intent, target, backed, { data: tampered, updateTime: '2026-10-27T01:02:04.123456789Z' }, {}), /campo protegido/);
console.log('✓ migração fmt2: patch fechado, pureza, backup exato, preservação e CAS');
