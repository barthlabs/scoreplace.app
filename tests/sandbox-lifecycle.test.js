'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const client = fs.readFileSync('js/views/participants.js', 'utf8');
const sandboxCreator = fs.readFileSync('functions/index.js', 'utf8');
assert(sandboxCreator.includes('const sbDoc = Object.assign({}, cfg, envelope);'),
  'a cópia preserva creatorUid e adminUids do original');

const slice = (start, end) => {
  const a = server.indexOf(start), b = server.indexOf(end, a);
  assert(a >= 0 && b > a, `trecho ausente: ${start}`);
  return server.slice(a, b);
};
const HttpsError = class extends Error {
  constructor(code, message) { super(message); this.code = code; }
};
const docs = new Map(), writes = [];
let reads = [];
const ref = path => ({ path });
const db = {
  collection: name => ({ doc: id => ref(`${name}/${id}`) }),
  runTransaction: async fn => {
    let wrote = false;
    return fn({
      get: async target => {
        assert(!wrote, 'transação não pode ler após escrever');
        reads.push(target.path);
        return { exists:docs.has(target.path), data:() => structuredClone(docs.get(target.path)) };
      },
      set: (target, data) => {
        wrote = true;
        writes.push(target.path);
        docs.set(target.path, structuredClone(data));
      }
    });
  }
};
class TestDate extends Date {
  constructor(value) { super(value === undefined ? '2026-10-20T18:00:00.000Z' : value); }
  static now() { return Date.parse('2026-10-20T18:00:00.000Z'); }
}
const context = {
  exports:{}, onCall:fn => fn, HttpsError, db, Date:TestDate, Intl,
  _leTorneio:async (tx, target) => {
    if (target.path.startsWith('sandboxes/')) {
      assert(reads.includes(target.path) && reads.includes('tournaments/tour_evento'),
        'dono e original devem ser validados antes da leitura do sandbox');
    }
    const snapshot = await tx.get(target);
    return snapshot.exists ? snapshot.data() : null;
  },
  _antesDoMotor:() => ({}),
  _gravaTorneio:(tx, target, tournament) => {
    tx.set(target, tournament);
    return { clean:tournament };
  },
  _drawFail:(code, message) => new HttpsError(code, message)
};
vm.runInNewContext(slice('function _isTournamentAdmin(', '/* Concluir o sorteio'), context);
vm.runInNewContext(slice('async function _assertSandboxDrawOwner(', 'function _scheduleLocalDay('), context);
vm.runInNewContext(slice('exports.startTournament = onCall(', 'exports.setTeamTieDrawOrder ='), context);
vm.runInNewContext(slice('exports.resetTournamentCheckIn = onCall(', 'exports.setDefaultTournamentScoring ='), context);
const start = context.exports.startTournament;
const reset = context.exports.resetTournamentCheckIn;
const request = (id, sandbox, uid = 'cohost') => ({ auth:{ uid }, data:{ tournamentId:id, sandbox } });
const original = { id:'tour_evento', creatorUid:'owner', adminUids:[],
  coHosts:[{ uid:'cohost', status:'active' }], startDate:'2026-10-22T18:00',
  checkedIn:{ A:1 }, absent:{ B:1 }, checkedInConfirmed:{ A:1 } };
docs.set('tournaments/tour_evento', structuredClone(original));
docs.set('sandboxes/sb_evento', Object.assign({}, structuredClone(original), {
  id:'sb_evento', isSandbox:true, sandboxOf:'tour_evento', sandboxOwnerUid:'cohost',
  sbState:'ready', notificationsMuted:true
}));

(async () => {
  reads = [];
  const started = await start(request('sb_evento', true));
  assert.equal(started.changed, true);
  assert.equal(docs.get('sandboxes/sb_evento').startDate, '2026-10-22T18:00');
  assert.equal(docs.get('sandboxes/sb_evento').tournamentStarted, TestDate.now(),
    'co-host consegue ensaiar antes da data do evento');
  assert.deepEqual(writes, ['sandboxes/sb_evento']);
  assert.equal(docs.get('tournaments/tour_evento').tournamentStarted, undefined);
  assert.equal((await start(request('sb_evento', true))).changed, false, 'início idempotente');
  assert.deepEqual(writes, ['sandboxes/sb_evento']);

  reads = [];
  assert.equal((await reset(request('sb_evento', true))).changed, true);
  assert.deepEqual(docs.get('sandboxes/sb_evento').checkedIn, {});
  assert.deepEqual(docs.get('sandboxes/sb_evento').absent, {});
  assert.deepEqual(docs.get('sandboxes/sb_evento').checkedInConfirmed, {});
  assert.deepEqual(writes, ['sandboxes/sb_evento', 'sandboxes/sb_evento']);
  assert.deepEqual(docs.get('tournaments/tour_evento').checkedIn, { A:1 });
  assert.equal((await reset(request('sb_evento', true))).changed, false, 'reset idempotente');

  for (const action of [start, reset]) {
    const before = writes.length;
    await assert.rejects(action({ auth:{ uid:'cohost' }, data:{ tournamentId:'sb_evento' } }),
      e => e.code === 'invalid-argument', 'sandbox exige flag explícito');
    await assert.rejects(action(request('sb_evento', false)), e => e.code === 'invalid-argument');
    await assert.rejects(action(request('tour_evento', true)), e => e.code === 'invalid-argument');
    await assert.rejects(action(request('sb_evento', true, 'outsider')), e => e.code === 'not-found');
    docs.get('sandboxes/sb_evento').sbState = 'creating';
    await assert.rejects(action(request('sb_evento', true)), e => e.code === 'not-found');
    docs.get('sandboxes/sb_evento').sbState = 'ready';
    assert.equal(writes.length, before, 'falha de autorização não grava');
  }

  assert.equal((await start(request('tour_evento', false, 'owner'))).changed, true);
  assert.equal((await reset(request('tour_evento', false, 'owner'))).changed, true);
  assert.deepEqual(writes.slice(-2), ['tournaments/tour_evento', 'tournaments/tour_evento']);
  await assert.rejects(start(request('tour_evento', false, 'cohost')),
    e => e.code === 'permission-denied', 'torneio real mantém checagem de admin');

  const startClient = client.slice(client.indexOf('window._startTournament = function'), client.indexOf('window._setCheckInFilter', client.indexOf('window._startTournament = function')));
  const resetClient = client.slice(client.indexOf('window._resetCheckIn = function'), client.indexOf('// ═════════', client.indexOf('window._resetCheckIn = function')));
  assert(startClient.includes("sandbox: String(tId).startsWith('sb_')"));
  assert(resetClient.includes("sandbox: String(tId).startsWith('sb_')"));
  console.log('✓ ciclo sandbox: início futuro e reset isolados, co-host autorizado, produção preservada');
})().catch(error => { console.error(error); process.exitCode = 1; });
