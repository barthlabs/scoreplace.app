// scoreplace.app — DECISÃO da varredura diária de duplicatas (módulo puro, sem side effects)
//
// POR QUE EXISTE, e por que separado de index.js: index.js registra onCall/onSchedule e lê
// secrets no import, então não dá pra carregar num teste — a mesma razão que criou o
// merge-rules.js. E a decisão de QUEM funde com QUEM é a parte que mais dói errar: fundir
// duas pessoas apaga uma conta do Auth e não tem volta.
//
// INCIDENTE QUE ORIGINOU O MÓDULO (19/ago/2026, Confra BT Alta da Clínica): o endurecimento
// de 11/ago — "fundir exige credencial AUTENTICADA dos dois lados" — foi escrito SÓ dentro
// do trigger `autoMergeOnProfileUpdate`. A varredura diária seguia fundindo pelo campo
// `phone` DIGITADO no perfil, e às 04:45 fundiu Marjorie Cilone (nasc. 1954) com Ana Carolina
// Cilone (nasc. 1981) — mãe e filha, e-mails diferentes, mesmo celular no perfil. Enquanto a
// decisão morava dentro do index.js, nenhum teste conseguia exercitá-la: só dava pra checar
// o TEXTO do arquivo, que é teatro. Agora ela é uma função pura, injetável e testável.
//
// REGRA: PURO. Nada de firebase-admin/Firestore/Date.now. As duas coisas que dependem do
// mundo — escolher o sobrevivente e PROVAR que são a mesma pessoa — entram injetadas.

'use strict';

/**
 * Plano de fusão de UM grupo de docs que caíram na MESMA chave (mesmo phone/email digitado).
 *
 * O erro é ASSIMÉTRICO e é ele que define o default: duplicata não fundida é incômodo
 * reversível (o fluxo interativo pergunta e resolve); fusão errada é irreversível. Então
 * cada par sem prova é RECUSADO, não postergado silenciosamente — ele volta em `refused`
 * pra aparecer no log da varredura.
 *
 * @param {Array<{id:string}>} docs — docs do grupo (snapshots do Firestore ou objetos {id})
 * @param {object} deps
 *   @param {(a,b)=>Promise<object>} deps.pickKeep — devolve o doc que SOBREVIVE entre dois
 *   @param {(a,b)=>Promise<{allowed:boolean,by:string|null,reason:string|null}>} deps.proof
 *          — pode fundir? Recebe os DOCS (não só uids): a decisão precisa do perfil, porque
 *            um "não somos a mesma pessoa" dispensado pela pessoa bloqueia a fusão.
 * @returns {Promise<{keepUid:string|null, merges:Array<{dropUid,by}>, refused:Array<{dropUid,reason}>}>}
 */
async function planSweepMerges(docs, deps) {
  const lista = Array.isArray(docs) ? docs.filter(Boolean) : [];
  const vazio = { keepUid: null, merges: [], refused: [] };
  if (lista.length < 2) return vazio;
  if (!deps || typeof deps.pickKeep !== 'function' || typeof deps.proof !== 'function') {
    // Sem as duas dependências não há como decidir NADA — e "não decidir" tem que
    // significar "não funde", nunca "funde tudo".
    return vazio;
  }

  let keep = lista[0];
  for (let i = 1; i < lista.length; i++) {
    keep = (await deps.pickKeep(keep, lista[i])) || keep;
  }

  const merges = [];
  const refused = [];
  for (const d of lista) {
    if (!d || d.id === keep.id) continue;
    let p = null;
    try { p = await deps.proof(keep, d); } catch (e) { p = null; }
    if (p && p.allowed) merges.push({ dropUid: d.id, by: p.by || null });
    else refused.push({ dropUid: d.id, reason: (p && p.reason) || 'sem-credencial-autenticada' });
  }
  return { keepUid: keep.id, merges: merges, refused: refused };
}

module.exports = { planSweepMerges };
