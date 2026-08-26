#!/usr/bin/env node
/* APAGAR A CLASSIFICAÇÃO GRAVADA — ELA É DERIVADA  (2.0.120)
 *
 *   node scripts/apagar-standings-do-doc.js            → em seco
 *   node scripts/apagar-standings-do-doc.js --gravar   → apaga
 *
 * ⛔ MEDIDO em produção (26/ago/2026): `standings` estava gravado em 2 dos 39 torneios —
 * 120 linhas ao todo, TODAS zeradas e NENHUMA com uid. No Confra eram 110 linhas, 12,5 KB,
 * 16% do documento, afirmando "0 jogo disputado" num torneio com 115 jogos. O cálculo sobre
 * os mesmos dados dá 103 linhas, 95 com jogo e 103 com uid.
 *
 * O código já parou de gravar (firebase-db.saveTournament e o _applyWriteBoundary do CF).
 * ⚠️ Mas o cliente grava com `merge:true`, e merge PRESERVA campo ausente — parar de mandar
 * não apaga o que já está lá. Este rito apaga, uma vez.
 *
 * ⭐ CONFERE ANTES DE APAGAR: só apaga quando o cálculo sobre os jogos reais devolve uma
 * tabela COM jogo disputado. Se o cálculo vier vazio ou zerado, o rito RECUSA aquele torneio
 * — apagar uma coisa sem saber pôr outra no lugar não é arquitetura, é perda.
 * [[project_teto_do_documento_e_arquitetura_de_dados]]
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
const admin = require(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const split = require(path.join(ROOT, 'js', 'views', 'tournament-split-core.js'));
const W = require(path.join(ROOT, 'tests', 'render-harness')).sandbox;
const GRAVAR = process.argv.indexOf('--gravar') !== -1;

(async () => {
  const snap = await db.collection('tournaments').get();
  let apagados = 0, recusados = 0, kb = 0;
  for (const doc of snap.docs) {
    const cru = doc.data();
    if (!Array.isArray(cru.standings) || !cru.standings.length) continue;
    const nome = (cru.name || doc.id);
    const peso = Buffer.byteLength(JSON.stringify(cru.standings), 'utf8') / 1024;

    let t;
    try {
      t = await split.montarDoBanco(JSON.parse(JSON.stringify(cru)), async (col) =>
        (await doc.ref.collection(col).get()).docs.map(d => d.data()));
    } catch (e) { console.log('⏭️  ' + nome + ': não remontou — RECUSO (' + e.message + ')'); recusados++; continue; }

    const calc = W._standingsDoTorneio(t);
    const comJogo = (calc || []).filter(x => x.played || x.wins || x.losses).length;
    const gravComJogo = cru.standings.filter(x => x.played || x.wins || x.losses).length;
    console.log('\n══ ' + nome + ' ══');
    console.log('   gravado : ' + cru.standings.length + ' linhas, ' + gravComJogo + ' com jogo, ' +
                cru.standings.filter(x => x.uid).length + ' com uid  (' + peso.toFixed(1) + ' KB)');
    console.log('   cálculo : ' + (calc ? calc.length + ' linhas, ' + comJogo + ' com jogo, ' +
                calc.filter(x => x.uid).length + ' com uid' : 'a porta recusou responder'));
    if (!calc || (!comJogo && gravComJogo)) {
      console.log('   ⛔ RECUSO apagar: o cálculo não sabe responder melhor que o gravado.');
      recusados++; continue;
    }
    apagados++; kb += peso;
    if (!GRAVAR) continue;
    await doc.ref.update({ standings: admin.firestore.FieldValue.delete() });
    console.log('   ✅ apagado');
  }
  console.log('\n' + (GRAVAR ? '✅ APAGADO' : '👀 EM SECO (rode com --gravar)') +
    ': ' + apagados + ' torneio(s), ' + kb.toFixed(1) + ' KB' +
    (recusados ? '  ·  ⛔ ' + recusados + ' recusado(s)' : ''));
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
