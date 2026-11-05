'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/views/bracket.js', 'utf8');
const start = source.indexOf('window._bracketPostponedOrder = function');
const end = source.indexOf('window._bracketEnsureCourtReleaseListener = function', start);
assert(start > 0 && end > start);
const context = { window: {}, Map, String, Array };
vm.runInNewContext(source.slice(start, end), context);
const ordered = (postponed) => Array.from(context.window._bracketPostponedOrder(
  [{ id: 'j1' }, { id: 'j2' }, { id: 'j3' }], postponed), m => m.id);

assert.deepEqual(ordered([]), ['j1', 'j2', 'j3']);
assert.deepEqual(ordered(['j1']), ['j2', 'j3', 'j1']);
assert.deepEqual(ordered(['j1', 'j2']), ['j3', 'j1', 'j2']);
assert.deepEqual(ordered(['j2', 'j1']), ['j3', 'j2', 'j1']);
assert.deepEqual(ordered(['j1', 'j2', 'j3']), ['j1', 'j2', 'j3']);
assert.deepEqual(ordered(['antigo', 'j1']), ['j2', 'j3', 'j1']);
const selectStart = source.indexOf('window._bracketOperationsSelect = function');
const selectEnd = source.indexOf('\nfunction _bracketReconcileOperationalOrder(', selectStart);
assert(selectStart > end && selectEnd > selectStart);
context.window.ScoreplaceCourtOccupancy = { occupiesCourt:() => false, isFinished:() => false };
context.window.ScoreplaceNextMatch = { knownSide:() => true, firstAvailable:list => list[0] || null };
context.window._collectAllMatches = t => t.matches;
context.window._bracketCourtReleased = () => ({});
context.window._bracketCourtPostponed = () => ['j1'];
context.window._dashboardNextMatchCompare = (a, b) => Date.parse(a.item.m.scheduledAt) - Date.parse(b.item.m.scheduledAt);
context._matchCardTimestamp = value => Date.parse(value);
context.Date = Date;
context.Set = Set;
vm.runInNewContext(source.slice(selectStart, selectEnd), context);
const futureMatches = ['j1', 'j2', 'j3'].map((id, index) => ({ id, p1:'A', p2:'B',
  scheduledAt:new Date(Date.UTC(2026, 10, 13, 12, index * 35)).toISOString() }));
const nextFor = id => context.window._bracketOperationsSelect({ id, courtCount:2, matches:futureMatches }).next.id;
assert.equal(nextFor('sb_future_event'), 'j2');
assert.equal(nextFor('tour_future_event'), 'j2');
const concentratedStart = source.indexOf('window._isConcentratedTournament = function');
const concentratedEnd = source.indexOf('\nwindow._matchCoordsFromId = function', concentratedStart);
assert(concentratedStart > 0 && concentratedEnd > concentratedStart);
vm.runInNewContext(source.slice(concentratedStart, concentratedEnd), context);
const futureSchedule = { days:[{ day:'2026-11-13', startTime:'08:00', endTime:'19:30' }] };
assert.equal(context.window._isConcentratedTournament({ id:'sb_future_event', scheduleWindow:futureSchedule }), true);
assert.equal(context.window._isConcentratedTournament({ id:'tour_future_event', scheduleWindow:futureSchedule }), true);
assert(source.includes("_callCF('endMatchOnCourt', {") && source.includes("action: 'postpone'") &&
  source.includes("sandbox: String(t.id).startsWith('sb_')"),
  'sandbox e torneio real devem chamar a mesma ação com o mesmo payload');
const reloadStart = source.indexOf('window._bracketReloadCourtState = function', start);
const reloadEnd = source.indexOf('window._bracketEnsureCourtReleaseListener = function', reloadStart);
assert(reloadStart > start && reloadEnd === end);
let resolveRead;
let sourceOption;
context.window.FirestoreDB = { db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ({
  get: option => { sourceOption = option; return new Promise(resolve => { resolveRead = resolve; }); }
}) }) }) }) } };
context.Promise = Promise;
const entry = { ready: true, revision: 7, postponed: ['j1'] };
const pending = context.window._bracketReloadCourtState('tour_test', entry);
assert.equal(entry.ready, false, 'segundo clique fica bloqueado até ler a revisão nova');
assert.equal(sourceOption.source, 'server');
resolveRead({ exists: true, data: () => ({ revision: 8, postponed: ['j1', 'j2'] }) });
pending.then(() => {
  assert.equal(entry.ready, true);
  assert.equal(entry.revision, 8);
  assert.deepEqual(Array.from(entry.postponed), ['j1', 'j2']);
  console.log('✓ pular jogo repetidamente usa a revisão confirmada do servidor');
}).catch(error => { console.error(error); process.exitCode = 1; });
