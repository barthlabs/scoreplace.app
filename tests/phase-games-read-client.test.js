'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../js/views/phase-games-read-core');
const split = require('../js/views/tournament-split-core');
const certificate = require('../functions/phase-index-certificate-core');
const source = fs.readFileSync(path.join(__dirname, '../js/firebase-db.js'), 'utf8');
const integer = (n) => ({ integerValue: String(n) });
const str = (s) => ({ stringValue: s });
const record = split.dividir({ matches: [{ id: 'm', phaseIndex: 1 }] }, ['matches']).matches[0];
record._loc.nested = { integer: 3, empty: null };
const encode = (value) => value === null ? { nullValue: null } :
  typeof value === 'string' ? str(value) :
  typeof value === 'number' ? integer(value) :
  typeof value === 'boolean' ? { booleanValue: value } :
  Array.isArray(value) ? { arrayValue: { values: value.map(encode) } } :
  { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
const fields = (value) => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
const envelope = (phase, gamePhase = phase) => ({ document: { fields: fields({ ...record,
  _phaseIndex: phase, jogo: { ...record.jogo, phaseIndex: gamePhase } }) } });
const proof = certificate.build([record], split);
const typedRow = (value) => {
  const row = envelope(1);
  row.document.fields._loc.mapValue.fields.extra = value;
  return [row];
};
const response = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
function setup(behavior = {}) {
  const calls = [];
  const window = {
    _phaseGamesRead: behavior.validFalse ? { ...core, valid: async () => false } : core, _tSplit: split,
    firebase: {
      app: () => ({ options: { projectId: 'demo-scoreplace' } }),
      auth: () => ({ currentUser: behavior.user ? { getIdToken: async () => 'id-token' } : null }),
      appCheck: () => ({ getToken: async () => ({ token: 'app-token' }) })
    }
  };
  const fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body, headers: options.headers });
    if (behavior.hang && url.includes(behavior.hang)) return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
    });
    if (behavior.reject && url.includes(behavior.reject)) throw Error('network down');
    if (url.endsWith(':beginTransaction')) return response({ transaction: 'tx' });
    if (url.endsWith(':rollback')) return response({});
    if (url.endsWith(':batchGet')) return response(behavior.rootRows ?? [{ found: {
      name: body.documents[0], fields: fields({ name: 'Fixture', phases: behavior.phases ?? [{}, {}],
        currentPhaseIndex: Object.prototype.hasOwnProperty.call(behavior, 'currentPhaseIndex')
          ? behavior.currentPhaseIndex : 1,
        _nPartes: { matches: behavior.total ?? 1 },
        _phaseReadCertificate: behavior.oldProof ? { ...proof, version: 1 } :
          (behavior.total === 0 ? certificate.build([], split) : proof) })
    } }]);
    if (url.endsWith(':runAggregationQuery')) {
      const filter = body.structuredAggregationQuery.structuredQuery.where;
      const n = filter ? (filter.fieldFilter.op === 'EQUAL' ? (behavior.phaseCount ?? 1) : (behavior.indexed ?? 1)) : (behavior.total ?? 1);
      return response([{ result: { aggregateFields: { n: integer(n) } } }]);
    }
    if (url.endsWith(':runQuery')) return response(behavior.rows ?? [envelope(1)]);
    throw Error('unexpected URL ' + url);
  };
  vm.runInNewContext(source, { window, fetch, AbortController, setTimeout, clearTimeout },
    { filename: 'firebase-db.js' });
  const db = window.FirestoreDB;
  db.db = {};
  db._ehSandbox = () => !!behavior.sandbox;
  if (behavior.now) db._phaseGamesNow = behavior.now;
  let fallbackCount = 0;
  db.loadTournamentById = async () => {
    fallbackCount++;
    if (behavior.fallbackReject) throw Error('fallback failed');
    return { id: 't', complete: true };
  };
  return { db, calls, fallbackCount: () => fallbackCount };
}
(async () => {
  const good = setup({ user: true });
  const partial = await good.db.loadTournamentPhaseGames('t', 1);
  assert.equal(partial.mode, 'partial');
  assert.equal(partial.readOnly, true);
  assert.equal(partial.root.name, 'Fixture');
  assert.equal(partial.root.phases.length, 2);
  assert.equal(partial.games[0].jogo.id, 'm');
  assert.equal(partial.tournament, undefined, 'não pode ser apresentado como torneio completo');
  assert.equal(good.fallbackCount(), 0);
  assert.equal(good.calls.length, 7, 'begin, raiz, 3 agregações, fase e rollback');
  assert(good.calls.every((call) => call.headers['X-Firebase-AppCheck'] === 'app-token'));
  assert(good.calls.every((call) => call.headers.Authorization === 'Bearer id-token'));
  assert(good.calls.slice(1, 6).every((call) => call.body.transaction === 'tx'));
  assert.equal(good.calls[3].body.structuredAggregationQuery.structuredQuery.where.fieldFilter.op, 'IN');
  assert.equal(good.calls[3].body.structuredAggregationQuery.structuredQuery.where.fieldFilter.value.arrayValue.values.length, 30);
  const current = setup({ user: true });
  const currentResult = await current.db.loadTournamentPhaseGames('t', 'current');
  assert.equal(currentResult.mode, 'partial');
  assert.equal(currentResult.phaseIndex, 1, 'current deve resolver para o índice da raiz');
  assert.deepEqual(JSON.parse(JSON.stringify(currentResult.games)),
    JSON.parse(JSON.stringify(partial.games)), 'current e índice explícito coincidem');
  const empty = setup({ total: 0, indexed: 0, phaseCount: 0, rows: [{ readTime: '2026-10-31T00:00:00Z' }] });
  assert.equal((await empty.db.loadTournamentPhaseGames('t', 1)).mode, 'fullFallback');
  assert.equal((await empty.db.loadTournamentPhaseGames('t', 'current')).mode, 'fullFallback');
  assert.equal(empty.calls[1].headers.Authorization, undefined, 'visitante não forja login');
  const noFull = setup({ validFalse: true });
  const skipped = await noFull.db.loadTournamentPhaseGames('t', 'current', { skipFullFallback: true });
  assert.equal(skipped.mode, 'fullFallback');
  assert.equal(skipped.tournament, null);
  assert.equal(noFull.fallbackCount(), 0, 'prévia não duplica a carga integral');
  for (const value of [null, '1', 1.5, -1, 30, 5]) {
    const bad = setup({ currentPhaseIndex: value, phases: [{}, {}, {}] });
    assert.equal((await bad.db.loadTournamentPhaseGames('t', 'current',
      { skipFullFallback: true })).mode, 'fullFallback');
    assert.equal(bad.calls.filter((call) => call.url.endsWith(':runAggregationQuery')).length,
      0, 'raiz inválida não executa agregações: ' + value);
    assert.equal(bad.fallbackCount(), 0);
  }
  for (const behavior of [
    { total: 2 }, { indexed: 0 }, { phaseCount: 2 }, { rows: [envelope(2)] },
    { rows: [envelope(1, 2)] }, { reject: ':runQuery' }, { reject: ':runAggregationQuery' },
    { rootRows: [{ missing: 'projects/demo/databases/(default)/documents/tournaments/t' }] },
    { reject: ':batchGet' }, { oldProof: true }, { validFalse: true },
    { rows: typedRow({ timestampValue: '2026-10-31T00:00:00Z' }) },
    { rows: typedRow({ geoPointValue: { latitude: 1, longitude: 2 } }) },
    { rows: typedRow({ bytesValue: 'YQ==' }) },
    { rows: typedRow({ referenceValue: 'projects/demo-scoreplace/databases/(default)/documents/x/y' }) }
  ]) {
    const test = setup(behavior);
    const result = await test.db.loadTournamentPhaseGames('t', 1);
    assert.equal(result.mode, 'fullFallback', JSON.stringify(behavior));
    assert.equal(result.readOnly, true, 'fallback integral não é editável');
    assert.equal(result.tournament.complete, true);
    assert.equal(test.fallbackCount(), 1);
  }
  const sandbox = setup({ sandbox: true });
  assert.equal((await sandbox.db.loadTournamentPhaseGames('sb_x', 1)).mode, 'fullFallback');
  assert.equal(sandbox.calls.length, 0);
  const invalid = setup();
  assert.equal((await invalid.db.loadTournamentPhaseGames('t', 1.5)).mode, 'fullFallback');
  assert.equal((await invalid.db.loadTournamentPhaseGames('t', 30)).mode, 'fullFallback');
  assert.equal(invalid.calls.length, 0);
  let ticks = 0;
  const stalled = setup({ hang: ':beginTransaction', now: () => (++ticks === 1 ? 0 : 14900) });
  const started = Date.now();
  assert.equal((await stalled.db.loadTournamentPhaseGames('t', 1)).mode, 'fullFallback');
  assert(Date.now() - started < 500, 'deadline compartilhado precisa abortar a requisição travada');
  assert.equal(stalled.fallbackCount(), 1);
  const rejected = setup({ validFalse: true, fallbackReject: true });
  await assert.rejects(() => rejected.db.loadTournamentPhaseGames('t', 1), /fallback failed/);
  assert.equal(rejected.fallbackCount(), 1, 'falha do fallback não repete o carregamento integral');
  console.log('phase-games-read-client: transação, fallback e isolamento OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
