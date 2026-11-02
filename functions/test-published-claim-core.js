'use strict';
const assert = require('node:assert/strict');
const { plan } = require('./published-claim-core');
const split = require('./vendor/tournament-split-core');

const old = 'manual-1', pair = 'pair-old', next = 'pair-new', uid = 'account-1';
const item = { fixedPair: true, fixedPairId: pair, p1ManualId: old, p1Name: 'Maria Santos', p2Uid: 'account-2', p2Name: 'Joana Silva' };
const participant = { id: split.chaveDoInscrito(item), data: { _idx: 0, _k: split.chaveDoInscrito(item), item } };
const game = (id, side = 1) => ({ id, data: { _chave: id, _loc: { tipo: 'matches', mi: Number(id.slice(1)) }, _phaseIndex: 1,
  jogo: { id, phaseIndex: 1, scheduledAt: '2026-10-22T18:00:00Z', court: '7', team1Obj: side === 1 ? item : { p1Uid: 'a', p2Uid: 'b' },
    team2Obj: side === 2 ? item : { p1Uid: 'c', p2Uid: 'd' }, team1Uids: side === 1 ? ['account-2'] : ['a', 'b'],
    team2Uids: side === 2 ? ['account-2'] : ['c', 'd'] }, playerUids: ['account-2'] } });
const inputs = [participant], games = [game('m1'), game('m2', 2)];
const output = plan(old, pair, next, uid, inputs, games);
assert.equal(output.participants.length, 1);
assert.notEqual(output.participants[0].newId, participant.id);
assert.equal(output.participants[0].data.item.p1Uid, uid);
assert.equal(output.participants[0].data.item.p1ManualId, undefined);
assert.equal(output.matches.length, 2);
for (const m of output.matches) {
  const original = games.find((g) => g.id === m.id).data.jogo;
  assert.equal(m.data.jogo.id, original.id);
  assert.equal(m.data.jogo.scheduledAt, original.scheduledAt);
  assert.equal(m.data.jogo.court, original.court);
  assert.equal(m.data._phaseIndex, 1, 'vínculo de vaga preserva índice de leitura do envelope');
  assert.equal(split.faseIndexavel(m.data.jogo, m.data._loc), m.data._phaseIndex);
  assert.equal(m.data.jogo.team1Obj.p1Name, original.team1Obj.p1Name);
  assert.equal(m.data.jogo.team2Obj.p1Name, original.team2Obj.p1Name);
  assert(m.data.playerUids.includes(uid));
  assert.equal('result' in m, false, 'vínculo usa apenas jogos físicos');
}
assert.equal(games[0].data.jogo.team1Obj.p1ManualId, old, 'input remains immutable');
assert.throws(() => plan(old, pair, next, uid, inputs, [{ ...games[0], data: { ...games[0].data,
  jogo: { ...games[0].data.jogo, sets: [{ home: 1, away: 0 }] } } }]), /jogo iniciado/);
assert.throws(() => plan(old, pair, next, uid, inputs, [{ ...games[0], data: { ...games[0].data,
  jogo: { ...games[0].data.jogo, score: '1-0' } } }]), /jogo iniciado/);
assert.throws(() => plan(old, pair, next, uid, inputs, [{ ...games[0], data: { ...games[0].data,
  jogo: { ...games[0].data.jogo, totalGamesP1: 1 } } }]), /jogo iniciado/);
assert.throws(() => plan(old, pair, next, uid, inputs, [{ ...games[0], data: { ...games[0].data,
  jogo: { ...games[0].data.jogo, pendingResult: { score: '6-2' } } } }]), /jogo iniciado/);
assert.throws(() => plan(old, pair, next, uid, inputs, [{ ...games[0], data: { ...games[0].data,
  jogo: { ...games[0].data.jogo, wo: true } } }]), /jogo iniciado/);
assert.throws(() => plan(old, pair, next, uid, inputs.concat(inputs), games), /ambíguo/);
assert.throws(() => plan(old, pair, next, uid, inputs, []), /não encontrados/);
const orphan = { id: 'm3', data: { jogo: { id: 'm3', team1Obj: { p1Uid: 'x' },
  team2Obj: { p1Uid: 'y' }, roster: { manualParticipantId: old } } } };
assert.throws(() => plan(old, pair, next, uid, inputs, games.concat(orphan)), /referência antiga restante/);
const oversized = Array.from({ length: 101 }, (_, i) => game('m' + (i + 10)));
assert.throws(() => plan(old, pair, next, uid, inputs, oversized), /grande demais/);
assert.equal(oversized[0].data.jogo.team1Obj.p1ManualId, old, 'limit failure made no mutation');
const noId = game('m0'); delete noId.data.jogo.id;
assert.equal(plan(old, pair, next, uid, inputs, [noId]).matches[0].id, 'm0');
const unwrapped = { id: 'm4', data: { ...game('m4').data.jogo } };
assert(plan(old, pair, next, uid, inputs, [unwrapped]).matches[0].data.playerUids.includes(uid));
console.log('published-claim-core: ok');
