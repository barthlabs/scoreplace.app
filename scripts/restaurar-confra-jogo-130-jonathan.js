#!/usr/bin/env node
'use strict';

/*
 * Restaura o participante histórico do jogo 130 do Confra após uma substituição
 * de W.O. ter propagado indevidamente para um jogo já encerrado. O alvo e o
 * estado anterior são conferidos contra a auditoria do placar. Nunca altera o
 * jogo futuro 171, no qual Erika é a substituta válida.
 *
 * Uso:
 *   node scripts/restaurar-confra-jogo-130-jonathan.js
 *   node scripts/restaurar-confra-jogo-130-jonathan.js --apply
 */

const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const APPLY = process.argv.includes('--apply');
const TID = 'tour_1780009816637';
const GAME_130 = 'ph-tour_1780009816637-1-silver-VC-R1-P7';
const GAME_171 = 'ph-tour_1780009816637-1-silver-VC-R2-P15';
const JONATHAN_UID = 'EJH8HsZGs6eRrm8s8XIAjzcEbVq1';
const ERIKA_UID = 'gHg0YJWGVzMILKpX5n0raJ0B4EV2';
const MARINA_UID = 'B9fsorSZ62Tn1auED6bXDqZBaoh1';
const ORIGINAL_P1 = 'Jonathan hall / Marina Cegal';
const WRONG_P1 = 'Erika Lopes / Marina Cegal';

