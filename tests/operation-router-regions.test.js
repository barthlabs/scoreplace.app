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
let probeFailure = false;
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
      else if (payload.action === 'receipt') result = { found: receipt, receipt: receipt ? { response: { ok: true } } : undefined };
      return { ok: true, json: async () => ({ result }) };
    }
    if (region === failedRegion) return { ok: false, status: 503, json: async () => ({}) };
    committed = true; receipt = true;
    return { ok: true, json: async () => ({ result: { ok: true } }) };
  } };
context.window = context;
context.crypto = { randomUUID: (() => { let i = 0; return () => `12345678-1234-4123-8123-${String(++i).padStart(12, '0')}`; })() };
context.firebase = { auth: () => ({ currentUser: { uid: 'owner' } }) };
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
  assert.equal((await router.call('assignMatchCourt', payload, headers)).requiresRefresh, true);
  assert.equal(calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length, before + 1,
    'recibo confirmado impede nova escrita');
  assert.equal(committed, false);
  assert.equal(store.get('sp-operation-pending-v2'), '{}');
  probeFailure = true;
  const beforeUnavailable = calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length;
  await assert.rejects(router.call('assignMatchCourt', { tournamentId: 'tour_other', matchId: 'm2', court: 5 }, headers),
    error => error.code === 'functions/unavailable');
  assert.equal(calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe).length, beforeUnavailable,
    'sem região saudável não há escrita');
  console.log('✓ eleição, aderência, troca por falha, mesmo operationId e recibo sem escrita duplicada');
})().catch(error => { console.error(error); process.exitCode = 1; });
