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
assert.deepEqual(Array.from(context.window._bracketPostponedOrder(
  [{ id: 'j19' }, { id: 'j20' }, { id: 'j22' }], ['j19'], ['j19']), m => m.id),
['j19', 'j20', 'j22'], 'após chamar outro jogo, o pulado volta antes do seguinte');
assert.deepEqual(Array.from(context.window._bracketPostponedOrder(
  [{ id: 'j19' }, { id: 'j20' }, { id: 'j22' }], ['j19'], []), m => m.id),
['j20', 'j22', 'j19'], 'pular novamente adia o mesmo jogo até a próxima chamada');
const selectStart = source.indexOf('window._bracketOperationsSelect = function');
const selectEnd = source.indexOf('\nfunction _bracketReconcileOperationalOrder(', selectStart);
assert(selectStart > end && selectEnd > selectStart);
context.window.ScoreplaceCourtOccupancy = { occupiesCourt:() => false, isFinished:() => false };
context.window.ScoreplaceNextMatch = { knownSide:() => true, firstAvailable:list => list[0] || null };
context.window._collectAllMatches = t => t.matches;
context.window._bracketCourtReleased = () => ({});
context.window._bracketCourtPostponed = () => ['j1'];
context.window._bracketCourtPostponedReady = () => [];
context.window._dashboardNextMatchCompare = (a, b) => Date.parse(a.item.m.scheduledAt) - Date.parse(b.item.m.scheduledAt);
context._matchCardTimestamp = value => Date.parse(value);
context._bracketOperationsGroup = () => null;
context.Date = Date;
context.Set = Set;
vm.runInNewContext(source.slice(selectStart, selectEnd), context);
const futureMatches = ['j1', 'j2', 'j3'].map((id, index) => ({ id, p1:'A', p2:'B',
  scheduledAt:new Date(Date.UTC(2026, 10, 13, 12, index * 35)).toISOString() }));
const nextFor = id => context.window._bracketOperationsSelect({ id, courtCount:2, matches:futureMatches }).next.id;
assert.equal(nextFor('sb_future_event'), 'j2');
assert.equal(nextFor('tour_future_event'), 'j2');
const groupStart = source.indexOf('function _bracketOperationsGroup(');
const groupEnd = source.indexOf('\nfunction _bracketOperationsNavHtml(', groupStart);
assert(groupStart > 0 && groupEnd > groupStart);
context.window._bracketMonarchGroupLabel = (_, group) => group.name;
vm.runInNewContext(source.slice(groupStart, groupEnd), context);
const series = [19, 20, 21, 22].map((number, index) => ({
  id: 'j' + number, _gameNum: number, p1: 'A / B', p2: 'C / D',
  isMonarch: index < 3, category: 'Fem Diamante', round: 1,
  monarchGroup: index < 3 ? 6 : 7, phaseIndex: 0,
  scheduledAt: new Date(Date.UTC(2026, 10, 13, 12, index * 35)).toISOString()
}));
const event = { id: 'tour_series', courtCount: 2, scheduleWindow: { days: [{ day: '2026-11-13' }] }, matches: series };
context.window._bracketCourtPostponed = () => ['j19'];
context.window._bracketCourtPostponedReady = () => [];
assert.equal(context.window._bracketOperationsSelect(event).next.id, 'j22',
  'pular o primeiro da série não oferece o segundo nem o terceiro');
context.window._bracketCourtPostponedReady = () => ['j19'];
assert.equal(context.window._bracketOperationsSelect(event).next.id, 'j19',
  'depois de outra chamada, o primeiro da série retorna');
context.window._bracketCourtPostponedReady = () => [];
assert.equal(context.window._bracketOperationsSelect(event).next.id, 'j22',
  'pular outra vez mantém o mesmo primeiro jogo adiado');
const activeDiamond = Array.from({ length: 8 }, (_, index) => ({
  id: 'diamond-' + index, category:'Fem Diamante', p1:'Diamante A' + index, p2:'Diamante B' + index,
  court:'Quadra ' + (index + 1), courtCalledAt:'2026-11-13T11:00:00.000Z',
  scheduledAt:'2026-11-13T11:00:00.000Z'
}));
const firstGold = { id:'gold-1', category:'Fem Ouro', p1:'Ouro A', p2:'Ouro B',
  scheduledAt:'2026-11-13T12:40:00.000Z' };
