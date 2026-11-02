'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '../js/firebase-db.js'), 'utf8');
const window = {
  _slotUids: (game, side) => side === 'p1' ? game.team1Uids : game.team2Uids,
  _matchWinnerSide: game => game.draw ? 0 : game.winnerUids[0] === game.team1Uids[0] ? 1 : 2,
  _isPartidaEmRajada: () => false,
  _error: () => {}, _warn: () => {}
};
vm.runInNewContext(src, { window, Date, isFinite, console });
const db = window.FirestoreDB;

const game = {
  tournamentId: 'tour', matchId: 'm1', tournamentName: 'Torneio',
  team1Uids: ['ana', 'bia'], team2Uids: ['caio', 'davi'], winnerUids: ['ana', 'bia'],
  scoreP1: 6, scoreP2: 4, sets: [{ gamesP1: 6, gamesP2: 4 }],
  resultAt: '2026-11-01T12:00:00.000Z'
};
const projected = window._spTournamentHistoryRecord(game);
assert.equal(projected.matchId, 't_tour_m1');
assert.equal(projected.matchType, 'tournament');
assert.equal(projected.scoreSummary, '6-4');
assert.equal(projected.winnerTeam, 1);
assert.deepEqual(Array.from(projected.players, p => [p.uid, p.team]),
  [['ana', 1], ['bia', 1], ['caio', 2], ['davi', 2]]);
assert.equal(projected.stats.team1.games, 6);
assert.equal(projected.stats.team2.games, 4);
assert.equal(projected.stats.team1.points, 0, 'não inventa estatística de ponto');
assert.equal(projected.finishedAt, game.resultAt);
const fromSets = window._spTournamentHistoryRecord({ ...game, scoreP1: null, scoreP2: null,
  sets: [{ gamesP1: 7, gamesP2: 6, tiebreak: { p1: 7, p2: 5 } }] });
assert.equal(fromSets.scoreSummary, '7-6(5)');
assert.equal(window._spTournamentHistoryRecord({ ...game, scoreP1: null, scoreP2: null, sets: [] }), null);
assert.equal(window._spTournamentHistoryRecord({ ...game, scoreP1: null, scoreP2: null,
  team1Uids: [], team2Uids: [], sets: [] }), null, 'jogo não disputado não exige identidade');
assert.equal(window._spTournamentHistoryRecord({ ...game, wo: true }), null);
assert.equal(window._spTournamentHistoryRecord({ ...game, team2Uids: [] }), null,
  'sem os dois lados UID, o placar fica no torneio e não vira V/D pessoal');

(async () => {
  const filters = [];
  let queryFailure = null;
  db.db = { collection: name => {
    assert.equal(name, 'users');
    return { doc: uid => {
      assert.equal(uid, 'ana');
      return { collection: sub => {
        assert.equal(sub, 'matchHistory');
        return { where: (field, op, value) => {
          filters.push([field, op, value]);
          return { get: async () => {
            if (queryFailure) throw queryFailure;
            return { forEach: fn => fn({ id: 'casual', data: () => ({ matchType: 'casual', finishedAt: '2026-11-01' }) }) };
          } };
        } };
      } };
    } };
  } };
  assert.equal((await db.loadUserMatchHistory('ana')).length, 1);
  assert.deepEqual(filters, [['matchType', '==', 'casual']]);
  queryFailure = { code: 'permission-denied' };
  assert.equal(await db.loadUserMatchHistory('ana'), null);
  queryFailure = new Error('offline');
  await assert.rejects(db.loadUserMatchHistory('ana'), /offline/);

  const casual = [{ matchId: 'casual', matchType: 'casual' }];
  db.loadMyMatchResults = async uid => {
    assert.equal(uid, 'ana');
    return [game, { ...game, matchId: 'not-played', scoreP1: null, scoreP2: null, sets: [] }];
  };
  db.loadUserMatchHistory = async () => casual;
  const all = await db.loadScoreplaceMatchHistory('ana');
  assert.equal(all.length, 2);
  assert.equal(all[0].matchId, 't_tour_m1');
  assert.equal(all[1], casual[0]);
  db.loadUserMatchHistory = async () => null;
  assert.equal(await db.loadScoreplaceMatchHistory('ana'), null, 'privacidade não vira lista vazia');
  db.loadUserMatchHistory = async () => { throw new Error('offline'); };
  await assert.rejects(db.loadScoreplaceMatchHistory('ana'), /offline/, 'falha não vira histórico parcial');
  console.log('✅ E05: histórico de torneio deriva do jogo físico e falha sem parcial');
})().catch(error => { console.error(error); process.exitCode = 1; });
