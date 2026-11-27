#!/usr/bin/env node
'use strict';

// Correção delimitada às duas vagas restantes e à grafia do sorteio oficial do CULT.
// Uso: node scripts/remanejar-atletas-cult-20261127.cjs --preview|--apply PDF PLANO_PRIVADO [trocas|grafia]
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const admin = createRequire(path.resolve(__dirname, '../functions/package.json'))('firebase-admin');
const { HttpsError } = createRequire(path.resolve(__dirname, '../functions-autodraw/package.json'))('firebase-functions/v2/https');
const rename = require('../functions/rename-canonical-participant-core');
const { normalizeName } = require('../functions/manual-name-unique-core');
const { nameKey } = require('../functions/historical-athlete-claim-core');
const { fingerprint } = require('../functions-autodraw/tournament-rehearsal');
const checkpoint = require('../functions-autodraw/tournament-draw-checkpoint');

const ID = 'tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
const OWNER = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const PDF_SHA = '7a4ec8cdf9c0e9eaeb10566a1cd7853624b1d9b1441fffec69e4263f7d99d09d';
const SCOPES = {
  trocas: [
    { oldName: 'Camila Calia', newName: 'Juliana Carneiro', group: 'E', category: 'Categoria C' },
    { oldName: 'Fabíola Baldscci', newName: 'Camila Calia', group: 'B', category: 'Categoria B' }
  ],
  grafia: [{ oldName: 'Lu Sores', newName: 'Lu Soares', group: 'D', category: 'Categoria C' }]
};
const COLLECTIONS = ['matches', 'grupos', 'participants', 'inscritos', 'opponentHistory', 'checkedIn', 'woClaims', 'woLog'];
const [mode, pdfPath, planPath, scopeArgument, ...extra] = process.argv.slice(2);
const scope = scopeArgument || 'trocas', CHANGES = SCOPES[scope];
if (!['--preview', '--apply'].includes(mode) || !pdfPath || !planPath || !CHANGES || extra.length) {
  throw new Error('uso: --preview|--apply PDF PLANO_PRIVADO [trocas|grafia]');
}
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
if (sha(fs.readFileSync(path.resolve(pdfPath))) !== PDF_SHA) throw new Error('PDF diferente do pedido autorizado.');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Credencial não configurada.');
const identity = JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
if (identity.project_id !== 'scoreplace-app' || !identity.private_key) throw new Error('Credencial fora do projeto.');
admin.initializeApp({ credential: admin.credential.cert(identity), projectId: 'scoreplace-app' });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(ID);
const manifest = db.collection('tournamentDrawCheckpoints').doc(ID);
const operation = sha(JSON.stringify({ ID, PDF_SHA, CHANGES }));
const audit = db.collection('tournamentAdminCorrections').doc(ID).collection('operations').doc(operation);

async function load(tx) {
  const get = target => tx ? tx.get(target) : target.get();
  const [root, registrations, checkpointManifest, ...collections] = await Promise.all([
    get(ref), get(ref.collection('registrations')), get(manifest),
    ...COLLECTIONS.map(name => get(ref.collection(name)))
  ]);
  if (!root.exists || root.data().creatorUid !== OWNER) throw new Error('Torneio diferente do autorizado.');
  const regs = registrations.docs.map(doc => ({ ...doc.data() }));
  const docs = collections.flatMap((snap, index) => snap.docs.map(doc => ({
    id: doc.id, collection: COLLECTIONS[index], ref: doc.ref, data: doc.data()
  }))).sort((a, b) => a.ref.path.localeCompare(b.ref.path));
  const profileIds = [...new Set(regs.map(r => r.participantUid).filter(Boolean))];
  const profiles = await Promise.all(profileIds.map(uid => get(db.collection('usersPublic').doc(uid))));
  if (profiles.some(p => !p.exists || !p.data().displayName)) throw new Error('Perfil de inscrito indisponível.');
  return { root: root.data(), regs, docs, checkpointManifest: checkpointManifest.data(),
    accountNames: profiles.map(p => p.data().displayName) };
}

