'use strict';
const assert = require('node:assert/strict');
const core = require('../scripts/aplicar-pares-e05-core.js');
const cli = require('../scripts/aplicar-pares-e05.js');

function doc(path, data, n = 1) {
  const parts = path.split('/');
  return { id: parts.at(-1), exists: true, ref: { path },
    updateTime: { seconds: n, nanoseconds: 0 }, data: () => data };
}
const id = 'tour_1793572858010_00000000000000000000000000000001';
const path = 'tournaments/' + id;
const root = doc(path, { id, name: 'Nome privado', organizerEmail: 'privado@example.invalid',
  _semPesados: ['matches'], _nPartes: { matches: 1 }, _nJogos: 1 });
const match = doc(path + '/matches/g1', { _chave: 'g1', _loc: { tipo: 'matches', mi: 0 },
  jogo: { id: 'g1', p1: 'Nome privado', scoreP1: 6, scoreP2: 4 } });
const result = doc(path + '/results/g1', { matchId: 'g1', tournamentId: id,
  scoreP1: 6, scoreP2: 4 });
const snapshot = { ref: { path }, root, physicalCollectionNames: ['matches', 'results'],
  collections: { matches: [match], results: [result] } };

(async () => {
  assert.equal(core.validId(id), true);
  assert.equal(core.validId('sb_' + id), false);
  assert.equal(core.validId('../sandboxes/x'), false);
  const { plan, translated } = await core.makePlan(snapshot);
  assert.equal(plan.targets.length, 1);
  assert.deepEqual(plan.targets, ['g1']);
  assert.equal(translated.report.pairedReady, 1);
  assert(!JSON.stringify(plan).includes('Nome privado'));
  assert(!JSON.stringify(plan).includes('privado@example.invalid'));
  core.validatePlan(plan);
  core.verifyReadSet(snapshot, plan);
  assert.throws(() => core.checkSnapshot({ ...snapshot, collections: {
    matches: Array(1000).fill(match), results: [result] } }), /1000 documentos/);
  assert.throws(() => core.verifyReadSet({ ...snapshot,
    collections: { matches: [match], results: [doc(result.ref.path, result.data(), 2)] } }, plan),
  /documento mudou/);
  assert.throws(() => core.validatePlan({ ...plan, digest: '0'.repeat(64) }), /inválido/);
  assert.throws(() => core.checkSnapshot({ ...snapshot, ref: { path: 'sandboxes/' + id } }), /sandbox/);

  const release = { schema: 'scoreplace/stage3-release/1', project: 'scoreplace-app',
    stage3Published: true, mirrorExportsRetired: true, hostingCommit: 'a'.repeat(40),
    readerSha256: 'b'.repeat(64), indexSha256: 'c'.repeat(64) };
  assert.equal(cli.releaseGate(release, release.hostingCommit), release);
  assert.throws(() => cli.releaseGate({ ...release, mirrorExportsRetired: false },
    release.hostingCommit), /E20/);
  assert.throws(() => cli.releaseGate(release, 'd'.repeat(40)), /E20/);
  const approval = { schema: 'scoreplace/e05-pair-approval/1', project: 'scoreplace-app',
    tournamentId: id, digest: plan.digest, authorizedBy: 'owner', authorizationRef: 'conversa/E05',
    expiresAt: '2100-01-01T00:00:00Z' };
  assert.equal(cli.approvalGate(approval, plan), approval);
  assert.throws(() => cli.approvalGate({ ...approval, digest: '0'.repeat(64) }, plan), /autorização/);
  assert.throws(() => cli.approvalGate({ ...approval, expiresAt: '2000-01-01T00:00:00Z' },
    plan), /autorização/);
  console.log('E05 pares: tradução, CAS, sandbox, recibo E20 e autorização conferidos');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
