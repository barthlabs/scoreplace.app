#!/usr/bin/env node
/* Reordena SOMENTE a numeração do Neon conforme as seis fotos de 15/out/2026.
 * A fonte auditável é neon-ordem-fotos-2026-10-15.json (64 fixedPairId em ordem).
 * Inscrição, UID, nome manual, categoria de origem/destino, times, jogos, pontos e
 * recibo de migração não são alterados. `functions/registration-core.js`
 * calcula o fingerprint só de registrationId/pairId/conflitos; seq não entra.
 * O root legado deste Neon tem participants:[] (auditado em 16/out/2026);
 * a UI/callables leem o canônico quando há recibo. O espelho `inscritos`
 * contém p1Seq/p2Seq e é ajustado na MESMA transação da fonte canônica.
 * `syncMatchRosters` escuta só escrita em tournaments/{tid}, não subcoleções.
 * Se qualquer identidade/ordem mudar, aborta.
 * Após uma futura reclassificação na Análise, enrollSeq continua sendo o número
 * original da inscrição; não renumerar novamente pelo novo agrupamento.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const admin = require('../functions/node_modules/firebase-admin');
const photoOrder = require('./neon-ordem-fotos-2026-10-15.json');
const PROJECT = 'scoreplace-app';
const TOURNAMENT = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const CATEGORY_COUNTS = [['Fem Light', 16], ['Fem Power', 8], ['Fem Extreme', 8],
  ['Masc Light', 16], ['Masc Power', 8], ['Masc Extreme', 8]];
const args = process.argv.slice(2);
const mode = args.includes('--aplicar') ? 'apply' : args.includes('--restaurar') ? 'restore' : 'dry-run';
const option = (name) => { const i = args.indexOf(name); return i < 0 ? '' : String(args[i + 1] || ''); };
const fail = (message) => { throw new Error(message); };
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const logicalHash = (state) => hash({ migration: state.migration, counter: state.counter,
  registrations: state.registrations.map(({ id, data }) => ({ id, data })),
  mirror: state.mirror.map(({ id, data }) => ({ id, data })) });
function nonSequenceHash(state) {
  return hash({ migration: state.migration, counter: state.counter,
    registrations: state.registrations.map(({ id, data }) => {
      const copy = { ...data }; delete copy.enrollSeq; return { id, data: copy };
    }),
    mirror: state.mirror.map(({ id, data }) => {
      const copy = JSON.parse(JSON.stringify(data));
      if (copy.item) { delete copy.item.p1Seq; delete copy.item.p2Seq; }
      return { id, data: copy };
    }) });
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS))
  fail('credencial persistente da conta de serviço ausente');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();
const rootRef = db.collection('tournaments').doc(TOURNAMENT);
const regRef = rootRef.collection('registrations');
const mirrorRef = rootRef.collection('inscritos');
const docsOf = (snap) => snap.docs.map((doc) => ({ id: doc.id, data: doc.data(),
  updateTime: doc.updateTime.toDate().toISOString() })).sort((a, b) => a.id.localeCompare(b.id));
const stateOf = (root, regs, mirror) => ({
  rootUpdateTime: root.updateTime.toDate().toISOString(),
  migration: root.data().canonicalRegistrationMigration,
  counter: root.data()._nPartes && root.data()._nPartes.participants,
  registrations: docsOf(regs), mirror: docsOf(mirror)
});
async function readNow() {
  const [root, regs, mirror] = await Promise.all([rootRef.get(), regRef.get(), mirrorRef.get()]);
  if (!root.exists || root.data().isSandbox === true) fail('alvo ausente ou sandbox');
  return { root, state: stateOf(root, regs, mirror) };
}
function proposal(root, state, expectApplied = false) {
  if (!state.migration || !state.migration.fingerprint ||
      state.migration.registrationCount !== state.registrations.length || state.registrations.length !== 214)
    fail('recibo canônico divergente; não tocar no elenco');
  if (state.counter !== 128 || state.mirror.length !== 64) fail('contador ou espelho não tem 128/64');
  if (Array.isArray(root.data().participants) && root.data().participants.length)
    fail('root legado passou a ter participantes; revisar paridade antes de renumerar');
  const active = state.registrations.filter((r) => r.data.status === 'confirmed');
  if (active.length !== 128) fail('não há exatamente 128 inscrições confirmadas');
  const labels = new Map((root.data().categoryDefinitions || []).map((c) => [c.label, c.id]));
  const allSeq = active.map((r) => r.data.enrollSeq).sort((a, b) => a - b);
  if (allSeq.some((value, index) => value !== index + 1)) fail('enrollSeq não é permutação 1–128');
  const pairs = new Map();
  active.forEach((r) => {
    const id = r.data.fixedPairId;
    if (!id || !r.data.participantKey) fail('inscrição sem identidade fixa');
    if (!pairs.has(id)) pairs.set(id, []);
    pairs.get(id).push(r);
  });
  if (pairs.size !== 64) fail('número de duplas canônicas inesperado');
  const mirrorBySeq = new Map();
  state.mirror.forEach((m) => {
    const item = m.data.item || {};
    if (!Number.isInteger(item.p1Seq) || mirrorBySeq.has(item.p1Seq)) fail('espelho tem sequência inválida');
    mirrorBySeq.set(item.p1Seq, m);
  });
  const seenPairs = new Set(), seenMirrors = new Set(), changes = [];
  let next = 1;
  CATEGORY_COUNTS.forEach(([label, count]) => {
    const source = photoOrder[label];
    if (!Array.isArray(source) || source.length !== count || !labels.has(label))
      fail('lista-fonte de fotos ou categoria inválida: ' + label);
    source.forEach(({ pairId, oldSeq }) => {
      if (seenPairs.has(pairId)) fail('dupla repetida na fonte');
      seenPairs.add(pairId);
      const members = pairs.get(pairId);
      if (!members || members.length !== 2 || members.some((r) => r.data.categoryId !== labels.get(label)))
        fail('dupla/categoria não coincide com fonte: ' + pairId);
      members.sort((a, b) => a.data.enrollSeq - b.data.enrollSeq);
      const currentStart = expectApplied ? next : oldSeq;
      if (members[0].data.enrollSeq !== currentStart || members[1].data.enrollSeq !== currentStart + 1)
        fail('identidade ou ordem da dupla mudou: ' + pairId);
      const mirror = mirrorBySeq.get(currentStart);
      if (!mirror || seenMirrors.has(mirror.id)) fail('espelho da dupla ausente/repetido: ' + pairId);
      seenMirrors.add(mirror.id);
      const item = mirror.data.item || {};
      const key = (side) => item[side + 'Uid'] ? 'uid:' + item[side + 'Uid'] :
        item[side + 'ManualId'] ? 'manual:' + item[side + 'ManualId'] : '';
      if (item.categoryId !== labels.get(label) || item.p2Seq !== currentStart + 1 ||
          key('p1') !== members[0].data.participantKey || key('p2') !== members[1].data.participantKey)
        fail('espelho divergiu da dupla canônica: ' + pairId);
      changes.push({ label, pairId, old: [oldSeq, oldSeq + 1], next: [next, next + 1],
        registrations: members.map((r) => r.id), mirrorId: mirror.id });
      next += 2;
    });
  });
  if (next !== 129 || seenPairs.size !== pairs.size || seenMirrors.size !== state.mirror.length)
    fail('a fonte não cobriu as 64 duplas exatas');
  return changes;
}
function backupAt(file) {
  if (!file || !path.isAbsolute(file)) fail('--backup exige caminho absoluto');
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (backup.project !== PROJECT || backup.tournamentId !== TOURNAMENT ||
      backup.sha256 !== hash(backup.before) || backup.photoOrderSha256 !== hash(photoOrder))
    fail('backup ou lista-fonte foi alterado');
  return backup;
}
async function writeTransaction(backup, restore) {
  return db.runTransaction(async (tx) => {
    const root = await tx.get(rootRef);
    const regs = await tx.get(regRef);
    const mirror = await tx.get(mirrorRef);
    if (!root.exists) fail('torneio desapareceu');
    const state = stateOf(root, regs, mirror);
    const expectedHash = restore ? (backup.afterSha256 || option('--sha256')) : backup.sha256;
    if (hash(state) !== expectedHash)
      fail('estado mudou desde a prévia; operação cancelada');
    if (restore && nonSequenceHash(state) !== nonSequenceHash(backup.before))
      fail('dados não numéricos mudaram; restauração automática cancelada');
    const changes = proposal(root, state, restore);
    changes.forEach((change) => {
      const target = restore ? change.old : change.next;
      change.registrations.forEach((id, index) => tx.update(regRef.doc(id), { enrollSeq: target[index] }));
      tx.update(mirrorRef.doc(change.mirrorId), { 'item.p1Seq': target[0], 'item.p2Seq': target[1] });
    });
    return { registrations: 128, pairs: changes.length, changedPairs: changes.filter((c) => c.old[0] !== c.next[0]).length };
  });
}
(async () => {
  if (mode === 'dry-run') {
    const { root, state } = await readNow();
    const changes = proposal(root, state);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-neon-seq-'));
    const file = path.join(dir, 'backup.json');
    const backup = { project: PROJECT, tournamentId: TOURNAMENT, photoOrderSha256: hash(photoOrder),
      before: state, sha256: hash(state) };
    fs.writeFileSync(file, JSON.stringify(backup), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ mode, backup: file, sha256: backup.sha256,
      confirmed: 128, pairs: 64, changes: changes.filter((c) => c.old[0] !== c.next[0]).length,
      boundaries: CATEGORY_COUNTS.map(([label, count]) => ({ category: label, people: count * 2 })),
      firstAfterFemLight: changes[16].next[0], last: changes[63].next[1] }));
    return;
  }
  const backup = backupAt(option('--backup'));
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) fail('sem credencial da conta de serviço');
  if (mode === 'apply' && option('--sha256') !== backup.sha256) fail('hash da prévia não confirmado');
  if (mode === 'restore' && (!option('--sha256') ||
      (backup.afterSha256 && option('--sha256') !== backup.afterSha256)))
    fail('hash pós-aplicação não confirmado');
  const result = await writeTransaction(backup, mode === 'restore');
  const { root, state } = await readNow();
  proposal(root, state, mode !== 'restore');
  if (mode === 'apply') {
    backup.afterSha256 = hash(state);
    // Imprimir primeiro: se persistir o hash no arquivo falhar após o commit,
    // o hash exibido ainda permite restauração segura com --sha256.
    console.log(JSON.stringify({ mode, result, sha256: backup.afterSha256, confirmed: 128, pairs: 64 }));
    try { fs.writeFileSync(option('--backup'), JSON.stringify(backup), { mode: 0o600 }); }
    catch (error) { console.error('[neon-sequencia] AVISO: backup não recebeu afterSha256; guarde o hash acima: ' + error.message); }
  } else if (logicalHash(state) !== logicalHash(backup.before))
    fail('restauração não reproduziu dados da prévia original');
  else console.log(JSON.stringify({ mode, result, sha256: hash(state), confirmed: 128, pairs: 64 }));
})().catch((error) => { console.error('[neon-sequencia] ' + error.message); process.exitCode = 1; });
