'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments.js'), 'utf8');
const start = src.indexOf('function _tournamentAsMs(value)');
const end = src.indexOf('// Entrada genérica da dashboard:', start);
assert(start >= 0 && end > start);
const context = { window: {
  AppStore: { currentUser: { uid: 'me' } },
  _collectAllMatches: t => t.matches,
  _userTeamInMatch: (_t, m) => m.owner === 'me' ? 1 : 0,
  _isByeMatch: m => m.p2 === 'BYE',
  _dashboardWithinTournamentCompare: ({ item: a }, { item: b }) => a.m.round - b.m.round,
  _assignGlobalGameNumbers: t => { t.numbered = true; }
} };
vm.runInNewContext(src.slice(start, end), context);
const target = context.window._nextParticipantTournamentMatchTarget;
const played = (id, round, game, extra = {}) => ({ id, round, _gameNum: game, owner: 'me',
  winner: 'Dupla A', category: 'Fem Ouro', ...extra });
const selected = matches => target({ id: 'torneio', matches });

assert.equal(selected([played('old', 3, 9), played('new', 1, 10)]).matchId, 'new',
  'eliminação de rodada 1 sucede grupo de rodada 3 pelo número global');
assert.equal(selected([
  played('later', 1, 10, { completedAt: { seconds: 200 } }),
  played('earlier', 3, 9, { resultAt: '1970-01-01T00:01:40Z' })
]).matchId, 'later', 'Timestamp Firestore e ISO escolhem conclusão mais recente');
assert.equal(selected([
  played('z', 1, 9, { completedAt: { toMillis: () => 200000 } }),
  played('a', 1, 10, { completedAt: '1970-01-01T00:03:20Z' })
]).matchId, 'a', 'conclusões no mesmo instante desempataram pelo jogo global');

const mixed = [played('numbered', 1, 5), played('unmarked', 3, null), played('dated', 1, null,
  { scheduledAt: '2026-11-09T10:00:00-03:00' })];
assert.equal(selected(mixed).matchId, selected([...mixed].reverse()).matchId,
  'mistura incompleta mantém a ordem determinística');
assert.equal(selected([played('wo', 1, 4, { wo: true }), played('bye', 2, 5, { p2: 'BYE' }),
  played('sitout', 3, 6, { isSitOut: true })]).matchId, 'wo',
  'W.O. concluído conta; bye canônico e folga não contam');
assert.equal(selected([played('other', 9, 100, { owner: 'other' }), played('mine', 1, 1)]).matchId, 'mine');
assert.equal(selected([played('old', 1, 1), { id: 'partial', owner: 'me', round: 2, resultAt: '2026-11-09T10:00:00Z' }]).matchId,
  'partial', 'placar parcial sem winner ainda é jogo pendente');
assert.equal(selected([played('old', 1, 1), { id: 'next', owner: 'me', round: 2 },
  { id: 'first', owner: 'me', round: 1 }]).matchId, 'first',
  'pendente usa a regra original antes do histórico');
assert.equal(selected([played('other', 1, 1, { owner: 'other' })]), null);
assert.equal(selected([played('last', 1, 1)]).tab.category, 'Fem Ouro');
console.log('✓ entrada-ultimo-jogo: histórico pessoal e ordem multifase');
