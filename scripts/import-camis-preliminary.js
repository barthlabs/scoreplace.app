#!/usr/bin/env node
'use strict';

// Importação pontual do elenco preliminar CAMIS. Sem UID de conta, nomes não são chaves.
// --dry-run imprime o hash da prévia; --apply --plan-hash HASH confirma exatamente essa fotografia.
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const mutations = require('../functions/registration-mutations-core');
const boundary = require('../functions/canonical-registration-boundary-core');

const TOURNAMENT_ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const INPUT = '/Users/rtb/Downloads/camis/camis.xlsx';
const CATEGORIES = [{ sheet: 'diamante', label: 'Fem Diamante', count: 32 },
  { sheet: 'ouro', label: 'Fem Ouro', count: 64 }, { sheet: 'prata', label: 'Fem Prata', count: 48 }];
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const expected = args[args.indexOf('--plan-hash') + 1] || '';
const fail = text => { throw new Error(text); };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const workbookBytes = fs.readFileSync(INPUT);
const workbookHash = sha(workbookBytes);
const workbook = XLSX.read(workbookBytes, { type: 'buffer' });
if (workbook.SheetNames.join('|') !== CATEGORIES.map(x => x.sheet).join('|')) fail('abas inesperadas');
const rows = CATEGORIES.map(category => {
  const all = XLSX.utils.sheet_to_json(workbook.Sheets[category.sheet], { header: 1, defval: '' });
  const names = all.map(row => String(row[0] || '').trim()).filter(Boolean);
  if (names.length !== category.count || all.some(row => row.slice(1).some(v => String(v || '').trim()))) fail('contagens ou colunas da planilha divergentes');
  return { ...category, names };
});
const names = rows.flatMap(x => x.names);
if (new Set(names.map(x => x.normalize('NFKC').toLocaleLowerCase('pt-BR'))).size !== 144) fail('nomes repetidos');
const credential = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(credential), projectId: 'scoreplace-app' });
const db = admin.firestore();
const rootRef = db.collection('tournaments').doc(TOURNAMENT_ID);
const stamp = snap => snap.updateTime ? snap.updateTime.toMillis() : 0;
const stateHash = state => sha(JSON.stringify({ root: stamp(state.root),
  reservations: (state.root.data().placeholderReservations || []).map(x => x.manualParticipantId),
  mirrors: state.mirrors.docs.map(x => [x.id, stamp(x)]).sort((a,b) => a[0].localeCompare(b[0])),
  registrations: state.registrations.docs.map(x => [x.id, stamp(x)]),
  games: state.games.map(x => x.size) }));
