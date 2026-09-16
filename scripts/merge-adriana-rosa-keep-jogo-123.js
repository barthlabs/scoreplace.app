#!/usr/bin/env node
'use strict';
/*
 * Mesclagem DIRECIONAL, caso único: Adriana Rosa.
 * Mantém deliberadamente a UID do jogo 123, cujo placar já é histórico.
 * Não usa a rotina genérica porque ela pode escolher a conta federada como sobrevivente.
 *
 * Uso:
 *   node scripts/merge-adriana-rosa-keep-jogo-123.js          # plano, sem escrita
 *   node scripts/merge-adriana-rosa-keep-jogo-123.js --apply  # aplica após as precondições
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const { computeProfileMerge, computeLinkedIdentifiers } = require(path.join(__dirname, '..', 'functions', 'profile-merge-core'));
const { findUidPaths, isPlainContainer } = require(path.join(__dirname, '..', 'functions', 'uid-sweep'));

const PROJECT = 'scoreplace-app';
const KEEP = 'okliHAbvyNMhOR5DXXXytCkzOox2'; // conta presente no jogo 123 pontuado
const DROP = 'cEEiv2vOfcd4Enf8Iwbo0wurUiv1'; // conta Apple duplicada
const TOURNAMENT = 'tour_1780009816637';
const GAME_123 = 'ph-tour_1780009816637-1-gold-VC-R1-P18';
const GAME_157 = 'ph-tour_1780009816637-1-silver-VC-R1-P2';
const APPLY = process.argv.includes('--apply');

if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();
const F = admin.firestore.FieldValue;

function assert(condition, message) { if (!condition) throw new Error(message); }
function remapExactly(node, from, to) {
  let changed = false;
  const walk = (value) => {
    if (typeof value === 'string') {
      if (value === from) { changed = true; return to; }
      return value;
    }
    if (!isPlainContainer(value)) return value;
    if (Array.isArray(value)) {
      const mapped = value.map(walk);
      // Dedup somente se A PRÓPRIA substituição produziu dois UIDs iguais.
      const seen = new Set();
      return mapped.filter((item) => {
        if (typeof item !== 'string') return true;
        if (seen.has(item)) { changed = true; return false; }
        seen.add(item); return true;
      });
    }
    const out = {};
    for (const key of Object.keys(value)) {
      const nextKey = key === from ? to : key;
      if (nextKey !== key) changed = true;
      const nextValue = walk(value[key]);
      // Quando as duas contas já existem como chaves, o estado já do sobrevivente vence.
      if (nextKey !== key && Object.prototype.hasOwnProperty.call(out, nextKey)) continue;
      out[nextKey] = nextValue;
    }
    return out;
  };
  return { value: walk(node), changed };
}
async function scanRootExact() {
  const roots = await db.listCollections();
  const found = [];
  for (let i = 0; i < roots.length; i += 5) {
    const batch = await Promise.all(roots.slice(i, i + 5).map(async (col) => {
      const snap = await col.get();
      return snap.docs.map((doc) => ({ path: doc.ref.path, paths: findUidPaths(doc.data() || {}, DROP) }))
        .filter((item) => item.paths.length);
    }));
    found.push(...batch.flat());
  }
  return found;
}
async function scanTournamentChildrenExact(tournamentRef) {
  const found = [];
  const children = await tournamentRef.listCollections();
  for (const col of children) {
    const snap = await col.get();
    for (const doc of snap.docs) {
      const paths = findUidPaths(doc.data() || {}, DROP);
      if (paths.length) found.push({ path: doc.ref.path, paths });
    }
  }
  return found;
}
function allowedHistorical(pathName) {
  return pathName === 'orphanProfileRuns/2026-09-03' ||
    pathName === `tournaments_backup/${TOURNAMENT}` ||
    pathName === `tournaments_backup/${TOURNAMENT}__original`;
}
const CHILDREN = [
  'inscritos/ucEEiv2vOfcd4Enf8Iwbo0wurUiv1',
  'inscritos/uokliHAbvyNMhOR5DXXXytCkzOox2',
  'participants/cEEiv2vOfcd4Enf8Iwbo0wurUiv1',
  'participants/okliHAbvyNMhOR5DXXXytCkzOox2',
  'matches/match-rr-r1-wl31-0-1786553646758-0',
  'matches/match-rr-r1-wl31-1-1786553646758-0',
  'matches/match-rr-r1-wl31-2-1786553646758-0',
  'results/match-rr-r1-wl31-0-1786553646758-0',
  'results/match-rr-r1-wl31-1-1786553646758-0',
  'results/match-rr-r1-wl31-2-1786553646758-0',
  'notificationOutbox/wo-marcos-adriana-1789499906990',
];
const CHILDREN_WITH_DROP = CHILDREN.filter((name) => !name.endsWith(`u${KEEP}`) && !name.endsWith(`/${KEEP}`));
function childKey(pathName) { return pathName.replace(/\//g, '__'); }
function categoryUnion(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].filter(Boolean))];
}
function mergeEnrollment(keepItem, dropItem) {
  const keep = keepItem || {}, drop = dropItem || {};
  // `category` é o primário antigo (D, do jogo 123); `categories` carrega as duas inscrições.
  return Object.assign({}, drop, keep, {
    uid: KEEP,
    categories: categoryUnion(keep.categories, drop.categories),
    category: keep.category || drop.category || '',
    ligaActive: Boolean(keep.ligaActive || drop.ligaActive),
  });
}
async function preflight() {
  const refs = {
    keep: db.doc(`users/${KEEP}`),
    drop: db.doc(`users/${DROP}`),
    tournament: db.doc(`tournaments/${TOURNAMENT}`),
    summary: db.doc(`tournaments_summary/${TOURNAMENT}`),
    game123: db.doc(`tournaments/${TOURNAMENT}/matches/${GAME_123}`),
    result123: db.doc(`tournaments/${TOURNAMENT}/results/${GAME_123}`),
    game157: db.doc(`tournaments/${TOURNAMENT}/matches/${GAME_157}`),
    children: Object.fromEntries(CHILDREN.map((name) => [name, db.doc(`tournaments/${TOURNAMENT}/${name}`)])),
  };
  const baseRefs = [refs.keep, refs.drop, refs.tournament, refs.summary, refs.game123, refs.result123, refs.game157];
  const base = await Promise.all(baseRefs.map((ref) => ref.get()));
  const [keep, drop, tournament, summary, game123, result123, game157] = base;
  const childPairs = await Promise.all(Object.entries(refs.children).map(async ([name, ref]) => [name, await ref.get()]));
  const childSnaps = Object.fromEntries(childPairs);
  const kd = keep.data() || {}, dd = drop.data() || {};
  assert(keep.exists && drop.exists, 'uma das duas contas não existe');
  assert(!kd.mergedInto && !dd.mergedInto, 'uma das duas contas já está mesclada');
  assert(kd.displayName === 'Adriana Rosa' && dd.displayName === 'Adriana Rosa', 'os perfis não são o par esperado');
  assert(tournament.exists && summary.exists, 'torneio ou resumo esperado não existe');
  assert(Object.values(childSnaps).every((snap) => snap.exists), 'um vínculo auditado da Adriana desapareceu; abortado');
  assert(game123.exists && result123.exists, 'jogo 123 ou seu placar histórico não existe');
  const g123 = game123.data() || {}, r123 = result123.data() || {};
  assert(Array.isArray(g123.playerUids) && g123.playerUids.includes(KEEP), 'o jogo 123 não contém a conta sobrevivente');
  assert(Array.isArray(r123.sets) && r123.sets.length >= 2, 'o jogo 123 não tem o placar já lançado');
  assert(game157.exists, 'jogo 157 esperado não existe');
  const g157 = game157.data() || {};
  assert(findUidPaths(g157, DROP).length === 0, 'a duplicata reapareceu no jogo 157; abortado');
  const shown157 = JSON.stringify(g157);
  assert(shown157.includes('Jogador X') && shown157.includes('Eliane Cinelli'), 'o jogo 157 não está no estado corrigido; abortado');

  const rootRefs = await scanRootExact();
  const activeUnexpected = rootRefs.filter((item) =>
    item.path !== `tournaments/${TOURNAMENT}` &&
    item.path !== `tournaments_summary/${TOURNAMENT}` &&
    !allowedHistorical(item.path)
  );
  assert(activeUnexpected.length === 0,
    'há referência ativa não auditada à conta duplicada: ' + activeUnexpected.map((x) => x.path).join(', '));
  const childRefs = await scanTournamentChildrenExact(refs.tournament);
  const expectedChildPaths = new Set(CHILDREN_WITH_DROP.map((name) => `tournaments/${TOURNAMENT}/${name}`));
  assert(childRefs.every((item) => expectedChildPaths.has(item.path)),
    'há referência não auditada em subcoleção do torneio: ' + childRefs.filter((x) => !expectedChildPaths.has(x.path)).map((x) => x.path).join(', '));
  assert(childRefs.length === CHILDREN_WITH_DROP.length, 'faltou referência esperada no inventário do torneio; abortado');

  const tr = remapExactly(tournament.data() || {}, DROP, KEEP);
  const sr = remapExactly(summary.data() || {}, DROP, KEEP);
  assert(tr.changed && sr.changed, 'o estado ativo esperado não contém a conta duplicada');
  for (const [name, snap] of Object.entries(childSnaps)) {
    if (name.startsWith('inscritos/') || name.startsWith('participants/')) continue;
    assert(remapExactly(snap.data() || {}, DROP, KEEP).changed, `vínculo ${name} não contém a UID esperada`);
  }
  const profileUpdate = computeProfileMerge(kd, dd, KEEP);
  Object.assign(profileUpdate, computeLinkedIdentifiers(Object.assign({}, kd, profileUpdate), dd.email, dd.phone));
  return { refs, snaps: { keep, drop, tournament, summary, game123, result123, game157, childSnaps }, values: { kd, dd, tr, sr, profileUpdate }, rootRefs };
}
function compactPlan(state) {
  const { kd, dd, profileUpdate } = state.values;
  return {
    keep: { uid: KEEP, displayName: kd.displayName, email: kd.email },
    drop: { uid: DROP, displayName: dd.displayName, email: dd.email },
    game123: { id: GAME_123, playerUids: state.snaps.game123.data().playerUids, sets: state.snaps.result123.data().sets },
    game157Untouched: { id: GAME_157, hasJogadorX: JSON.stringify(state.snaps.game157.data()).includes('Jogador X'), hasEliane: JSON.stringify(state.snaps.game157.data()).includes('Eliane Cinelli') },
    activeDocumentsToRemap: [state.refs.tournament.path, state.refs.summary.path,
      ...Object.keys(state.refs.children).filter((x) => !x.startsWith('inscritos/') && !x.startsWith('participants/'))],
    enrollmentDocumentsCollapsedToOneUid: ['inscritos', 'participants'],
    preservedCategories: categoryUnion(
      state.snaps.childSnaps['inscritos/uokliHAbvyNMhOR5DXXXytCkzOox2'].data().item.categories,
      state.snaps.childSnaps['inscritos/ucEEiv2vOfcd4Enf8Iwbo0wurUiv1'].data().item.categories),
    historicalDocumentsPreservedWithoutChange: state.rootRefs.filter((x) => allowedHistorical(x.path)).map((x) => x.path),
    profileFieldsAbsorbed: Object.keys(profileUpdate),
    dropBecomesTombstone: true,
  };
}
async function apply() {
  const state = await preflight();
  console.log(JSON.stringify(compactPlan(state), null, 2));
  if (!APPLY) { console.log('\nENSAIO: nada foi gravado.'); return; }
  const { refs } = state;
  const now = new Date().toISOString();
  const undo = db.collection('mergeUndo').doc(DROP);
  await db.runTransaction(async (tx) => {
    const baseRefs = [refs.keep, refs.drop, refs.tournament, refs.summary, refs.game123, refs.result123, refs.game157];
    const [keep, drop, tournament, summary, game123, result123, game157] = await Promise.all(baseRefs.map((ref) => tx.get(ref)));
    const childPairs = await Promise.all(Object.entries(refs.children).map(async ([name, ref]) => [name, await tx.get(ref)]));
    const children = Object.fromEntries(childPairs);
    assert(keep.exists && drop.exists && !drop.data().mergedInto, 'estado das contas mudou antes da gravação');
    assert(Array.isArray(result123.data().sets) && result123.data().sets.length >= 2, 'placar do jogo 123 mudou; abortado');
    assert((game123.data().playerUids || []).includes(KEEP), 'conta sobrevivente saiu do jogo 123; abortado');
    assert(findUidPaths(game157.data() || {}, DROP).length === 0, 'duplicata reapareceu no 157; abortado');
    assert(JSON.stringify(game157.data() || {}).includes('Jogador X') && JSON.stringify(game157.data() || {}).includes('Eliane Cinelli'), '157 mudou; abortado');
    assert(Object.values(children).every((snap) => snap.exists), 'um documento auditado mudou antes da gravação');

    const currentTournament = remapExactly(tournament.data() || {}, DROP, KEEP);
    const currentSummary = remapExactly(summary.data() || {}, DROP, KEEP);
    assert(currentTournament.changed && currentSummary.changed, 'referências ativas da duplicata desapareceram antes da gravação');
    const currentProfileUpdate = computeProfileMerge(keep.data() || {}, drop.data() || {}, KEEP);
    Object.assign(currentProfileUpdate, computeLinkedIdentifiers(Object.assign({}, keep.data() || {}, currentProfileUpdate), (drop.data() || {}).email, (drop.data() || {}).phone));
    const keepInscrito = children['inscritos/uokliHAbvyNMhOR5DXXXytCkzOox2'].data();
    const dropInscrito = children['inscritos/ucEEiv2vOfcd4Enf8Iwbo0wurUiv1'].data();
    const keepParticipant = children[`participants/${KEEP}`].data();
    const dropParticipant = children[`participants/${DROP}`].data();
    const mergedEnrollment = mergeEnrollment(keepInscrito.item, dropInscrito.item);
    const mergedParticipantEntry = Object.assign({}, mergeEnrollment(keepParticipant.entry, dropParticipant.entry), {
      categories: mergedEnrollment.categories, category: mergedEnrollment.category,
    });

    // Caderno de reversão: cada retrato é salvo antes de qualquer mudança canônica.
    tx.set(undo.collection('passos').doc('profiles'), { keepBefore: keep.data(), dropBefore: drop.data() });
    tx.set(undo.collection('passos').doc('tournament'), { before: tournament.data(), path: refs.tournament.path });
    tx.set(undo.collection('passos').doc('summary'), { before: summary.data(), path: refs.summary.path });
    for (const [name, snap] of Object.entries(children)) tx.set(undo.collection('passos').doc(childKey(name)), { before: snap.data(), path: snap.ref.path });
    tx.set(undo, {
      sobreviveu: KEEP, absorvida: DROP, emMs: Date.now(), em: F.serverTimestamp(),
      motivo: 'mesclagem direcional explícita: preservar Adriana Rosa do jogo 123 já pontuado',
      documentos: 5 + Object.keys(children).length, completo: true, desfeita: false,
      authPendente: 'A conta Apple permanece utilizável para redirecionamento até a transferência de provedor ser verificada.',
    }, { merge: true });

    tx.set(refs.tournament, currentTournament.value);
    tx.set(refs.summary, currentSummary.value);
    for (const [name, snap] of Object.entries(children)) {
      if (name.startsWith('inscritos/') || name.startsWith('participants/')) continue;
      tx.set(snap.ref, remapExactly(snap.data() || {}, DROP, KEEP).value);
    }
    // Duas inscrições não ficam ativas sob UIDs diferentes. Categorias e histórico são unidos na inscrição sobrevivente.
    tx.set(children['inscritos/uokliHAbvyNMhOR5DXXXytCkzOox2'].ref, Object.assign({}, keepInscrito, { item: mergedEnrollment }));
    tx.set(children[`participants/${KEEP}`].ref, Object.assign({}, keepParticipant, { uid: KEEP, entry: mergedParticipantEntry }));
    tx.delete(children['inscritos/ucEEiv2vOfcd4Enf8Iwbo0wurUiv1'].ref);
    tx.delete(children[`participants/${DROP}`].ref);
    tx.set(refs.keep, Object.assign({}, currentProfileUpdate, { updatedAt: now }), { merge: true });
    tx.set(refs.drop, {
      mergedInto: KEEP, mergedAt: F.serverTimestamp(),
      mergeReason: 'explicit-merge-preserve-scored-game-123',
      mergeAudit: { keepUid: KEEP, appliedAt: now },
    }, { merge: true });
    const email = String((drop.data() || {}).email || '').trim().toLowerCase();
    if (email) tx.set(db.collection('loginRedirects').doc(email), { ownerUid: KEEP, at: F.serverTimestamp() }, { merge: true });
  });
  const [afterDrop, afterTournament, afterSummary, after123, afterResult123, after157, afterDropEnrollment, afterDropParticipant] = await Promise.all([
    refs.drop.get(), refs.tournament.get(), refs.summary.get(), refs.game123.get(), refs.result123.get(), refs.game157.get(),
    refs.children['inscritos/ucEEiv2vOfcd4Enf8Iwbo0wurUiv1'].get(), refs.children[`participants/${DROP}`].get(),
  ]);
  assert((afterDrop.data() || {}).mergedInto === KEEP, 'a lápide não foi gravada');
  assert(findUidPaths(afterTournament.data() || {}, DROP).length === 0, 'UID duplicado permaneceu no torneio ativo');
  assert(findUidPaths(afterSummary.data() || {}, DROP).length === 0, 'UID duplicado permaneceu no resumo ativo');
  assert((after123.data().playerUids || []).includes(KEEP) && Array.isArray((afterResult123.data() || {}).sets) && afterResult123.data().sets.length >= 2, 'o jogo 123 ou seu placar foi alterado');
  assert(findUidPaths(after157.data() || {}, DROP).length === 0 && JSON.stringify(after157.data() || {}).includes('Jogador X') && JSON.stringify(after157.data() || {}).includes('Eliane Cinelli'), 'o jogo 157 foi alterado');
  assert(!afterDropEnrollment.exists && !afterDropParticipant.exists, 'uma inscrição duplicada permaneceu ativa');
  const remainingChildren = await scanTournamentChildrenExact(refs.tournament);
  assert(remainingChildren.length === 0, 'UID duplicado permaneceu em subcoleção ativa: ' + remainingChildren.map((x) => x.path).join(', '));
  console.log('\nAPLICADO E RELIDO: jogo 123 preservado; jogo 157 intocado; UID ativo unificado.');
}
apply().catch((error) => { console.error('\nFALHOU:', error.stack || error.message || error); process.exit(1); });
