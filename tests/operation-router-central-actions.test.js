'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/operation-router.js'), 'utf8');
const digest = 'a'.repeat(64);
const regions = ['us-east1', 'us-east4', 'us-south1'];
const services = ['court', 'score', 'presence', 'presence-wo', 'end-court', 'control'];
const config = { schema: 2, regions, services: Object.fromEntries(services.map(s => {
  const name = `sp-op-${s}-v2`;
  return [name, { digest, urls: Object.fromEntries(regions.map(r => [r, `https://${r}.example/${name}`])) }];
})) };

function harness({ noConfig = false, centralError = false, receipt = false, probeError = false } = {}) {
  const calls = [], store = new Map();
  let currentReceipt = receipt;
  let failCentral = centralError;
  let failProbe = probeError;
  let selected = '';
  let revision = 0;
  const document = { body: { appendChild(n) { n.isConnected = true; } }, getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute() {}, remove() {} }) };
  const ctx = { document, localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) },
    AbortController, setTimeout, clearTimeout, performance: { now: () => Date.now() },
    Date, Map, Set, Uint8Array, Array, Object, JSON, Error, Promise,
    fetch: async (endpoint, options) => {
      if (endpoint.startsWith('/operation-regions-')) return { ok: false, status: 404 };
      if (endpoint.startsWith('/operation-regions.json?')) return noConfig
        ? { ok: false, status: 503 } : { ok: true, json: async () => config };
      const payload = JSON.parse(options.body).data;
      calls.push({ endpoint, payload });
      if (endpoint.includes('endmatchoncourt-')) return failCentral
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, json: async () => ({ result: { ok: true, changed: true } }) };
      const [, region, name] = /^https:\/\/([^.]*)\.example\/(.*)$/.exec(endpoint) || [];
      assert(region && name, 'endpoint regional válido');
      if (payload.probe) return failProbe
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, json: async () => ({ result: { ok: true, region, sourceDigest: digest } }) };
      if (name === 'sp-op-control-v2') {
        let result;
        if (payload.action === 'current') result = { selected: !!selected, region: selected, day: '2026-10-23', revision };
        if (payload.action === 'select') { selected = payload.region; revision++; result = { selected: true, region: selected, day: '2026-10-23', revision }; }
        if (payload.action === 'receipt') result = { found: currentReceipt, receipt: currentReceipt ? { response: { ok: true } } : undefined };
        return { ok: true, json: async () => ({ result }) };
      }
      return { ok: true, json: async () => ({ result: { ok: true } }) };
    } };
  ctx.window = ctx;
  ctx.crypto = { randomUUID: (() => { let i = 0; return () => `12345678-1234-4123-8123-${String(++i).padStart(12, '0')}`; })() };
  ctx.firebase = { auth: () => ({ currentUser: { uid: 'owner' } }) };
  ctx.FirestoreDB = { loadTournamentById: async () => ({ id: 'tour_test' }) };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  return { router: ctx.ScoreplaceOperationRouter, calls, store,
    setReceipt: v => { currentReceipt = v; }, setCentralError: v => { failCentral = v; },
    setProbeError: v => { failProbe = v; } };
}

(async () => {
  const headers = { Authorization: 'Bearer test' };
  const payload = action => ({ tournamentId: 'tour_test', matchId: 'm1', action });
  const isolated = harness({ noConfig: true, probeError: true });
  assert.equal((await isolated.router.call('endMatchOnCourt', payload('cancel-call'), headers)).ok, true);
  assert.equal((await isolated.router.call('endMatchOnCourt', payload('postpone'), headers)).ok, true);
  assert.equal(isolated.calls.length, 2, 'ações novas não sondam nem alinham regiões');
  assert(isolated.calls.every(c => c.endpoint.includes('endmatchoncourt-')));

  const legacy = harness();
  await legacy.router.call('endMatchOnCourt', payload('release'), headers);
  await legacy.router.call('endMatchOnCourt', payload('restore'), headers);
  await legacy.router.call('applyMatchResult', { tournamentId: 'tour_test', matchId: 'm2' }, headers);
  assert(legacy.calls.filter(c => !c.payload.probe && !c.endpoint.includes('control')).every(c =>
    c.endpoint.includes('.example/') && !c.endpoint.includes('endmatchoncourt-')),
  'liberar, restaurar e placar permanecem nas portas regionais');

  const uncertain = harness({ centralError: true, receipt: false });
  const p = payload('postpone');
  await assert.rejects(uncertain.router.call('endMatchOnCourt', p, headers), e => e.infrastructure === true);
  const first = uncertain.calls.find(c => c.endpoint.includes('endmatchoncourt-')).payload.operationId;
  assert.equal(uncertain.calls.filter(c => c.endpoint.includes('endmatchoncourt-')).length, 1,
    'erro incerto não provoca reenvio imediato');
  await assert.rejects(uncertain.router.call('endMatchOnCourt', payload('cancel-call'), headers),
    e => e.code === 'functions/failed-precondition' && /postpone/.test(e.message));
  assert.equal(uncertain.calls.filter(c => c.endpoint.includes('endmatchoncourt-')).length, 1,
    'troca de ação pendente não envia mutação');
  uncertain.setReceipt(true);
  uncertain.setCentralError(true);
  const replay = await uncertain.router.call('endMatchOnCourt', p, headers);
  assert.equal(replay.replayed, true);
  assert.equal(replay.tournament.id, 'tour_test');
  assert.equal(uncertain.calls.filter(c => c.endpoint.includes('endmatchoncourt-'))[1].payload.operationId, first);
  assert.equal(uncertain.store.get('sp-operation-pending-v2'), '{}');

  const down = harness({ noConfig: true, centralError: true });
  await assert.rejects(down.router.call('endMatchOnCourt', payload('cancel-call'), headers), e => e.infrastructure === true);
  assert.notEqual(down.store.get('sp-operation-pending-v2'), '{}',
    'sem central nem controle a intenção permanece pendente');
  console.log('✓ ações novas na central, legado isolado, recibo e UUID preservados');
})().catch(e => { console.error(e); process.exitCode = 1; });