function beforeHash(state) {
  return fingerprint({ root: state.root, regs: state.regs,
    docs: state.docs.map(doc => ({ path: doc.ref.path, data: doc.data })) });
}

function build(state) {
  const t0 = state.root;
  const cp = t0.drawCheckpoint;
  if (t0.testModeEnabled !== true || t0.isSandbox === true ||
      t0.rehearsal?.state !== 'active' || t0.rehearsal?.mode !== 'preDraw' ||
      !checkpoint.preserved(t0) || cp.epoch !== state.checkpointManifest?.activeEpoch ||
      cp.hash !== state.checkpointManifest?.hash) throw new Error('Reset/fotografia fora do estado autorizado.');
  if (state.regs.length !== 48 || state.docs.filter(d => d.collection === 'matches').length !== 84) {
    throw new Error('A quantidade de inscrições ou jogos mudou.');
  }
  const games = state.docs.filter(d => d.collection === 'matches').map(d => d.data.jogo);
  if (games.some(g => !g || g.winner || g.completed || g._scoreSubmitted || g.courtCalledAt ||
      g.startedAt || g.gameStartedAt || g.endedAt || Number(g.scoreP1) || Number(g.scoreP2) ||
      (Array.isArray(g.sets) && g.sets.some(s => Number(s.scoreP1) || Number(s.scoreP2))))) {
    throw new Error('Há jogo chamado ou com placar; operação recusada.');
  }
  let t = { ...t0 }, regs = state.regs.map(r => ({ ...r })), docs = state.docs.map(d => ({ ...d }));
  const targets = [];
  for (const change of CHANGES) {
    const candidates = regs.filter(r => normalizeName(r.manualDisplayName) === normalizeName(change.oldName));
    if (candidates.length !== 1) throw new Error('A vaga de origem mudou ou é ambígua.');
    const target = candidates[0];
    const definition = t.categoryDefinitions?.find(d => d.id === target.categoryId);
    if (target.participantKind !== 'manual' || target.participantUid || target.status !== 'confirmed' ||
        target.fixedPairId || target.paymentState || target.paymentDueCents || target.proofPath ||
        !definition?.label.includes(change.category)) throw new Error('Vaga/categoria não confere.');
    const appearances = docs.filter(d => d.collection === 'matches').map(d => d.data.jogo)
      .filter(g => [...(g.team1 || []), ...(g.team2 || [])]
        .some(name => normalizeName(name) === normalizeName(change.oldName)));
    if (appearances.length !== 7 || appearances.some(g =>
      String(g.scheduledGroupLabel || '').replace(/^Grupo\s+/, '') !== change.group ||
      ![...(g.team1SlotIds || []), ...(g.team2SlotIds || [])].includes(target.participantKey))) {
      throw new Error('O grupo, a vaga ou os sete confrontos não conferem.');
    }
    const result = rename.plan(t, regs, { oldName: change.oldName,
      newName: change.newName, manualParticipantId: target.manualParticipantId }, state.accountNames, docs);
    const changed = new Map(result.documents.map(doc => [doc.ref.path, doc.data]));
    docs = docs.map(doc => changed.has(doc.ref.path) ? { ...doc, data: changed.get(doc.ref.path) } : doc);
    t = { ...t, ...result.rootPatch };
    regs = regs.map(r => r.registrationId === target.registrationId ?
      { ...r, manualDisplayName: change.newName } : r);
    targets.push({ registrationId: target.registrationId, oldName: change.oldName,
      newName: change.newName, group: change.group, appearances: appearances.length });
  }
  const changedDocs = docs.filter((doc, i) => fingerprint(doc.data) !== fingerprint(state.docs[i].data));
  const rootPatch = {};
  for (const key of Object.keys(t)) {
    if (fingerprint(t[key]) !== fingerprint(t0[key])) rootPatch[key] = t[key];
  }
  const gamePins = checkpoint.gamePins(t, docs.filter(d => d.collection === 'matches')
    .map(d => ({ path: 'matches/' + d.id, data: d.data })));
  const writes = targets.length + changedDocs.length + 2;
  if (writes > 400) throw new Error('Escritas acima do limite da transação.');
  return { targets, changedDocs, rootPatch, gamePins, writes };
}

