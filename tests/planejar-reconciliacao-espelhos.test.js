'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const split = require('../functions/vendor/tournament-split-core.js');
const roster = require('../functions/match-roster.js');
const core = require('../scripts/planejar-reconciliacao-espelhos-core.js');
const script = require('../scripts/planejar-reconciliacao-espelhos.js');
const { listFull } = require('../scripts/backfill-indice-fases.js');

const base = 'projects/test/databases/(default)/documents/tournaments/fixture';
const time = '2026-10-31T10:00:00.000Z';
const doc = (name, fields, updateTime = time) => ({ name, fields, updateTime });
const decode = (item) => item.fields;
const encode = (value) => {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, encode(item)])
  ) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  return { stringValue: String(value) };
};
const wireDoc = (item) => ({ ...item, fields: Object.fromEntries(
  Object.entries(item.fields).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encode(value)])
) });
const players = ['a', 'b', 'c', 'd'].map((uid) => ({ uid }));
const game = { _loc: { tipo: 'matches', mi: 0 }, _phaseIndex: 0,
  jogo: { id: '1', phaseIndex: 0, p1: 'Mesmo nome', p2: 'Mesmo nome',
    team1Uids: ['a', 'b'], team2Uids: ['c', 'd'], scoreP1: 6, scoreP2: 4 } };
const config = { id: 'fixture', name: 'Teste', _nPartes: { matches: 1 } };

async function fixture(changes = {}) {
  const tournament = { ...config, ...changes.config };
  const match = changes.game || game;
  const participants = changes.players || players;
  const pieces = split.dividir({ ...tournament, participants }, ['participants']);
  const mounted = await split.montarDoBanco(tournament, (collection) => ({
    matches: [match], inscritos: pieces.participants, opponentHistory: [], grupos: []
  })[collection]);
  const desired = roster.buildSeedDoc(mounted, mounted.matches[0]);
  const result = { ...desired, ...changes.result };
  for (const key of changes.remove || []) delete result[key];
  const extras = { inscritos: pieces.participants.map((item, index) => doc(base + '/inscritos/' + index, item)),
    opponentHistory: [] };
  return { tournament: doc(base, tournament), matches: [doc(base + '/matches/1', match)],
    results: [doc(base + '/results/1', result)], extras, desired };
}

async function plan(f) {
  return core.planTournament(f.tournament, f.matches, f.results, f.extras, decode, time);
}

