/* Reparo pontual: Denise Mamesso ocupa o Jogador X do Jogo 125. */
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { initializeApp, getApps, applicationDefault } = require(path.join(ROOT, 'functions-autodraw', 'node_modules', 'firebase-admin', 'lib', 'app'));
const { getFirestore } = require(path.join(ROOT, 'functions-autodraw', 'node_modules', 'firebase-admin', 'lib', 'firestore'));
require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;
const split = require(path.join(ROOT, 'functions-autodraw', 'vendor', 'tournament-split-core.js'));
const { computeMemberUids } = require(path.join(ROOT, 'functions', 'enroll-core.js'));
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: 'scoreplace-app' });
const db = getFirestore();

const TID = 'tour_1780009816637';
const MATCH_ID = 'ph-tour_1780009816637-1-silver-VC-R1-P2';
const DENISE_UID = 'LeeS4rKmEZh1yoB9Xjkp2vQ5IwB2';
const APPLY = process.argv.includes('--apply');
const NOW = new Date().toISOString();

function clone(v) { return JSON.parse(JSON.stringify(v)); }
function hasUid(p, uid) {
  if (!p || typeof p !== 'object') return false;
  if (String(p.uid || '') === uid || String(p.p1Uid || '') === uid || String(p.p2Uid || '') === uid) return true;
  return Array.isArray(p.participants) && p.participants.some(x => x && String(x.uid || '') === uid);
}
function sideNames(m, side) { return String(m[side] || '').split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean); }
// Espelha exatamente _setSlot de bracket-logic.js; ela não é exportada pelo shim Node.
function setCanonicalSlot(m, side, uids, obj) {
  const clean = (uids || []).filter(Boolean);
  if (side === 'p1') { m.team1Uids = clean; m.p1Uid = clean.length === 1 ? clean[0] : null; m.team1Obj = obj; }
  else { m.team2Uids = clean; m.p2Uid = clean.length === 1 ? clean[0] : null; m.team2Obj = obj; }
}
async function mount(read) {
  const root = await read.get();
  if (!root.exists) throw new Error('Torneio não encontrado.');
  const config = Object.assign({ id: TID }, root.data());
  return split.montarDoBanco(config, async collection => (await read.getCollection(collection)).docs.map(d => d.data()));
}
const txReader = (tx, ref) => ({ get: () => tx.get(ref), getCollection: c => tx.get(ref.collection(c)) });
const snapshotReader = ref => ({ get: () => ref.get(), getCollection: c => ref.collection(c).get() });

