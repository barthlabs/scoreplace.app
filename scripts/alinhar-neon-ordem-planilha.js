#!/usr/bin/env node
/* Migração pontual: sequência e lados das duplas canônicas do Neon segundo a
 * planilha final. Nunca altera identidades, composição, categoria ou jogos.
 * Uso: --dry-run (padrão); --aplicar --backup PATH --sha256 HASH;
 *      --restaurar --backup PATH --sha256 HASH_POSTERIOR.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');
const admin = require('../functions/node_modules/firebase-admin');
const { workbookRows, align, alignedDayAssignments, nameScore, validateNumbering, reorderedMirror } = require('./neon-planilha-ordem-core');

const PROJECT = 'scoreplace-app';
const TOURNAMENT = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const i = args.indexOf(name); return i < 0 ? '' : String(args[i + 1] || ''); };
const fail = message => { throw new Error(message); };
const mode = flag('--restaurar') ? 'restore' : flag('--aplicar') ? 'apply' : 'dry-run';
if (flag('--sandbox-id') && !option('--sandbox-id')) fail('informe --sandbox-id completo');
const sandboxId = option('--sandbox-id');
if (sandboxId && !new RegExp('^sb_' + TOURNAMENT + '_[0-9]{13}$').test(sandboxId))
  fail('sandbox-id não pertence ao Neon esperado');
const targetId = sandboxId || TOURNAMENT;
const input = option('--planilha') || '/Users/rtb/Downloads/Participantes Neon Nightmare.xlsx';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const canonicalJson = value => JSON.stringify(value, (_key, entry) =>
  entry && !Array.isArray(entry) && typeof entry === 'object'
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b)))
    : entry);
if (flag('--restaurar') && flag('--aplicar')) fail('modos incompatíveis');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS))
  fail('credencial persistente da conta de serviço ausente');
if (!fs.existsSync(input)) fail('planilha final ausente');
const workbookBytes = fs.readFileSync(input);
const workbookSha256 = sha(workbookBytes);
const rows = workbookRows(XLSX.read(workbookBytes, { type: 'buffer' }));
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();
const rootRef = db.collection(sandboxId ? 'sandboxes' : 'tournaments').doc(targetId);
const regRef = rootRef.collection('registrations');
const mirrorRef = rootRef.collection('inscritos');

const memberKey = (item, side) => item[side + 'Uid'] ? 'uid:' + item[side + 'Uid'] :
  item[side + 'ManualId'] ? 'manual:' + item[side + 'ManualId'] : '';
const identitySet = keys => keys.slice().sort().join('\u0000');
const docsOf = snapshot => snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
function snapshotHash(state) {
  return sha(canonicalJson({ root: [state.root.name, state.root.canonicalRegistrationMigration,
      state.root.categoryDefinitions, state.root._nPartes, (state.root.participants || []).length,
      state.root.waitlist, state.root.standbyParticipants, state.root.monarchWaitlist,
      state.root.categorySchedule?.slots, state.root.teamCompetition?.schedule?.originDayPolicy,
      state.root.teamCompetition?.schedule?.pairDayAssignments,
      state.root.teamCompetition?.schedule?.rosterSnapshot,
      state.root.matches, state.root._phaseMaterialized, state.root._canonicalDraw,
      state.root.drawSelectionDone],
    registrationCount: state.registrations.length,
    registrations: state.registrations.map(x => [x.id, x.data.status, x.data.categoryId,
      x.data.fixedPairId, x.data.participantKey, x.data.manualDisplayName || '', x.data.enrollSeq]),
    mirror: state.mirror.map(x => [x.id, x.data.item]) }));
}
async function load(read) {
  const [root, regs, mirror] = await Promise.all([read(rootRef), read(regRef), read(mirrorRef)]);
  if (!root.exists || (root.data().isSandbox === true) !== !!sandboxId ||
      (sandboxId && root.data().sandboxOf !== TOURNAMENT) ||
      root.data().name !== 'NEON NIGHTMARE – THE TOURNAMENT')
    fail('alvo de produção não corresponde ao Neon esperado');
  const state = { root: root.data(), registrations: docsOf(regs), mirror: docsOf(mirror) };
  if (state.root.teamCompetition?.schedule?.originDayPolicy === 'organizer-pair-days')
    fail('dias das duplas agora são definidos no app; esta planilha histórica não pode substituir o plano do organizador');
  if (state.root.canonicalRegistrationMigration?.registrationCount !== state.registrations.length ||
      state.registrations.filter(x => x.data.status === 'confirmed').length !== 128 ||
      state.mirror.length !== 64 || (state.root.participants || []).length !== 0)
    fail('contagens/recibo canônico alterados; operação cancelada');
  if ((state.root.matches || []).length || Number(state.root._phaseMaterialized || 0) > 0 ||
      state.root._canonicalDraw || state.root.drawSelectionDone === true)
    fail('já existem jogos ou sorteio; reordenação cancelada');
  validateNumbering(state.registrations.map(x => x.data), state.root);
  return state;
}
async function plan(state) {
  const labels = new Map((state.root.categoryDefinitions || []).map(x => [x.id, x.label]));
  const active = state.registrations.filter(x => x.data.status === 'confirmed');
  const uids = [...new Set(active.map(x => x.data.participantUid).filter(Boolean))];
  const users = await db.getAll(...uids.map(uid => db.collection('users').doc(uid)));
  const names = new Map(users.map(doc => [doc.id, doc.data()?.displayName || doc.data()?.name || '']));
  const grouped = new Map();
  active.forEach(doc => {
    const data = doc.data, pairId = data.fixedPairId;
    if (!pairId || !data.participantKey || !Number.isInteger(data.enrollSeq)) fail('registro ativo incompleto');
    if (!grouped.has(pairId)) grouped.set(pairId, []);
    grouped.get(pairId).push({ id: doc.id, key: data.participantKey,
      name: data.manualDisplayName || names.get(data.participantUid) || '', seq: data.enrollSeq,
      categoryId: data.categoryId });
  });
  if (grouped.size !== 64 || new Set(active.map(x => x.data.enrollSeq)).size !== 128)
    fail('duplas ou numeração atuais inválidas');
  const pairs = [...grouped].map(([id, members]) => {
    if (members.length !== 2 || members[0].categoryId !== members[1].categoryId ||
        !members[0].name || !members[1].name) fail('dupla incompleta: ' + id);
    members.sort((a, b) => a.seq - b.seq);
    return { id, category: labels.get(members[0].categoryId), members };
  });
  const aligned = align(rows, pairs);
  aligned.dayPlan = alignedDayAssignments(aligned, state.root.categorySchedule?.slots,
    state.root.teamCompetition?.schedule);
  aligned.rosterSnapshot = aligned.map(entry => ({ fixedPairId: entry.pair.id,
    categoryId: entry.first.categoryId })).sort((a, b) => a.fixedPairId.localeCompare(b.fixedPairId));
  const priorRoster = state.root.teamCompetition?.schedule?.rosterSnapshot || [];
  if (priorRoster.length !== 64) fail('snapshot de duplas incompleto');
  aligned.rosterChanges = aligned.rosterSnapshot.filter(entry => !priorRoster.some(item =>
    item.fixedPairId === entry.fixedPairId && item.categoryId === entry.categoryId)).length;
  if (aligned.rosterChanges > 1) fail('snapshot diverge demais das duplas atuais');
  const byIdentity = new Map();
  state.mirror.forEach(doc => {
    const item = doc.data.item || {}, keys = [memberKey(item, 'p1'), memberKey(item, 'p2')];
    const id = identitySet(keys);
    if (!keys[0] || !keys[1] || byIdentity.has(id)) fail('espelho ambíguo: ' + doc.id);
    byIdentity.set(id, doc);
  });
  for (const entry of aligned) {
    const id = identitySet(entry.pair.members.map(x => x.key));
    entry.mirror = byIdentity.get(id);
    if (!entry.mirror || entry.mirror.data.item.fixedPair !== true) fail('espelho da dupla ausente: ' + entry.pair.id);
    entry.mirrorReversed = memberKey(entry.mirror.data.item, 'p1') !== entry.first.key;
  }
  return aligned;
}
function predictedState(state, aligned) {
  const sequence = new Map();
  const mirrors = new Map();
  aligned.forEach(entry => {
    sequence.set(entry.first.id, entry.seq);
    sequence.set(entry.second.id, entry.seq + 1);
    mirrors.set(entry.mirror.id, reorderedMirror(entry.mirror.data.item, entry.first.key, entry.seq));
  });
  return { root: { ...state.root, teamCompetition: { ...state.root.teamCompetition,
    schedule: { ...state.root.teamCompetition.schedule,
      pairDayAssignments: aligned.dayPlan.assignments,
      rosterSnapshot: aligned.rosterSnapshot } } },
    registrations: state.registrations.map(doc => ({ id: doc.id, data: sequence.has(doc.id)
      ? { ...doc.data, enrollSeq: sequence.get(doc.id) } : doc.data })),
    mirror: state.mirror.map(doc => ({ id: doc.id, data: mirrors.has(doc.id)
      ? { ...doc.data, item: mirrors.get(doc.id) } : doc.data })) };
}
function backupFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-neon-planilha-ordem-'));
  fs.chmodSync(dir, 0o700);
  return path.join(dir, 'backup.json');
}
function backupAt(filename) {
  if (!path.isAbsolute(filename)) fail('--backup exige caminho absoluto');
  const backup = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (backup.project !== PROJECT || backup.tournamentId !== targetId ||
      backup.workbookSha256 !== workbookSha256 || backup.sha256 !== sha(JSON.stringify(backup.before)))
    fail('backup ou planilha diverge');
  return backup;
}
(async () => {
  const current = await load(ref => ref.get());
  const aligned = await plan(current);
  const hash = snapshotHash(current);
  const changes = aligned.filter(e => e.first.seq !== e.seq || e.second.seq !== e.seq + 1 || e.mirrorReversed);
  const detail = { mode, targetId, workbookSha256, pairs: aligned.length, people: aligned.length * 2,
    reorderedPairs: changes.length, flippedPairs: aligned.filter(e => e.reversed).length,
    mirrorFlips: aligned.filter(e => e.mirrorReversed).length,
    correctedDays: aligned.dayPlan.changes, staleDayIds: aligned.dayPlan.staleIds,
    rosterChanges: aligned.rosterChanges, fridayPairs: aligned.dayPlan.fridayPairIds.length,
    weakestScore: Math.min(...aligned.map(e => e.score)), stateSha256: hash };
  if (mode === 'dry-run') {
    if (flag('--detalhes')) aligned.forEach(e => {
      const scores = [nameScore(e.row.members[0], e.first.name), nameScore(e.row.members[1], e.second.name)];
      if (Math.min(...scores) < 0.5) console.log(JSON.stringify({ category: e.row.category,
        sheet: e.row.sheetName, row: e.row.row, source: e.row.members,
        current: [e.first.name, e.second.name], scores }));
    });
    const filename = backupFile();
    const before = { pairDayAssignments: current.root.teamCompetition.schedule.pairDayAssignments,
      rosterSnapshot: current.root.teamCompetition.schedule.rosterSnapshot,
      registrations: current.registrations.map(x => ({ id: x.id, seq: x.data.enrollSeq })),
      mirror: current.mirror.map(x => ({ id: x.id, item: x.data.item })) };
    const backup = { project: PROJECT, tournamentId: targetId, workbookSha256,
      before, sha256: sha(JSON.stringify(before)), stateSha256: hash,
      expectedAfterStateSha256: snapshotHash(predictedState(current, aligned)) };
    fs.writeFileSync(filename, JSON.stringify(backup), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ ...detail, backup: filename, backupSha256: backup.sha256 }));
    return;
  }
  const filename = option('--backup'), backup = backupAt(filename);
  if (mode === 'apply' && (option('--sha256') !== backup.sha256 || hash !== backup.stateSha256))
    fail('prévia desatualizada; operação cancelada');
  if (mode === 'restore' && (!backup.expectedAfterStateSha256 ||
      option('--sha256') !== backup.expectedAfterStateSha256 ||
      hash !== backup.expectedAfterStateSha256)) fail('estado pós-aplicação diverge; restauração cancelada');
  await db.runTransaction(async tx => {
    const [root, regs, mirror] = await Promise.all([tx.get(rootRef), tx.get(regRef), tx.get(mirrorRef)]);
    const live = { root: root.data(), registrations: docsOf(regs), mirror: docsOf(mirror) };
    if (snapshotHash(live) !== hash) fail('estado mudou durante a transação; operação cancelada');
    if ((live.root.matches || []).length || Number(live.root._phaseMaterialized || 0) > 0 ||
        live.root._canonicalDraw || live.root.drawSelectionDone === true)
      fail('sorteio ou jogos surgiram durante a transação; operação cancelada');
    if (mode === 'apply') {
      if (aligned.dayPlan.changes || aligned.rosterChanges) tx.update(rootRef, {
        'teamCompetition.schedule.pairDayAssignments': aligned.dayPlan.assignments,
        'teamCompetition.schedule.rosterSnapshot': aligned.rosterSnapshot });
      for (const entry of aligned) {
        tx.update(regRef.doc(entry.first.id), { enrollSeq: entry.seq });
        tx.update(regRef.doc(entry.second.id), { enrollSeq: entry.seq + 1 });
        tx.update(mirrorRef.doc(entry.mirror.id), {
          item: reorderedMirror(entry.mirror.data.item, entry.first.key, entry.seq) });
      }
    } else {
      tx.update(rootRef, {
        'teamCompetition.schedule.pairDayAssignments': backup.before.pairDayAssignments,
        'teamCompetition.schedule.rosterSnapshot': backup.before.rosterSnapshot });
      for (const entry of backup.before.registrations) {
        if (entry.seq !== undefined) tx.update(regRef.doc(entry.id), { enrollSeq: entry.seq });
      }
      for (const entry of backup.before.mirror) tx.update(mirrorRef.doc(entry.id), { item: entry.item });
    }
  });
  const after = await load(ref => ref.get());
  const afterHash = snapshotHash(after);
  if (mode === 'apply') {
    if (afterHash !== backup.expectedAfterStateSha256) fail('hash pós-aplicação divergiu do backup');
    const updated = await plan(after);
    if (updated.dayPlan.changes || updated.rosterChanges ||
        updated.some(e => e.first.seq !== e.seq || e.second.seq !== e.seq + 1 || e.mirrorReversed ||
        e.mirror.data.item.p1Seq !== e.seq || e.mirror.data.item.p2Seq !== e.seq + 1))
      fail('verificação pós-aplicação falhou');
  } else if (afterHash !== backup.stateSha256) fail('restauração não reproduziu a prévia');
  console.log(JSON.stringify({ mode, targetId, people: 128, pairs: 64, stateSha256: afterHash }));
})().catch(error => { console.error('[neon-planilha-ordem] ' + error.message); process.exitCode = 1; });
