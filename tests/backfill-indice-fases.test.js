'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const split = require('../functions/vendor/tournament-split-core.js');
const roster = require('../functions/match-roster.js');
const mirror = require('../functions/match-result-mirror-core.js');
const core = require('../scripts/backfill-indice-fases-core.js');
const script = require('../scripts/backfill-indice-fases.js');

const root = 'projects/test/databases/(default)/documents/tournaments/private-id';
const stamp = '2026-10-30T00:00:00.000000Z';
const doc = (name, fields, updateTime = stamp) => ({ name, fields, updateTime });
const decode = (item) => item.fields;
const config = { id: 'private-id', _nPartes: { matches: 1, participants: 0, opponentHistory: 0 } };
const game = { _loc: { tipo: 'matches', mi: 0 }, jogo: { id: '1', phaseIndex: 0, team1: ['a'], team2: ['b'] } };

function fsValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fsValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, fsValue(child)])) } };
}
const firestoreDoc = (name, data, updateTime = stamp) => ({ name, updateTime,
  fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, fsValue(value)])) });

async function fakeServer(options = {}) {
  const count = options.count || 1;
  const rootData = { ...config, _nPartes: { ...config._nPartes, matches: count } };
  const games = Array.from({ length: count }, (_, index) => ({
    _loc: { tipo: 'matches', mi: index },
    jogo: { ...game.jogo, id: String(index + 1) }
  }));
  const assembled = await split.montarDoBanco(rootData, (name) => ({ matches: games, participants: [], opponentHistory: [] })[name]);
  const rootDocument = firestoreDoc(root, rootData);
  const matches = games.map((item, index) => firestoreDoc(root + '/matches/' + (index + 1), item));
  const results = games.map((item, index) => firestoreDoc(root + '/results/' + (index + 1),
    roster.buildMirrorDoc(assembled, assembled.matches[index], 'private-id', '2000-01-01T00:00:00.000Z')));
  const calls = [];
  let patchAttempts = 0;
  const fetchImpl = async (input, request) => {
    const url = new URL(input);
    calls.push({ url, request });
    assert(!url.searchParams.has('mask.fieldPaths'));
    const pathname = decodeURIComponent(url.pathname);
    if (request.method === 'PATCH') {
      patchAttempts++;
      if (options.backupDir) assert(fs.readdirSync(script.backupRoot(options.backupDir)).some((name) => name.endsWith('.json')));
      if (options.failPatchNumber === patchAttempts) return { ok: false, status: 500 };
      if (!options.ignorePatch) {
        const item = matches.find((candidate) => pathname.endsWith('/matches/' + candidate.name.split('/').pop()));
        assert(item);
        item.fields._phaseIndex = JSON.parse(request.body).fields._phaseIndex;
        item.updateTime = stamp + '-patched';
      }
      return { ok: true, json: async () => ({}) };
    }
    if (pathname.endsWith('/documents/tournaments')) return { ok: true, json: async () => ({ documents: [rootDocument] }) };
    if (pathname.endsWith('/matches')) return { ok: true, json: async () => ({ documents: matches }) };
    if (pathname.endsWith('/results')) return { ok: true, json: async () => ({ documents: results }) };
    if (pathname.endsWith('/inscritos') || pathname.endsWith('/opponentHistory')) {
      return { ok: true, json: async () => ({ documents: [] }) };
    }
    if (pathname.endsWith('/documents/tournaments/private-id')) {
      return { ok: true, json: async () => ({ ...rootDocument, updateTime: options.rootChanged ? stamp + '-changed' : stamp }) };
    }
    const result = results.find((candidate) => pathname.endsWith('/results/' + candidate.name.split('/').pop()));
    if (result) return options.resultMissing ? { ok: false, status: 404 } : { ok: true, json: async () => result };
    throw new Error('requisição inesperada');
  };
  return { fetchImpl, calls, matches, get patchAttempts() { return patchAttempts; } };
}

