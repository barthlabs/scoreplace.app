#!/usr/bin/env node
'use strict';

// Troca pontual do elenco de TESTE CAMIS. Prévia por padrão; --apply exige o hash da prévia.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const mutations = require('../functions/registration-mutations-core');
const boundary = require('../functions/canonical-registration-boundary-core');
const { canonical, fingerprint } = require('../functions-autodraw/tournament-rehearsal');

const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const BASE = '/Users/rtb/Library/CloudStorage/GoogleDrive-rstbarth@gmail.com/Meu Drive/scoreplace ajustes e divulgacao/camis';
const SPECS = [['Diamante',8],['Ouro',16],['Prata',12]];
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const expected = (args.find(arg => arg.startsWith('--expected=')) || '').slice('--expected='.length);
if (apply && !/^[a-f0-9]{64}$/.test(expected)) throw Error('Informe --expected=<hash da prévia>.');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
const fail = message => { throw Error(message); };

const groups = {}, sourceHashes = {};
for (const [tier, count] of SPECS) {
  const file = path.join(BASE, `Grupos Camis Beyond 2026 - ${tier}.xlsx`);
  const bytes = fs.readFileSync(file);
  sourceHashes[tier] = sha(bytes);
  const workbook = XLSX.read(bytes, { type:'buffer' });
  const sheets = workbook.SheetNames.filter(name => !/CHAVE/i.test(name));
  if (sheets.length !== count) fail(`${tier}: quantidade de grupos inesperada`);
  groups[`Fem ${tier}`] = sheets.map((sheetName, i) => {
    const sheet = workbook.Sheets[sheetName], cell = ref => String(sheet[ref]?.v || '').trim();
    if (!cell('D8').toLocaleUpperCase('pt-BR').includes(`${tier.toLocaleUpperCase('pt-BR')} GRUPO ${i + 1}`))
      fail(`${tier}/${sheetName}: título de grupo inesperado`);
    const roster = [11,13,15,17].map(row => cell(`B${row}`));
    const games = [20,22,25,27,30,32].flatMap(row => [cell(`B${row}`),cell(`F${row}`)]);
    if (roster.some(name => !name) || new Set(roster.map(norm)).size !== 4 || games.length !== 12 ||
        games.some(name => !roster.map(norm).includes(norm(name)))) fail(`${tier}/${sheetName}: elenco e jogos divergem`);
    return roster;
  });
}
const official = Object.entries(groups).flatMap(([category, quartets]) =>
  quartets.flatMap((names, group) => names.map(name => ({ category, group:group + 1, name }))));
if (official.length !== 144 || new Set(official.map(row => norm(row.name))).size !== 144)
  fail('planilhas oficiais não contêm 144 atletas únicos');
const byName = new Map(official.map(row => [norm(row.name), row]));
const credential = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential:admin.credential.cert(credential), projectId:'scoreplace-app' });
const db = admin.firestore(), ref = db.collection('tournaments').doc(ID);

async function read() {
  const [root, regs, baseline] = await Promise.all([
    ref.get(), ref.collection('registrations').get(), db.collection('tournamentRehearsalBaselines').doc(ID).get()
  ]);
  if (!root.exists) fail('torneio de teste ausente');
  const t = root.data();
  if (t.name !== 'Camis no Beyond' || t.creatorUid !== 'B17n7JCXYOfqahlcLZ0fKxGGyUu1' ||
      t.isSandbox === true || t.isPublic !== false || t.organizerOnly !== true || t.status !== 'closed' ||
      (t.matches || []).length || (t.rounds || []).length || (t.groups || []).length ||
      t.drawCompleted || t._canonicalDraw || t.pendingDraw || Number(t._nPartes?.matches || 0) ||
      t.rehearsal?.state || (baseline.exists && baseline.data().state !== 'restored'))
    fail('alvo, privacidade, estado pré-sorteio ou ensaio divergente');
  const rows = regs.docs.map(doc => ({ ref:doc.ref, data:doc.data(), updateTime:doc.updateTime.toMillis() }));
  boundary.verifiedRoster(t, rows.map(row => row.data));
  if (rows.length !== 144 || rows.some(row => row.data.participantKind !== 'manual' || row.data.participantUid))
    fail('elenco atual não tem 144 inscrições manuais');
  const categories = new Map((t.categoryDefinitions || []).map(item => [item.label,item.id]));
  if (SPECS.some(([tier]) => !categories.has(`Fem ${tier}`))) fail('categorias oficiais ausentes');
  return { root, rows, t, categories };
}

