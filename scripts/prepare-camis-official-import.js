#!/usr/bin/env node
'use strict';

// Read-only preparation for the official CAMIS test roster. Never writes Firestore.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const { canonical, fingerprint, projectedSize } = require('../functions-autodraw/tournament-rehearsal');

const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const BASE = '/Users/rtb/Library/CloudStorage/GoogleDrive-rstbarth@gmail.com/Meu Drive/scoreplace ajustes e divulgacao/camis';
const CATEGORIES = [
  { file:'Diamante', label:'Fem Diamante', groups:8 },
  { file:'Ouro', label:'Fem Ouro', groups:16 },
  { file:'Prata', label:'Fem Prata', groups:12 }
];
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const norm = name => String(name || '').trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
const fail = message => { throw Error(message); };

const official = [];
const workbookHashes = {};
const sourceWarnings = [];
for (const category of CATEGORIES) {
  const file = path.join(BASE, `Grupos Camis Beyond 2026 - ${category.file}.xlsx`);
  const bytes = fs.readFileSync(file);
  workbookHashes[category.file] = sha(bytes);
  const workbook = XLSX.read(bytes, { type:'buffer' });
  const sheets = workbook.SheetNames.filter(name => !/CHAVE/i.test(name));
  if (sheets.length !== category.groups) fail(`${category.file}: número de abas de grupo divergiu`);
  sheets.forEach((sheet, index) => {
    const ws = workbook.Sheets[sheet];
    const cell = address => String(ws[address]?.v || '').trim();
    const title = cell('D8');
    if (!title.toLocaleUpperCase('pt-BR').includes(`${category.file.toLocaleUpperCase('pt-BR')} GRUPO ${index + 1}`))
      fail(`${category.file}/${sheet}: título de grupo inesperado`);
    const names = [11,13,15,17].map(row => cell(`B${row}`));
    if (names.some(name => !name) || new Set(names.map(norm)).size !== 4) fail(`${category.file}/${sheet}: grupo incompleto ou duplicado`);
    const games = [20,22,25,27,30,32].flatMap(row => [cell(`B${row}`), cell(`F${row}`)]).filter(Boolean);
    if (games.length !== 12 || games.some(name => !names.map(norm).includes(norm(name))))
      fail(`${category.file}/${sheet}: jogos não conferem com os quatro atletas`);
    const standings = [39,41,43,45].map(row => cell(`B${row}`));
    if (standings.some((name, i) => norm(name) !== norm(names[i]))) {
      sourceWarnings.push({ category:category.file, group:index + 1, roster:names, standings });
    }
    official.push({ category:category.label, group:index + 1, names });
  });
}
const flat = official.flatMap(group => group.names.map(name => ({ ...group, name, names:undefined })));
if (flat.length !== 144 || new Set(flat.map(row => norm(row.name))).size !== 144) fail('elenco oficial não tem 144 nomes únicos');

const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential:admin.credential.cert(key), projectId:'scoreplace-app' });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(ID);
async function readTree(parent, prefix = '') {
  const rows = [];
  for (const collection of await parent.listCollections()) {
    for (const doc of (await collection.get()).docs) {
      const relative = `${prefix}${collection.id}/${doc.id}`;
      rows.push({ path:relative, data:doc.data() });
      rows.push(...await readTree(doc.ref, `${relative}/`));
    }
  }
  return rows.sort((a,b) => a.path.localeCompare(b.path));
}
(async () => {
  const [root, tree, summary, feed, baseline] = await Promise.all([
    ref.get(), readTree(ref), db.collection('tournaments_summary').doc(ID).get(),
    db.collection('discoveryFeed').doc(ID).get(),
    db.collection('tournamentRehearsalBaselines').doc(ID).get()
  ]);
  if (!root.exists) fail('torneio de teste ausente');
  const t = root.data();
  if (t.name !== 'Camis no Beyond' || t.creatorUid !== 'B17n7JCXYOfqahlcLZ0fKxGGyUu1' ||
      t.isPublic !== false || t.organizerOnly !== true || t.isSandbox === true || feed.exists)
    fail('identidade ou privacidade do alvo divergente');
  const regs = tree.filter(item => /^registrations\/[^/]+$/.test(item.path));
  if (regs.length !== 144 || t.canonicalRegistrationMigration?.registrationCount !== 144 ||
      regs.some(item => item.data.participantKind !== 'manual' || item.data.participantUid))
    fail('inscrições canônicas atuais inesperadas');
  if ((t.matches || []).length || (t.rounds || []).length || (t.groups || []).length ||
      t.drawCompleted || t._canonicalDraw || t.pendingDraw || Number(t._nPartes?.matches || 0))
    fail('há sorteio ou jogo; plano de troca bloqueado');
  if (baseline.exists && !['restored'].includes(baseline.data().state)) fail('fotografia de ensaio já ativa');
  const categories = new Map((t.categoryDefinitions || []).map(row => [row.label, row.id]));
  if (CATEGORIES.some(row => !categories.has(row.label))) fail('categorias do alvo não conferem');
  const oldNames = regs.map(item => norm(item.data.manualDisplayName || item.data.name));
  const newNames = flat.map(item => norm(item.name));
  const removed = oldNames.filter(name => !newNames.includes(name));
  const added = newNames.filter(name => !oldNames.includes(name));
  const plan = { id:ID, sourceHashes:workbookHashes, rootUpdateTime:root.updateTime.toMillis(),
    registrationUpdates:regs.map(item => [item.path, item.data.updatedAt?.toMillis?.() || null]),
    roster:official, categories:Object.fromEntries(categories), warnings:sourceWarnings,
    oldCount:regs.length, removed, added, tvHashes:Object.fromEntries(['tvLayout','tvScreens','tvActiveScreen']
      .map(field => [field, fingerprint(t[field])])) };
  const snapshot = { id:ID, capturedAt:new Date().toISOString(), planHash:sha(JSON.stringify(plan)),
    root:canonical(t), tree:canonical(tree), summary:summary.exists ? canonical(summary.data()) : null,
    baseline:baseline.exists ? canonical(baseline.data()) : null };
  const output = path.join('/private/tmp', `camis-official-before-${snapshot.planHash.slice(0,12)}.json`);
  fs.writeFileSync(output, JSON.stringify(snapshot), { flag:'wx', mode:0o600 });
  console.log(JSON.stringify({ id:ID, snapshot:output, snapshotSha256:sha(fs.readFileSync(output)),
    planHash:snapshot.planHash, groups:official.length, categoryCounts:CATEGORIES.map(row => [row.file,row.groups * 4]),
    oldCount:regs.length, removed:removed.length, added:added.length,
    warnings:sourceWarnings.map(row => [row.category,row.group]),
    currentStatus:t.status, baseline:baseline.exists ? baseline.data().state : 'none',
    projectedBaselineBytes:projectedSize({ root:t, tree, summary:summary.exists ? summary.data() : null }),
    tvHashes:plan.tvHashes }, null, 2));
  await admin.app().delete();
})().catch(error => { console.error(error); process.exitCode = 1; });
