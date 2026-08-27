#!/usr/bin/env node
/* medir-porta-do-placar.js — POR ONDE os placares realmente entram.
 *
 * ⚠️ ESTE CABEÇALHO ESTAVA VENCIDO E ME ENGANOU (27/ago/2026). Ele dizia que a queda era
 * "o caminho local", e eu li isso como "o motor do cliente aplica e grava" — passei a
 * investigar uma divergência que já não existe. **Desde a 2.0.103 a queda é a FILA**:
 * grava a INTENÇÃO por escrita comum (que o SDK entrega quando a rede volta) e o gatilho
 * `applyQueuedResult` aplica NO SERVIDOR, com a mesma função da porta chamável. Nenhum
 * cliente deriva avanço de chave. Ver [[project_fila_do_placar_offline]].
 * Lição: comentário que descreve o mundo antigo custa mais caro que comentário nenhum.
 *
 * POR QUE EXISTE: a entrada na fila era SILENCIOSA (só `_warn`, fora do Sentry) — então
 * "nenhum evento no Sentry" NÃO provava que a CF estava dando conta; provava que ninguém
 * estava olhando. ⇒ A prova saía do DADO: quantos placares o banco registrou na janela ×
 * quantos a CF disse que aplicou (log). [[feedback_proof_lives_in_the_data_not_in_a_stamp]]
 * ✅ Desde 2.1.5 a recusa do servidor VAI pro Sentry (e o erro que não for de rede também),
 * então este script deixou de ser o único olho — mas segue valendo como conferência
 * independente, que é o ponto: não confiar num carimbo só.
 *
 * Uso: node scripts/medir-porta-do-placar.js 2026-08-20 2026-08-25
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

const de = new Date((process.argv[2] || '2026-08-20') + 'T00:00:00Z');
const ate = new Date((process.argv[3] || '2026-08-26') + 'T00:00:00Z');

// os jogos moram em TRÊS lugares no documento — varrer só `rounds` perderia
// os de Rei/Rainha e os de eliminatória. Ver tournament-split-core.js.
function jogos(t) {
  const out = [];
  (t.rounds || []).forEach((r) => (r && r.matches || []).forEach((m) => m && out.push(m)));
  (t.matches || []).forEach((m) => m && out.push(m));
  (t.groups || []).forEach((g) => (g && g.matches || []).forEach((m) => m && out.push(m)));
  return out;
}
const quando = (m) => {
  const v = m.resultAt || m.completedAt || m.updatedAt || m.finishedAt || null;
  if (!v) return null;
  const d = (typeof v.toDate === 'function') ? v.toDate() : new Date(v);
  return isNaN(+d) ? null : d;
};

(async () => {
  const snap = await db.collection('tournaments').get();
  let comResultado = 0, naJanela = 0, semCarimboDeTempo = 0;
  /* ⛔ ESTE SCRIPT É CEGO A TORNEIO DIVIDIDO, e cegueira silenciosa numa ferramenta de
   * MEDIÇÃO é pior que não ter a ferramenta. Ele varre `t.rounds/matches/groups` do
   * DOCUMENTO; desde a fase 2 os jogos moram na subcoleção `matches` e o documento vem
   * VAZIO (`_semPesados` inclui 'matches'). MEDIDO em 27/ago/2026: ele reportou 6 placares
   * numa janela em que o log da CF mostrava 27 aplicados — o Confra inteiro, 115 jogos,
   * invisível. Quem lesse o número concluiria que a queda pro caminho local estava
   * carregando 21 placares, e concluiria errado.
   * Enquanto ele não ler subcoleção, o mínimo é DECLARAR o que ficou de fora.
   * [[feedback_no_silent_caps]] */
  let divididos = 0;
  const porTorneio = {};
  snap.forEach((doc) => {
    const t = doc.data() || {};
    if (Array.isArray(t._semPesados) && t._semPesados.indexOf('matches') !== -1) divididos++;
    for (const m of jogos(t)) {
      const temR = !!(m.result || m.score || m.winner || m.completed);
      if (!temR) continue;
      comResultado++;
      const d = quando(m);
      if (!d) { semCarimboDeTempo++; continue; }
      if (d >= de && d < ate) {
        naJanela++;
        porTorneio[t.name || doc.id] = (porTorneio[t.name || doc.id] || 0) + 1;
      }
    }
  });
  console.log('janela: ' + de.toISOString().slice(0, 10) + ' → ' + ate.toISOString().slice(0, 10));
  console.log('placares no banco, TOTAL de todos os tempos: ' + comResultado);
  console.log('placares SEM carimbo de tempo (não dá pra datar): ' + semCarimboDeTempo);
  console.log('placares DATADOS dentro da janela: ' + naJanela);
  Object.keys(porTorneio).sort((a, b) => porTorneio[b] - porTorneio[a]).slice(0, 10)
    .forEach((k) => console.log('   ' + String(porTorneio[k]).padStart(4) + '  ' + k));
  if (divididos) {
    console.log('\n⛔ ATENÇÃO — ESTE NÚMERO ESTÁ INCOMPLETO.');
    console.log('   ' + divididos + ' torneio(s) DIVIDIDO(S) ficaram de fora: os jogos deles moram na');
    console.log('   subcoleção `matches`, e este script só varre o DOCUMENTO. Em 27/ago/2026 ele');
    console.log('   reportou 6 numa janela em que a CF aplicou 27 — o Confra inteiro invisível.');
    console.log('   Não conclua nada sobre a queda pro caminho local com este número sozinho.');
  }
  console.log('\n⇒ compare com o log da CF na MESMA janela:');
  console.log('   npx firebase functions:log --only applyMatchResult -n 1000 | grep -c "— applied"');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
