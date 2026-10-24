'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { checkPort, inspect, loadManifest } = require('../scripts/check-live-operation-readiness');

const root = path.join(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'operation-regions-v3.json'), 'utf8'));
const headers = new Headers({
  'access-control-allow-origin': 'https://scoreplace.app',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, x-firebase-appcheck',
});
const response = (status, body, responseHeaders = headers) => new Response(body, { status, headers: responseHeaders });
const good = async (_url, options) => options.method === 'OPTIONS'
  ? response(204, null)
  : response(401, JSON.stringify({ error: { status: 'UNAUTHENTICATED' } }));

// Six live callable handlers must reject a tokenless request before their probe
// or first database access. The runtime behavior of four also has dedicated VM
// tests in operation-probe-readonly.test.js.
const sources = {
  'sp-op-presence-v3': ['functions/index.js', 'setTournamentPresence'],
  'sp-op-presence-wo-v3': ['functions-autodraw/index.js', 'setTournamentPresenceWithWOSubstitution'],
  'sp-op-court-v3': ['functions-autodraw/index.js', 'assignMatchCourt'],
  'sp-op-score-v3': ['functions-autodraw/index.js', 'applyMatchResult'],
  'sp-op-end-court-v3': ['functions-autodraw/index.js', 'endMatchOnCourt'],
  'sp-op-control-v3': ['functions-autodraw/index.js', 'tournamentOperationControl'],
};
for (const [service, [file, handler]] of Object.entries(sources)) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const start = source.indexOf(`exports.${handler} = onCall`);
  assert(start >= 0, service);
  const nextExport = source.indexOf('\nexports.', start + 1);
  const head = source.slice(start, nextExport < 0 ? undefined : nextExport);
  const auth = head.indexOf("if (!uid) throw new HttpsError('unauthenticated'") >= 0
    ? head.indexOf("if (!uid) throw new HttpsError('unauthenticated'")
    : head.indexOf('if (!callerUid) throw new HttpsError("unauthenticated"');
  const probe = head.indexOf('probe === true');
  assert(auth >= 0 && probe > auth, `${service}: autenticação antes da sonda`);
  assert(!/\b(?:db|tx)\.(?:collection|doc|get|runTransaction)\(/.test(head.slice(0, auth)),
    `${service}: acesso ao banco antes da autenticação`);
}

(async () => {
  await checkPort('https://test.invalid', good, 100);
  await assert.rejects(checkPort('https://test.invalid', async (_url, options) =>
    options.method === 'OPTIONS' ? response(204, null) : response(401, '{}'), 100), /probe status/);
  await assert.rejects(checkPort('https://test.invalid', async (_url, options) =>
    options.method === 'OPTIONS' ? response(500, 'error') : good(_url, options), 100), /CORS/);
  await assert.rejects(checkPort('https://test.invalid', async (_url, options) =>
    options.method === 'OPTIONS' ? response(204, null, new Headers()) : good(_url, options), 100), /CORS/);
  await assert.rejects(checkPort('https://test.invalid', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }), 10), /abort/i);
  const report = await inspect(config, { fetcher: good, retries: 0, timeoutMs: 100 });
  assert.equal(report.completeRegions, 5);
  assert.equal(report.blocked, false);
  const flaky = async (url, options) => url.includes('sp-op-court-v3') && url.includes('-ue.')
    ? response(500, 'error') : good(url, options);
  const warning = await inspect(config, { fetcher: flaky, retries: 0, timeoutMs: 100 });
  assert.equal(warning.blocked, false);
  assert.equal(warning.completeRegions, 4);
  const down = async (url, options) => url.includes('-ue.') ? response(500, 'error') : good(url, options);
  const blocked = await inspect(config, { fetcher: down, retries: 0, timeoutMs: 100 });
  assert.equal(blocked.downRegions, 1);
  assert.equal(blocked.blocked, true);
  await assert.rejects(loadManifest('https://test.invalid', async () => response(503, 'error'), 100), /manifesto/);
  console.log('✓ prontidão operacional: CORS, autenticação, retries e limiar regional');
})().catch(error => { console.error(error); process.exitCode = 1; });
