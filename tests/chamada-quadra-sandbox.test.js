'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const client = fs.readFileSync('js/views/bracket.js', 'utf8');
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = server.indexOf("exports.assignMatchCourt = onCall({ invoker: 'public' }");
const end = server.indexOf('// ─── Atribuições da análise', start);
assert(start >= 0 && end > start);
let nowIso = '2026-10-20T18:00:00.000Z';
class TestDate extends Date {
  constructor(value) { super(value === undefined ? nowIso : value); }
  static now() { return Date.parse(nowIso); }
}
const HttpsError = class extends Error { constructor(code, message) { super(message); this.code = code; } };
const paths = [], saved = [];
let tournament, ownerProfile = null;
const context = {
  exports: {}, onCall: (_options, callback) => callback, HttpsError,
  db: {
    collection: collection => ({ doc: id => { const ref = { path: collection + '/' + id }; paths.push(ref.path); return ref; } }),
    runTransaction: async fn => fn({ get: async ref => ref.path.startsWith('users/')
      ? { exists: !!ownerProfile, data: () => ownerProfile }
      : { exists: true, ref } })
  },
  drawWindow: {
    _findMatch: (t, id) => t.matches.find(m => m.id === id),
    _collectAllMatches: t => t.matches,
    _matchHasRealPlay: () => false
  },
  _assertSandboxDrawOwner: async () => {},
  _leTorneio: async () => tournament,
  _isTournamentAdmin: () => true,
  _antesDoMotor: () => ({}),
  _gravaTorneio: (_tx, _ref, t) => { saved.push(JSON.stringify(t.matches)); return { clean: {} }; },
  _drawFail: (code, message) => new HttpsError(code, message),
  _courtOccupancy: require('../js/domain/court-occupancy.js'),
  _matchTiming: require('../js/domain/match-timing.js'),
  _agenda: require('../functions-autodraw/agenda-core.js'),
  Date: TestDate, Intl, Number, String, Array, Set, console
};
const helperStart = server.indexOf('async function _fusoDoEvento(');
const helperEnd = server.indexOf('/* ── L6.R1', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart);
vm.runInNewContext(server.slice(helperStart, helperEnd), context);
vm.runInNewContext(server.slice(start, end), context);
const callable = context.exports.assignMatchCourt;
const request = (id, matchId, court, confirmCall = false) => ({ auth: { uid: 'owner' }, data: {
  tournamentId: id, sandbox: id.startsWith('sb_'), matchId, court, confirmCall
} });
const game = (id, court, scheduledAt = '2026-10-22T21:00:00.000Z') => ({ id, court, scheduledAt });

(async () => {
  const browser = { window: { _callCF: async (_name, data) => ({ data: { ok: true, ...data } }) } };
  const clientStart = client.indexOf('window._assignMatchCourt = function');
  const clientEnd = client.indexOf('window._spFormatElapsed = function', clientStart);
  assert(clientStart >= 0 && clientEnd > clientStart);
  vm.runInNewContext(client.slice(clientStart, clientEnd), browser);
  assert.equal((await browser.window._assignMatchCourt('sb_test', 'j1', 'Quadra 4')).sandbox, true);
  assert.equal((await browser.window._assignMatchCourt('tour_test', 'j1', 'Quadra 4')).sandbox, false);

  tournament = { timeZone: 'America/Sao_Paulo', callTime: 5, courtNames: ['Quadra 4', 'Quadra 5'], matches: [game('j1', 'Quadra 4')] };
  await callable(request('sb_test', 'j1', 'Quadra 4', true));
  assert.equal(paths.at(-1), 'sandboxes/sb_test');
  assert.ok(tournament.matches[0].courtCalledAt, 'sandbox pode simular antes do evento');
  tournament.matches[0] = game('j1', 'Quadra 4');
  const savesBeforeEarlyCall = saved.length;
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /programado/.test(e.message));
  assert.equal(saved.length, savesBeforeEarlyCall, 'recusa antecipada não grava');
  assert.equal(paths.at(-1), 'tournaments/tour_test');
  const withZone = tournament.timeZone;
  delete tournament.timeZone;
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /fuso/.test(e.message));
  tournament.venueCity = 'São Paulo';
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /programado/.test(e.message), 'fuso do local autoriza a regra de dia');
  delete tournament.venueCity;
  tournament.creatorUid = 'owner';
  ownerProfile = { city: 'São Paulo' };
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /programado/.test(e.message), 'fuso do perfil do dono autoriza a regra de dia');
  ownerProfile = null;
  delete tournament.creatorUid;
  tournament.timeZone = withZone;
  await assert.rejects(callable({ auth: { uid: 'owner' }, data: {
    tournamentId: 'sb_test', sandbox: false, matchId: 'j1', court: 'Quadra 4'
  } }), e => e.code === 'not-found');

  nowIso = '2026-10-22T02:59:59.000Z';
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition');
  nowIso = '2026-10-22T03:00:00.000Z';
  await callable(request('tour_test', 'j1', 'Quadra 4', true));
  assert.ok(tournament.matches[0].courtCalledAt, 'chamada começa no dia local correto');

  tournament.matches.push(game('j2', 'Quadra 5', '2026-10-22T22:00:00.000Z'));
  const beforeOccupied = saved.length;
  await assert.rejects(callable(request('tour_test', 'j2', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /Quadra ocupada/.test(e.message));
  assert.equal(saved.length, beforeOccupied, 'quadra ocupada não grava nem desloca jogo');
  tournament.matches[0].resultAt = nowIso;
  tournament.matches[0].winner = 'p1';
  await callable(request('tour_test', 'j2', 'Quadra 4', true));
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'resultado libera a quadra');

  tournament.matches = [game('w1', 'Quadra 4'), game('w2', 'Quadra 5')];
  tournament.matches[0].courtCalledAt = nowIso;
  tournament.matches[0].wo = true;
  await callable(request('tour_test', 'w2', 'Quadra 4', true));
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'W.O. libera a quadra');

  tournament.matches = [game('a', 'Quadra 4'), game('b', 'Quadra 5')];
  tournament.matches[0].courtCalledAt = nowIso;
  await callable(request('tour_test', 'a', 'Quadra 5'));
  assert.equal(tournament.matches[0].court, 'Quadra 5');
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'troca automática não vê o próprio jogo como ocupante');
  console.log('✓ sandbox isolado; dia local, ocupação e troca de quadra validados na callable real');
})().catch(error => { console.error(error); process.exitCode = 1; });
