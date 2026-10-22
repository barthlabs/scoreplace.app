const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {
  _spCor: x => x,
  PresenceDB: { dayKey: d => d.toISOString().slice(0, 10) },
  _isConcentratedTournament: () => true,
  _collectAllMatches: t => t.matches,
  _venueGeo: { resolverFuso: () => ({ tz: 'America/Sao_Paulo' }) }
};
let fixedNow = Date.parse('2026-10-23T12:00:00Z');
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}
let toggleMore = null;
const box = { innerHTML: '', querySelector: selector => selector === '.sp-upcoming-more' && box.innerHTML.includes('sp-upcoming-more')
  ? { addEventListener: (_, fn) => { toggleMore = fn; } } : null };
const sandbox = { window, document: { getElementById: () => box }, console, Date: FixedDate, Intl, Map, Promise, setTimeout, clearTimeout };
window.window = window;
window.AppStore = { currentUser: { uid: 'me', friends: [] }, tournaments: [] };
window._friendInteractionScore = uid => uid === 'friend22' ? 100 : 0;
window._safeHtml = x => String(x || '');
window._initials = x => String(x || '').slice(0, 2);
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/presence.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/venues.js'), 'utf8'), sandbox);

const matches = [];
for (const day of [22, 23]) {
  for (let pair = 0; pair < 32; pair += 2) {
    const side = n => ({
      fixedPairId: `${day}-pair-${n}`,
      displayName: `Jogador ${day}-${n}-1 / Jogador ${day}-${n}-2`,
      p1Uid: day === 23 && n === 0 ? 'me' : (day === 22 && n === 0 ? 'friend22' : ''),
      p2Uid: day === 23 && n === 0 ? 'partner' : ''
    });
    matches.push({
      id: `${day}-${pair}`,
      scheduleSource: 'organizer', scheduledKind: 'estimate',
      requiredDay: `2026-10-${day}`,
      scheduledAt: `2026-10-${day}T21:00:00Z`,
      team1Obj: side(pair), team2Obj: side(pair + 1)
    });
  }
}
const tournament = { id: 'day-test', name: 'Dois dias', startDate: '2026-10-22T21:00:00Z', matches };
const people22 = window._tournamentOccupancyForDay(tournament, '2026-10-22', '2026-10-22', 'America/Sao_Paulo');
const people23 = window._tournamentOccupancyForDay(tournament, '2026-10-23', '2026-10-23', 'America/Sao_Paulo');
assert.equal(people22.length, 64);
assert.equal(people23.length, 64);
assert.equal(people22.some(p => p.uid === 'me'), false);
const me = people23.find(p => p.uid === 'me');
const partner = people23.find(p => p.uid === 'partner');
assert.equal(me._partnerKey, partner._personKey);
assert.equal(partner._partnerKey, me._personKey);
assert.equal(new Set(people23.map(p => p._personKey)).size, 64);
const rank = people => window._venuesRankDayPeople(people.map(p => ({ p, klass: p.uid === 'me' ? 'me' : 'other' })),
  uid => ({ partner: 1, '23-pair-1': 30, high: 100 }[uid] || 0));
const selected = rank(people23).slice(0, 3);
assert.equal(selected.map(x => x.p.uid || x.p._personKey).join(','), 'me,partner,m:23-pair-1:1');
assert.equal(people23.length - selected.length, 61);
assert.equal(rank(people22)[0].klass, 'other');
window._venuesRenderUpcomingBox('upcoming', [], [tournament], '2026-10-23', 'venue', { maxChips: 3 });
assert(box.innerHTML.includes('ver mais'));
assert(box.innerHTML.includes('+61'));
assert(box.innerHTML.indexOf('Você') < box.innerHTML.indexOf('Jogador 23-0-2'));
assert(box.innerHTML.indexOf('Jogador 23-0-2') < box.innerHTML.indexOf('Jogador 23-1-1'));
assert(!box.innerHTML.includes('Jogador 22-0-1'));
assert.equal(typeof toggleMore, 'function');
toggleMore();
assert(box.innerHTML.includes('ver menos'));
assert(!box.innerHTML.includes('+61'));
assert(box.innerHTML.includes('Jogador 23-31-2'));
fixedNow = Date.parse('2026-10-22T12:00:00Z');
window.AppStore.currentUser.friends = ['friend22'];
window._venuesRenderUpcomingBox('upcoming', [], [tournament], '2026-10-22', 'venue', { maxChips: 3 });
assert(box.innerHTML.includes('+61'));
assert(box.innerHTML.includes('Jogador 22-0-1'));
assert(!box.innerHTML.includes('Você'));
assert(!box.innerHTML.includes('Jogador 23-0-1'));
window._venuesUpcomingExpanded = {};
window._venuesRenderUpcomingBox('upcoming', [], [tournament], '2026-10-23', 'venue', { maxChips: 3 });
assert(box.innerHTML.includes('Você'), 'o foco em amanhã deve usar a agenda de amanhã mesmo ainda sendo hoje');
assert(box.innerHTML.indexOf('Você') < box.innerHTML.indexOf('Jogador 23-0-2'));
assert(box.innerHTML.includes('+61'));

const duplicate = { ...matches[16], id: 'repeat' };
tournament.matches.push(duplicate);
assert.equal(window._tournamentOccupancyForDay(tournament, '2026-10-23', '2026-10-23', 'America/Sao_Paulo').length, 64);

(async () => {
  const summary = { id: 'cache-test', _resumo: true };
  let resolveFirst;
  let reads = 0;
  window._findTournamentById = () => summary;
  window.FirestoreDB = { loadTournamentById: () => { reads++; return new Promise(resolve => { resolveFirst = resolve; }); } };
  const first = window._loadTournamentForOccupancy(summary, 'venue');
  const second = window._loadTournamentForOccupancy(summary, 'venue');
  assert.equal(first, second, 'dashboard e presença compartilham a leitura no mesmo SPA');
  assert.equal(reads, 1);
  const complete = { id: summary.id, matches: [], updatedAt: 1 };
  resolveFirst(complete);
  assert.equal(await first, complete);
  assert.equal(await window._loadTournamentForOccupancy(summary, 'venue'), complete);
  assert.equal(reads, 1);

  let rejectLoad;
  window.FirestoreDB.loadTournamentById = () => { reads++; return new Promise((_, reject) => { rejectLoad = reject; }); };
  const failing = window._loadTournamentForOccupancy({ id: 'failure', _resumo: true }, 'venue');
  rejectLoad(new Error('rede'));
  await assert.rejects(failing, /rede/);
  const retry = window._loadTournamentForOccupancy({ id: 'failure', _resumo: true }, 'venue');
  assert.equal(reads, 3, 'falha permite nova leitura');
  rejectLoad(new Error('rede outra vez'));
  await assert.rejects(retry, /rede outra vez/);

  const live = { id: summary.id, matches: [], updatedAt: 2 };
  window._findTournamentById = () => live;
  assert.equal(await window._loadTournamentForOccupancy(summary, 'venue'), live,
    'atualização viva invalida a fotografia antiga');
  console.log('dashboard-participants-by-day: OK');
})().catch(err => { console.error(err); process.exitCode = 1; });
