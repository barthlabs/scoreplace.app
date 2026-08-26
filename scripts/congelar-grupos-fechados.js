#!/usr/bin/env node
/* CONGELAR OS GRUPOS JÁ FECHADOS  (2.0.119)
 *
 *   node scripts/congelar-grupos-fechados.js            → em seco (não grava nada)
 *   node scripts/congelar-grupos-fechados.js --gravar   → grava
 *
 * Ordem do dono (26/ago/2026): _"o que não pode acontecer é termos a classificação de um
 * grupo publicada e ela mudar depois por qualquer motivo."_ E: _"os congelamentos são
 * fundamentais para não mudar nenhuma classificação antes de corrigirmos os critérios de
 * desempate que não estavam funcionando corretamente."_
 *
 * ⛔ POR QUE ESTE RITO EXISTE: o congelador rodava a cada placar lançado, mas procurava os
 * jogos em `g.matches` / `g.rounds[].matches`. No Confra os jogos moram em
 * `t.rounds[0].matches`, apontando o grupo pelo campo `monarchGroup` — ele achava zero e
 * desistia em silêncio. 6 grupos fechados ficaram sem retrato e eram recalculados a cada
 * tela. O código já está consertado (`_jogosDoGrupo`); este rito alcança o passado.
 *
 * ⛔ ESCREVE SÓ `rounds` DO DOC DE CONFIG, a partir do doc CRU — nunca do remontado. Gravar
 * o remontado devolveria os 115 jogos para dentro do documento e estouraria o teto.
 * [[project_classificacao_publicada_congela]] [[project_teto_do_documento_e_arquitetura_de_dados]]
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
  let totNovos = 0, totTorneios = 0;
  for (const doc of snap.docs) {
    const ref = doc.ref;
    const cru = doc.data();
    if (!Array.isArray(cru.rounds) || !cru.rounds.length) continue;

    // remonta SÓ para enxergar os jogos; o que se grava sai do doc CRU.
    let t;
    try {
      t = await split.montarDoBanco(JSON.parse(JSON.stringify(cru)), async (col) =>
        (await ref.collection(col).get()).docs.map(d => d.data()));
    } catch (e) { console.log('⏭️  ' + (cru.name || doc.id) + ': não remontou (' + e.message + ')'); continue; }

    const novos = [];
    (t.rounds || []).forEach((r, ri) => ((r && r.monarchGroups) || []).forEach((g, gi) => {
      if (!g || Array.isArray(g.classifCongelada)) return;
      const ms = W._jogosDoGrupo(t, r, ri, g, gi);
      const reais = ms.filter(m => m && !m.isSitOut && !m.isBye);
      if (!reais.length) return;
      if (!reais.every(m => m.winner || m.scoreP1 != null)) return;
      const st = W._computeMonarchStandings(
        { players: g.players || [], playersUids: g.playersUids || [], matches: ms }, t, g.category || null) || [];
      if (!st.length) return;
      novos.push({ ri, gi, nome: g.name || ('grupo ' + gi),
        ordem: st.map(x => ({ name: (x && x.name) || '', uid: (x && x.uid) || null })) });
    }));
    if (!novos.length) continue;
    totTorneios++; totNovos += novos.length;
    console.log('\n══ ' + (cru.name || doc.id) + ' — ' + novos.length + ' grupo(s) a congelar ══');
    novos.forEach(n => console.log('   • ' + n.nome + ': ' + n.ordem.map((x, i) => (i + 1) + 'º ' + x.name).join(', ')));
    if (!GRAVAR) continue;

    const agora = new Date().toISOString();
    const rounds = JSON.parse(JSON.stringify(cru.rounds));   // ⛔ o CRU, não o remontado
    let escreveu = 0;
    novos.forEach(n => {
      const g = rounds[n.ri] && rounds[n.ri].monarchGroups && rounds[n.ri].monarchGroups[n.gi];
      if (!g || Array.isArray(g.classifCongelada)) return;   // corrida: alguém congelou antes
      g.classifCongelada = n.ordem; g.classifCongeladaAt = agora; escreveu++;
    });
    if (escreveu) { await ref.update({ rounds }); console.log('   ✅ gravado (' + escreveu + ')'); }
  }
  console.log('\n' + (GRAVAR ? '✅ GRAVADO' : '👀 EM SECO (rode com --gravar)') +
    ': ' + totNovos + ' grupo(s) em ' + totTorneios + ' torneio(s).');
  process.exit(0);
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
