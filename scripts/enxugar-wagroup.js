#!/usr/bin/env node
/* enxugar-wagroup.js — o grupo de WhatsApp do JOGO volta a ser o que o dono disse que é:
 * _"cada grupo de jogo tem 1 link pequeno para o grupo do whats"_.
 *
 * O QUE ESTAVA GRAVADO (medido em 26/ago, 48 jogos, 13,0 KB):
 *   notifyLog 34% · link 21% · byUid 14% · byName 9% · notifiedAt 9% · at 7% · notifyCount 5%
 * ⇒ o LINK é 21%. Os outros 79% são registro SOBRE o link — e triplicado, porque o objeto
 *   inteiro era copiado nos 3 jogos de cada grupo (16 links distintos para 48 jogos).
 *
 * O QUE FICA:
 *   • PORTADOR do grupo (o 1º jogo): link + quem criou + quando + último aviso. Os diálogos
 *     leem daí ("Fulano já criou um grupo aqui. Substituir?") — `ctx.target` em groupMode
 *     É o portador, então nada na tela muda.
 *   • IRMÃOS: só `{ link }`. É o que o chip "Abrir grupo" lê.
 *   • ⛔ `notifyLog` do JOGO some: nenhuma tela abre. O do TORNEIO (`t.waGroup`) FICA — ele
 *     alimenta o relatório "Convites do grupo" em Comunicados. Escopos diferentes; apagar
 *     os dois mataria um relatório que funciona.
 *
 * Uso: node scripts/enxugar-wagroup.js [--aplicar]
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.indexOf('--aplicar') !== -1;
const B = (v) => Buffer.byteLength(JSON.stringify(v) || '', 'utf8');

(async () => {
  const snap = await db.collection('tournaments').get();
  let antes = 0, depois = 0, jogos = 0, gravados = 0, logsMortos = 0;
  for (const doc of snap.docs) {
    const t = doc.data() || {};
    let mudou = false;
    // percorre os TRÊS lugares onde jogo mora (rounds, matches, groups)
    const listas = [];
    (t.rounds || []).forEach((r) => { if (r && Array.isArray(r.matches)) listas.push(r.matches); });
    if (Array.isArray(t.matches)) listas.push(t.matches);
    (t.groups || []).forEach((g) => { if (g && Array.isArray(g.matches)) listas.push(g.matches); });

    // quem é o PORTADOR de cada grupo: o primeiro jogo, na ordem do array, que tem link
    const portador = {};
    for (const lista of listas) {
      for (const m of lista) {
        if (!m || !m.waGroup || !m.waGroup.link) continue;
        const gi = (m.groupIdx != null) ? m.groupIdx : (m.monarchGroup != null ? m.monarchGroup : 'x');
        const k = String(m.roundIndex || 0) + '|' + gi + '|' + m.waGroup.link;
        if (!portador[k]) portador[k] = m.id;
      }
    }
    for (const lista of listas) {
      for (const m of lista) {
        if (!m || !m.waGroup) continue;
        jogos++;
        const w = m.waGroup;
        antes += B(w);
        if (Array.isArray(w.notifyLog)) logsMortos += w.notifyLog.length;
        const gi = (m.groupIdx != null) ? m.groupIdx : (m.monarchGroup != null ? m.monarchGroup : 'x');
        const k = String(m.roundIndex || 0) + '|' + gi + '|' + w.link;
        const ehPortador = (portador[k] === m.id);
        const novo = ehPortador
          ? { link: w.link, byUid: w.byUid, byName: w.byName, at: w.at,
              notifiedAt: w.notifiedAt, notifyCount: w.notifyCount }
          : { link: w.link };
        Object.keys(novo).forEach((x) => { if (novo[x] === undefined) delete novo[x]; });
        depois += B(novo);
        if (JSON.stringify(novo) !== JSON.stringify(w)) { m.waGroup = novo; mudou = true; }
      }
    }
    if (mudou) {
      console.log('  ' + (t.name || doc.id).slice(0, 44).padEnd(46) + ' enxugado');
      if (APLICAR) {
        const patch = {};
        if (Array.isArray(t.rounds)) patch.rounds = t.rounds;
        if (Array.isArray(t.matches)) patch.matches = t.matches;
        if (Array.isArray(t.groups)) patch.groups = t.groups;
        await doc.ref.update(patch);
        gravados++;
      }
    }
  }
  console.log('\njogos com waGroup: ' + jogos + ' · entradas de notifyLog mortas: ' + logsMortos);
  console.log('peso do waGroup: ' + (antes / 1024).toFixed(1) + ' KB → ' + (depois / 1024).toFixed(1) +
    ' KB   (economia ' + ((antes - depois) / 1024).toFixed(1) + ' KB, ' +
    (((antes - depois) / Math.max(antes, 1)) * 100).toFixed(0) + '%)');
  console.log(APLICAR ? '✓ aplicado em ' + gravados + ' torneio(s)' : '(em seco — nada gravado; rode com --aplicar)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
