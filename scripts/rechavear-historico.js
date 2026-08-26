#!/usr/bin/env node
/* rechavear-historico.js — troca a chave do espelho de histórico: POSIÇÃO → CONTEÚDO.
 *
 * POR QUE: `tournamentMirror` chaveava cada evento por `'h' + _idx`. Posição é exatamente
 * o que muda quando o log é podado — e podar é o motivo de o espelho existir. Com chave
 * posicional, podar o documento pras últimas N faria o diff reescrever as N primeiras
 * linhas com conteúdo errado e APAGAR todo o resto. Medido no Confra: 188 eventos
 * perdidos pra economizar 37 KB.
 *
 * ⛔ ORDEM OBRIGATÓRIA: escreve as chaves NOVAS, CONFERE uma a uma, e só então apaga as
 * velhas. Nunca o contrário — se apagasse antes e a escrita falhasse no meio, o log ia
 * embora e não tem de onde voltar (o documento é a única outra cópia, e é justo ele que
 * a gente quer poder podar).
 *
 * Uso:  node scripts/rechavear-historico.js            # em seco (não grava nada)
 *       node scripts/rechavear-historico.js --aplicar
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const S = require(path.join(__dirname, '..', 'js', 'views', 'tournament-split-core.js'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.indexOf('--aplicar') !== -1;
const ehPosicional = (k) => /^h\d+$/.test(k);

(async () => {
  const snap = await db.collection('tournaments').get();
  let tocados = 0, escritos = 0, apagados = 0, colisoes = 0;
  for (const doc of snap.docs) {
    const t = doc.data() || {};
    const hist = Array.isArray(t.history) ? t.history : [];
    const col = doc.ref.collection('history');
    const esp = await col.get();
    const velhas = esp.docs.filter((d) => ehPosicional(d.id));
    if (!hist.length && !velhas.length) continue;

    // ① as chaves novas, a partir do DOCUMENTO (que é a verdade de hoje)
    const novos = new Map();
    hist.forEach((ev, i) => {
      const k = S.chaveDoEvento(ev);
      if (novos.has(k)) colisoes++;
      novos.set(k, { _idx: i, _k: k, item: JSON.parse(JSON.stringify(ev)) });
    });
    // ② o que o espelho já tem sob chave posicional e o documento NÃO tem mais
    //    (poda antiga, ou evento removido): preserva — log não se apaga.
    for (const d of velhas) {
      const reg = d.data() || {};
      const ev = reg.item;
      if (!ev) continue;
      const k = S.chaveDoEvento(ev);
      if (!novos.has(k)) novos.set(k, { _idx: reg._idx != null ? reg._idx : -1, _k: k, item: ev });
    }

    const jaTem = new Set(esp.docs.map((d) => d.id));
    const aEscrever = [...novos.entries()].filter(([k]) => !jaTem.has(k));
    console.log((t.name || doc.id).slice(0, 44).padEnd(46) +
      ' doc:' + String(hist.length).padStart(4) +
      '  espelho:' + String(esp.size).padStart(4) +
      '  posicionais:' + String(velhas.length).padStart(4) +
      '  a escrever:' + String(aEscrever.length).padStart(4));
    if (!APLICAR) { tocados++; continue; }

    // ③ ESCREVE o novo
    let lote = db.batch(), n = 0;
    for (const [k, reg] of aEscrever) {
      lote.set(col.doc(k), reg);
      if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
    }
    if (n) await lote.commit();
    escritos += aEscrever.length;

    // ④ CONFERE antes de apagar: cada evento do documento tem que estar lá, igual
    const depois = await col.get();
    const porId = new Map(depois.docs.map((d) => [d.id, d.data()]));
    let faltou = 0;
    for (const ev of hist) {
      const g = porId.get(S.chaveDoEvento(ev));
      if (!g || JSON.stringify(g.item) !== JSON.stringify(ev)) faltou++;
    }
    if (faltou) {
      console.log('   ⛔ ' + faltou + ' evento(s) NÃO conferem — NÃO vou apagar as chaves velhas aqui.');
      continue;
    }
    // ⑤ só agora as posicionais saem
    lote = db.batch(); n = 0;
    for (const d of velhas) {
      lote.delete(d.ref);
      if (++n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
    }
    if (n) await lote.commit();
    apagados += velhas.length;
    console.log('   ✓ ' + aEscrever.length + ' escrito(s), ' + velhas.length + ' posicional(is) apagada(s), conferido');
    tocados++;
  }
  console.log('\n' + (APLICAR ? '✓ aplicado' : '(em seco — nada gravado; rode com --aplicar)') +
    ': ' + tocados + ' torneio(s), ' + escritos + ' escrito(s), ' + apagados + ' apagado(s)' +
    (colisoes ? ', ⚠️ ' + colisoes + ' colisão(ões) de chave' : ', 0 colisões'));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
