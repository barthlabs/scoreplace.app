#!/usr/bin/env node
/* Move rascunhos iniciais legados para o cofre privado.
 * Uso seguro: node scripts/migrar-rascunhos-iniciais-privados.js --apply
 * Sem --apply apenas informa quantos documentos seriam migrados.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions-autodraw', 'node_modules', 'firebase-admin'));
const APPLY = process.argv.includes('--apply');
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
function marcador(pd) {
  return { kind:'initial', private:true, matchCount:Number(pd && pd.matchCount || 0), teamCount:Number(pd && pd.teamCount || 0), generatedAt:String(pd && pd.generatedAt || ''), source:String(pd && pd.source || 'drawRound') };
}
(async () => {
  const snaps = await db.collection('tournaments').where('pendingDraw.kind', '==', 'initial').get();
  const legacy = snaps.docs.filter((doc) => { const pd = doc.get('pendingDraw'); return pd && pd.private !== true && pd.draft; });
  console.log('[private-draw-migration] encontrados=' + snaps.size + ' legados=' + legacy.length + ' modo=' + (APPLY ? 'APLICAR' : 'SIMULAR'));
  if (!APPLY) return;
  for (const doc of legacy) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const pd = fresh.exists && fresh.get('pendingDraw');
      if (!pd || pd.kind !== 'initial' || pd.private === true || !pd.draft) return;
      tx.set(doc.ref.collection('privateDraws').doc('initial'), pd);
      tx.update(doc.ref, { pendingDraw: marcador(pd) });
      console.log('[private-draw-migration] migrado=' + doc.id);
    });
  }
  console.log('[private-draw-migration] concluído=' + legacy.length);
})().catch((err) => { console.error('[private-draw-migration] falhou', err && err.stack || err); process.exitCode = 1; });
