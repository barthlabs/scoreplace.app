'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const client = fs.readFileSync('js/views/bracket.js', 'utf8');
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const clientStart = client.indexOf('window._assignMatchCourt = function');
const clientEnd = client.indexOf('window._spFormatElapsed = function', clientStart);
assert(clientStart >= 0 && clientEnd > clientStart);
const calls = [];
const browser = {
  window: {
    _callCF: async (name, data) => { calls.push({ name, data }); return { data: { ok: true, changed: false } }; },
  },
};
vm.runInNewContext(client.slice(clientStart, clientEnd), browser);

const start = server.indexOf("exports.assignMatchCourt = onCall({ invoker: 'public' }");
const end = server.indexOf('// ─── Atribuições da análise', start);
assert(start >= 0 && end > start);
const paths = [];
const ownerChecks = [];
let match;
const HttpsError = class extends Error { constructor(code, message) { super(message); this.code = code; } };
const context = {
  exports: {},
  onCall: (_options, callback) => callback,
  HttpsError,
  db: {
    collection: (collection) => ({ doc: (id) => { const ref = { path: collection + '/' + id }; paths.push(ref.path); return ref; } }),
    runTransaction: async (fn) => fn({ get: async (ref) => ({ exists: true, ref }) }),
  },
  drawWindow: { _findMatch: () => match, _matchHasRealPlay: () => false },
  _assertSandboxDrawOwner: async (_tx, snap, uid) => { ownerChecks.push({ path: snap.ref.path, uid }); },
  _leTorneio: async () => ({ id: 'loaded' }),
  _isTournamentAdmin: () => true,
  _antesDoMotor: () => ({}),
  _gravaTorneio: () => ({ clean: {} }),
  _drawFail: (code, message) => new HttpsError(code, message),
  console,
  Date,
};
vm.runInNewContext(server.slice(start, end), context);

(async () => {
  await browser.window._assignMatchCourt('sb_test', 'j1', 'Quadra 4');
  assert.equal(calls[0].data.sandbox, true);
  await browser.window._assignMatchCourt('tour_test', 'j1', 'Quadra 4');
  assert.equal(calls[1].data.sandbox, false);

  const button = { disabled: false, textContent: '', closest: () => ({
    querySelector: () => ({ value: 'Quadra 4' }),
  }) };
  browser.window._confirmMatchCourtCall(button, 'sb_test', 'j1');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[2].data.sandbox, true);
  assert.equal(calls[2].data.confirmCall, true);

  match = { id: 'j1', court: 'Quadra 4' };
  const callable = context.exports.assignMatchCourt;
  const sandboxResult = await callable({ auth: { uid: 'owner' }, data: calls[2].data });
  assert.equal(sandboxResult.ok, true);
  assert.equal(sandboxResult.changed, true);
  assert.equal(paths.at(-1), 'sandboxes/sb_test');
  assert.deepEqual(ownerChecks.map((item) => item.path), ['sandboxes/sb_test']);
  assert.ok(match.courtCalledAt);

  match = { id: 'j1' };
  const productionResult = await callable({ auth: { uid: 'owner' }, data: calls[1].data });
  assert.equal(productionResult.ok, true);
  assert.equal(paths.at(-1), 'tournaments/tour_test');
  assert.equal(ownerChecks.length, 1, 'produção não entra na validação do sandbox');

  await assert.rejects(callable({ auth: { uid: 'owner' }, data: {
    tournamentId: 'sb_test', sandbox: false, matchId: 'j1', court: 'Quadra 4',
  } }), (error) => error.code === 'not-found');
  assert.equal(paths.at(-1), 'tournaments/tour_test', 'ID e flag divergentes não leem outra coleção');
  console.log('✓ chamada para quadra roteia sandbox e produção, preservando a validação do dono');
})().catch((error) => { console.error(error); process.exitCode = 1; });
