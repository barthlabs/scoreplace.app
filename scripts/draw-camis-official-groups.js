#!/usr/bin/env node
'use strict';

// Chama o sorteio canônico do único torneio de teste CAMIS. Prévia por padrão.
const fs = require('node:fs');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');
const { fingerprint } = require('../functions-autodraw/tournament-rehearsal');
const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const UID = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const API_KEY = 'AIzaSyB7AyOojV_Pm50Kr7bovVY4jVTTNbKOK0A'; // chave pública do cliente
const args = process.argv.slice(2), apply = args.includes('--apply');
const expected = (args.find(arg => arg.startsWith('--expected=')) || '').slice('--expected='.length);
if (apply && !/^[a-f0-9]{64}$/.test(expected)) throw Error('Informe --expected=<hash da prévia>.');
const fail = message => { throw Error(message); };
const credential = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential:admin.credential.cert(credential), projectId:'scoreplace-app' });
const db = admin.firestore(), ref = db.collection('tournaments').doc(ID);
const tvFields = ['tvLayout','tvScreens','tvActiveScreen','logoUrl','coverColor','brandColor','titleColor'];
function check(t) {
  if (!t || t.name !== 'Camis no Beyond' || t.creatorUid !== UID || t.isPublic !== false ||
      t.organizerOnly !== true || t.isSandbox === true || t.status !== 'closed' ||
      t.rehearsal?.state || (t.matches || []).length || (t.rounds || []).length ||
      (t.groups || []).length || t.drawCompleted || t._canonicalDraw || t.pendingDraw)
    fail('alvo ou estado pré-sorteio divergente');
  const groups = t.camisOfficialGroups || {};
  if (Object.keys(groups).length !== 3 ||
      groups['Fem Diamante']?.length !== 8 || groups['Fem Ouro']?.length !== 16 ||
      groups['Fem Prata']?.length !== 12) fail('grupos oficiais ainda não importados');
}
(async () => {
  const before = await ref.get(), t = before.data();
  check(t);
  const planHash = fingerprint({ id:ID, updateTime:before.updateTime.toMillis(), groups:t.camisOfficialGroups });
  console.log(JSON.stringify({ mode:apply ? 'apply' : 'dry-run', id:ID, planHash,
    groups:36, expectedGames:108, tvHashes:Object.fromEntries(tvFields.map(key => [key,fingerprint(t[key])])) }, null, 2));
  if (!apply) { await admin.app().delete(); return; }
  if (expected !== planHash) fail('hash da prévia divergiu');
  const fresh = await ref.get();
  if (fresh.updateTime.toMillis() !== before.updateTime.toMillis()) fail('torneio mudou desde a prévia');
  check(fresh.data());
  const customToken = await admin.auth().createCustomToken(UID);
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method:'POST', headers:{ 'Content-Type':'application/json', Referer:'https://scoreplace.app/' },
    body:JSON.stringify({ token:customToken, returnSecureToken:true }), signal:AbortSignal.timeout(30000)
  });
  const auth = await signIn.json();
  if (!signIn.ok || !auth.idToken)
    fail('não foi possível obter autenticação do organizador: ' + (auth.error?.message || signIn.status));
  const verifiedToken = await admin.auth().verifyIdToken(auth.idToken);
  if (verifiedToken.uid !== UID) fail('token autenticado não corresponde ao organizador');
  const operationId = crypto.randomUUID();
  const called = await fetch('https://us-central1-scoreplace-app.cloudfunctions.net/drawRound', {
    method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${auth.idToken}` },
    body:JSON.stringify({ data:{ tournamentId:ID, sandbox:false, operationId } }),
    signal:AbortSignal.timeout(600000)
  });
  const reply = await called.json();
  if (!called.ok || reply.error || !reply.result?.ok) fail('drawRound recusou: ' + JSON.stringify(reply.error || reply.result || { status:called.status }));
  const after = await ref.get(), drawn = after.data();
  const sameTv = tvFields.every(key => fingerprint(drawn[key]) === fingerprint(t[key]));
  const all = (drawn.matches || []).slice();
  const subdocs = await ref.collection('matches').get();
  subdocs.docs.forEach(doc => all.push(doc.data().jogo || doc.data()));
  const matches = [...new Map(all.filter(item => item && item.id).map(item => [String(item.id), item])).values()];
  if (!sameTv || matches.length !== 108 || matches.some(item => item.winner || item.wo ||
      item.resultAt || item.courtCalledAt || item.startedAt || item.scoreP1 != null || item.scoreP2 != null))
    fail('sorteio respondeu, mas verificação de jogos/TV divergiu; preserve os dados para auditoria');
  console.log(JSON.stringify({ applied:true, verified:true, operationId, groups:36, games:108,
    rehearsal:drawn.rehearsal?.state, tvPreserved:true }));
  await admin.app().delete();
})().catch(error => { console.error('Sorteio CAMIS recusado: ' + error.message); process.exitCode = 1; });
