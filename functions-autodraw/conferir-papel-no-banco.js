'use strict';
/* ⛔ CONFERE NO BANCO se a lista achatada que o SERVIDOR lê (`adminUids`) bate com os FATOS
 * (criador + co-organizadores ativos) que o APLICATIVO lê.
 *
 * Por que existe: a regra do Firestore não percorre lista de objetos filtrando por `status`,
 * então o co-organizador ativo é achatado em `adminUids` e recomputado em todo save. Isso é
 * uma RESPOSTA DERIVADA guardada no banco — o único ponto do desenho em que há duas verdades.
 * Divergir significa: o app mostra o botão e o servidor recusa, ou pior, o contrário.
 *
 * Medido em 24/set/2026: 78 torneios, 0 divergências — mas só 1 tinha co-organizador ativo.
 * Rodar isto depois de mexer em co-organizador é mais barato que descobrir na quadra.
 *
 *   node conferir-papel-no-banco.js
 */
const admin = require('firebase-admin');

function divergencia(t) {
  const ativos = (Array.isArray(t.coHosts) ? t.coHosts : [])
    .filter((c) => c && c.status === 'active' && c.uid).map((c) => String(c.uid));
  const esperado = new Set(ativos);
  if (t.creatorUid) esperado.add(String(t.creatorUid));
  if (t.isSandbox === true && t.sandboxOwnerUid) esperado.add(String(t.sandboxOwnerUid));
  const gravado = new Set((Array.isArray(t.adminUids) ? t.adminUids : []).map(String));
  return {
    faltando: [...esperado].filter((u) => !gravado.has(u)),   // app mostra, servidor recusa
    sobrando: [...gravado].filter((u) => !esperado.has(u))    // servidor deixa, app esconde
  };
}
module.exports = { divergencia };

if (require.main === module) {
  admin.initializeApp();
  const db = admin.firestore();
  (async () => {
    const snap = await db.collection('tournaments').get();
    let total = 0, comCoHost = 0, ruins = 0;
    snap.forEach((d) => {
      const t = d.data(); total++;
      if ((t.coHosts || []).some((c) => c && c.status === 'active')) comCoHost++;
      const dv = divergencia(t);
      if (dv.faltando.length || dv.sobrando.length) {
        ruins++;
        console.log('  ⛔ ' + d.id + ' · app mostra e servidor recusa: ' + dv.faltando.length
          + ' · servidor deixa e app esconde: ' + dv.sobrando.length);
      }
    });
    console.log('torneios: ' + total + ' · com co-organizador ativo: ' + comCoHost);
    console.log(ruins ? '⛔ ' + ruins + ' divergência(s)' : '✓ servidor e aplicativo respondem o mesmo em todos');
    if (ruins) process.exit(1);
  })().catch((e) => { console.error(e.message); process.exit(1); });
}
