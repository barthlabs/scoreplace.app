'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const core = require('../scripts/planejar-fonte-unica-e05-core.js');
const cli = require('../scripts/planejar-fonte-unica-e05.js');
const { documentToObject } = require('../scripts/auditar-indice-fases.js');

const prefix = 'projects/demo/databases/(default)/documents/';
const root = (kind = 'tournaments', id = 'private-id') => ({ name: prefix + kind + '/' + id, data: {} });
const match = (id, game = { id, scoreP1: 6, scoreP2: 4 }, kind = 'tournaments', parent = 'private-id', extra = {}) =>
  ({ name: prefix + kind + '/' + parent + '/matches/' + id, data: { jogo: game, ...extra } });
const result = (id, data = { matchId: id, scoreP1: 6, scoreP2: 4 }, kind = 'tournaments', parent = 'private-id') =>
  ({ name: prefix + kind + '/' + parent + '/' + core.ROOTS[kind] + '/' + id, data });
const decode = d => d.data;
const run = (matches, results, kind = 'tournaments') => core.classifyRoot(root(kind), matches, results, kind, decode);

{
  const c = run([match('m1', undefined, 'tournaments', 'private-id', { playerUids: ['u1', 'u2'] })],
    [result('m1', { matchId: 'm1', scoreP1: 6, scoreP2: 4, playerUids: ['u2', 'u1'] })]);
  assert.equal(c.paired, 1);
  assert.equal(c.scoreConflict, 0);
  assert.equal(c.uidConflict, 0);
  assert.equal(c.blockedRecords, 0);
}
{
  const c = run([match('m1')], [result('m1', { matchId: 'm1', scoreP1: 7, scoreP2: 4 })]);
  assert.equal(c.scoreConflict, 1);
  assert.equal(c.blockedRecords, 1);
}
{
  const c = run([match('m1', { id: 'm1', scoreP2: 4 })],
    [result('m1', { matchId: 'm1', scoreP1: 6, scoreP2: 4 })]);
  assert.equal(c.resultOnlyRecordField, 1);
  assert.equal(c.transferRecords, 1);
}
{
  const c = run([match('m1')], [result('m1', { matchId: 'm1', scoreP1: 6, scoreP2: 4,
    playerUids: ['u1'] })]);
  assert.equal(c.uidNeedsProof, 1);
  assert.equal(c.blockedRecords, 1);
}
{
  const c = run([], [result('played', { matchId: 'played', scoreP1: 6, winner: 'a' }),
    result('empty', { matchId: 'empty' })]);
  assert.equal(c.orphan, 2);
  assert.equal(c.orphanWithRecordData, 1);
  assert.equal(c.orphanWithoutRecordData, 1);
  assert.equal(c.blockedRecords, 2);
}
assert.throws(() => run([match('m1'), match('m1')], []), /ID duplicado/);
assert.throws(() => run([match('m1')], [result('m1', undefined, 'tournaments', 'other-id')]),
  /fora da coleção/);
