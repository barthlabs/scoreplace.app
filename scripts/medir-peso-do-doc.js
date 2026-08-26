#!/usr/bin/env node
/* medir-peso-do-doc.js — quanto cada CAMPO pesa no documento do torneio.
 *
 * POR QUE EXISTE: o teto do Firestore é 1 MB por DOCUMENTO. Saber "o Confra tem 436 KB"
 * não diz o que fazer; saber que `rounds` são 202 KB DELES diz. E a decisão de qual campo
 * tirar tem que sair da MEDIDA de hoje, não do número que eu anotei ontem — o torneio
 * cresce todo dia. Ver docs/FASE2-JOGOS-EM-SUBCOLECAO.md.
 *
 * Uso: node scripts/medir-peso-do-doc.js [idDoTorneio]
 *      (sem id: os 8 maiores da base)
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
// Aproximação por JSON: não é o byte exato que o Firestore conta (ele guarda por campo,
// com overhead de nome e tipo), mas a PROPORÇÃO entre campos — que é o que decide o que
// tirar — é fiel. Timestamps viram objeto; converto pra string pra não inflar.
const peso = (v) => Buffer.byteLength(JSON.stringify(v, (k, x) =>
  (x && typeof x.toDate === 'function') ? x.toDate().toISOString() : x) || '', 'utf8');

(async () => {
  const alvo = process.argv[2];
  let docs;
  if (alvo) {
    const d = await db.collection('tournaments').doc(String(alvo)).get();
    if (!d.exists) { console.error('✗ torneio', alvo, 'não existe'); process.exit(1); }
    docs = [d];
  } else {
    const snap = await db.collection('tournaments').get();
    docs = snap.docs.map((d) => ({ d, n: peso(d.data()) }))
      .sort((a, b) => b.n - a.n).slice(0, 8).map((x) => x.d);
  }

  for (const doc of docs) {
    const t = doc.data() || {};
    const total = peso(t);
    const campos = Object.keys(t).map((k) => ({ k, n: peso(t[k]) })).sort((a, b) => b.n - a.n);
    const pct = (n) => ((n / total) * 100).toFixed(0).padStart(2) + '%';
    const teto = 1024 * 1024;
    console.log('\n═══ ' + (t.name || doc.id) + '  (' + doc.id + ')');
    console.log('    TOTAL ' + kb(total) + '  ·  ' + ((total / teto) * 100).toFixed(1) + '% do teto de 1 MB' +
      '  ·  cabe mais ' + (teto / total).toFixed(1) + '×');
    if (Array.isArray(t._semPesados) && t._semPesados.length) console.log('    ⭐ já dividido: _semPesados = [' + t._semPesados.join(', ') + ']');
    for (const c of campos.slice(0, 8)) {
      if (c.n < 512) continue;
      console.log('      ' + pct(c.n) + '  ' + kb(c.n).padStart(9) + '  ' + c.k);
    }
    // o que sobraria tirando os pesados — é a pergunta que a Fase 2c responde
    const semJogos = total - peso(t.rounds) - peso(t.matches);
    const semTudo = semJogos - peso(t.history);
    console.log('    ⇒ sem os JOGOS: ' + kb(semJogos) + '  (cabe ' + (teto / Math.max(semJogos, 1)).toFixed(0) + '× mais)');
    console.log('    ⇒ sem jogos + histórico: ' + kb(semTudo) + '  (cabe ' + (teto / Math.max(semTudo, 1)).toFixed(0) + '× mais)');
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