(async () => {
  assert.equal(core.IDENTITY_FIELDS.length, 5);
  assert.equal(roster.RESULT_FIELDS.length, 16);
  for (const field of roster.RESULT_FIELDS) assert.equal(core.IDENTITY_FIELDS.includes(field), false);
  assert.equal(core.sameIdentity('playerUids', ['a', 'b'], ['b', 'a']), true);
  assert.equal(core.sameIdentity('playerUids', undefined, []), false);
  assert.equal(core.sameIdentity('p1Uid', undefined, null), false);
  const f = await fixture({ result: { playerUids: [] } });
  const p = await plan(f);
  assert.equal(p.summary.candidates, 1);
  assert.deepEqual(p.targets[0].fields, [['playerUids', f.desired.playerUids]]);
  assert.equal(p.targets[0].matchUpdateTime, time);
  assert.equal(p.targets[0].resultUpdateTime, time);
  const f2 = await fixture({ result: { playerUids: [], replay: { points: [1, 2] } } });
  const p2 = await plan(f2);
  assert.equal(p2.summary.candidates, 1);
  assert.deepEqual(roster.buildMirrorDoc({}, { id: 1 }, 'fixture', time, f2.results[0].fields).replay,
    { points: [1, 2] });
  const report = core.aggregate([p], time, { source: 'hash' }, 'head', 'dirty');
  assert.equal(report.digest, core.aggregate([await plan(f)], time, { source: 'hash' }, 'head', 'dirty').digest);
  assert.equal(JSON.stringify(report).includes('Mesmo nome'), false);
  assert.notEqual(report.digest, core.aggregate([p2], time, { source: 'hash' }, 'head', 'dirty').digest);
  f.results[0].updateTime = '2026-10-31T10:01:00.000Z';
  assert.notEqual(report.digest, core.aggregate([await plan(f)], time, { source: 'hash' }, 'head', 'dirty').digest);
  const hidden = await fixture({ config: { organizerOnly: true }, result: { playerUids: [] } });
  assert.equal((await plan(hidden)).summary.candidates, 0);
  assert.equal((await plan(await fixture({ config: { organizerOnly: true }, result: { playerUids: ['x'] } }))).summary.candidates, 0);
  assert.equal((await plan(await fixture({ result: { playerUids: [], scoreP1: 9 } }))).summary.nonIdentityDifference, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [], tournamentId: 'outro' } }))).summary.nonIdentityDifference, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [], pendingResult: { winner: 'a' } } }))).summary.nonIdentityDifference, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [], p1: null } }))).summary.nonIdentityDifference, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [], team1Uids: ['x'] } }))).summary.noUidProof, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [] }, players: players.slice(1) }))).summary.noUidProof, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [] }, players: [...players, { uid: 'a' }] }))).summary.noUidProof, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [] }, game: { ...game,
    jogo: { ...game.jogo, team1Uids: ['a'], team2Uids: ['a'] } } }))).summary.noUidProof, 1);
  assert.equal((await plan(await fixture({ result: { playerUids: [] }, game: { ...game,
    jogo: { ...game.jogo, team1Uids: ['a', 'a'] } } }))).summary.noUidProof, 1);
  const orphan = await fixture({ result: { playerUids: [] } });
  orphan.results.push(doc(base + '/results/2', { matchId: '2', replay: { points: [1] }, scoreP1: 6 }));
  assert.equal((await plan(orphan)).summary.orphansPreserved, 1);
  assert.equal((await plan(orphan)).targets.length, 1);
  await assert.rejects(core.planTournament(f.tournament, f.matches, f.results, f.extras, decode), /readTime/);

  const paths = ['tournaments', 'tournaments/fixture/matches', 'tournaments/fixture/results',
    'tournaments/fixture/inscritos', 'tournaments/fixture/opponentHistory'];
  const wire = { [paths[0]]: [orphan.tournament], [paths[1]]: orphan.matches,
    [paths[2]]: orphan.results, [paths[3]]: orphan.extras.inscritos, [paths[4]]: [] };
  for (const path of paths) wire[path] = wire[path].map(wireDoc);
  const calls = [];
  const fakeFetch = async (url, options) => {
    assert.equal(options.method, 'GET');
    const u = new URL(url);
    assert.equal(u.searchParams.get('readTime'), time);
    const path = decodeURIComponent(u.pathname.split('/documents/')[1]);
    calls.push({ path, page: u.searchParams.get('pageToken') });
    const docs = wire[path];
    assert.ok(docs, path);
    if (path === paths[0] && !u.searchParams.has('pageToken')) {
      return { ok: true, json: async () => ({ documents: [], nextPageToken: 'second' }) };
    }
    return { ok: true, json: async () => ({ documents: docs }) };
  };
  const preview = await script.preview(fakeFetch, 'token', time,
    { sourceHashes: { source: 'hash' }, version: { head: 'head', worktreeStatus: '' } });
  assert.equal(preview.tournaments, 1);
  assert.equal(preview.orphansPreserved, 1);
  assert.equal(calls.length, 6);
  assert.equal(calls[1].page, 'second');
  await assert.rejects(script.preview(async () => ({ ok: false }), 'token', time,
    { sourceHashes: {}, version: { head: '', worktreeStatus: '' } }), /leitura Firestore/);
  await assert.rejects(listFull(async () => ({ ok: true, json: async () => ({ nextPageToken: 'repeat' }) }),
    'tournaments', 'token', time), /paginação repetida/);
  assert.equal(fs.readFileSync('functions/vendor/tournament-split-core.js', 'utf8'),
    fs.readFileSync('js/views/tournament-split-core.js', 'utf8'));
  assert.equal(fs.readFileSync('functions/match-roster.js', 'utf8'),
    fs.readFileSync('functions-autodraw/vendor/match-roster.js', 'utf8'));
  const code = fs.readFileSync('scripts/planejar-reconciliacao-espelhos.js', 'utf8');
  assert.equal(/\.patch\(|\.delete\(|\.set\(|firebase-admin|method:\s*['"](?:POST|PATCH|DELETE)/.test(code), false);
  console.log('planejar-reconciliacao-espelhos: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