assert.throws(() => run([match('m1', { id: 'another' })], []), /ID interno divergente/);
{
  const c = run([], [result('m1', { matchId: 'm1', scoreP1: 6 }, 'sandboxes')], 'sandboxes');
  assert.equal(c.orphanWithRecordData, 1);
  assert.equal(c.results, 1);
  assert.throws(() => core.classifyRoot(root('sandboxes'), [],
    [result('m1', { matchId: 'm1' }, 'tournaments')], 'sandboxes', decode), /fora da coleção/);
}
{
  // createSandbox copia a raiz original (inclusive rounds) e ignora results legado.
  const r = root('sandboxes');
  r.data.rounds = [{ matches: [{ id: 's1', scoreP1: 6 }] }];
  const c = core.classifyRoot(r, [], [result('s1', {
    matchId: 's1', scoreP1: 6 }, 'sandboxes')], 'sandboxes', decode);
  assert.equal(c.inlineOnly, 1);
  assert.equal(c.orphanInlineCandidate, 1);
  assert.equal(c.blockedInlineGames, 1);
}
{
  const c = run([match('m1')], [result('m1', { matchId: 'm1', scoreP1: 6,
    scoreP2: 4, mystery: 'preserve' })]);
  assert.equal(c.unknownResultFields, 1);
  assert.equal(c.blockedRecords, 1);
}
{
  const c = run([match('m1')], [result('m1', { matchId: 'm1', scoreP1: 6,
    scoreP2: 4, replay: { v: 1, points: [{ w: 1 }] } })]);
  assert.equal(c.resultOnlyReplay, 1);
  assert.equal(c.transferRecords, 1);
}
{
  const c = run([match('m1', { id: 'm1', scoreP1: 6, resultAt: 'later' })],
    [result('m1', { matchId: 'm1', scoreP1: 6, resultAt: 'earlier' })]);
  assert.equal(c.scoreConflict, 0);
  assert.equal(c.resultFieldConflict, 1);
  assert.equal(c.blockedRecords, 1);
}
{
  const r = root();
  r.data.matches = [{ id: 'm1', scoreP1: 6 }, { id: 'inline-only', scoreP1: 3 }];
  const c = core.classifyRoot(r, [match('m1', { id: 'm1', scoreP1: 7 })], [], 'tournaments', decode);
  assert.equal(c.inlineGames, 2);
  assert.equal(c.inlineDuplicates, 1);
  assert.equal(c.inlineOnly, 1);
  assert.equal(c.inlineScoreConflict, 1);
  assert.equal(c.blockedInlineGames, 2);
}
{
  const r = root(); r.data.matches = [{ id: 'inline-result', scoreP1: 3 }];
  const c = core.classifyRoot(r, [], [result('inline-result', {
    matchId: 'inline-result', scoreP1: 4, winner: 'x' })], 'tournaments', decode);
  assert.equal(c.orphanInlineCandidate, 1);
  assert.equal(c.orphanInlineScoreConflict, 1);
  assert.equal(c.blockedInlineGames, 1);
  assert.equal(c.blockedRecords, 1);
}
{
  const r = root(); r.data.matches = [{ id: 'same' }, { id: 'same' }];
  const c = core.classifyRoot(r, [], [], 'tournaments', decode);
  assert.equal(c.inlineDuplicateIds, 1);
  assert.equal(c.blockedInlineGames, 1);
}
{
  const r = root(); r.data.matches = [{ id: 'm1', resultAt: 'before' }];
  const c = core.classifyRoot(r, [match('m1', { id: 'm1', resultAt: 'after' })], [], 'tournaments', decode);
  assert.equal(c.inlineScoreConflict, 0);
  assert.equal(c.inlineFieldConflict, 1);
  assert.equal(c.blockedInlineGames, 1);
}
{
  const report = core.aggregate([run([], [result('secret-id', { matchId: 'secret-id', scoreP1: 6 })])],
    '2026-11-01T00:00:00.000Z');
  const text = cli.formatReport(report);
  assert.match(text, /summaryDigest/);
  assert.doesNotMatch(text, /secret-id|scoreP1|private-id/);
  assert.equal(report.applicable, false);
}
{
  const doc = { fields: { nested: { mapValue: { fields: { a: { integerValue: '3' },
    b: { nullValue: null } } } }, list: { arrayValue: { values: [
    { doubleValue: 1.5 }, { stringValue: 'ok' } ] } } } };
  assert.deepEqual(documentToObject(doc), { nested: { a: 3, b: null }, list: [1.5, 'ok'] });
}
{
  const file = path.join(__dirname, '..', 'scripts', 'planejar-fonte-unica-e05.js');
  const ran = spawnSync(process.execPath, [file], {
    encoding: 'utf8', env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: '/tmp/scoreplace-e05-no-key' },
  });
  assert.equal(ran.status, 1);
  assert.equal(ran.stdout, '');
  assert.match(ran.stderr, /prévia E05 indisponível/);
}
async function testPreview() {
  const readTime = '2026-11-01T00:00:00.000Z';
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ path: String(url.pathname), readTime: url.searchParams.get('readTime'), method: options.method });
    const p = String(url.pathname).split('/documents/')[1];
    const roots = p === 'tournaments' ? [{ name: prefix + 'tournaments/secret-tour', fields: {} }]
      : p === 'sandboxes' ? [{ name: prefix + 'sandboxes/secret-sb', fields: {} }] : [];
    return { ok: true, json: async () => ({ documents: roots }) };
  };
  const report = await cli.preview(fetchImpl, 'fake-token', readTime);
  const output = cli.formatReport(report);
  assert.equal(requests.length, 6);
  assert(requests.every(item => item.method === 'GET' && item.readTime === readTime));
  assert.deepEqual(Object.keys(JSON.parse(output)), ['readTime', 'counts', 'summaryDigest', 'applicable']);
  assert.doesNotMatch(output, /secret-tour|secret-sb|fake-token/);
  assert.equal(report.applicable, false);
  await assert.rejects(cli.preview(async (url, options) => {
    if (String(url.pathname).includes('/matches')) throw new Error('network failed');
    return fetchImpl(url, options);
  }, 'fake-token', readTime), /network failed/);
}
testPreview().then(() => console.log('E05: prévia de fonte única classifica sem escrever nem expor dados'))
  .catch(error => { console.error(error); process.exitCode = 1; });
