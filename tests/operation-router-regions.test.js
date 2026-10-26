'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const names = ['sp-op-court-v2', 'sp-op-score-v2', 'sp-op-presence-v2',
  'sp-op-presence-wo-v2', 'sp-op-end-court-v2', 'sp-op-control-v2'];
const regions = ['us-east1', 'us-east4', 'us-south1'];
const digest = 'a'.repeat(64);
const cfg = { schema: 2, regions, services: Object.fromEntries(names.map(name => [name, {
  digest, urls: Object.fromEntries(regions.map(region => [region, `https://${region}.example/${name}`]))
}])) };
const store = new Map();
const calls = [];
let elected = null;
let revision = 0;
let failedRegion = '';
let committed = false;
let receipt = false;
let receiptBodyMissing = false;
let probeFailure = false;
let readFailure = false;
let transientReads = 0;
const doc = { body: { appendChild(node) { node.isConnected = true; } }, getElementById() { return null; },
  createElement() { return { style: {}, setAttribute() {}, remove() {} }; } };
const context = { window: {}, document: doc, localStorage: {
  getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value)
}, AbortController, setTimeout, clearTimeout, performance: { now: () => Date.now() },
  Date, Map, Uint8Array, Array, Object, JSON, Error, Promise, fetch: async (endpoint, options) => {
    if (endpoint.startsWith('/operation-regions.json?')) return { ok: true, json: async () => cfg };
    const [, region, name] = /^https:\/\/([^.]*)\.example\/(.*)$/.exec(endpoint) || [];
    assert(region && name && options.headers.Authorization === 'Bearer test');
    const payload = JSON.parse(options.body).data;
    calls.push({ region, name, payload });
    if (payload.probe) return probeFailure
      ? { ok: false, status: 503, json: async () => ({}) }
      : { ok: true, json: async () => ({ result: { ok: true, region, sourceDigest: digest } }) };
    if (name === 'sp-op-control-v2') {
      let result;
      if (payload.action === 'current') result = { selected: !!elected, day: '2026-10-23', region: elected, revision };
      else if (payload.action === 'select') { elected = payload.region; revision = 1; result = { selected: true, day: '2026-10-23', region: elected, revision }; }
      else if (payload.action === 'failover') { assert.equal(payload.observedRevision, revision); elected = payload.region; revision++; result = { selected: true, day: '2026-10-23', region: elected, revision }; }
      else if (payload.action === 'receipt') result = { found: receipt, receipt: receipt && !receiptBodyMissing ? { response: { ok: true } } : undefined };
      return { ok: true, json: async () => ({ result }) };
    }
    if (region === failedRegion) return { ok: false, status: 503, json: async () => ({}) };
    committed = true; receipt = true;
    return { ok: true, json: async () => ({ result: { ok: true } }) };
  } };
