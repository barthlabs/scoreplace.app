/* amizade-fase.js — QUANDO O BACKEND SOCIAL PODE ESCREVER (v2.1.48)
 *
 * Duas travas INDEPENDENTES, no mesmo documento `_meta/amizadeMigration`:
 *
 *   `fase`        — a máquina ONE-SHOT da migração:
 *                     not_started → frozen → backfilled → live
 *                   `live` é TERMINAL. Rebobinar permitiria rodar o backfill destrutivo de
 *                   novo, que veria as amizades criadas depois do corte como "extras".
 *
 *   `maintenance` — pausa OPERACIONAL, ligável e desligável a qualquer momento.
 *
 * ⛔ POR QUE SÃO DUAS (8ª auditoria externa, 29/ago/2026): o rollback seguro precisa PARAR
 * o backend sem REBOBINAR a migração. Com uma trava só, "parar" significaria voltar a fase
 * para `frozen` — e aí o backfill destrutivo ficaria autorizado de novo. Rollback seguro é
 * `Rules da Etapa A + maintenance=true`, com a fase intacta em `live`.
 *
 * A tabela, que é o contrato:
 *   fase=live       · maintenance=false → operações sociais NORMAIS  ← o ÚNICO caso
 *   fase=live       · maintenance=true  → TUDO recusado (rollback seguro / manutenção)
 *   fase=backfilled · qualquer          → TUDO recusado (a Etapa C ainda não terminou)
 *   fase=frozen     · qualquer          → tudo recusado, MAS o backfill é autorizado
 *   fase=not_started· qualquer          → tudo recusado, backfill NÃO autorizado
 *   maintenance=true                    → NUNCA autoriza backfill (é pausa, não migração)
 *
 * ⛔ SEM CACHE DO ESTADO LIBERADO (8ª auditoria, ponto 3). A versão anterior cacheava a
 * fase por 10 s "pra não cobrar pedágio". Isso é fail-open: o operador liga a manutenção e
 * por até 10 s as instâncias quentes continuam AUTORIZANDO escrita — exatamente a janela
 * que a manutenção existe pra fechar. Uma leitura por operação social custa quase nada
 * (merge/delete/amizade são raros) e vale muito mais que uma autorização velha.
 * Só o estado BLOQUEADO poderia ser cacheado — atraso na liberação falha fechado — e nem
 * isso vale a complexidade aqui.
 */
'use strict';

const DOC = '_meta/amizadeMigration';
const FASES = ['not_started', 'frozen', 'backfilled', 'live'];
/* Fases em que a autoridade social ainda não está no ar. `backfilled` está aqui: o cânone
 * existe, mas Functions finais / Rules finais / cliente ainda não subiram. */
const FASES_CONGELADAS = ['not_started', 'frozen', 'backfilled'];

/** Lê o estado SEM CACHE. Falha de leitura ⇒ congelado (falha fechada). */
async function estado(db) {
  try {
    const d = await db.doc(DOC).get();
    if (!d.exists) return { fase: 'not_started', maintenance: false, existe: false };
    const x = d.data() || {};
    const fase = FASES.includes(String(x.fase)) ? String(x.fase) : 'not_started';
    return { fase: fase, maintenance: x.maintenance === true, existe: true };
  } catch (e) {
    console.error('[amizade-fase] leitura falhou — assumindo CONGELADO:', e && e.message);
    return { fase: 'frozen', maintenance: true, existe: null, erroLeitura: true };
  }
}

/* ⛔ 9ª auditoria (ponto 1): SÓ `live` LIBERA. A versão anterior liberava tudo que não
 * estivesse em `not_started`/`frozen` — ou seja, `backfilled` já reabria amizade, merge,
 * delete e auto-merge. Mas `backfilled` é o fim da ETAPA B: ainda faltam o deploy final
 * das Functions, as Rules finais, o Hosting e a decisão consciente de abrir. Nenhum
 * backend social pode voltar antes do `--fase=live --aplicar`, que é o ÚLTIMO passo. */
function operacoesLiberadas(est) {
  if (!est) return false;
  if (est.maintenance === true) return false;
  return String(est.fase) === 'live';
}

/** O backfill pode escrever agora? SÓ em `frozen`, e nunca sob manutenção. */
function backfillAutorizado(est) {
  if (!est) return false;
  if (est.maintenance === true) return false;
  return String(est.fase) === 'frozen';
}

function _motivo(est) {
  if (est.maintenance === true) return 'manutenção ligada (maintenance=true)';
  if (est.fase === 'backfilled') return 'migração em backfilled — a Etapa C ainda não terminou';
  return 'migração de amizade em ' + est.fase;
}

/* ⭐ 9ª auditoria (ponto 6): a mesma decisão, mas a partir de um snapshot LIDO DENTRO de
 * uma transação. É isto que faz ligar a manutenção durante uma aquisição concorrente
 * abortar e repetir a transação — e na repetição ela recusa. */
function estadoDeSnapshot(snap) {
  if (!snap || !snap.exists) return { fase: 'not_started', maintenance: false, existe: false };
  const x = snap.data() || {};
  return {
    fase: FASES.includes(String(x.fase)) ? String(x.fase) : 'not_started',
    maintenance: x.maintenance === true,
    existe: true,
  };
}

/** Para callables: lança `HttpsError('unavailable')` quando bloqueado. */
async function exigirLiberado(db, HttpsError, operacao) {
  const est = await estado(db);
  if (!operacoesLiberadas(est)) {
    console.warn('[amizade-fase] "' + operacao + '" RECUSADA — ' + _motivo(est));
    throw new HttpsError('unavailable',
      'Amizades e unificação de contas estão em manutenção. Tente de novo em instantes.');
  }
  return est;
}

/** Para gatilhos e agendadas, que não têm quem escute um HttpsError. */
async function liberado(db) { return operacoesLiberadas(await estado(db)); }

module.exports = {
  DOC, FASES, FASES_CONGELADAS,
  estado, estadoDeSnapshot, operacoesLiberadas, backfillAutorizado, exigirLiberado, liberado, _motivo,
};