async function load(read) {
  const [root, mirrors, registrations, ...games] = await Promise.all([
    read(rootRef), read(rootRef.collection('inscritos')),
    read(rootRef.collection('registrations')),
    ...['matches', 'rounds', 'grupos', 'woClaims'].map(part => read(rootRef.collection(part).limit(1)))
  ]);
  if (!root.exists) fail('CAMIS ausente');
  const t = root.data();
  if (t.name !== 'Camis no Beyond' || t.isSandbox === true || t.organizerOnly !== true || t.isPublic !== false) fail('alvo/privacidade divergente');
  if ((t.canonicalRegistrationMigration || {}).registrationCount !== 0 || registrations.size !== 0) fail('já há inscrições canônicas');
  if ((t.placeholderReservations || []).length !== 144 || mirrors.size !== 144 ||
      (t.participants || []).length !== 0 || Number((t._nPartes || {}).participants) !== 144) fail('elenco atual divergiu');
  if (games.some(x => x.size) || ['matches', 'rounds', 'groups'].some(k => Array.isArray(t[k]) && t[k].length) ||
      Number((t._nPartes || {}).matches || 0) || t.drawSelectionDone || t._canonicalDraw) fail('sorteio/jogo já existe');
  const labels = new Map((t.categoryDefinitions || []).map(x => [x.label, x.id]));
  if (rows.some(x => !labels.has(x.label))) fail('categorias não correspondem');
  const reserveIds = (t.placeholderReservations || []).map(x => x.manualParticipantId);
  if (new Set(reserveIds).size !== 144) fail('ID de reserva duplicado');
  for (let i = 0; i < 144; i++) {
    const id = 'manual-' + TOURNAMENT_ID + '-' + String(i + 1).padStart(2, '0');
    if (reserveIds[i] !== id || t.placeholderReservations[i].isPlaceholder !== true ||
        t.placeholderReservations[i].genericPlaceholderReservation !== true) fail('reservas não são o lote genérico esperado');
    const mirror = mirrors.docs.find(doc => doc.id === 'm' + id);
    if (!mirror || mirror.data().item?.manualParticipantId !== id || mirror.data().item?.isPlaceholder !== true) fail('espelho de reserva divergente');
  }
  return { root, mirrors, registrations, games, labels };
}
function plan(state) {
  const t = state.root.data();
  let seq = 0;
  const creates = [];
  for (const category of rows) {
    for (const name of category.names) {
      seq++;
      const manualParticipantId = t.placeholderReservations[seq - 1].manualParticipantId;
      const decision = mutations.enroll(TOURNAMENT_ID, [], { manualParticipantId }, [state.labels.get(category.label)],
        { status: 'confirmed', validationState: 'approved', manualDisplayName: name });
      if (decision.creates.length !== 1) fail('falha ao compor inscrição');
      creates.push({ ...decision.creates[0], enrollSeq: seq });
    }
  }
  const next = boundary.applyCreates({ id: TOURNAMENT_ID, ...t }, [], creates);
  if (next.participants.length !== 144 || next.tournament.canonicalRegistrationMigration.registrationCount !== 144 ||
      creates.some(x => x.participantUid !== null)) fail('projeção canônica inválida');
  return { creates, next, planHash: sha(workbookHash + ':' + stateHash(state) + ':' + sha(JSON.stringify(creates))) };
}
function backup(state) {
  const path = '/private/tmp/camis-preliminary-before-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  const content = JSON.stringify({ target: TOURNAMENT_ID, workbookSha256: workbookHash, stateHash: stateHash(state),
    root: state.root.data(), mirrors: state.mirrors.docs.map(x => ({ id: x.id, data: x.data() })),
    registrations: state.registrations.docs.map(x => ({ id: x.id, data: x.data() })) });
  const fd = fs.openSync(path, 'wx', 0o600);
  try { fs.writeFileSync(fd, content); } finally { fs.closeSync(fd); }
  return { path, hash: sha(content) };
}
(async () => {
  const initial = await load(ref => ref.get());
  const preview = plan(initial);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', counts: rows.map(x => [x.sheet, x.count]),
    workbookSha256: workbookHash, planHash: preview.planHash, existingPlaceholders: 144, newManualRegistrations: 144 }));
  if (!apply) return;
  if (expected !== preview.planHash) fail('hash da prévia não confere');
  const saved = backup(initial);
  console.log(JSON.stringify({ backup: saved.path, backupSha256: saved.hash }));
  await db.runTransaction(async tx => {
    const fresh = await load(ref => tx.get(ref));
    const current = plan(fresh);
    if (current.planHash !== expected) fail('estado mudou desde a prévia; transação abortada');
    const t = fresh.root.data();
    current.creates.forEach(item => tx.create(rootRef.collection('registrations').doc(item.registrationId), {
      ...item, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
    fresh.mirrors.docs.forEach(doc => tx.delete(doc.ref));
    tx.update(rootRef, { placeholderReservations: [], _nPartes: { ...t._nPartes, participants: 0 },
      canonicalRegistrationMigration: current.next.tournament.canonicalRegistrationMigration,
      memberUids: boundary.memberUids(current.next.tournament, current.next.registrations),
      updatedAt: admin.firestore.FieldValue.serverTimestamp() });
  }, { maxAttempts: 1 });
  const after = await rootRef.get();
  const [regs, mirrors] = await Promise.all([rootRef.collection('registrations').get(), rootRef.collection('inscritos').get()]);
  const actual = regs.docs.map(x => x.data());
  const countByCategory = new Map(rows.map(x => [initial.labels.get(x.label), 0]));
  actual.forEach(x => countByCategory.set(x.categoryId, (countByCategory.get(x.categoryId) || 0) + 1));
  if (regs.size !== 144 || mirrors.size !== 0 || (after.data().placeholderReservations || []).length !== 0 ||
      after.data().canonicalRegistrationMigration.registrationCount !== 144 ||
      actual.some(x => x.participantUid !== null) ||
      rows.some(x => countByCategory.get(initial.labels.get(x.label)) !== x.count) ||
      new Set(actual.map(x => x.manualDisplayName)).size !== 144) fail('verificação posterior divergente');
  console.log(JSON.stringify({ verified: true, registrations: regs.size, mirrors: mirrors.size,
    categoryCounts: rows.map(x => [x.sheet, countByCategory.get(initial.labels.get(x.label))]), accountUidCount: 0 }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
