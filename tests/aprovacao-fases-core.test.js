'use strict';

const assert = require('assert');
const { buildOperationalBackup } = require('../scripts/backup-torneio-operacional-core');
const { parseArgs, normalizedTime, validateApprovals } = require('../scripts/aprovacao-fases-core');

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓ ' + name); }
const seconds = Date.parse('2026-10-25T00:00:00Z') / 1000;
const timestamp = { toDate() { return new Date(seconds * 1000); }, seconds, nanoseconds: 123456789 };
const id = 'tour_1791844371582_e096aa48f3b5c5464796a17b9b897c98';
const snapshot = { id, updateTime: timestamp, data() { return { formatCode: 'elim_simples', matches: [{ id: 'j1', score: '6-4' }] }; } };
const backup = buildOperationalBackup(snapshot, { results: [{ id: 'r1', data: { score: '6-4' } }] }, '2026-10-25T01:00:00Z', 'scoreplace-app');
const manifest = { ready: true, exceptions: [], pending: [{ tournamentId: id, fingerprint: 'f'.repeat(64), updateTime: '2026-10-24T21:00:00.123456789-03:00' }] };
const approval = { tournamentId: id, fingerprint: 'f'.repeat(64), backupManifestPath: '/tmp/backup.json.manifest.json' };
const receipt = { path: approval.backupManifestPath, payload: backup.payload, manifest: backup.manifest, sha256: backup.sha256 };
const receipts = new Map([[id, receipt]]);
function validate(overrides = {}) { return validateApprovals({ manifest, approvals: [approval], receipts, ...overrides }); }

test('backup real assina o updateTime explícito com nanossegundos', () => {
  assert.deepStrictEqual(backup.payload.tournament.updateTime, { __firestoreType: 'timestamp', seconds, nanoseconds: 123456789 });
  assert.strictEqual(backup.manifest.tournamentUpdateTime.nanoseconds, 123456789);
  assert.strictEqual(backup.sha256, require('crypto').createHash('sha256').update(backup.body).digest('hex'));
  assert.strictEqual(validate().length, 1);
});
test('mesmo instante REST com offset compara igual e um nanossegundo diferente falha', () => {
  assert.deepStrictEqual(normalizedTime(manifest.pending[0].updateTime), { seconds, nanoseconds: 123456789 });
  const stale = { ...manifest, pending: [{ ...manifest.pending[0], updateTime: '2026-10-25T00:00:00.123456788Z' }] };
  assert.throws(() => validate({ manifest: stale }), /estado atual/);
});
test('somente subconjunto aprovado é retornado', () => {
  const other = { tournamentId: 'other', fingerprint: 'e'.repeat(64), updateTime: '2026-10-25T00:00:00Z' };
  assert.deepStrictEqual(validate({ manifest: { ...manifest, pending: [manifest.pending[0], other] } }).map(x => x.tournamentId), [id]);
});
test('duplicata, ID extra e fingerprint divergente bloqueiam antes de escrever', () => {
  assert.throws(() => validate({ approvals: [approval, approval] }), /duplicada/);
  assert.throws(() => validate({ approvals: [{ ...approval, tournamentId: 'other' }] }), /não pendente/);
  assert.throws(() => validate({ approvals: [{ ...approval, fingerprint: 'e'.repeat(64) }] }), /divergente/);
});
test('forma inválida, vazio, exceções e backup antigo bloqueiam', () => {
  assert.throws(() => validate({ approvals: [] }), /ausentes/);
  assert.throws(() => validate({ approvals: [{ ...approval, extra: true }] }), /deve conter apenas/);
  assert.throws(() => validate({ manifest: { ...manifest, pending: [] } }), /não pendente/);
  assert.throws(() => validate({ manifest: { ...manifest, ready: false, exceptions: [{ reason: 'x' }] } }), /exceções/);
  const old = { ...receipt, payload: { ...backup.payload, tournament: { id, data: backup.payload.tournament.data } } };
  assert.throws(() => validate({ receipts: new Map([[id, old]]) }), /updateTime/);
});
test('hash, projeto, ID e tempo do backup divergentes bloqueiam', () => {
  assert.throws(() => validate({ receipts: new Map([[id, { ...receipt, sha256: 'x' }]]) }), /incompatível/);
  assert.throws(() => validate({ receipts: new Map([[id, { ...receipt, payload: { ...backup.payload, project: 'other' } }]]) }), /incompatível/);
  assert.throws(() => validate({ receipts: new Map([[id, { ...receipt, manifest: { ...backup.manifest, tournamentUpdateTime: { ...backup.manifest.tournamentUpdateTime, nanoseconds: 1 } } }]]) }), /estado atual/);
});
test('parser recusa flags repetidas, ausentes e desconhecidas', () => {
  assert.deepStrictEqual(parseArgs([]), { apply: false });
  assert.deepStrictEqual(parseArgs(['--aprovacoes', '/tmp/a.json', '--apply', '--manifest-fingerprint', 'abc']), { apply: true, approvalFile: '/tmp/a.json', expected: 'abc' });
  assert.throws(() => parseArgs(['--apply', '--manifest-fingerprint', '--aprovacoes', '/tmp/a.json', 'x']), /valor ausente/);
  assert.throws(() => parseArgs(['--apply', '--apply', '--manifest-fingerprint', 'x', '--aprovacoes']), /flag inválida ou repetida/);
  assert.throws(() => parseArgs(['--apply', '--manifest-fingerprint', 'x', '--outro', 'y']), /flag inválida ou repetida/);
});
test('JSON de aprovações malformado falha antes da validação', () => {
  assert.throws(() => JSON.parse('{"tournamentId":'), SyntaxError);
});

console.log('aprovacao-fases-core: ' + passed + ' testes passaram');
