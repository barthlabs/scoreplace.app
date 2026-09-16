#!/usr/bin/env node
'use strict';
/* Repara a cópia auxiliar team*Obj do jogo 157 do Confra.
 * O motor de W.O. já trocou p1/p2 e team*Uids, mas não rehidratou team*Obj;
 * a tela prioriza esse objeto e continuava mostrando Marcos/Flávia. */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const APPLY = process.argv.includes('--apply');
const TID = 'tour_1780009816637';
const MID = 'ph-tour_1780009816637-1-silver-VC-R1-P2';
const MARCOS = 'K8mF4MnHRGNU4cBPuyzLnFW5Las1';
const FLAVIA = 'JrqPgvB6jUg5O0jlqIv4oLgMz3W2';
const ELIANE = 'MVzXbpSw4La9zcf64n4uKLK8VOe2';
function die(s) { throw new Error('ABORTADO: ' + s); }
function stamp(value, matchId, gameNum) {
  const at = (value && typeof value === 'object' && value.at) || (typeof value === 'number' ? new Date(value).toISOString() : new Date().toISOString());
  const next = Object.assign({}, value && typeof value === 'object' ? value : {}, { at, matchId, gameNum });
  // Conta é UID: limpa qualquer cópia velha de rótulo de perfil.
  ['name', 'displayName', 'email', 'phone'].forEach(k => delete next[k]);
  return next;
}
function names(side) { return String(side || '').split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean); }
function rebuild(old, label, uids) {
  const ns = names(label);
  if (ns.length !== uids.length || ns.length !== 2) die('lado não é dupla coerente: ' + JSON.stringify({label,uids}));
  const previous = Array.isArray(old && old.participants) ? old.participants : [];
  return Object.assign({}, old || {}, {
    displayName: label, name: label,
    p1Name: ns[0], p1Uid: uids[0], p2Name: ns[1], p2Uid: uids[1],
    participants: ns.map((name, i) => Object.assign({}, previous[i] || {}, {
      key: 'uid:' + uids[i], uid: uids[i], name, displayName: name
    }))
  });
}
(async () => {
  if (!admin.apps.length) admin.initializeApp({projectId:'scoreplace-app'});
  const db = admin.firestore();
  const tRef = db.collection('tournaments').doc(TID);
  const mRef = tRef.collection('matches').doc(MID);
  const before = await Promise.all([tRef.get(), mRef.get()]);
  if (!before[0].exists || !before[1].exists) die('torneio ou jogo inexistente');
  const t = before[0].data() || {}, env = before[1].data() || {}, m = env.jogo || {};
  const p1 = Array.isArray(m.team1Uids) ? m.team1Uids : [];
  const p2 = Array.isArray(m.team2Uids) ? m.team2Uids : [];
  if (p1.includes(MARCOS) || p2.includes(FLAVIA)) die('UID antigo ainda ocupa a vaga; não é reparo de espelho');
  if (p1.length !== 2 || !p2.includes(ELIANE) || m.p1 !== 'Adriana Rosa / Juliana Dal Sasso' || m.p2 !== 'Andrea Nunes / Eliane Cinelli') die('os dois slots canônicos não estão prontos para normalização');
  if (!t.absent || !Object.prototype.hasOwnProperty.call(t.absent, MARCOS) || !Object.prototype.hasOwnProperty.call(t.absent, FLAVIA)) die('W.O. de Marcos/Flávia não está marcado no torneio');
  const gameNum = m._gameNum || 156;
  const fixedAbsent = Object.assign({}, t.absent, { [MARCOS]: stamp(t.absent[MARCOS], MID, gameNum), [FLAVIA]: stamp(t.absent[FLAVIA], MID, gameNum) });
  const _hist = (old, patch) => {
    const next = Object.assign({}, old && typeof old === 'object' ? old : {}, patch);
    ['name', 'displayName', 'originalTeam', 'partner', 'replacedBy', 'email', 'phone'].forEach(k => delete next[k]);
    return next;
  };
  const fixedHistory = Object.assign({}, t.woHistory || {});
  fixedHistory[MARCOS] = _hist(fixedHistory[MARCOS], { matchId:MID, gameNum, substituteUid:p1[0], partnerUid:p1[1] || null, originalTeamUids:[MARCOS, p1[1] || null].filter(Boolean) });
  fixedHistory[FLAVIA] = _hist(Object.assign({}, fixedHistory[FLAVIA] || {}, fixedHistory['Flavia Cocozza'] || {}), { matchId:MID, gameNum, substituteUid:ELIANE, partnerUid:p2.find(u => u !== ELIANE) || null, originalTeamUids:[p2.find(u => u !== ELIANE) || null, FLAVIA].filter(Boolean) });
  delete fixedHistory['Flavia Cocozza'];
  const cleanClaim = (c, substituteUid) => {
    const next = Object.assign({}, c, { result:'subbed', substituteUid, matchId:MID });
    ['absentName', 'substituteName', 'byName', 'players'].forEach(k => delete next[k]);
    return next;
  };
  const fixedClaims = (Array.isArray(t.woClaims) ? t.woClaims : []).map(c => {
    if (!c || !Array.isArray(c.absentUids)) return c;
    if (c.absentUids.includes(MARCOS)) return cleanClaim(c, p1[0]);
    if (c.absentUids.includes(FLAVIA)) return cleanClaim(c, ELIANE);
    return c;
  });
  const fixed = Object.assign({}, m, {
    team1Obj: rebuild(m.team1Obj, m.p1, p1),
    team2Obj: rebuild(m.team2Obj, m.p2, p2)
  });
  console.log(JSON.stringify({
    jogo: MID,
    antes: { p1: m.team1Obj && m.team1Obj.displayName, p2: m.team2Obj && m.team2Obj.displayName },
    depois: { p1: fixed.team1Obj.displayName, p2: fixed.team2Obj.displayName },
    wo: Object.keys(fixedAbsent).filter(u => u === MARCOS || u === FLAVIA),
    listaWoUids: [MARCOS, FLAVIA],
    substitutos: fixedClaims.filter(c => c && Array.isArray(c.absentUids) && (c.absentUids.includes(MARCOS) || c.absentUids.includes(FLAVIA))).map(c => ({ absentUid: c.absentUids[0], substituteUid: c.substituteUid }))
  }, null, 2));
  if (!APPLY) { console.log('DRY-RUN: nenhuma escrita.'); return; }
  await db.runTransaction(async tx => {
    const [freshT, freshM] = await Promise.all([tx.get(tRef), tx.get(mRef)]);
    if (!freshT.exists || !freshM.exists) die('alvo mudou durante a transação');
    const ft = freshT.data() || {}, fm = (freshM.data() || {}).jogo || {};
    const a = Array.isArray(fm.team1Uids) ? fm.team1Uids : [], b = Array.isArray(fm.team2Uids) ? fm.team2Uids : [];
    if (a.includes(MARCOS) || b.includes(FLAVIA) || !b.includes(ELIANE)) die('slot canônico mudou durante a transação');
    if (!ft.absent || !Object.prototype.hasOwnProperty.call(ft.absent, MARCOS) || !Object.prototype.hasOwnProperty.call(ft.absent, FLAVIA)) die('marcadores de W.O. mudaram durante a transação');
    tx.update(tRef, { absent: fixedAbsent, woHistory: fixedHistory, woClaims: fixedClaims });
    tx.update(mRef, { jogo: Object.assign({}, fm, {
      team1Obj: rebuild(fm.team1Obj, fm.p1, a),
      team2Obj: rebuild(fm.team2Obj, fm.p2, b),
      updatedAt: new Date().toISOString()
    }) });
  });
  const after = (await mRef.get()).data().jogo;
  const afterT = (await tRef.get()).data() || {};
  if (after.team1Obj.displayName !== after.p1 || after.team2Obj.displayName !== after.p2 ||
      after.team1Obj.p1Uid !== after.team1Uids[0] || after.team2Obj.p2Uid !== after.team2Uids[1]) die('releitura do jogo divergente');
  if (!afterT.absent || !afterT.absent[FLAVIA] || !afterT.woHistory || afterT.woHistory[FLAVIA].substituteUid !== ELIANE || afterT.woHistory[MARCOS].substituteUid !== after.team1Uids[0]) die('releitura da lista de W.O. divergente');
  if (afterT.absent[FLAVIA].name || afterT.woHistory[FLAVIA].name || afterT.woHistory[FLAVIA].replacedBy) die('releitura gravou nome de conta no W.O.');
  console.log('✅ reparado e relido:', after.team1Obj.displayName, '×', after.team2Obj.displayName, '| W.O. UID:', MARCOS, 'e', FLAVIA);
})().catch(e => { console.error('✗ ' + (e && e.message || e)); process.exit(1); });
