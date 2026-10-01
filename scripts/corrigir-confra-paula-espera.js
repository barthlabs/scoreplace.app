#!/usr/bin/env node
/*
 * Reparo pontual da ConfrA: a Paula Caldeira Brant foi promovida para o jogo
 * 167, mas a cópia enxuta dela permaneceu em standbyParticipants. O alvo é
 * derivado do UID que está no jogo, nunca do nome exibido.
 *
 * Uso:
 *   node scripts/corrigir-confra-paula-espera.js
 *   node scripts/corrigir-confra-paula-espera.js --apply
 */
'use strict';

const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
require('./preflight-alvo').preflight('correcao-confra-paula-espera', 'scoreplace-app');

const TID = 'tour_1780009816637';
const MATCH_ID = 'ph-tour_1780009816637-1-silver-VC-R2-P11';
const GAME_NUMBER = 167;
const PAULA_UID = 'pY4a8a3H9YW1I6xm7b5sqlUcCKz1';
const APPLY = process.argv.includes('--apply');

const fail = (message) => { throw new Error('ABORTADO: ' + message); };
const entryHasUid = (entry, uid) => {
  if (!entry || typeof entry !== 'object') return false;
  const wanted = String(uid);
  if ([entry.uid, entry.p1Uid, entry.p2Uid].some((value) => String(value || '') === wanted)) return true;
  return Array.isArray(entry.participants) && entry.participants.some((slot) => slot && String(slot.uid || '') === wanted);
};
const matchHasUid = (match, uid) => {
  if (!match || typeof match !== 'object') return false;
  const wanted = String(uid);
  return [match.p1Uid, match.p2Uid].some((value) => String(value || '') === wanted) ||
    ['team1Uids', 'team2Uids'].some((key) => Array.isArray(match[key]) && match[key].map(String).includes(wanted));
};
const countAcrossWaitlists = (t, uid) => {
  const count = (list) => (Array.isArray(list) ? list : []).filter((entry) => entryHasUid(entry, uid)).length;
  const monarch = t.monarchWaitlist && typeof t.monarchWaitlist === 'object' ? t.monarchWaitlist : {};
  return count(t.waitlist) + count(t.standbyParticipants) + Object.values(monarch).reduce((sum, list) => sum + count(list), 0);
};
const withoutUid = (list, uid) => (Array.isArray(list) ? list : []).filter((entry) => !entryHasUid(entry, uid));

(async () => {
  if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
  const db = admin.firestore();
  const tournamentRef = db.collection('tournaments').doc(TID);
  const matchRef = tournamentRef.collection('matches').doc(MATCH_ID);
  const before = await Promise.all([tournamentRef.get(), matchRef.get()]);
  if (!before[0].exists || !before[1].exists) fail('torneio ou jogo canônico não existe');
  const beforeTournament = before[0].data() || {};
  const beforeMatch = (before[1].data() || {}).jogo || {};
  if (Number(beforeMatch._gameNum) !== GAME_NUMBER) fail('o documento não é o jogo ' + GAME_NUMBER);
  if (!matchHasUid(beforeMatch, PAULA_UID)) fail('o UID da Paula não está no jogo ' + GAME_NUMBER);
  const beforeCount = countAcrossWaitlists(beforeTournament, PAULA_UID);
  console.log('▸ jogo ' + GAME_NUMBER + ': ' + beforeMatch.p2);
  console.log('  UID confirmado: ' + PAULA_UID);
  console.log('  ocorrências na espera antes: ' + beforeCount);
  if (!beforeCount) { console.log('✓ nenhuma cópia da Paula na espera; nada a fazer.'); return; }
  if (!APPLY) { console.log('✓ DRY-RUN: rode com --apply para remover somente esse UID da espera.'); return; }

  await db.runTransaction(async (tx) => {
    const [tSnap, mSnap] = await Promise.all([tx.get(tournamentRef), tx.get(matchRef)]);
    if (!tSnap.exists || !mSnap.exists) fail('torneio ou jogo mudou antes da transação');
    const t = tSnap.data() || {};
    const match = (mSnap.data() || {}).jogo || {};
    if (Number(match._gameNum) !== GAME_NUMBER || !matchHasUid(match, PAULA_UID)) {
      fail('o jogo ' + GAME_NUMBER + ' já não contém o UID confirmado da Paula');
    }
    const patch = {};
    if (Array.isArray(t.waitlist)) patch.waitlist = withoutUid(t.waitlist, PAULA_UID);
    if (Array.isArray(t.standbyParticipants)) patch.standbyParticipants = withoutUid(t.standbyParticipants, PAULA_UID);
    if (t.monarchWaitlist && typeof t.monarchWaitlist === 'object') {
      patch.monarchWaitlist = Object.fromEntries(Object.entries(t.monarchWaitlist)
        .map(([category, list]) => [category, withoutUid(list, PAULA_UID)]));
    }
    tx.update(tournamentRef, patch);
  });

  const after = await tournamentRef.get();
  const remaining = countAcrossWaitlists(after.data() || {}, PAULA_UID);
  if (remaining) fail('a releitura ainda encontrou ' + remaining + ' ocorrência(s) na espera');
  console.log('✓ corrigido e relido: Paula permanece no jogo ' + GAME_NUMBER + ' e saiu de toda a lista de espera.');
})().catch((error) => { console.error('✗ ' + (error && error.message || error)); process.exit(1); });
