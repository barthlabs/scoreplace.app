/*
 * Reparo administrativo pontual: Cristina Arvate tomou W.O. antes do Jogo 135,
 * mas a partida foi disputada por Vanessa + Jogador X. Preserva placar e vitória;
 * substitui somente o slot/roster e envia Cristina aos Desativados (lista W.O.).
 */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { initializeApp, getApps, applicationDefault } = require(path.join(ROOT, 'functions-autodraw', 'node_modules', 'firebase-admin', 'lib', 'app'));
const { getFirestore } = require(path.join(ROOT, 'functions-autodraw', 'node_modules', 'firebase-admin', 'lib', 'firestore'));
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const split = require(path.join(ROOT, 'functions-autodraw', 'vendor', 'tournament-split-core.js'));
const roster = require(path.join(ROOT, 'functions-autodraw', 'vendor', 'match-roster.js'));
const { computeMemberUids } = require(path.join(ROOT, 'functions', 'enroll-core.js'));
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: 'scoreplace-app' });
const db = getFirestore();

const TID = 'tour_1780009816637';
const MATCH_ID = 'ph-tour_1780009816637-1-silver-VC-R1-P12';
const CRISTINA_UID = 'SmMl6pTmhkT0IBJ5B8AZSl1e0w33';
const VANESSA_UID = '5TxVeRIiT1crULiD2PETGBCr6Ek2';
const GHOST_UID = 'ghostwo_manual_game135_cristina';
const APPLY = process.argv.includes('--apply');
const NOW = new Date().toISOString();

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function hasUid(p, uid) {
  if (!p || typeof p !== 'object') return false;
  if (String(p.uid || '') === uid || String(p.p1Uid || '') === uid || String(p.p2Uid || '') === uid) return true;
  return Array.isArray(p.participants) && p.participants.some(x => x && String(x.uid || '') === uid);
}
function names(v) { return String(v || '').split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean); }
// Espelha _setSlot de bracket-logic.js; ela não é exportada pelo shim Node.
function setCanonicalSlot(m, side, uids, obj) {
  const clean = (uids || []).filter(Boolean);
  if (side === 'p1') { m.team1Uids = clean; m.p1Uid = clean.length === 1 ? clean[0] : null; m.team1Obj = obj; }
  else { m.team2Uids = clean; m.p2Uid = clean.length === 1 ? clean[0] : null; m.team2Obj = obj; }
}
async function mount(read) {
  const root = await read.get();
  if (!root.exists) throw new Error('Torneio não encontrado.');
  return split.montarDoBanco(Object.assign({ id: TID }, root.data()), async collection => (await read.getCollection(collection)).docs.map(d => d.data()));
}
const txReader = (tx, ref) => ({ get: () => tx.get(ref), getCollection: c => tx.get(ref.collection(c)) });
const snapshotReader = ref => ({ get: () => ref.get(), getCollection: c => ref.collection(c).get() });
function target(t) {
  const all = typeof win._collectAllMatches === 'function' ? win._collectAllMatches(t) : [];
  const m = all.find(x => x && x.id === MATCH_ID);
  if (!m) throw new Error('ABORTA: Jogo 135 não encontrado pelo ID canônico.');
  if (m.p2 !== 'Vanessa Kaufmann / Cristina Arvate') throw new Error(`ABORTA: lado 2 inesperado: ${m.p2}`);
  if (!Array.isArray(m.team2Uids) || !m.team2Uids.includes(VANESSA_UID) || !m.team2Uids.includes(CRISTINA_UID)) throw new Error('ABORTA: UIDs estruturais do lado 2 não conferem.');
  if (m.winner !== 'Olivia / Maira' || m.scoreP1 !== 2 || m.scoreP2 !== 1 || !Array.isArray(m.sets) || m.sets.length !== 3) throw new Error('ABORTA: placar do Jogo 135 divergiu; não vou tocar numa partida diferente.');
  return { all, m };
}
function prepare(t, profile) {
  const { all, m } = target(t);
  const cristina = (Array.isArray(t.participants) ? t.participants : []).find(p => hasUid(p, CRISTINA_UID));
  if (!cristina) throw new Error('ABORTA: Cristina não está no elenco do torneio.');
  const liveName = String((profile && (profile.displayName || profile.name)) || cristina.displayName || cristina.name || '').trim();
  if (liveName !== 'Cristina Arvate') throw new Error(`ABORTA: UID solicitado resolve para “${liveName || '(vazio)'}”.`);
  if (cristina.ligaActive === false || cristina.woDeactivatedAt) throw new Error('ABORTA: Cristina já está nos Desativados; não repito a operação.');
  const completedOther = all.filter(x => x && x.id !== MATCH_ID && (x.winner || x.scoreP1 != null || x.scoreP2 != null) && typeof win._slotUids === 'function' && win._slotUids(x, 'p1').concat(win._slotUids(x, 'p2')).includes(CRISTINA_UID));
  if (!completedOther.length) throw new Error('ABORTA: esperado histórico anterior da Cristina não foi encontrado; verifique antes de remover estatísticas.');

  const label = 'Vanessa Kaufmann / Jogador X';
  m.p2 = label;
  if (Array.isArray(m.team2)) m.team2 = ['Vanessa Kaufmann', 'Jogador X'];
  setCanonicalSlot(m, 'p2', [VANESSA_UID, GHOST_UID], {
    p1Uid: VANESSA_UID, p2Uid: GHOST_UID,
    p1Name: 'Vanessa Kaufmann', p2Name: 'Jogador X',
    displayName: label, name: label,
    participants: [
      { uid: VANESSA_UID, displayName: 'Vanessa Kaufmann', name: 'Vanessa Kaufmann' },
      { uid: GHOST_UID, displayName: 'Jogador X', name: 'Jogador X', isGhost: true }
    ]
  });
  cristina.ligaActive = false;
  cristina.woDeactivatedAt = NOW;
  delete cristina.woSentToWaitlistAt;
  if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(p => !hasUid(p, CRISTINA_UID));
  if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(p => !hasUid(p, CRISTINA_UID));
  t.woGhosts = Array.isArray(t.woGhosts) ? t.woGhosts.filter(g => !(g && g.matchId === MATCH_ID)) : [];
  t.woGhosts.push({ uid: GHOST_UID, name: 'Jogador X', replacedUid: CRISTINA_UID, replacedName: liveName, matchId: MATCH_ID, at: Date.parse(NOW), reason: 'Ajuste administrativo: W.O. antes da partida; o Jogo 135 foi disputado por Vanessa Kaufmann com Jogador X.' });
  t.memberUids = computeMemberUids(t);
  if (!t.memberUids.includes(CRISTINA_UID)) throw new Error('ABORTA: Cristina não pode desaparecer dos membros do torneio ao ir para W.O.');
  if (!Array.isArray(t.history)) t.history = [];
  t.history.push({ date: NOW, message: 'Ajuste administrativo: Cristina Arvate tomou W.O. antes do Jogo 135 e foi para os Desativados. O placar já jogado foi preservado; Vanessa Kaufmann disputou a vaga com Jogador X. Estatísticas do Jogo 135 não são mais atribuídas à Cristina.' });
  const mirror = roster.buildMirrorDoc(t, m, TID, NOW, null);
  if (mirror.playerUids.includes(CRISTINA_UID) || !mirror.playerUids.includes(GHOST_UID) || mirror.p2 !== label) throw new Error('ABORTA: espelho canônico não refletiu a troca de roster.');
  return { m, cristina, mirror, completedOther: completedOther.map(x => x.id) };
}
function changedRecords(t) {
  const p = split.dividir(t, t._semPesados || []);
  const participant = (p.participants || []).find(r => r && hasUid(r.item, CRISTINA_UID));
  const match = (p.matches || []).find(r => r && r.jogo && r.jogo.id === MATCH_ID);
  if (!participant || !match) throw new Error('ABORTA: divisão canônica não encontrou participante ou Jogo 135.');
  return { participant, match };
}
(async () => {
  const ref = db.collection('tournaments').doc(TID);
  const resultRef = ref.collection('results').doc(MATCH_ID);
  if (!APPLY) {
    const [profile, oldMirror] = await Promise.all([db.collection('users').doc(CRISTINA_UID).get(), resultRef.get()]);
    const t = await mount(snapshotReader(ref)), before = clone(t), out = prepare(t, profile.data() || {}), records = changedRecords(t);
    console.log(JSON.stringify({ dryRun:true, tournament:t.name, game:MATCH_ID,
      before:{p2:target(before).m.p2, team2Uids:target(before).m.team2Uids, mirrorPlayerUids:(oldMirror.data()||{}).playerUids||[]},
      after:{p2:out.m.p2, team2Uids:out.m.team2Uids, mirrorPlayerUids:out.mirror.playerUids, score:{scoreP1:out.m.scoreP1,scoreP2:out.m.scoreP2,winner:out.m.winner,sets:out.m.sets}},
      cristina:{ligaActive:out.cristina.ligaActive,woDeactivatedAt:out.cristina.woDeactivatedAt}, preservedPreviousMatches:out.completedOther,
      writes:['inscritos/'+split.chaveDoRegistro(records.participant),'matches/'+split.chaveDoRegistro(records.match),'results/'+MATCH_ID,'tournaments/'+TID]
    },null,2));
    return;
  }
  const result = await db.runTransaction(async tx => {
    const [profile, oldMirror] = await Promise.all([tx.get(db.collection('users').doc(CRISTINA_UID)), tx.get(resultRef)]);
    const t = await mount(txReader(tx, ref));
    const out = prepare(t, profile.data() || {}), records = changedRecords(t);
    if (!oldMirror.exists || !Array.isArray(oldMirror.data().playerUids) || !oldMirror.data().playerUids.includes(CRISTINA_UID)) throw new Error('ABORTA: espelho antigo não contém Cristina; estado concorrente ou já corrigido.');
    tx.set(ref.collection('inscritos').doc(split.chaveDoRegistro(records.participant)), records.participant);
    tx.set(ref.collection('matches').doc(split.chaveDoRegistro(records.match)), records.match);
    tx.set(resultRef, roster.buildMirrorDoc(t, out.m, TID, NOW, oldMirror.data() || null));
    tx.update(ref, { woGhosts:t.woGhosts, standbyParticipants:t.standbyParticipants || [], waitlist:t.waitlist || [], memberUids:t.memberUids, history:t.history, updatedAt:NOW });
    return { game:MATCH_ID, replacement:out.m.p2, playerUids:out.mirror.playerUids };
  });
  console.log('✅ ajuste gravado atomicamente:', JSON.stringify(result));
})().catch(err => { console.error(`❌ ${err.message}`); process.exit(1); });
