#!/usr/bin/env node
/* rechavear-inscritos.js — chave do inscrito no espelho: POSIÇÃO → IDENTIDADE.
 * Mesmo motivo do histórico: posição muda quando alguém sai do MEIO da lista, e aí o diff
 * reescreve o registro de A por cima do de B. Ordem: escreve o novo, CONFERE, apaga o velho.
 * Uso: node scripts/rechavear-inscritos.js [--aplicar]
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.indexOf('--aplicar') !== -1;
const posicional = (k) => /^p\d+$/.test(k);

(async () => {
  const snap = await db.collection('tournaments').get();
  let tocados = 0, escritos = 0, apagados = 0, colisoes = 0;
  for (const doc of snap.docs) {
    const t = doc.data() || {};
    const col = doc.ref.collection('participants');
    const esp = await col.get();
    const velhas = esp.docs.filter((d) => posicional(d.id));
    if (!esp.size) continue;
    // a verdade é o que ESTÁ no espelho hoje (o doc pode já estar dividido)
    const novos = new Map();
    esp.docs.forEach((d) => {
      const reg = d.data() || {};
      const item = reg.item; if (!item) return;
      const k = S.chaveDoInscrito(item);
      if (novos.has(k)) colisoes++;
      novos.set(k, { _idx: reg._idx, _k: k, item: item });
    });
    const jaTem = new Set(esp.docs.map((d) => d.id));
    const aEscrever = [...novos.entries()].filter(([k]) => !jaTem.has(k));
    if (!aEscrever.length && !velhas.length) continue;
    console.log('  ' + (t.name || doc.id).slice(0, 42).padEnd(44) +
      ' espelho:' + String(esp.size).padStart(4) + '  posicionais:' + String(velhas.length).padStart(4) +
      '  a escrever:' + String(aEscrever.length).padStart(4));
    tocados++;
    if (!APLICAR) continue;
    let lote = db.batch(), n = 0;
    for (const [k, reg] of aEscrever) { lote.set(col.doc(k), reg); if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; } }
    if (n) await lote.commit();
    escritos += aEscrever.length;
    // ⛔ confere ANTES de apagar
    const depois = await col.get();
    const ids = new Set(depois.docs.map((d) => d.id));
    let faltou = 0;
    novos.forEach((_, k) => { if (!ids.has(k)) faltou++; });
    if (faltou) { console.log('   ⛔ ' + faltou + ' não conferem — NÃO apago as posicionais'); continue; }
    lote = db.batch(); n = 0;
    for (const d of velhas) { lote.delete(d.ref); if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; } }
    if (n) await lote.commit();
    apagados += velhas.length;
    console.log('   ✓ ' + aEscrever.length + ' escrito(s), ' + velhas.length + ' posicional(is) apagada(s)');
  }
  console.log('\n' + (APLICAR ? '✓ aplicado' : '(em seco)') + ': ' + tocados + ' torneio(s), ' +
    escritos + ' escrito(s), ' + apagados + ' apagado(s), ' + colisoes + ' colisão(ões)');
  process.exit(colisoes ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
