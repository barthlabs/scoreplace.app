'use strict';

const assert = require('node:assert/strict');
const C = require('../functions/historical-athlete-claim-core');
const autoNameKey = require('../functions-autodraw/vendor/manual-name-key-core').nameKey;
const { claimManualParticipant } = require('../functions/registration-claim-core');
const { registrationId } = require('../functions/registration-core');
const { canonicalPairId } = require('../functions/registration-mutations-core');

const manual = (id, name) => ({ registrationId: id, manualParticipantId: id,
  manualDisplayName: name, participantKind: 'manual', status: 'confirmed' });
assert.equal(C.nameKey('  Andréa   Carril '), 'andrea carril');
for (const name of ['  Andréa   Carril ', 'Maria-Paula  Silveira', 'Ana', 'Luísa D\'Ávila']) {
  assert.equal(autoNameKey(name), C.nameKey(name), 'autoDraw e vínculo histórico usam o mesmo índice de nome');
}
assert.equal(C.nameKey('Ana'), '', 'nome incompleto não sugere vínculo');
assert.equal(C.accountPredatesTournament(Date.parse('2026-11-01T12:00:00Z'),
  { startDate: '2026-11-13T08:00:00Z' }), true);
assert.equal(C.accountPredatesTournament(Date.parse('2026-11-14T12:00:00Z'),
  { startDate: '2026-11-13T08:00:00Z' }), false, 'conta criada depois da disputa exige conferência humana');
assert.equal(C.accountPredatesTournament(NaN, { startDate: '2026-11-13T08:00:00Z' }), false);
assert.equal(C.uniqueManual([manual('m1', 'Andréa Carril')], 'Andrea Carril').manualParticipantId, 'm1');
assert.throws(() => C.uniqueManual([manual('m1', 'Ana Silva'), manual('m2', 'ANA  SILVA')], 'Ana Silva'),
  /ambígua/, 'homônimos não são resolvidos por ordem da consulta');
assert.throws(() => C.uniqueManual([manual('m1', 'Ana Silva'),
  { ...manual('m2', 'ANA SILVA'), status: 'withdrawn' }], 'Ana Silva'),
  /ambígua/, 'vaga retirada homônima ainda pode aparecer nos jogos antigos');
assert.throws(() => C.uniqueManual([manual('m1', 'Ana Silva')], 'Ana Souza'), /ambígua/,
  'mesmo primeiro nome não basta');
assert.throws(() => C.assertNoAccountHomonym(
  [{ participantKind:'account', status:'withdrawn' }], [], {}, 'Maria Souza', 'u1'),
  /identidade/, 'conta sem UID não pode ser ignorada');
assert.throws(() => C.assertNoAccountHomonym(
  [{ participantKind:'account', participantUid:'u2', status:'withdrawn' }], [],
  { u2:{ displayName:'Maria Souza' } }, 'Maria Souza', 'u1'),
  /outra conta/, 'conta homônima retirada ainda causa ambiguidade');

const original = { _chave: 'j1', jogo: { id: 'j1',
  p1: 'Andréa Carril / Mariana Pucci', p2: 'Fabrizia Frank / Camila Giannella',
  team1: ['Andréa Carril', 'Mariana Pucci'], team1Uids: [null, null],
  team2: ['Fabrizia Frank', 'Camila Giannella'], team2Uids: [null, null],
  sets: [{ gamesP1: 7, gamesP2: 5 }], winner: 'Andréa Carril / Mariana Pucci' } };
const untouched = JSON.stringify(original);
const plan = C.planMatches([{ id: 'j1', data: original }], 'Andrea Carril', 'uid-a');
assert.equal(plan.length, 1);
assert.deepEqual(plan[0].patch['jogo.team1Uids'], ['uid-a', null]);
assert.deepEqual(plan[0].patch.playerUids, ['uid-a']);
assert.deepEqual(plan[0].patch['jogo.historicalClaimUids'], ['uid-a']);
assert.equal(Object.prototype.hasOwnProperty.call(plan[0].patch, 'jogo'), false,
  'apenas caminhos de UID são escritos; placar e vencedor não entram no update');
assert.equal(JSON.stringify(original), untouched, 'planejamento não altera a partida original');
const mirror = C.planParticipantMirror([{ id:'mold', data:{ _k:'mold', _idx:0,
  item:{ p1ManualId:'old', p1Name:'Maria Souza', p2Uid:'partner', p2Name:'Bia Lima' } } }],
  'tour-old', 'old', 'Maria Souza', 'new-uid');
assert.equal(mirror.oldId, 'mold');
assert.equal(mirror.newId, 'dunew-uid_upartner');
assert.equal(mirror.after.item.p1Uid, 'new-uid');
assert.equal(mirror.after.item.p1ManualId, undefined);
assert.equal(mirror.after.item.p2Uid, 'partner');
assert.throws(() => C.planParticipantMirror([
  { id:'mold', data:{ _k:'mold', _idx:0, item:{ manualParticipantId:'old', displayName:'Maria Souza' } } },
  { id:'unew-uid', data:{ item:{ uid:'new-uid', displayName:'Outra Pessoa' } } },
], 'tour-old', 'old', 'Maria Souza', 'new-uid'), /ocupada/,
'destino físico já ocupado aborta a troca de chave');
assert.throws(() => C.planParticipantMirror([], 'tour-old', 'old', 'Maria Souza', 'new-uid'),
  /espelho da vaga ausente/, 'espelho ausente bloqueia vínculo');