context.window.ScoreplaceCourtOccupancy = { occupiesCourt:m => !!m.courtCalledAt, isFinished:() => false };
context.window.ScoreplacePhaseCallOrder = { allowed:(_, __, m) => m.category === 'Fem Diamante' };
context.window._bracketCourtPostponed = () => [];
context.window._bracketCourtPostponedReady = () => [];
const fullCourts = context.window._bracketOperationsSelect({ id:'tour_full_courts', courtCount:8,
  matches:[...activeDiamond, firstGold] });
assert.equal(fullCourts.active.length, 8);
assert.equal(fullCourts.next.id, 'gold-1', 'mostra o primeiro Ouro mesmo com todas as quadras ocupadas');
assert.equal(fullCourts.nextCallable, false, 'prévia não antecipa a chamada da fase seguinte');
const withTie = { id:'tour_full_courts', courtCount:8, matches:[...activeDiamond, firstGold],
  phaseTieDecisions:{ '0':{ 'group-0:1:2':{ choice:'play', status:'pending', groupName:'Fem Diamante · Grupo A1',
    matches:[{ id:'tie-a', displayGameNumber:'3A', p1:{name:'Ana'}, p2:{name:'Bia'} }] } } } };
const nextTie = context.window._bracketOperationsSelect(withTie);
assert.equal(nextTie.next.id, 'tie-a', 'desempate pendente precede a próxima partida regular');
assert.equal(nextTie.next.isTieBreak, true);
assert.equal(nextTie.next.category, 'Fem Diamante · Grupo A1',
  'metadado do grupo permanece na fila mesmo com a designação curta no card');
assert.equal(nextTie.tieCanPostpone, false, 'sem outro jogo chamável, a última simples não pode ser pulada');
const laterDiamond = { id:'diamond-later', category:'Fem Diamante', p1:'Outra A', p2:'Outra B',
  phaseIndex:0, scheduledAt:'2026-11-13T13:00:00.000Z' };
withTie.matches.push(laterDiamond);
assert.equal(context.window._bracketOperationsSelect(withTie).tieCanPostpone, true,
  'com outro jogo da fase, o desempate oferece Pular jogo');
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].postponedAt = '2026-11-13T12:02:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, laterDiamond.id,
  'pular a simples deixa o próximo jogo classificatório ser chamado');
laterDiamond.courtCalledAt = '2026-11-13T13:00:00Z';
assert.equal(context.window._bracketOperationsSelect(withTie).next.id, 'tie-a',
  'sem outro jogo chamável, a simples volta antes da fase seguinte');
assert.equal(context.window._bracketOperationsSelect(withTie).tieCanPostpone, false,
  'na volta final não existe mais Pular jogo');
delete withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].postponedAt;
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].court = 'Quadra 8';
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].courtCalledAt = '2026-11-13T12:00:00Z';
assert(context.window._bracketOperationsSelect(withTie).active.some(m => m.id === 'tie-a'),
  'desempate chamado aparece entre os jogos em quadra');
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].sets = [{ p1:5, p2:3 }];
withTie.phaseTieDecisions['0']['group-0:1:2'].matches[0].winnerKey = 'name:Ana';
assert(!context.window._bracketOperationsSelect(withTie).active.some(m => m.id === 'tie-a'),
  'resultado da simples, gravado com winnerKey, retira o card da faixa operacional');
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
resolveRead({ exists: true, data: () => ({ revision: 8, postponed: ['j2'], postponedReady: ['j1'] }) });
pending.then(() => {
  assert.equal(entry.ready, true);
  assert.equal(entry.revision, 8);
  assert.deepEqual(Array.from(entry.postponed), ['j2']);
  assert.deepEqual(Array.from(entry.postponedReady), ['j1']);
  console.log('✓ pular jogo repetidamente usa a revisão confirmada do servidor');
}).catch(error => { console.error(error); process.exitCode = 1; });
