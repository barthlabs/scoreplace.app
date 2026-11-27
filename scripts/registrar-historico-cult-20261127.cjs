#!/usr/bin/env node
'use strict';

// Registra eventos a partir dos recibos já aplicados, sem alterar sorteio ou placares.
// Uso: node scripts/registrar-historico-cult-20261127.cjs --preview|--apply RECIBO_TROCAS RECIBO_GRAFIA
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const admin = createRequire(path.resolve(__dirname, '../functions/package.json'))('firebase-admin');
const { append } = require('../functions/tournament-roster-history');
const ID = 'tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
const EXPECTED = [
  { kind:'substitution', fromName:'Camila Calia', toName:'Juliana Carneiro', group:'E', category:'Categoria C' },
  { kind:'substitution', fromName:'Fabíola Baldscci', toName:'Camila Calia', group:'B', category:'Categoria B' },
  { kind:'spelling', fromName:'Lu Sores', toName:'Lu Soares', group:'D', category:'Categoria C' }
];
const [mode, movesFile, spellingFile, ...extra] = process.argv.slice(2);
if (!['--preview','--apply'].includes(mode) || !movesFile || !spellingFile || extra.length)
  throw new Error('uso: --preview|--apply RECIBO_TROCAS RECIBO_GRAFIA');
const receipts = [movesFile, spellingFile].map(file => JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));
if (receipts.some(receipt => receipt.tournamentId !== ID || !receipt.appliedAt || !Array.isArray(receipt.targets)))
  throw new Error('Recibos inválidos.');
const targets = receipts.flatMap(receipt => receipt.targets.map(target => ({ ...target, at:receipt.appliedAt })));
if (targets.length !== EXPECTED.length || EXPECTED.some((expected, i) =>
  targets[i].oldName !== expected.fromName || targets[i].newName !== expected.toName || targets[i].group !== expected.group))
  throw new Error('Trocas não conferem com os recibos.');
const events = targets.map((target, i) => ({
  id:'cult-20261127-' + ['grupo-e','grupo-b','grafia-d'][i], kind:EXPECTED[i].kind,
  fromName:target.oldName, toName:target.newName, group:target.group,
  category:EXPECTED[i].category, at:target.at, registrationId:target.registrationId
}));
const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credential) throw new Error('Credencial não configurada.');
const identity = JSON.parse(fs.readFileSync(credential, 'utf8'));
if (identity.project_id !== 'scoreplace-app') throw new Error('Projeto incorreto.');
admin.initializeApp({credential:admin.credential.cert(identity),projectId:'scoreplace-app'});
const db = admin.firestore();
const tournament = db.collection('tournaments').doc(ID);
const history = db.collection('tournamentRosterHistory').doc(ID);
async function run() {
  const [root, registrations, prior] = await Promise.all([
    tournament.get(), tournament.collection('registrations').get(), history.get()
  ]);
  if (!root.exists || root.data().creatorUid !== 'B17n7JCXYOfqahlcLZ0fKxGGyUu1') throw new Error('Torneio incorreto.');
  for (const event of events) {
    const match = registrations.docs.find(doc => doc.id === event.registrationId);
    if (!match || match.data().manualDisplayName !== event.toName) throw new Error('Inscrição atual não confere: ' + event.id);
  }
  const previous = prior.exists && Array.isArray(prior.data().events) ? prior.data().events : [];
  const next = events.reduce(append, previous);
  console.log(JSON.stringify({ mode, tournamentId:ID, previous:previous.length, next:next.length,
    events:events.map(({id,kind,fromName,toName,group,at}) => ({id,kind,fromName,toName,group,at})) }, null, 2));
  if (mode === '--apply') await db.runTransaction(async tx => {
    const [freshRoot, freshHistory] = await Promise.all([tx.get(tournament), tx.get(history)]);
    if (!freshRoot.exists || freshRoot.data().creatorUid !== 'B17n7JCXYOfqahlcLZ0fKxGGyUu1') throw new Error('Torneio alterado.');
    const current = freshHistory.exists && Array.isArray(freshHistory.data().events) ? freshHistory.data().events : [];
    const updated = events.reduce(append, current);
    tx.set(history, {schema:1,updatedAt:new Date().toISOString(),events:updated});
  });
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => admin.app().delete());
