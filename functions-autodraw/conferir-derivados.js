'use strict';
/* ⛔⛔ AS LISTAS DERIVADAS DO TORNEIO TÊM DE BATER COM OS FATOS (24/set/2026).
 *
 * Pergunta do dono: _"porque vc acha que é a forma certa de trabalhar com um banco de dados?"_
 * O desenho guarda FATOS e deriva as respostas. Mas três listas são DERIVADAS E GRAVADAS,
 * porque a regra do Firestore não percorre lista de objetos filtrando por `status`:
 *   · `adminUids`   — criador + co-organizadores ativos (a regra decide por ela);
 *   · `adminEmails` — derivada, só compatibilidade;
 *   · `memberUids`  — todo mundo que está no torneio (a regra decide por ela, e a LISTA
 *                     "meus torneios" consulta por ela).
 * Resposta guardada é onde nascem duas verdades. Logo: conferir, e consertar.
 *
 * ⛔ MONTA O TORNEIO DIVIDIDO ANTES DE COMPARAR. Na primeira medição eu comparei o documento
 * MAGRO e "achei" 6 divergências — o elenco mora em subcoleção, então o recomputo via elenco
 * vazio. Montando, sobrou 1, real. Comparar sem montar é inventar defeito.
 *
 * O que cada lado significa, e é diferente:
 *   · FALTA na lista → a pessoa ESTÁ no torneio e a regra a trata como estranha: não lança o
 *     próprio placar e não vê o torneio na lista dela;
 *   · SOBRA na lista → a pessoa NÃO está no torneio e a regra a deixa passar.
 *
 *   node conferir-derivados.js            # SECO
 *   node conferir-derivados.js --apply    # conserta
 */
const admin = require('firebase-admin');
const Co = require('../functions/cohost-core.js');
const En = require('../functions/enroll-core.js');
const Split = require('./vendor/tournament-split-core.js');

const LISTAS = [
  ['adminUids',   (t) => Co.computeAdminUids(t)],
  ['adminEmails', (t) => (typeof Co.computeAdminEmails === 'function' ? Co.computeAdminEmails(t) : null)],
  ['memberUids',  (t) => (typeof En.computeMemberUids === 'function' ? En.computeMemberUids(t) : null)],
];

/** Compara UMA lista. Devolve {falta, sobra} ou null quando não há como recomputar. */
function conferirLista(gravado, esperado) {
  if (!Array.isArray(esperado)) return null;
  const g = new Set((Array.isArray(gravado) ? gravado : []).map(String));
  const e = new Set(esperado.map(String));
  return { falta: [...e].filter((x) => !g.has(x)), sobra: [...g].filter((x) => !e.has(x)) };
}

module.exports = { conferirLista, LISTAS };

if (require.main === module) {
  const apply = process.argv.indexOf('--apply') !== -1;
  admin.initializeApp();
  const db = admin.firestore();
  (async () => {
    const snap = await db.collection('tournaments').get();
    console.log((apply ? '▸ APLICANDO' : '▸ SECO (nada será gravado)') + ' — ' + snap.size + ' torneio(s)');
    let ruins = 0, consertados = 0;
    for (const d of snap.docs) {
      const t = d.data();
      let completo = t;
      if (Array.isArray(t._semPesados) && t._semPesados.length) {
        try {
          completo = await Split.montarDoBanco(JSON.parse(JSON.stringify(t)), async (col) => {
            const qs = await db.collection('tournaments').doc(d.id).collection(col).get();
            return qs.docs.map((x) => Object.assign({ id: x.id }, x.data()));
          });
        } catch (e) {
          /* ⛔ Sem montar não se compara: melhor não dizer nada que dizer errado. */
          console.log('  ⚠️ ' + d.id + ' · não montei as partes, PULADO: ' + (e && e.message));
          continue;
        }
      }
      const patch = {};
      const relatos = [];
      LISTAS.forEach(([campo, calc]) => {
        const r = conferirLista(t[campo], calc(completo));
        if (!r) return;
        if (r.falta.length || r.sobra.length) {
          relatos.push(campo + ': falta ' + r.falta.length + ' (está no torneio e a regra recusa)'
            + ' · sobra ' + r.sobra.length + ' (não está e a regra deixa)');
          patch[campo] = calc(completo);
        }
      });
      if (!relatos.length) continue;
      ruins++;
      console.log('  ⛔ ' + d.id + ' · ' + (t.name || '') + '\n       ' + relatos.join('\n       '));
      if (apply) {
        await db.collection('tournaments').doc(d.id).update(patch);
        consertados++;
      }
    }
    console.log('\n  divergentes: ' + ruins + (apply ? ' · consertados: ' + consertados : ''));
    if (!apply) { console.log('  (seco — rode com --apply para gravar)'); return; }
    console.log('✓ conserto aplicado; rode de novo em seco para conferir');
  })().catch((e) => { console.error(e); process.exit(1); });
}
