'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../scripts/aplicar-historico-e05-core.js');
const cli = require('../scripts/aplicar-historico-e05.js');
const { digest } = require('../scripts/backup-torneio-operacional-core.js');

const ts = { seconds: 1700000000, nanoseconds: 123, toDate: () => new Date(1700000000000) };
function doc(id, type, data = {}) {
  return { ref: { path: 'users/ana/matchHistory/' + id }, updateTime: ts,
    data: () => ({ matchType: type, ...data }) };
}
const docs = [doc('casual', 'casual'), doc('t_t_m', 'tournament',
  { tournamentId: 't', matchId: 't_t_m', scoreSummary: '6-4' })];
const plan = core.makePlan(docs);
assert.equal(plan.count, 1);
assert.equal(plan.untouched, 1);
assert.deepEqual(plan.targets, ['users/ana/matchHistory/t_t_m']);
assert.equal(core.makePlan(docs.slice().reverse()).digest, plan.digest, 'ordem da consulta não muda o lote');
assert.throws(() => core.makePlan([doc('bad', 'other', { tournamentId: 't' })]), /ambíguo/);
assert.throws(() => core.makePlan([doc('bad', 'tournament')]), /sem vínculo/);
assert.throws(() => core.makePlan(Array.from({ length: 451 }, (_, i) =>
  doc('m' + i, 'tournament', { tournamentId: 't', matchId: 'm' + i }))), /teto/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e05-history-'));
try {
  const backed = cli.backup(docs, dir);
  assert.equal(digest(fs.readFileSync(backed.file, 'utf8')), backed.sha256);
  assert.equal(fs.statSync(backed.file).mode & 0o777, 0o600);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

const coverage = { digest: 'a'.repeat(64), orphanRoots: ['missing'], uidMismatches: 2 };
const approval = { schema: 'scoreplace/e05-matchhistory-approval/1', project: 'scoreplace-app',
  digest: plan.digest, coverageDigest: coverage.digest, count: plan.count,
  uidMismatches: 2,
  orphanRoots: ['missing'], authorizedBy: 'owner', authorizationRef: 'specific-lot',
  expiresAt: '2999-01-01T00:00:00Z' };
assert.equal(cli.approvalGate(approval, plan, coverage), approval);
assert.throws(() => cli.approvalGate({ ...approval, orphanRoots: [] }, plan, coverage), /autorização/);
assert.throws(() => cli.approvalGate({ ...approval, digest: 'b'.repeat(64) }, plan, coverage), /autorização/);
console.log('✅ E05: prévia, backup 0600 e autorização específica do histórico');
