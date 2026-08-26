#!/usr/bin/env node
/* ver-backup.js — consulta o estado ANTIGO guardado. É pra isso que o backup existe:
 * quando alguém disser "isso aqui mudou", dá pra abrir o de antes e comparar na hora.
 * Uso: node scripts/ver-backup.js <id> [campo]    (sem campo: resumo dos dois backups)
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const ID = process.argv[2], CAMPO = process.argv[3];
const kb = (v) => (Buffer.byteLength(JSON.stringify(v) || '', 'utf8') / 1024).toFixed(1) + ' KB';
(async () => {
  if (!ID) { console.error('uso: node scripts/ver-backup.js <id> [campo]'); process.exit(1); }
  for (const suf of ['', '__original']) {
    const d = await db.collection('tournaments_backup').doc(ID + suf).get();
    if (!d.exists) { console.log('— ' + ID + suf + ': não existe'); continue; }
    const b = d.data() || {};
    console.log('\n═══ ' + ID + suf);
    console.log('  origem ..... ' + (b.origem || '?'));
    console.log('  congelado .. ' + (b.em || '?'));
    console.log('  conteúdo ... ' + kb(b.doc) + ' · ' + b.jogos + ' jogos (' + b.comPlacar +
      ' com placar) · ' + b.inscritos + ' inscritos · ' + b.historico + ' eventos');
    if (CAMPO) {
      const v = (b.doc || {})[CAMPO];
      console.log('  ' + CAMPO + ' = ' + (v === undefined ? '(ausente)' : JSON.stringify(v).slice(0, 1200)));
    }
  }
  console.log('\n(o vivo, pra comparar: node scripts/medir-peso-do-doc.js ' + ID + ')');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
