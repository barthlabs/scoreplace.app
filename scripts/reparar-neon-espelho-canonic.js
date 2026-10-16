#!/usr/bin/env node
/* Repara APENAS a projeção legada `inscritos` do Neon a partir de registrations.
 * O elenco canônico, jogos, times e resultados nunca são escritos. Uso:
 *   node scripts/reparar-neon-espelho-canonic.js --dry-run
 *   node scripts/reparar-neon-espelho-canonic.js --executar --backup /caminho/export.json --sha256 HASH
 *   node scripts/reparar-neon-espelho-canonic.js --restore --backup /caminho/export.json
 * O hash é a prévia assinada: qualquer mudança concorrente cancela a transação.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const admin = require('../functions/node_modules/firebase-admin');
const roster = require('../functions/vendor/registration-roster.js');
const split = require('../js/views/tournament-split-core.js');
const PROJECT = 'scoreplace-app';
const TOURNAMENT = 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';
const args = process.argv.slice(2);
const mode = args.includes('--executar') ? 'execute' : args.includes('--restore') ? 'restore' :
  args.includes('--restore-dry-run') ? 'restore-dry-run' : 'dry-run';
const option = (name) => { const i = args.indexOf(name); return i < 0 ? '' : String(args[i + 1] || ''); };
const digest = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (msg) => { throw new Error(msg); };
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS || !fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  fail('credencial de serviço persistente ausente; não usar OAuth pessoal');
}
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(TOURNAMENT);
const regRef = ref.collection('registrations');
const mirrorRef = ref.collection('inscritos');
const docsOf = (snap) => snap.docs.map((d) => ({ id: d.id, data: d.data(), updateTime: d.updateTime.toDate().toISOString() }))
  .sort((a, b) => a.id.localeCompare(b.id));
const stateOf = (rootSnap, regSnap, mirrorSnap) => ({
  rootUpdateTime: rootSnap.updateTime.toDate().toISOString(),
  migration: rootSnap.data().canonicalRegistrationMigration,
  counter: rootSnap.data()._nPartes && rootSnap.data()._nPartes.participants,
  registrations: docsOf(regSnap), mirror: docsOf(mirrorSnap)
});
const sourceHash = (state) => digest(state);
const logicalHash = (state) => digest({ migration: state.migration, counter: state.counter,
  registrations: state.registrations.map((d) => ({ id: d.id, data: d.data })),
  mirror: state.mirror.map((d) => ({ id: d.id, data: d.data })) });
function assertPlainMirror(value) {
  if (!value || typeof value !== 'object') return;
  if (value.constructor !== Object && !Array.isArray(value)) fail('espelho contém tipo Firestore não exportável fielmente');
  Object.values(value).forEach(assertPlainMirror);
}
function desired(state, tournament) {
  if (!tournament || tournament.isSandbox === true) fail('alvo ausente ou sandbox');
  if (!state.migration || !state.migration.fingerprint || state.migration.registrationCount !== state.registrations.length)
    fail('recibo canônico divergente');
  const active = state.registrations.filter((d) => d.data.status === 'confirmed').map((d) => d.data);
  if (active.length !== 128 || state.registrations.length !== 214) fail('contagem mudou; requer novo plano');
  const projected = roster.rosterFromRegistrations(active);
  if (projected.length !== 64 || projected.some((p) => !p.p1Seq || !p.p2Seq || !p.p1Uid && !p.p1ManualId || !p.p2Uid && !p.p2ManualId))
    fail('projeção canônica não contém 64 duplas identificadas');
  const seq = projected.flatMap((p) => [p.p1Seq, p.p2Seq]).sort((a, b) => a - b);
  if (seq.some((n, i) => n !== i + 1)) fail('sequências não são 1–128');
  const counts = {};
  projected.forEach((p) => { counts[p.categoryId] = (counts[p.categoryId] || 0) + 1; });
  const expected = [16, 8, 8, 16, 8, 8].sort((a, b) => a - b);
  if (JSON.stringify(Object.values(counts).sort((a, b) => a - b)) !== JSON.stringify(expected))
    fail('categorias não batem com as seis fotos');
  const labels = {};
  (tournament.categoryDefinitions || []).forEach((d) => { if (d && d.id && d.label) labels[d.id] = d.label; });
  const entries = projected.map((p) => {
    const label = labels[p.categoryId];
    if (!label) fail('categoria sem rótulo ' + p.categoryId);
    return { ...p, category: label, categories: [label] };
  });
  const records = split.dividir({ participants: entries }, ['participants']).participants;
  const map = new Map();
  records.forEach((record) => {
    const key = split.chaveDoRegistro(record);
    if (!key || key.includes('/') || map.has(key)) fail('chave duplicada/inválida na projeção');
    map.set(key, record);
  });
  if (map.size !== 64) fail('espelho projetado não contém 64 documentos');
  return { map, counts, entries };
}
async function readNow() {
  const [root, registrations, mirror] = await Promise.all([ref.get(), regRef.get(), mirrorRef.get()]);
  if (!root.exists) fail('torneio não existe');
  return { root, state: stateOf(root, registrations, mirror) };
}
function loadBackup() {
  const file = option('--backup');
  if (!file || !path.isAbsolute(file)) fail('--backup exige caminho absoluto');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.project !== PROJECT || data.tournamentId !== TOURNAMENT || !data.before || data.sha256 !== sourceHash(data.before))
    fail('backup inválido ou alterado');
  return { file, data };
}
async function transact(backup, restore) {
  return db.runTransaction(async (tx) => {
    const root = await tx.get(ref);
    const registrations = await tx.get(regRef);
    const mirror = await tx.get(mirrorRef);
    if (!root.exists) fail('torneio desapareceu');
    const current = stateOf(root, registrations, mirror);
    const expectedHash = restore ? backup.afterSha256 : backup.sha256;
    if (!expectedHash || sourceHash(current) !== expectedHash) fail('estado mudou desde a prévia; transação abortada');
    const proposed = restore
      ? new Map(backup.before.mirror.map((d) => [d.id, d.data]))
      : desired(current, root.data()).map;
    const oldIds = new Set(current.mirror.map((d) => d.id));
    oldIds.forEach((id) => { if (!proposed.has(id)) tx.delete(mirrorRef.doc(id)); });
    proposed.forEach((data, id) => tx.set(mirrorRef.doc(id), data));
    tx.update(ref, { '_nPartes.participants': restore ? backup.before.counter : 128 });
    return { old: oldIds.size, next: proposed.size };
  });
}
(async () => {
  if (mode === 'dry-run') {
    const { root, state } = await readNow();
    const p = desired(state, root.data());
    state.mirror.forEach((d) => assertPlainMirror(d.data));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-neon-roster-'));
    const file = path.join(dir, 'export.json');
    const backup = { project: PROJECT, tournamentId: TOURNAMENT, before: state, sha256: sourceHash(state) };
    fs.writeFileSync(file, JSON.stringify(backup), { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ mode, tournamentId: TOURNAMENT, backup: file, sha256: backup.sha256,
      confirmed: 128, pairs: p.entries.length, categories: p.counts,
      legacyMirrorBefore: state.mirror.length, legacyMirrorAfter: p.map.size, counterBefore: state.counter, counterAfter: 128 }));
    return;
  }
  const { file, data } = loadBackup();
  if (mode === 'restore-dry-run') {
    const current = (await readNow()).state;
    if (data.afterSha256 ? sourceHash(current) !== data.afterSha256 : sourceHash(current) !== data.sha256)
      fail('estado não coincide com a fotografia esperada para restaurar');
    console.log(JSON.stringify({ mode, valid: true, backup: file,
      willRestoreMirror: data.before.mirror.length, willRestoreCounter: data.before.counter }));
    return;
  }
  if (mode === 'execute' && option('--sha256') !== data.sha256) fail('hash da prévia não confirmado');
  const result = await transact(data, mode === 'restore');
  const after = (await readNow()).state;
  if (mode === 'execute') {
    const p = desired(after, (await ref.get()).data());
    if (after.counter !== 128 || after.mirror.length !== 64 ||
        after.mirror.some((d) => /Jogador\s+\d+/i.test(JSON.stringify(d.data)))) fail('verificação pós-write falhou');
    data.afterSha256 = sourceHash(after);
    fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    console.log(JSON.stringify({ mode, tournamentId: TOURNAMENT, result, afterSha256: data.afterSha256,
      confirmed: 128, pairs: p.entries.length, mirror: 64, counter: 128 }));
  } else {
    if (logicalHash(after) === logicalHash(data.before)) console.log(JSON.stringify({ mode, restored: true, result }));
    else fail('restauração não reproduziu a fotografia original');
  }
})().catch((e) => { console.error('[neon-roster] ' + e.message); process.exitCode = 1; });
