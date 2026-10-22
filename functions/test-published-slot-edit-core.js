'use strict';
const assert = require('node:assert/strict');
const editCore = require('./edit-canonical-slot-core');
const published = require('./published-slot-edit-core');
const split = require('./vendor/tournament-split-core');
const { registrationId } = require('./registration-core');
const { canonicalPairId } = require('./registration-mutations-core');

const id = 'tour-test', categoryId = 'fem';
const sourceId = registrationId('manual:manual-old', categoryId);
const partnerId = registrationId('uid:partner-uid', categoryId);
const oldPairId = canonicalPairId(id, categoryId, [sourceId, partnerId]);
const source = { registrationId: sourceId, participantKey: 'manual:manual-old', tournamentId: id, categoryId,
  participantKind: 'manual', manualParticipantId: 'manual-old', manualDisplayName: 'Laura',
  participantUid: null, fixedPairId: oldPairId, status: 'confirmed' };
const partner = { registrationId: partnerId, participantKey: 'uid:partner-uid', tournamentId: id, categoryId,
  participantKind: 'account', participantUid: 'partner-uid', fixedPairId: oldPairId, status: 'confirmed' };
const edit = editCore.plan(id, [source, partner], { manualParticipantId: 'manual-old' },
  categoryId, 'Laura', 'Marilia', null, 'new-uid');
const side = { fixedPair: true, fixedPairId: oldPairId, categoryId,
  p1ManualId: 'manual-old', p1Name: 'Laura', p2Uid: 'partner-uid',
  name: 'Laura / Parceira', displayName: 'Laura / Parceira' };
const oldId = split.chaveDoInscrito(side);
const ref = (key) => ({ id: key, parent: { doc: (name) => ({ id: name }) } });
const participants = [{ ref: ref(oldId), data: { _k: oldId, _idx: 7, item: side } }];
const game = { id: 'game-1', team1Obj: side, team2Obj: { p1Uid: 'other' },
  team1Uids: ['partner-uid'], team2Uids: ['other'], p1: 'Laura / Parceira',
  p2: 'Outra dupla', court: 'Quadra 4', scheduledAt: '2026-10-22T18:00:00Z',
  scoreP1: 0, scoreP2: 0, winner: null };
const matches = [{ ref: ref('game-1'), data: { _chave: 'game-1', _loc: { mi: 1 },
  jogo: game, playerUids: ['partner-uid', 'other'] } }];
const results = [{ ref: ref('game-1'), data: { matchId: 'game-1', p1: game.p1,
  p2: game.p2, playerUids: ['partner-uid', 'other'], scoreP1: 0, scoreP2: 0,
  winner: null, updatedAt: 123 } }];
const output = published.plan(edit, participants, matches, results);
assert.notEqual(output.participant.newId, oldId);
assert.equal(output.participant.data.item.p1Uid, 'new-uid');
assert.equal(output.participant.data.item.p1ManualId, undefined);
assert.equal(output.participant.data.item.name, 'Marilia / Parceira');
assert.equal(output.matches[0].data.jogo.p1, 'Marilia / Parceira');
assert.equal(output.matches[0].data.jogo.team1Obj.name, 'Marilia / Parceira');
assert.deepEqual(output.matches[0].data.jogo.team1Uids, ['new-uid', 'partner-uid']);
assert.deepEqual(output.matches[0].data.playerUids, ['new-uid', 'partner-uid', 'other']);
assert.equal(output.matches[0].data.jogo.scheduledAt, game.scheduledAt);
assert.equal(output.matches[0].data.jogo.court, game.court);
assert.equal(output.results[0].data.p1, 'Marilia / Parceira');
assert.equal(output.results[0].data.scoreP1, 0);
assert.equal(output.results[0].data.updatedAt, 123);
assert.equal(game.team1Obj.p1ManualId, 'manual-old', 'plano não modifica leitura');
assert.throws(() => published.plan(edit, participants,
  [{ ...matches[0], data: { ...matches[0].data, jogo: { ...game, startedAt: 123 } } }], results), /iniciado/);
assert.throws(() => published.plan(edit, participants, matches,
  [{ ...results[0], data: { ...results[0].data, scoreP1: 6 } }]), /placar/);
assert.throws(() => published.plan(edit, participants,
  [{ ...matches[0], data: { ...matches[0].data, jogo: { ...game, liveScored: true } } }], results), /iniciado/);
assert.throws(() => published.plan(edit, participants,
  [{ ...matches[0], data: { ...matches[0].data, jogo: { ...game, p1: 'Mariana / Parceira' } } }], results), /ambíguo/);
assert.throws(() => published.plan(edit, participants,
  [{ ...matches[0], data: { ...matches[0].data, jogo: { ...game, p1: undefined } } }], results), /ausente/);
assert.throws(() => published.plan(edit, participants.concat({ ref: ref(output.participant.newId), data: {} }), matches, results), /espelho/);
console.log('published-slot-edit-core: ok');
