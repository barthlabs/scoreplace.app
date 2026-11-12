#!/usr/bin/env node
'use strict';

// Fotografia pós-sorteio, exclusiva do torneio de teste CAMIS. Prévia por padrão.
const fs = require('node:fs');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const { canonical, fingerprint, projectedSize } = require('../functions-autodraw/tournament-rehearsal');
const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const args = process.argv.slice(2), apply = args.includes('--apply');
const expected = (args.find(arg => arg.startsWith('--expected=')) || '').slice('--expected='.length);
if (apply && !/^[a-f0-9]{64}$/.test(expected)) throw Error('Informe --expected=<hash da prévia>.');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = message => { throw Error(message); };
const credential = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential:admin.credential.cert(credential), projectId:'scoreplace-app' });
const db = admin.firestore(), ref = db.collection('tournaments').doc(ID);
const baseRef = db.collection('tournamentRehearsalBaselines').doc(ID);

async function treeOf(parent, prefix = '') {
  const rows = [];
  for (const collection of await parent.listCollections()) {
    for (const snap of (await collection.get()).docs) {
      const relative = `${prefix}${collection.id}/${snap.id}`;
      rows.push({ path:relative, data:snap.data(), updateTime:snap.updateTime.toMillis() });
      rows.push(...await treeOf(snap.ref, `${relative}/`));
    }
  }
  return rows.sort((a,b) => a.path.localeCompare(b.path));
}
async function load() {
  const [root, baseline, tree, summary, feed] = await Promise.all([
    ref.get(), baseRef.get(), treeOf(ref), db.collection('tournaments_summary').doc(ID).get(),
    db.collection('discoveryFeed').doc(ID).get()
  ]);
  if (!root.exists || !baseline.exists || feed.exists) fail('alvo, fotografia prévia ou privacidade divergente');
  const t = root.data(), b = baseline.data();
  if (t.name !== 'Camis no Beyond' || t.creatorUid !== 'B17n7JCXYOfqahlcLZ0fKxGGyUu1' ||
      t.isPublic !== false || t.organizerOnly !== true || t.isSandbox === true ||
      t.rehearsal?.state !== 'active' || b.state !== 'active' || b.mode === 'postDraw' ||
      b.hash !== t.rehearsal.hash || b.epoch !== t.rehearsal.epoch)
    fail('ensaio pré-sorteio não está ativo no único torneio de teste');
  const registrations = tree.filter(item => /^registrations\/[^/]+$/.test(item.path));
  if (registrations.length !== 144 || t.canonicalRegistrationMigration?.registrationCount !== 144)
    fail('as 144 inscrições oficiais não estão íntegras');
  const official = t.camisOfficialGroups || {}, categories = Object.keys(official);
  if (categories.length !== 3 || categories.reduce((n, name) => n + official[name].length, 0) !== 36)
    fail('36 grupos oficiais ausentes');
  const all = (t.matches || []).concat(tree.filter(item => /^matches\/[^/]+$/.test(item.path)).map(item => item.data));
  const matches = [...new Map(all.filter(item => item && item.id).map(item => [String(item.id),item])).values()];
  if (matches.length !== 108 || matches.some(item => item.winner || item.wo || item.resultAt ||
      item.courtCalledAt || item.startedAt || item.scoreP1 != null || item.scoreP2 != null))
    fail('jogos ausentes ou placar/chamada já registrado; checkpoint recusado');
  const grouped = new Map();
  matches.forEach(item => {
    if (!item.isMonarch || Number(item.phaseIndex || 0) !== 0) fail('jogo fora da classificatória oficial');
    const key = `${item.category}:${item.monarchGroup}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  if (grouped.size !== 36) fail('partidas não formam 36 quartetos');
  for (const [key, games] of grouped) {
    const divider = key.lastIndexOf(':'), category = key.slice(0,divider), index = Number(key.slice(divider + 1));
    const roster = official[category]?.[index];
    const found = [...new Set(games.flatMap(game => (game.team1 || []).concat(game.team2 || [])))];
    if (games.length !== 3 || !roster || roster.length !== 4 ||
        fingerprint([...found].sort()) !== fingerprint([...roster].sort())) fail(`quarteto ${key} não confere`);
  }
  const rootData = { ...t }; delete rootData.rehearsal;
  const payload = { root:rootData, tree:tree.map(({path,data}) => ({path,data})),
    summary:summary.exists ? summary.data() : null };
  const size = projectedSize(payload);
  if (size > 900 * 1024) fail('checkpoint próximo do limite de 1 MiB; publicação recusada');
  const stateDigest = sha(JSON.stringify({ root:root.updateTime.toMillis(), baseline:baseline.updateTime.toMillis(),
    tree:tree.map(item => [item.path,item.updateTime]), summary:summary.exists ? summary.updateTime.toMillis() : null }));
  return { root, baseline, tree, summary, payload, size, stateDigest, planHash:sha(stateDigest + ':' + fingerprint(payload)) };
}
(async () => {
  const state = await load();
  console.log(JSON.stringify({ mode:apply ? 'apply' : 'dry-run', id:ID, planHash:state.planHash,
    registrations:144, groups:36, games:108, projectedBytes:state.size,
    tvHashes:Object.fromEntries(['tvLayout','tvScreens','tvActiveScreen'].map(key =>
      [key,fingerprint(state.root.data()[key])])) }, null, 2));
  if (!apply) { await admin.app().delete(); return; }
  if (expected !== state.planHash) fail('hash da prévia divergiu');
  const backupPath = `/private/tmp/camis-before-postdraw-checkpoint-${expected.slice(0,12)}.json`;
  const backup = JSON.stringify({ id:ID, root:canonical(state.root.data()),
    baseline:canonical(state.baseline.data()), tree:canonical(state.tree),
    summary:state.summary.exists ? canonical(state.summary.data()) : null });
  fs.writeFileSync(backupPath, backup, { flag:'wx', mode:0o600 });
  const hash = fingerprint(state.payload), epoch = crypto.randomUUID();
  await db.runTransaction(async tx => {
    const [root, baseline] = await Promise.all([tx.get(ref),tx.get(baseRef)]);
    if (root.updateTime.toMillis() !== state.root.updateTime.toMillis() ||
        baseline.updateTime.toMillis() !== state.baseline.updateTime.toMillis())
      fail('raiz ou checkpoint mudou; operação cancelada');
    tx.set(baseRef, { ...state.payload, mode:'postDraw', state:'active', step:'captured',
      epoch, hash, createdAt:new Date().toISOString() });
    tx.update(ref, { rehearsal:{ state:'active', mode:'postDraw', epoch, hash } });
  }, { maxAttempts:1 });
  const [afterRoot, afterBase, afterTree] = await Promise.all([ref.get(),baseRef.get(),treeOf(ref)]);
  if (afterRoot.data().rehearsal?.hash !== hash || afterBase.data().hash !== hash ||
      fingerprint(afterTree.map(({path,data}) => ({path,data}))) !== fingerprint(state.payload.tree))
    fail('checkpoint gravado, mas verificação posterior divergiu');
  console.log(JSON.stringify({ applied:true, verified:true, backupPath, backupSha256:sha(backup),
    epoch, hash, groups:36, games:108 }));
  await admin.app().delete();
})().catch(error => { console.error('Checkpoint recusado: ' + error.message); process.exitCode = 1; });