const structuredGame = { _chave:'j2', jogo:{ id:'j2',
  team1:['Maria Souza','Bia Lima'], team2:['Ana Paula','Carla Dias'],
  team1Uids:[null,'partner'], historicalClaimUids:['partner'],
  team1Obj:{ p1Name:'Maria Souza', p1ManualId:'old', p2Name:'Bia Lima', p2Uid:'partner' },
  score1:6, score2:4 }, playerUids:['partner'] };
const structuredBefore = JSON.stringify(structuredGame);
const structuredPatch = C.planMatches([{ id:'j2', data:structuredGame }], 'Maria Souza', 'new-uid')[0].patch;
assert.equal(structuredPatch['jogo.team1Obj.p1Uid'], 'new-uid');
assert.equal(structuredPatch['jogo.team1Obj.p1ManualId'], null);
assert.deepEqual(structuredPatch.playerUids,['new-uid','partner'],
  'vínculo anterior confirmado permanece no índice, sem UID legado desconhecido');
assert.equal(structuredPatch['jogo.score1'], undefined);
assert.equal(JSON.stringify(structuredGame), structuredBefore, 'objeto e resultado não mudam ao planejar');
assert.throws(() => C.planMatches([{ id:'j2', data:{ ...structuredGame,
  jogo:{ ...structuredGame.jogo, team1Obj:{ ...structuredGame.jogo.team1Obj, p1Name:'Outra Pessoa' } } } }],
  'Maria Souza', 'new-uid'), /diverge/, 'objeto estrutural divergente bloqueia vínculo');
const tournamentId = 'tour-old', categoryId = 'cat-1';
const oldId = registrationId('manual:old', categoryId);
const partnerId = registrationId('uid:partner', categoryId);
const oldPairId = canonicalPairId(tournamentId, categoryId, [oldId, partnerId]);
const oldReg = { tournamentId, registrationId: oldId, participantKey: 'manual:old',
  participantKind: 'manual', manualParticipantId: 'old', manualDisplayName: 'Maria Souza',
  categoryId, status: 'confirmed', fixedPairId: oldPairId };
const partnerReg = { tournamentId, registrationId: partnerId, participantKey: 'uid:partner',
  participantKind: 'account', participantUid: 'partner', categoryId, status: 'confirmed', fixedPairId: oldPairId };
const claimed = claimManualParticipant(tournamentId, [oldReg, partnerReg], 'old', 'new-uid');
assert.equal(claimed.creates[0].registrationId, registrationId('uid:new-uid', categoryId));
assert.equal(claimed.updates.find((item) => item.registrationId === oldId).status, 'withdrawn');
assert.equal(claimed.creates[0].fixedPairId,
  canonicalPairId(tournamentId, categoryId, [claimed.creates[0].registrationId, partnerId]));
assert.equal(claimed.updates.find((item) => item.registrationId === partnerId).fixedPairId,
  claimed.creates[0].fixedPairId);
assert.throws(() => C.planMatches([{ id: 'j1', data: { ...original,
  jogo: { ...original.jogo, team1Uids: ['outro-uid', null] } } }], 'Andrea Carril', 'uid-a'),
  /UID legado/, 'não anexa identidade legada sem vínculo confirmado');
assert.throws(() => C.planMatches([{ id: 'j1', data: { ...original,
  jogo: { ...original.jogo, team2Uids: ['outro-uid', null] } } }], 'Andrea Carril', 'uid-a'),
  /UID legado/, 'UID desconhecido do adversário não contamina o índice pessoal');
assert.equal(C.planMatches([{ id:'unrelated', data:{ _chave:'unrelated', jogo:{
  id:'unrelated', team1:['Outra Pessoa'], team1Uids:['uid-legado'],
  team2:['Mais Uma'], team2Uids:[null] } } },
{ id:'j1', data:original }], 'Andrea Carril', 'uid-a').length, 1,
'UID de jogo alheio não impede a reivindicação da atleta');
assert.throws(() => C.planMatches([{ id: 'j1', data: { ...original,
  jogo: { ...original.jogo, team2: ['Andréa Carril', 'Camila Giannella'] } } }], 'Andrea Carril', 'uid-a'),
  /mais de um slot/, 'não escolhe um dos lados de um jogo ambíguo');
assert.throws(() => C.planMatches([{ id: 'j1', data: original }], 'Pessoa Ausente', 'uid-z'),
  /nenhum jogo/, 'não vincula inscrição sem partida correspondente');
const manyGames = Array.from({ length:101 }, (_, index) => ({ id:'match-' + index,
  data:{ _chave:'match-' + index, jogo:{ id:'match-' + index,
    team1:['Maria Souza'], team2:['Ana Paula'], score1:6, score2:1 } } }));
assert.throws(() => C.planMatches(manyGames, 'Maria Souza', 'new-uid'), /grande demais/,
  'mais de cem jogos não gera plano de escrita parcial');

console.log('✅ vínculo histórico: nome completo, homônimos, slots, placar e UID');