async function verify(receipt) {
  const state = await load();
  if (state.root.drawCheckpoint?.epoch !== receipt.epoch ||
      !checkpoint.preserved(state.root) ||
      state.checkpointManifest?.activeEpoch !== receipt.epoch ||
      state.checkpointManifest?.hash !== state.root.drawCheckpoint.hash ||
      state.regs.some(r => receipt.targets.some(t => t.registrationId === r.registrationId &&
        r.manualDisplayName !== t.newName)) ||
      fingerprint(checkpoint.gamePins(state.root, state.docs.filter(d => d.collection === 'matches')
        .map(d => ({ path: 'matches/' + d.id, data: d.data })))) !== fingerprint(receipt.gamePins)) {
    throw new Error('O estado final não confere com o recibo.');
  }
  return state;
}

(async () => {
  if (mode === '--preview') {
    const state = await load(), plan = build(state);
    const preview = { schema: 1, tournamentId: ID, operation, pdfSha: PDF_SHA,
      beforeHash: beforeHash(state), oldEpoch: state.root.drawCheckpoint.epoch,
      epoch: crypto.randomUUID(), targets: plan.targets, gamePins: plan.gamePins,
      writes: plan.writes, createdAt: new Date().toISOString() };
    fs.writeFileSync(planPath, JSON.stringify(preview, null, 2), { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(planPath + '.backup.json', JSON.stringify({ root: state.root,
      registrations: state.regs, documents: state.docs.map(d => ({ path: d.ref.path, data: d.data })) }),
    { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ preview: true, targets: preview.targets, writes: preview.writes,
      games: 84, checkpoint: preview.oldEpoch }));
    return;
  }
  const preview = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  if (preview.schema !== 1 || preview.tournamentId !== ID || preview.operation !== operation ||
      preview.pdfSha !== PDF_SHA) throw new Error('Prévia fora do escopo.');
  const receipt = await db.runTransaction(async tx => {
    const [state, prior] = await Promise.all([load(tx), tx.get(audit)]);
    if (prior.exists) {
      const saved = prior.data();
      if (saved.operation !== operation || saved.epoch !== preview.epoch) throw new Error('Recibo divergente.');
      return saved;
    }
    if (beforeHash(state) !== preview.beforeHash || state.root.drawCheckpoint.epoch !== preview.oldEpoch) {
      throw new Error('O torneio mudou desde a prévia; nenhuma alteração foi feita.');
    }
    const plan = build(state);
    if (plan.writes !== preview.writes || fingerprint(plan.gamePins) !== fingerprint(preview.gamePins)) {
      throw new Error('Os confrontos mudaram desde a prévia.');
    }
    const saved = { schema: 1, operation, tournamentId: ID, pdfSha: PDF_SHA,
      epoch: preview.epoch, previousEpoch: preview.oldEpoch, targets: plan.targets,
      gamePins: plan.gamePins, writes: plan.writes, appliedAt: new Date().toISOString() };
    for (const target of plan.targets) {
      tx.update(ref.collection('registrations').doc(target.registrationId), {
        manualDisplayName: target.newName, manualNameKey: nameKey(target.newName),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    for (const doc of plan.changedDocs) tx.set(doc.ref, doc.data);
    tx.update(ref, { ...plan.rootPatch, drawCheckpoint: { state: 'capturing',
      epoch: preview.epoch, hash: '', expectedGames: plan.gamePins, preserveBefore: true },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      _phaseReadCertificate: admin.firestore.FieldValue.delete() });
    tx.create(audit, saved);
    return saved;
  });
  const current = (await ref.get()).data();
  if (current.drawCheckpoint?.state === 'capturing' && current.drawCheckpoint.epoch === receipt.epoch) {
    await checkpoint.makeService({ db, HttpsError }).capture(ID, receipt.epoch);
  }
  await verify(receipt);
  fs.writeFileSync(planPath + '.receipt.json', JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ applied: true, verified: true, targets: receipt.targets,
    games: 84, writes: receipt.writes, checkpoint: receipt.epoch }));
})().catch(error => { console.error(error.stack); process.exitCode = 1; })
  .finally(() => db.terminate());
