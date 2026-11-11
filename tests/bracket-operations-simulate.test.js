'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = source.indexOf('window._bracketOperationsSimulate = async function');
const end = source.indexOf('\nfunction _bracketReconcileOperationalOrder(', start);
assert(start > 0 && end > start);
const games = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'].map((id, i) => ({
  id, p1: 'A / B', p2: 'C / D', court: i < 3 ? 'Quadra 1' : 'Quadra 2',
  _gameNum: i + 1, courtCalledAt: i === 0 || i === 3 ? 1 : null,
  winner: null
}));
const tournament = { id:'t1', sport:'beach_tennis', scoring:{ gamesPerSet:6 }, matches:games };
const calls = [];
const simMath = Object.create(Math);
const values = [0.1,0.2,0.8,0.8,0.4,0.6,0.9,0.1,0.3,0.7,0.6,0.4,0.2,0.9];
simMath.random = () => values.shift() ?? 0.5;
const context = { Math:simMath, window: {
  location: { hash:'#tournaments/t1' },
  AppStore: { currentUser:{ uid:'org' }, async commitResultTx(tid, mid, payload) {
    calls.push([tid, mid, payload]);
    const m = games.find(x => x.id === mid);
    m.winner = payload.s1 > payload.s2 ? m.p1 : m.p2;
    const next = games[games.indexOf(m) + 1];
    if (next && next.court === m.court) next.courtCalledAt = 2;
    return true;
  } },
  _findTournamentById: () => tournament,
  _findMatch: (t, id) => t.matches.find(m => m.id === id),
  _isUserOrgOrCoHost: (t, u) => u.uid === 'org',
  _bracketOperationsSelect: t => ({ active:t.matches.filter(m => m.courtCalledAt && !m.winner) }),
  _effectiveScoring: t => t.scoring,
  _scoringUsesSets: () => true
} };
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
(async () => {
  for (const expected of [['a1','b1'],['a2','b2'],['a3','b3']]) {
    const before = calls.length;
    assert.equal(await context.window._bracketOperationsSimulate('t1'), true);
    assert.deepEqual(calls.slice(before).map(c => c[1]), expected);
    assert.equal(context.window._scoreViewportAnchor.fromOperations, true);
    for (const [, , payload] of calls.slice(before)) {
      assert.equal(Math.max(payload.s1, payload.s2), 6);
      assert(Math.min(payload.s1, payload.s2) <= 4);
    }
  }
  assert.equal(calls.length, 6);
  assert(new Set(calls.map(([, , payload]) => Math.min(payload.s1, payload.s2))).size > 1,
    'a simulação varia o placar entre jogos');
  assert.equal(await context.window._bracketOperationsSimulate('t1'), false);
  games.push({ id:'c1', p1:'E / F', p2:'G / H', court:'Quadra 3', courtCalledAt:1 },
    { id:'c2', p1:'E / G', p2:'F / H', court:'Quadra 3', courtCalledAt:1 });
  const beforeDuplicate = calls.length;
  assert.equal(await context.window._bracketOperationsSimulate('t1'), true);
  assert.deepEqual(calls.slice(beforeDuplicate).map(c => c[1]), ['c1'],
    'mesmo se dois jogos aparecerem na mesma quadra, só um entra na leva');
  context.window.AppStore.currentUser = { uid:'other' };
  assert.equal(await context.window._bracketOperationsSimulate('t1'), false);
  console.log('Simular registra só a leva atual, avança 3 jogos por quadra e exige organizador.');
})().catch(error => { console.error(error); process.exitCode = 1; });