(async () => {
  const mounted = await split.montarDoBanco(config, (name) => ({ matches: [game], participants: [], opponentHistory: [] })[name]);
  const oldMirror = roster.buildMirrorDoc(mounted, mounted.matches[0], 'private-id', '2000-01-01T00:00:00.000Z');
  const tournament = doc(root, config);
  const match = doc(root + '/matches/1', game);
  const result = doc(root + '/results/1', oldMirror);
  const extras = { inscritos: [], opponentHistory: [] };
  const plan = await core.matchesToPlan(tournament, [match], [result], decode, extras);
  assert.throws(() => core.matchesToPlan(tournament, [doc(root.replace('private-id', 'other-id') + '/matches/1', game)], [result], decode, extras), /outro torneio/);
  assert.throws(() => core.matchesToPlan(tournament, [match], [doc(root.replace('private-id', 'other-id') + '/results/1', oldMirror)], decode, extras), /outro torneio/);
  assert.equal(plan.eligible, true);
  assert.equal(plan.targets.length, 1);
  assert.equal(plan.targets[0].phase, 0);
  assert.equal(plan.withResults, 1);
  assert.equal(plan.nonSkippingMirrors, 0);
  const originalGameLookup = mirror.jogoPorId;
  try {
    mirror.jogoPorId = () => null;
    const unmounted = await core.matchesToPlan(tournament, [match], [result], decode, extras);
    assert.equal(unmounted.eligible, false);
    assert.equal(unmounted.reason, 'jogo_nao_montado', 'jogo físico sem montagem não vira elegível por skip');
  } finally { mirror.jogoPorId = originalGameLookup; }
  assert.equal(core.aggregatePlans([plan]).targetGames, 1);
  assert(!JSON.stringify(core.aggregatePlans([plan])).includes('private-id'));
  assert.notEqual((await core.matchesToPlan(doc(root, config, stamp + 'x'), [match], [result], decode, extras)).digest, plan.digest);
  assert.notEqual((await core.matchesToPlan(tournament, [match], [doc(result.name, oldMirror, stamp + 'x')], decode, extras)).digest, plan.digest);
  assert.notEqual((await core.matchesToPlan(tournament, [doc(match.name, game, stamp + 'x')], [result], decode, extras)).digest, plan.digest);

  const missing = await core.matchesToPlan(tournament, [match], [], decode, extras);
  assert.equal(missing.eligible, false);
  assert.equal(missing.reason, 'espelho_ausente');
  assert.equal(missing.missingResults, 1);
  const divergent = await core.matchesToPlan(tournament, [match], [doc(result.name, { ...oldMirror, scoreP1: 999 })], decode, extras);
  assert.equal(divergent.eligible, false);
  assert.equal(divergent.reason, 'espelho_divergente');
  const organizerOnly = await core.matchesToPlan(doc(root, { ...config, organizerOnly: true }),
    [match], [doc(result.name, { ...oldMirror, scoreP1: 999 })], decode, extras);
  assert.equal(organizerOnly.eligible, false, 'organizerOnly não relaxa a guarda do espelho');
  assert.equal(divergent.mirrorMismatchFields.scoreP1, 1);
  assert.equal(core.aggregatePlans([divergent]).mirrorMismatchFields.scoreP1, 1);
  assert.equal(core.aggregatePlans([divergent]).mirrorMismatchKinds.ausente_no_jogo, 1);
  assert.equal(core.differenceKind({}, { team1Uids: ['u'] }, 'team1Uids'), 'ausente_no_espelho');
  assert.equal(core.differenceKind({ team1Uids: ['u'] }, {}, 'team1Uids'), 'ausente_no_jogo');
  assert.equal(core.differenceKind({ team1Uids: ['u'] }, { team1Uids: ['v'] }, 'team1Uids'), 'valores_diferentes');
  assert.deepEqual(core.mirrorDifferences({ pendingResult: { nested: { b: 2, a: 1 } } },
    { pendingResult: { nested: { a: 1, b: 2 } } }), []);
  assert.deepEqual(core.mirrorDifferences({ pendingResult: { values: [1, 2] } },
    { pendingResult: { values: [2, 1] } }), ['pendingResult']);
  const ambiguous = await core.matchesToPlan(tournament, [doc(match.name, { _loc: { tipo: 'matches' }, jogo: { id: '1' } })], [result], decode, extras);
  assert.equal(ambiguous.eligible, false);
  const badCount = await core.matchesToPlan(doc(root, { ...config, _nPartes: { matches: 2 } }), [match], [result], decode, extras);
  assert.equal(badCount.eligible, false);
  const conflicting = await core.matchesToPlan(tournament, [doc(match.name, { ...game, _phaseIndex: 1 })], [result], decode, extras);
  assert.equal(conflicting.eligible, false);

  assert.equal(mirror.planoDoEspelho(mounted, '1', oldMirror, 'private-id', '2000-01-01T00:00:00.000Z').acao, 'skip');
  assert.equal(mirror.planoDoEspelho(mounted, '1', null, 'private-id', '2000-01-01T00:00:00.000Z').acao, 'set');
  assert.equal(roster.subdocSignature({ ...oldMirror, _phaseIndex: 0 }), roster.subdocSignature({ ...oldMirror, _phaseIndex: 7 }));

  const requests = [];
  const pages = await script.listFull(async (url, options) => {
    requests.push({ url: new URL(url), options });
    return { ok: true, json: async () => ({ documents: [match] }) };
  }, 'tournaments/private-id/matches', 'private-token');
  assert.equal(pages.length, 1);
  assert.equal(requests[0].options.method, 'GET');
  assert(!requests[0].url.searchParams.has('mask.fieldPaths'));
  assert(!requests[0].url.searchParams.has('updateMask.fieldPaths'));
  assert.equal(requests[0].options.body, undefined);
  assert(!JSON.stringify(core.aggregatePlans([plan])).includes('private-token'));
  const tempHome = fs.mkdtempSync('/private/tmp/scoreplace-phase-test-');
  try {
    const success = await fakeServer({ backupDir: tempHome });
    const expected = (await script.preview(success.fetchImpl, 'private-token')).digest;
    const outcome = await script.apply(success.fetchImpl, 'private-token', expected, { homeDir: tempHome });
    assert.deepEqual(outcome, { patched: 1, tournaments: 1, backupConfirmed: true });
    assert.equal(success.patchAttempts, 1);
    const patchCall = success.calls.find(({ request }) => request.method === 'PATCH');
    assert.equal(patchCall.url.searchParams.get('updateMask.fieldPaths'), '_phaseIndex');
    assert.equal(patchCall.url.searchParams.get('currentDocument.updateTime'), stamp);
    assert.deepEqual(Object.keys(JSON.parse(patchCall.request.body).fields), ['_phaseIndex']);
    assert(success.calls.filter(({ request }) => request.method === 'GET').every(({ request }) => request.body === undefined));
    const savedName = fs.readdirSync(script.backupRoot(tempHome)).find((name) => name.endsWith('.json'));
    const savedPath = path.join(script.backupRoot(tempHome), savedName);
    assert.equal(fs.statSync(savedPath).mode & 0o077, 0);
    assert.equal(JSON.parse(fs.readFileSync(savedPath, 'utf8')).tournaments[0].matches[0].name, match.name);

    const changedRoot = await fakeServer({ rootChanged: true });
    const rootDigest = (await script.preview(changedRoot.fetchImpl, 'private-token')).digest;
    await assert.rejects(script.apply(changedRoot.fetchImpl, 'private-token', rootDigest, { homeDir: tempHome }), /configuração alterada/);
    assert.equal(changedRoot.patchAttempts, 0);
    const missingResult = await fakeServer({ resultMissing: true });
    const resultDigest = (await script.preview(missingResult.fetchImpl, 'private-token')).digest;
    await assert.rejects(script.apply(missingResult.fetchImpl, 'private-token', resultDigest, { homeDir: tempHome }), /releitura Firestore indisponível/);
    assert.equal(missingResult.patchAttempts, 0);
    const failedPatch = await fakeServer({ count: 2, failPatchNumber: 2 });
    const failureDigest = (await script.preview(failedPatch.fetchImpl, 'private-token')).digest;
    await assert.rejects(script.apply(failedPatch.fetchImpl, 'private-token', failureDigest, { homeDir: tempHome }),
      (error) => /PATCH Firestore recusado/.test(error.message) && error.patched === 1);
    assert.equal(failedPatch.patchAttempts, 2);
    const badAudit = await fakeServer({ ignorePatch: true });
    const badAuditDigest = (await script.preview(badAudit.fetchImpl, 'private-token')).digest;
    await assert.rejects(script.apply(badAudit.fetchImpl, 'private-token', badAuditDigest, { homeDir: tempHome }),
      (error) => /auditoria pós-aplicação incompleta/.test(error.message) && error.patched === 1);
    const stale = await fakeServer();
    await assert.rejects(script.apply(stale.fetchImpl, 'private-token', 'f'.repeat(64), { homeDir: tempHome }), /prévia obsoleta/);
    assert.equal(stale.patchAttempts, 0);
    assert.throws(() => script.backupRoot(path.join(process.cwd(), 'test-home')), /proibido/);
    const link = path.join(tempHome, 'link');
    fs.symlinkSync('/private/tmp', link);
    assert.throws(() => script.assertNoSymlinks(path.join(link, 'backup')), /symlink/);
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
  console.log('backfill-indice-fases: prévia, espelhos, backup, CAS, falhas e auditoria simulados OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