function plan(state) {
  const { t, rows, categories } = state;
  const old = new Map(rows.map(row => [norm(row.data.manualDisplayName), row]));
  if (old.size !== 144) fail('nomes atuais duplicados');
  const updates = [], deletes = [], creates = [];
  for (const [category, quartets] of Object.entries(groups)) {
    const categoryId = categories.get(category);
    const arrivals = quartets.flat().filter(name => !old.has(norm(name)));
    const departures = rows.filter(row => row.data.categoryId === categoryId && !byName.has(norm(row.data.manualDisplayName)))
      .sort((a,b) => Number(a.data.enrollSeq) - Number(b.data.enrollSeq));
    if (arrivals.length !== departures.length) fail(`${category}: entradas e saídas não fecham`);
    arrivals.forEach((name, i) => {
      const manualParticipantId = 'manual-camis-official-' + sha(`${category}\0${norm(name)}`).slice(0,24);
      const created = mutations.enroll(ID, [], { manualParticipantId }, [categoryId], {
        status:'confirmed', validationState:'approved', manualDisplayName:name
      }).creates[0];
      creates.push({ ...created, enrollSeq:departures[i].data.enrollSeq, originCategoryId:categoryId });
      deletes.push(departures[i]);
    });
  }
  rows.forEach(row => {
    const entry = byName.get(norm(row.data.manualDisplayName));
    if (!entry) return;
    if (categories.get(entry.category) !== row.data.categoryId) fail('atleta mudou de categoria sem correspondência de vaga');
    if (entry.name !== row.data.manualDisplayName) updates.push({ ...row, next:{ ...row.data, manualDisplayName:entry.name } });
  });
  const deleted = new Set(deletes.map(row => row.data.registrationId));
  const updated = new Map(updates.map(row => [row.data.registrationId,row.next]));
  const projected = rows.filter(row => !deleted.has(row.data.registrationId))
    .map(row => updated.get(row.data.registrationId) || row.data).concat(creates);
  boundary.verifiedRoster(t, projected);
  const projectedNames = new Map(projected.map(item => [norm(item.manualDisplayName),item]));
  if (projectedNames.size !== 144 || official.some(entry =>
      !projectedNames.has(norm(entry.name)) || projectedNames.get(norm(entry.name)).categoryId !== categories.get(entry.category) ||
      projectedNames.get(norm(entry.name)).manualDisplayName !== entry.name)) fail('projeção não bate com as três planilhas');
  const stateDigest = sha(JSON.stringify({ root:state.root.updateTime.toMillis(),
    regs:rows.map(row => [row.ref.id,row.updateTime]).sort((a,b) => a[0].localeCompare(b[0])) }));
  const planHash = sha(JSON.stringify({ sourceHashes, stateDigest, groups }));
  return { updates, deletes, creates, projected, planHash };
}

(async () => {
  const state = await read(), preview = plan(state);
  console.log(JSON.stringify({ mode:apply ? 'apply' : 'dry-run', id:ID, planHash:preview.planHash,
    groups:36, athletes:144, replaced:preview.deletes.length, spellingUpdates:preview.updates.length,
    created:preview.creates.length, tvHashes:Object.fromEntries(['tvLayout','tvScreens','tvActiveScreen']
      .map(field => [field,fingerprint(state.t[field])])) }, null, 2));
  if (!apply) { await admin.app().delete(); return; }
  if (expected !== preview.planHash) fail('hash da prévia divergiu');
  const backup = path.join('/private/tmp', `camis-official-roster-before-${preview.planHash.slice(0,12)}.json`);
  const content = JSON.stringify({ id:ID, sourceHashes, root:canonical(state.t),
    registrations:canonical(state.rows.map(row => ({ id:row.ref.id, data:row.data }))) });
  fs.writeFileSync(backup, content, { flag:'wx', mode:0o600 });
  await db.runTransaction(async tx => {
    const freshRoot = await tx.get(ref), freshRegs = await tx.get(ref.collection('registrations'));
    const current = { root:freshRoot, t:freshRoot.data(), categories:state.categories,
      rows:freshRegs.docs.map(doc => ({ ref:doc.ref, data:doc.data(), updateTime:doc.updateTime.toMillis() })) };
    if (plan(current).planHash !== expected) fail('estado mudou desde a prévia; transação cancelada');
    preview.deletes.forEach(row => tx.delete(row.ref));
    preview.updates.forEach(row => tx.update(row.ref, { manualDisplayName:row.next.manualDisplayName,
      updatedAt:admin.firestore.FieldValue.serverTimestamp() }));
    preview.creates.forEach(item => tx.create(ref.collection('registrations').doc(item.registrationId), {
      ...item, createdAt:admin.firestore.FieldValue.serverTimestamp(),
      updatedAt:admin.firestore.FieldValue.serverTimestamp() }));
    tx.update(ref, { camisOfficialGroups:groups, updatedAt:admin.firestore.FieldValue.serverTimestamp() });
  }, { maxAttempts:1 });
  const after = await read(), names = new Map(after.rows.map(row => [norm(row.data.manualDisplayName),row.data]));
  if (names.size !== 144 || official.some(entry => !names.has(norm(entry.name)) ||
      names.get(norm(entry.name)).manualDisplayName !== entry.name ||
      names.get(norm(entry.name)).categoryId !== after.categories.get(entry.category)) ||
      fingerprint(after.t.camisOfficialGroups) !== fingerprint(groups)) fail('verificação posterior divergiu');
  for (const field of ['tvLayout','tvScreens','tvActiveScreen']) {
    if (fingerprint(after.t[field]) !== fingerprint(state.t[field])) fail(`campo ${field} da TV foi alterado`);
  }
  console.log(JSON.stringify({ applied:true, verified:true, backup, backupSha256:sha(content),
    registrations:after.rows.length, replaced:preview.deletes.length, groups:36 }));
  await admin.app().delete();
})().catch(error => { console.error('Importação recusada: ' + error.message); process.exitCode = 1; });