function fail(message) { throw new Error('ABORTADO: ' + message); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isExpectedCompletedGame(match) {
  return match && Number(match._gameNum) === 130 && match.p1 === WRONG_P1 &&
    match.p2 === 'Nathalie white iaria / Sonia Leite Pinto' &&
    match.scoreP1 === 0 && match.scoreP2 === 2 &&
    Array.isArray(match.sets) && match.sets.length === 2 &&
    match.winner === 'Nathalie white iaria / Sonia Leite Pinto' &&
    Array.isArray(match.team1Uids) && match.team1Uids[0] === ERIKA_UID && match.team1Uids[1] === MARINA_UID;
}
function isExpectedFutureGame(match) {
  return match && Number(match._gameNum) === 171 && match.winner == null &&
    match.p2 === WRONG_P1 && Array.isArray(match.team2Uids) &&
    match.team2Uids[0] === ERIKA_UID && match.team2Uids[1] === MARINA_UID;
}
function restoreHistoricalSide(match) {
  const fixed = clone(match);
  fixed.p1 = ORIGINAL_P1;
  fixed.team1Uids = [JONATHAN_UID, MARINA_UID];
  const team = Object.assign({}, fixed.team1Obj || {});
  const members = Array.isArray(team.participants) ? team.participants.map(clone) : [];
  if (!members.length || members[0].uid !== ERIKA_UID) fail('team1Obj do jogo 130 não contém a substituta esperada');
  members[0] = Object.assign({}, members[0], {
    uid: JONATHAN_UID,
    key: 'uid:' + JONATHAN_UID,
    name: 'Jonathan hall',
    displayName: 'Jonathan hall'
  });
  team.displayName = ORIGINAL_P1;
  team.name = ORIGINAL_P1;
  team.p1Name = 'Jonathan hall';
  team.p1Uid = JONATHAN_UID;
  team.p2Name = 'Marina Cegal';
  team.p2Uid = MARINA_UID;
  team.participants = members;
  fixed.team1Obj = team;
  return fixed;
}

(async () => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();
  const base = db.collection('tournaments').doc(TID);
  const game130Ref = base.collection('matches').doc(GAME_130);
  const result130Ref = base.collection('results').doc(GAME_130);
  const game171Ref = base.collection('matches').doc(GAME_171);
  const auditQuery = base.collection('scoreAudit').where('matchId', '==', GAME_130);
  const [game130, result130, game171, audit] = await Promise.all([game130Ref.get(), result130Ref.get(), game171Ref.get(), auditQuery.get()]);
  if (!game130.exists || !result130.exists || !game171.exists) fail('jogo 130, espelho de resultado ou jogo 171 não existe');
  const originalAudit = audit.docs.map((doc) => doc.data() || {}).find((entry) => entry.kind === 'score-write' && entry.after && entry.after.p1 === ORIGINAL_P1);
  if (!originalAudit) fail('auditoria não confirma Jonathan como participante histórico do jogo 130');
  const old130 = (game130.data() || {}).jogo || {};
  const old171 = (game171.data() || {}).jogo || {};
  const mirror = result130.data() || {};
  if (!isExpectedCompletedGame(old130)) fail('jogo 130 não está exatamente no estado indevido esperado');
  if (!isExpectedFutureGame(old171)) fail('jogo 171 não preserva a substituição válida da Erika');
  if (mirror.p1 !== WRONG_P1 || !Array.isArray(mirror.playerUids) || mirror.playerUids[0] !== ERIKA_UID) fail('espelho do resultado 130 diverge do estado indevido esperado');
  const fixed130 = restoreHistoricalSide(old130);
  const fixedMirror = Object.assign({}, mirror, {
    p1: ORIGINAL_P1,
    team1Uids: [JONATHAN_UID, MARINA_UID],
    playerUids: [JONATHAN_UID, MARINA_UID].concat((mirror.playerUids || []).slice(2))
  });
  console.log(JSON.stringify({
    jogo130: { antes: old130.p1, depois: fixed130.p1, placar: old130.sets, vencedor: old130.winner },
    jogo171: { mantido: old171.p2, winner: old171.winner },
    auditoria: originalAudit.logMessage || null
  }, null, 2));
  if (!APPLY) { console.log('DRY-RUN: nenhuma escrita.'); return; }

  await db.runTransaction(async (tx) => {
    const [fresh130, freshResult, fresh171] = await Promise.all([tx.get(game130Ref), tx.get(result130Ref), tx.get(game171Ref)]);
    const current130 = (fresh130.data() || {}).jogo || {};
    const current171 = (fresh171.data() || {}).jogo || {};
    const currentMirror = freshResult.data() || {};
    if (!isExpectedCompletedGame(current130) || !isExpectedFutureGame(current171)) fail('um dos jogos mudou antes da transação');
    if (currentMirror.p1 !== WRONG_P1 || !Array.isArray(currentMirror.playerUids) || currentMirror.playerUids[0] !== ERIKA_UID) fail('espelho do jogo 130 mudou antes da transação');
    tx.update(game130Ref, { jogo: restoreHistoricalSide(current130) });
    tx.update(result130Ref, Object.assign({}, fixedMirror, { updatedAt: new Date().toISOString() }));
  });

  const [after130, afterResult, after171] = await Promise.all([game130Ref.get(), result130Ref.get(), game171Ref.get()]);
  const restored = (after130.data() || {}).jogo || {};
  const untouched171 = (after171.data() || {}).jogo || {};
  const rereadMirror = afterResult.data() || {};
  if (restored.p1 !== ORIGINAL_P1 || restored.team1Uids[0] !== JONATHAN_UID || restored.team1Obj.p1Uid !== JONATHAN_UID ||
      restored.scoreP1 !== 0 || restored.scoreP2 !== 2 || restored.winner !== 'Nathalie white iaria / Sonia Leite Pinto') fail('releitura do histórico não confirmou a restauração');
  if (rereadMirror.p1 !== ORIGINAL_P1 || rereadMirror.playerUids[0] !== JONATHAN_UID) fail('espelho do resultado não foi restaurado');
  if (!isExpectedFutureGame(untouched171)) fail('a restauração tocou indevidamente o jogo 171');
  console.log('✓ jogo 130 restaurado e relido; Jonathan permanece no histórico e Erika permanece somente no jogo futuro 171.');
})().catch((error) => { console.error('✗ ' + (error && error.message || error)); process.exit(1); });
