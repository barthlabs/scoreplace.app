#!/usr/bin/env node
'use strict';
// Troca pontual da identidade cromática do CAMIS para referências do C6 Bank.
// Prévia por padrão; --apply exige o fingerprint da prévia. Não toca jogos ou inscrições.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('../functions/node_modules/firebase-admin');
const { credentialPath } = require('./firebase-service-account-token');

const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const apply = process.argv.includes('--apply');
const expected = (process.argv.find(a => a.startsWith('--expected=')) || '').slice(11);
if (apply && !/^[a-f0-9]{64}$/.test(expected)) throw Error('Use --apply --expected=<sha256 da prévia>.');

const key = JSON.parse(fs.readFileSync(credentialPath(process.env), 'utf8'));
admin.initializeApp({ credential:admin.credential.cert(key), projectId:'scoreplace-app' });
const db = admin.firestore();
const ref = db.collection('tournaments').doc(ID);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const desired = {
  coverColor:'#000000', coverGradientColor:'#242424', coverGradientEnabled:true,
  titleColor:'#FBFBFB', brandColor:'#FFBD4C', 'tvLayout.background':'#000000'
};
function patchFor(t) {
  const patch = { ...desired };
  if (Array.isArray(t.tvScreens) && t.tvScreens.length) {
    patch.tvScreens = t.tvScreens.map(screen => ({ ...screen,
      layout:screen.layout ? { ...screen.layout, background:'#000000' } : screen.layout }));
  }
  return patch;
}
function check(t) {
  if (!t || t.name !== 'Camis no Beyond') throw Error('O torneio alvo não corresponde ao CAMIS.');
  if (t.coverMode !== 'color' || !t.tvLayout || !('background' in t.tvLayout)) {
    throw Error('A configuração visual mudou; refaça a prévia.');
  }
  if (!((t.coverColor === '#a52719' || t.coverColor === '#000000') &&
      (t.coverGradientColor === '#ffffff' || t.coverGradientColor === '#242424'))) {
    throw Error('As cores atuais divergiram; refaça a prévia.');
  }
  if (Array.isArray(t.tvScreens) && t.tvScreens.some(screen => screen.layout &&
      screen.layout.background !== '#060d1a' && screen.layout.background !== '#000000')) {
    throw Error('Uma tela No ar tem cor manual nova; revise antes de substituir.');
  }
}
function display(t) {
  return { coverColor:t.coverColor, coverGradientColor:t.coverGradientColor,
    coverGradientEnabled:t.coverGradientEnabled, titleColor:t.titleColor,
    brandColor:t.brandColor || null, tvBackground:t.tvLayout.background };
}
(async () => {
  const snap = await ref.get();
  check(snap.data());
  const fingerprint = hash(snap.data());
  console.log(JSON.stringify({ tournamentId:ID, fingerprint, before:display(snap.data()),
    tvScreens:snap.data().tvScreens?.map((screen, index) => ({ index, background:screen.layout?.background })) || [],
    after:{ coverColor:desired.coverColor, coverGradientColor:desired.coverGradientColor,
      coverGradientEnabled:true, titleColor:desired.titleColor,
      brandColor:desired.brandColor, tvBackground:'#000000' } }, null, 2));
  if (!apply) return;
  if (expected !== fingerprint) throw Error('Fingerprint diferente da prévia; nada gravado.');
  const backupPath = path.join(os.tmpdir(), 'camis-before-c6-' + fingerprint.slice(0, 12) + '.json');
  fs.writeFileSync(backupPath, JSON.stringify(snap.data(), null, 2), { flag:'wx', mode:0o600 });
  await db.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (hash(fresh.data()) !== expected) throw Error('Torneio mudou desde a prévia; nada gravado.');
    check(fresh.data());
    tx.update(ref, patchFor(fresh.data()));
  });
  const verified = await ref.get();
  const t = verified.data();
  if (t.coverColor !== desired.coverColor || t.coverGradientColor !== desired.coverGradientColor ||
      t.titleColor !== desired.titleColor || t.brandColor !== desired.brandColor ||
      t.tvLayout.background !== '#000000' ||
      (t.tvScreens || []).some(screen => screen.layout && screen.layout.background !== '#000000')) {
    throw Error('Gravação não conferiu; verifique o torneio.');
  }
  console.log(JSON.stringify({ applied:true, verified:true, backupPath,
    tournamentId:ID, colors:display(t), receiptAt:new Date().toISOString() }));
})().catch(error => { console.error('Paleta C6 não aplicada: ' + error.message); process.exitCode=1; });