context.window = context;
context.crypto = { randomUUID: (() => { let i = 0; return () => `12345678-1234-4123-8123-${String(++i).padStart(12, '0')}`; })() };
context.firebase = { auth: () => ({ currentUser: { uid: 'owner' } }) };
context.FirestoreDB = { loadTournamentById: async () => {
  if (transientReads > 0) { transientReads--; return null; }
  return readFailure ? null : { id: 'tour_test', source: 'server' };
} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/operation-router.js'), 'utf8'), context);
const router = context.ScoreplaceOperationRouter;
const headers = { Authorization: 'Bearer test' };
(async () => {
  const payload = { tournamentId: 'tour_test', matchId: 'm1', court: 4 };
  assert.equal((await router.call('assignMatchCourt', payload, headers)).ok, true);
  assert(regions.includes(elected));
  const firstRegion = elected;
  assert.equal(calls.filter(x => x.payload.probe).length, names.length * regions.length);
  assert.equal(calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length, 1);
  failedRegion = elected; committed = false; receipt = false;
  assert.equal((await router.call('assignMatchCourt', payload, headers)).ok, true);
  assert.notEqual(elected, firstRegion);
  const operations = calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe);
  assert.equal(operations.length, 3);
  assert.equal(operations[1].payload.operationId, operations[2].payload.operationId,
    'failover repete a mesma intenção');
  assert.equal(committed, true);
  failedRegion = elected; committed = false; receipt = true;
  const before = calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length;
  readFailure = true;
  await assert.rejects(router.call('assignMatchCourt', payload, headers),
    error => error.code === 'functions/unavailable');
  assert.notEqual(store.get('sp-operation-pending-v2'), '{}', 'recibo sem releitura mantém a intenção');
  readFailure = false;
  const replay = await router.call('assignMatchCourt', payload, headers);
  assert.equal(replay.requiresRefresh, true);
  assert.equal(replay.tournament.source, 'server');
  assert.equal(calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length, before + 2,
    'recibo confirmado impede nova escrita');
  assert.equal(committed, false);
  assert.equal(store.get('sp-operation-pending-v2'), '{}');
  // O clique de placar precisa alinhar, gravar e reler sem pedir outro clique.
  failedRegion = '';
  receipt = false;
  transientReads = 1;
  const score = { tournamentId: 'tour_score', matchId: 'score1', payload: { s1: 6, s2: 4 } };
  const firstClick = router.call('applyMatchResult', score, headers);
  const doubleClick = router.call('applyMatchResult', score, headers);
  assert.strictEqual(doubleClick, firstClick, 'toques durante o alinhamento compartilham a mesma intenção');
  await assert.rejects(router.call('applyMatchResult', { ...score, payload: { s1: 6, s2: 5 } }, headers),
    error => error.code === 'functions/failed-precondition', 'placar diferente não é confundido com o primeiro toque');
  assert.equal((await firstClick).ok, true);
  assert.equal(transientReads, 1, 'resposta direta não exige releitura de recibo');
  assert.equal(calls.filter(x => x.name === 'sp-op-score-v2' && !x.payload.probe && x.payload.matchId === 'score1').length, 1,
    'primeiro clique envia o placar só uma vez');
  // Se houve timeout após commit, o recibo e a leitura transitória são resolvidos
  // no próprio clique original, sem reenviar o resultado.
  failedRegion = elected;
  receipt = true;
  transientReads = 1;
  const received = await router.call('applyMatchResult', { tournamentId: 'tour_score', matchId: 'score2', payload: { s1: 6, s2: 3 } }, headers);
  assert.equal(received.tournament.source, 'server');
  assert.equal(transientReads, 0, 'releitura transitória foi repetida automaticamente');
  receiptBodyMissing = true;
  const recovered = await router.call('applyMatchResult', {
    tournamentId: 'tour_score', matchId: 'score3', payload: { s1: 6, s2: 2 }
  }, headers);
  assert.equal(recovered.tournament.source, 'server', 'recibo encontrado sem corpo ainda permite releitura');
  receiptBodyMissing = false;
  probeFailure = true;
  const beforeUnavailable = calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length;
  await assert.rejects(router.call('assignMatchCourt', { tournamentId: 'tour_other', matchId: 'm2', court: 5 }, headers),
    error => error.code === 'functions/unavailable');
  assert.equal(calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length, beforeUnavailable,
    'sem região saudável não há escrita');
  const routerSource = fs.readFileSync(path.join(__dirname, '../js/operation-router.js'), 'utf8');
  const receiptStart = routerSource.indexOf('  async function findReceipt(');
  const receiptEnd = routerSource.indexOf('  async function refreshAnswer(', receiptStart);
  assert(receiptStart >= 0 && receiptEnd > receiptStart);
  const checkedRegions = [];
  const findReceipt = new Function('control', 'fail', routerSource.slice(receiptStart, receiptEnd) + '\nreturn findReceipt;')(
    async (_cfg, region) => {
      checkedRegions.push(region);
      return region === 'us-east4' ? { found: true, receipt: { response: { ok: true, region } } } : { found: false };
    }, (message, code) => Object.assign(new Error(message), { code })
  );
  const secondRegion = await findReceipt({}, ['us-east1', 'us-east4'], { tournamentId: 'tour_score', operationId: 'op' }, headers);
  assert.equal(secondRegion.region, 'us-east4', 'recibo é achado na segunda região após ausência na primeira');
  assert.deepEqual(checkedRegions, ['us-east1', 'us-east4']);
  const uncertainReceipt = new Function('control', 'fail', routerSource.slice(receiptStart, receiptEnd) + '\nreturn findReceipt;')(
    async (_cfg, region) => {
      if (region === 'us-east4') throw Object.assign(new Error('indisponível'), { infrastructure: true });
      return { found: false };
    }, (message, code) => Object.assign(new Error(message), { code })
  );
  await assert.rejects(uncertainReceipt({}, ['us-east1', 'us-east4'],
    { tournamentId: 'tour_score', operationId: 'op' }, headers),
    error => error.code === 'unavailable',
    'ausência em uma região não permite repetir escrita se outra região ficou inalcançável');
  console.log('✓ eleição, aderência, troca por falha, mesmo operationId e recibo sem escrita duplicada');
})().catch(error => { console.error(error); process.exitCode = 1; });
