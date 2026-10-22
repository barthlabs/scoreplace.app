'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const H = require('./render-harness');

const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const begin = source.indexOf('function _syncMatchCourtCopies(');
const end = source.indexOf('window._adjustMatchCourtClock = function', begin);
assert.ok(begin > 0 && end > begin, 'handler real localizado');

function card(id) {
  return { id: 'card-' + id, style: { border: '1px solid gray' }, attrs: {},
    setAttribute(name, value) { this.attrs[name] = value; } };
}

async function scenario({ response, matchExtra, route = '#tournaments/sb_tour_1', inBracket = true }) {
  const match = { id: 'm1', court: 'Quadra 4', p1: 'A', p2: 'B', ...matchExtra };
  const tournament = { id: 'sb_tour_1', matches: [match] };
  const first = card('m1'), second = card('m1'), dashboard = card('m1'), neighbor = card('m2');
  const originalOrder = [first, neighbor, second];
  let selector, clockInsertions = 0, tvRefreshes = 0;
  const view = { querySelectorAll(s) { selector = s; return s.startsWith('#inline-bracket-container')
    ? originalOrder : [first, neighbor, second]; } };
  const select = { value: 'Quadra 4' };
  const row = { querySelector(s) { return s === 'select' ? select : null; },
    insertAdjacentHTML() { clockInsertions++; } };
  const button = { disabled: false, textContent: 'OK',
    closest(s) {
      if (s === '.sp-match-operational') return row;
      if (s === '#view-container') return view;
      if (s === '#inline-bracket-container, [data-bracket-general-view]') return inBracket ? {} : null;
      return null;
    } };
  const context = { document: { querySelectorAll: () => [] }, window: {
    location: { hash: route },
    _callCF: () => response instanceof Error ? Promise.reject(response) : Promise.resolve({ data: response }),
    _findTournamentById: () => tournament,
    _collectAllMatches: t => t.matches,
    _spCourtClockHtml: () => '<span>relógio</span>',
    _tvLiveRefresh: () => { tvRefreshes++; }
  }, showNotification() {} };
  vm.runInNewContext(source.slice(begin, end), context);
  await context.window._confirmMatchCourtCall(button, tournament.id, match.id);
  return { match, first, second, dashboard, neighbor, originalOrder, selector,
    clockInsertions, tvRefreshes, button };
}

(async () => {
  const called = await scenario({ response: { ok: true, courtCalledAt: '2026-10-21T18:00:00Z' } });
  assert.equal(called.match.courtCalledAt, '2026-10-21T18:00:00Z');
  assert.equal(called.first.style.border, '3px solid #22c55e');
  assert.equal(called.second.style.border, '3px solid #22c55e');
  assert.equal(called.first.attrs['data-bracket-court'], 'Quadra 4');
  assert.equal(called.second.attrs['data-bracket-court'], 'Quadra 4');
  assert.equal(called.neighbor.style.border, '1px solid gray');
  assert.equal(called.dashboard.style.border, '1px solid gray');
  assert.deepEqual(called.originalOrder.map(x => x.id), ['card-m1', 'card-m2', 'card-m1']);
  assert.equal(called.button.textContent, '✓ OK');
  assert.equal(called.clockInsertions, 1);
  assert.equal(called.tvRefreshes, 1);
  assert.match(called.selector, /data-bracket-general-view/);

  const failed = await scenario({ response: new Error('Quadra ocupada') });
  assert.equal(failed.match.courtCalledAt, undefined);
  assert.equal(failed.first.style.border, '1px solid gray');
  assert.equal(failed.clockInsertions, 0);

  const finished = await scenario({ response: { ok: true, courtCalledAt: '2026-10-21T18:00:00Z' }, matchExtra: { winner: 'A' } });
  assert.equal(finished.first.style.border, '1px solid gray');

  const dashboardOnly = await scenario({ response: { ok: true, courtCalledAt: '2026-10-21T18:00:00Z' }, route: '#dashboard', inBracket: false });
  assert.equal(dashboardOnly.first.style.border, '1px solid gray');
  assert.equal(dashboardOnly.dashboard.style.border, '1px solid gray');

  const standalone = await scenario({ response: { ok: true, courtCalledAt: '2026-10-21T18:00:00Z' }, route: '#bracket/sb_tour_1', inBracket: false });
  assert.equal(standalone.first.style.border, '3px solid #22c55e');
  assert.equal(standalone.second.style.border, '3px solid #22c55e');

  const modelMatch = { id: 'm1' }, model = { matches: [modelMatch] };
  const fromAll = H.window._collectAllMatches(model).find(m => m.id === 'm1');
  assert.equal(fromAll, modelMatch, '_collectAllMatches preserva a referência do jogo');
  fromAll.court = 'Quadra 4';
  fromAll.courtCalledAt = '2026-10-21T18:00:00Z';
  assert.equal(model.matches[0].courtCalledAt, fromAll.courtCalledAt);
  console.log('✓ borda verde após OK na chave, Geral e rota autônoma; dashboard e falha preservadas');
})().catch(error => { console.error(error); process.exitCode = 1; });
