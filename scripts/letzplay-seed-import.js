/**
 * letzplay-seed-import.js — grava um letzplayImport (histórico normalizado do letzplay)
 * em users/{uid}.letzplayImport. Additive/merge — não toca nenhum outro campo.
 *
 * PRÉ-REQUISITO: credencial admin (ADC):  gcloud auth application-default login
 * USO (SEMPRE --dry primeiro):
 *   node scripts/letzplay-seed-import.js --uid <UID> --file <import.json> --dry
 *   node scripts/letzplay-seed-import.js --uid <UID> --file <import.json> --write
 *   --project scoreplace-app (default) | scoreplace-staging
 */
'use strict';
const path = require('path');
const fs = require('fs');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}
const PROJECT = arg('--project', 'scoreplace-app');
const UID = arg('--uid', null);
const FILE = arg('--file', null);
const WRITE = process.argv.includes('--write');
if (!UID || !FILE) { console.error('faltou --uid e/ou --file'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const bytes = Buffer.byteLength(JSON.stringify(data));

admin.initializeApp({ projectId: PROJECT });
const db = admin.firestore();

(async () => {
  const ref = db.collection('users').doc(UID);
  const snap = await ref.get();
  if (!snap.exists) { console.error('user doc não existe:', UID); process.exit(1); }
  const u = snap.data() || {};

  console.log('=== ALVO ===');
  console.log('project      :', PROJECT);
  console.log('uid          :', UID);
  console.log('displayName  :', u.displayName || '(sem nome)');
  console.log('email        :', u.email || '(sem email)');
  console.log('letzplayHandle:', u.letzplayHandle || '(vazio)', '· consent:', u.letzplayConsent === true);
  console.log('já tem import:', u.letzplayImport ? ('SIM (importedAt ' + (u.letzplayImport.importedAt || '?') + ')') : 'não');

  console.log('\n=== O QUE SERIA GRAVADO em users/' + UID + '.letzplayImport ===');
  console.log('handle          :', data.handle);
  console.log('officialCategory:', JSON.stringify(data.officialCategory), '  ← âncora anti-gato (torneio)');
  console.log('rating (recreat):', data.rating && (data.rating.value + ' → ' + data.rating.band));
  console.log('footprint       :', data.footprint.length, '(' + data.footprint.filter(f => f.official).length + ' oficiais / ' + data.footprint.filter(f => !f.official).length + ' recreativos)');
  console.log('categories      :', data.categories.length);
  console.log('pairs (torneio) :', data.pairs.map(p => p.partnerName + '=' + p.categoryRaw).join(' · '));
  console.log('observations    :', data.observations.length, '(ocultas)');
  console.log('stats           :', data.stats ? Object.keys(data.stats).join(', ') : '—');
  console.log('tamanho         :', bytes, 'bytes');

  if (!WRITE) {
    console.log('\n*** DRY-RUN — nada foi gravado. Rode com --write pra gravar. ***');
    process.exit(0);
  }

  await ref.set({ letzplayImport: data }, { merge: true });
  const after = (await ref.get()).data() || {};
  console.log('\n✅ GRAVADO. Confirmação: letzplayImport.handle =', after.letzplayImport && after.letzplayImport.handle,
    '· officialCategory =', JSON.stringify(after.letzplayImport && after.letzplayImport.officialCategory));
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