function locate(t) {
  const all = typeof win._collectAllMatches === 'function' ? win._collectAllMatches(t) : [];
  const match = all.find(m => m && m.id === MATCH_ID);
  if (!match) {
    const candidates = all.filter(m => m && /Jogador X|Juliana Dal Sasso|Andrea Nunes|Eliane Cinelli/i.test(String(m.p1 || '') + ' / ' + String(m.p2 || '')))
      .map(m => ({ id: m.id, p1: m.p1, p2: m.p2, winner: m.winner || null }));
    throw new Error(`ABORTA: não encontrei o Jogo 125 (${MATCH_ID}). Candidatos: ${JSON.stringify(candidates)}`);
  }
  if (match.winner || match.scoreP1 || match.scoreP2 || match.wo) throw new Error('ABORTA: Jogo 125 já concluído; não altero jogo com placar ou W.O.');
  const side = ['p1', 'p2'].find(s => sideNames(match, s).some(name => /^Jogador X$/i.test(name)));
  if (!side) throw new Error('ABORTA: Jogador X já não está no Jogo 125.');
  const names = sideNames(match, side), xIndex = names.findIndex(name => /^Jogador X$/i.test(name));
  if (names.length !== 2 || xIndex < 0) throw new Error('ABORTA: dupla da vaga Jogador X está em formato inesperado.');
  return { all, match, side, names, xIndex };
}
function prepare(t, profile) {
  const { all, match, side, names, xIndex } = locate(t);
  const denise = (Array.isArray(t.participants) ? t.participants : []).find(p => hasUid(p, DENISE_UID));
  if (!denise) throw new Error('ABORTA: Denise Mamesso não está no elenco inativo do torneio.');
  const deniseName = String((profile && (profile.displayName || profile.name)) || denise.displayName || denise.name || '').trim();
  if (!/^Denise Mamesso$/i.test(deniseName)) throw new Error(`ABORTA: UID solicitado resolve para “${deniseName || '(vazio)'}”.`);
  const openElsewhere = all.filter(m => m && m.id !== MATCH_ID && !m.winner && !m.wo && !m.isSitOut && !m.sitOutReason && typeof win._slotUids === 'function' &&
    win._slotUids(m, 'p1').concat(win._slotUids(m, 'p2')).includes(DENISE_UID));
  if (openElsewhere.length) throw new Error(`ABORTA: Denise já consta em outro jogo aberto (${openElsewhere.map(m => m.id).join(', ')}).`);
  const positional = typeof win._slotUidsPositional === 'function' ? win._slotUidsPositional(match, side, t) : [];
  const ghost = (Array.isArray(t.woGhosts) ? t.woGhosts : []).find(g => g && g.matchId === MATCH_ID && /^Jogador X$/i.test(String(g.name || '')));
  const ghostUid = (ghost && ghost.uid) || positional[xIndex] || '';
  if (!/^ghostwo_/i.test(String(ghostUid))) throw new Error('ABORTA: registro fantasma de W.O. não encontrado para a vaga.');
  if (positional.length !== names.length || String(positional[xIndex]) !== String(ghostUid)) throw new Error('ABORTA: identidade posicional do Jogador X divergiu; não vou inferi-la por nome.');
  const nextNames = names.slice(), nextUids = positional.slice();
  nextNames[xIndex] = deniseName; nextUids[xIndex] = DENISE_UID;
  const label = nextNames.join(' / ');
  match[side] = label;
  const teamKey = side === 'p1' ? 'team1' : 'team2';
  if (Array.isArray(match[teamKey])) match[teamKey] = nextNames.slice();
  setCanonicalSlot(match, side, nextUids, {
    p1Uid: nextUids[0], p2Uid: nextUids[1], p1Name: nextNames[0], p2Name: nextNames[1], displayName: label, name: label,
    participants: nextNames.map((name, i) => ({ uid: nextUids[i], displayName: name, name }))
  });
  denise.ligaActive = true;
  delete denise.woDeactivatedAt; delete denise.woSentToWaitlistAt;
  if (Array.isArray(t.standbyParticipants)) t.standbyParticipants = t.standbyParticipants.filter(p => !hasUid(p, DENISE_UID));
  if (Array.isArray(t.waitlist)) t.waitlist = t.waitlist.filter(p => !hasUid(p, DENISE_UID));
  if (t.absent && typeof t.absent === 'object') delete t.absent[DENISE_UID];
  if (!t.checkedIn || typeof t.checkedIn !== 'object') t.checkedIn = {};
  t.checkedIn[DENISE_UID] = Date.parse(NOW);
  t.woGhosts = (Array.isArray(t.woGhosts) ? t.woGhosts : []).filter(g => !(g && g.matchId === MATCH_ID && String(g.uid || '') === String(ghostUid)));
  t.memberUids = computeMemberUids(t);
  if (!t.memberUids.includes(DENISE_UID)) throw new Error('ABORTA: Denise sairia de memberUids.');
  if (!Array.isArray(t.history)) t.history = [];
  t.history.push({ date: NOW, message: 'Ajuste administrativo: Denise Mamesso saiu da fila de W.O. e ocupou a vaga Jogador X no Jogo 125, com Juliana Dal Sasso. Sem alteração de jogos concluídos.' });
  return { label, ghostUid, match };
}
function changedRecords(t) {
  const p = split.dividir(t, t._semPesados || []);
  const participant = (p.participants || []).find(r => r && hasUid(r.item, DENISE_UID));
  const match = (p.matches || []).find(r => r && r.jogo && r.jogo.id === MATCH_ID);
  if (!participant || !match) throw new Error('ABORTA: conversão canônica não encontrou a participante ou o jogo.');
  return { participant, match };
}

(async () => {
  const ref = db.collection('tournaments').doc(TID);
  if (!APPLY) {
    const profile = await db.collection('users').doc(DENISE_UID).get();
    const t = await mount(snapshotReader(ref)), before = clone(t), out = prepare(t, profile.data() || {}), records = changedRecords(t);
    console.log(JSON.stringify({ dryRun: true, tournament: t.name, game: MATCH_ID, before: { p1: locate(before).match.p1, p2: locate(before).match.p2 }, after: { p1: out.match.p1, p2: out.match.p2 }, ghostRemoved: out.ghostUid, participantRecord: split.chaveDoRegistro(records.participant), matchRecord: split.chaveDoRegistro(records.match), writes: ['inscritos/' + split.chaveDoRegistro(records.participant), 'matches/' + split.chaveDoRegistro(records.match), 'tournaments/' + TID] }, null, 2));
    return;
  }
  const result = await db.runTransaction(async tx => {
    const profile = await tx.get(db.collection('users').doc(DENISE_UID));
    const t = await mount(txReader(tx, ref)), out = prepare(t, profile.data() || {}), records = changedRecords(t);
    tx.set(ref.collection('inscritos').doc(split.chaveDoRegistro(records.participant)), records.participant);
    tx.set(ref.collection('matches').doc(split.chaveDoRegistro(records.match)), records.match);
    tx.update(ref, { absent: t.absent || {}, checkedIn: t.checkedIn || {}, woGhosts: t.woGhosts || [], standbyParticipants: t.standbyParticipants || [], waitlist: t.waitlist || [], memberUids: t.memberUids, history: t.history, updatedAt: NOW });
    return { game: MATCH_ID, replacement: out.label, ghostRemoved: out.ghostUid };
  });
  console.log('✅ ajuste gravado atomicamente:', JSON.stringify(result));
})().catch(err => { console.error(`❌ ${err.message}`); process.exit(1); });
