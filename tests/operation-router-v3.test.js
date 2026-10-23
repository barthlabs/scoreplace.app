'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const currentSource = fs.readFileSync(path.join(__dirname, '../js/operation-router.js'), 'utf8');
const root = path.join(__dirname, '..');
const oldSource = fs.existsSync(path.join(root, '.git'))
  ? execFileSync('git', ['show', '0a09166f9:js/operation-router.js'], { cwd: root, encoding: 'utf8' })
  : null; // A cópia git archive do predeploy não contém histórico.
const services = ['court', 'score', 'presence', 'presence-wo', 'end-court', 'control'];
const three = ['us-east1', 'us-east4', 'us-south1'];
const five = [...three, 'us-west1', 'southamerica-east1'];
const digest = 'a'.repeat(64);
const config = (schema) => ({ schema, regions: schema === 3 ? five : three,
  services: Object.fromEntries(services.map(s => [`sp-op-${s}-v${schema}`, {
    digest, urls: Object.fromEntries((schema === 3 ? five : three).map(r => [r, `https://${r}.example/sp-op-${s}-v${schema}`]))
  }])) });
function harness(source, { v3 = true, currentRegion = '', failFirstWrite = false, failV3Probe = false, failV2ConfigOnce = false, failV2ProbeOnce = false } = {}) {
  const calls = [], store = new Map(); let selected = currentRegion, revision = currentRegion ? 7 : 0;
  let first = failFirstWrite;
  let v2ConfigLoads = 0, v3ConfigLoads = 0;
  const document = { body: { appendChild(n) { n.isConnected = true; } }, getElementById() { return null; },
    createElement() { return { style: {}, setAttribute() {}, remove() {} }; } };
  const ctx = { document, localStorage: { getItem: k => store.get(k) || null, setItem: (k,v) => store.set(k,v) },
    AbortController, setTimeout, clearTimeout, performance: { now: () => Date.now() },
    Date, Map, Set, Uint8Array, Array, Object, JSON, Error, Promise,
    fetch: async (endpoint, options) => {
      if (endpoint.startsWith('/operation-regions-v3.json?')) {
        v3ConfigLoads++;
        if (!v3) return { ok: false, status: 404 };
        return { ok: true, json: async () => config(3) };
      }
      if (endpoint.startsWith('/operation-regions.json?')) {
        v2ConfigLoads++;
        if (failV2ConfigOnce && v2ConfigLoads === 1) return { ok: false, status: 503 };
        return { ok: true, json: async () => config(2) };
      }
      const [, region, name] = /^https:\/\/([^.]*)\.example\/(.*)$/.exec(endpoint) || [];
      assert(region && name, 'não faz fetch para URL ausente');
      const payload = JSON.parse(options.body).data; calls.push({ region, name, payload });
      if (payload.probe) return (failV3Probe && name.endsWith('-v3')) ||
        (failV2ProbeOnce && v2ConfigLoads === 1 && name.endsWith('-v2'))
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, json: async () => ({ result: { ok: true, region, sourceDigest: digest } }) };
      if (name.includes('control')) {
        let result;
        if (payload.action === 'current') result = { selected: !!selected, day: '2026-10-23', region: selected, revision };
        if (payload.action === 'select') { selected = payload.region; revision++; result = { selected: true, day: '2026-10-23', region: selected, revision }; }
        if (payload.action === 'failover') {
          assert.equal(payload.observedRevision, revision, 'CAS parte da revisão atual');
          selected = payload.region; revision++; result = { selected: true, day: '2026-10-23', region: selected, revision };
        }
        if (payload.action === 'receipt') result = { found: false };
        return { ok: true, json: async () => ({ result }) };
      }
      if (first) { first = false; return { ok: false, status: 503, json: async () => ({}) }; }
      return { ok: true, json: async () => ({ result: { ok: true } }) };
    } };
  ctx.window = ctx;
  ctx.SCOREPLACE_VERSION = '2.5.41';
  ctx.crypto = { randomUUID: () => '12345678-1234-4123-8123-000000000001' };
  ctx.firebase = { auth: () => ({ currentUser: { uid: 'owner' } }) };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { router: ctx.ScoreplaceOperationRouter, calls, store, getSelected: () => selected,
    getV2ConfigLoads: () => v2ConfigLoads, getV3ConfigLoads: () => v3ConfigLoads };
}
(async () => {
  const p = { tournamentId: 'tour_test', matchId: 'm1', court: 4 }, h = { Authorization: 'Bearer test' };
  const modern = harness(currentSource);
  await modern.router.call('assignMatchCourt', p, h);
  assert.equal(modern.calls.filter(x => x.payload.probe).length, 30);
  assert(modern.calls.some(x => x.name === 'sp-op-court-v3' && !x.payload.probe));
  const unavailableV3 = harness(currentSource, { failV3Probe: true });
  await unavailableV3.router.call('assignMatchCourt', p, h);
  assert.equal(unavailableV3.calls.filter(x => x.payload.probe && x.name.endsWith('-v3')).length, 30);
  assert(unavailableV3.calls.some(x => x.name === 'sp-op-court-v2' && !x.payload.probe));
  const retryConfig = harness(currentSource, { failV3Probe: true, failV2ConfigOnce: true });
  await assert.rejects(retryConfig.router.call('assignMatchCourt', p, h));
  await retryConfig.router.call('assignMatchCourt', p, h);
  assert.equal(retryConfig.getV2ConfigLoads(), 2, 'falha temporária do JSON v2 é tentada novamente');
  const retryProbes = harness(currentSource, { failV3Probe: true, failV2ProbeOnce: true });
  await assert.rejects(retryProbes.router.call('assignMatchCourt', p, h));
  await retryProbes.router.call('assignMatchCourt', p, h);
  assert.equal(retryProbes.getV3ConfigLoads(), 2, 'falha de todas as sondas limpa o cache');
  const fallback = harness(currentSource, { v3: false, currentRegion: 'us-west1', failFirstWrite: true });
  await fallback.router.call('assignMatchCourt', p, h);
  assert(three.includes(fallback.getSelected()));
  assert(fallback.calls.some(x => x.payload.action === 'failover' && x.payload.observedRevision === 7));
  const writes = fallback.calls.filter(x => x.name === 'sp-op-court-v2' && !x.payload.probe);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].payload.operationId, writes[1].payload.operationId);
  assert(!fallback.calls.some(x => x.region === 'us-west1' && x.name.endsWith('-v2')));
  if (oldSource) {
    const legacy = harness(oldSource, { currentRegion: 'us-west1' });
    await legacy.router.call('assignMatchCourt', p, h);
    assert(three.includes(legacy.getSelected()));
    assert(legacy.calls.some(x => x.payload.action === 'failover' && x.payload.observedRevision === 7));
    assert(!legacy.calls.some(x => x.region === 'us-west1'));
  } else console.log('⏭ sem .git: teste da fonte histórica 2.5.40 já executado no checkout');
  console.log('✓ v3 cinco regiões, fallback v2 com UUID preservado, cliente 2.5.40 com CAS');
})().catch(e => { console.error(e); process.exitCode = 1; });
