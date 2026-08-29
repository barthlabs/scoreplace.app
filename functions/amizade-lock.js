/* amizade-lock.js — LOCK DE CICLO DE VIDA, COM AQUISIÇÃO TRANSACIONAL (v2.1.48)
 *
 * ⛔ A VERSÃO ANTERIOR NÃO ERA UM LOCK (7ª auditoria externa, 29/ago/2026).
 * `marcar()` era um `batch.set` sem olhar o estado anterior — ou seja, escrevia por cima.
 * Então isto acontecia sem nenhum obstáculo:
 *     merge A/B  → marca A,B `merging`
 *     delete A   → marca A `deleting`      (sobrescreve, ninguém reclama)
 *     as duas seguem trabalhando no mesmo uid
 * e pior: `liberar()` de uma delas escrevia `active` enquanto a OUTRA ainda trabalhava,
 * reabrindo a janela no meio da operação alheia. Exclusão mútua exige comparar-e-trocar,
 * não escrever.
 *
 * ⭐ AGORA:
 *   · aquisição roda numa TRANSAÇÃO que lê TODOS os uids de uma vez — ou pega todos, ou
 *     não pega nenhum (nada de aquisição parcial, que é como nasce deadlock);
 *   · cada aquisição carrega um `operationId` aleatório;
 *   · `liberar` só solta se o `operationId` no documento ainda for o dela — ninguém libera
 *     lock alheio, nem por engano nem por retry atrasado;
 *   · `expiresAt` é um LEASE: operação abandonada não tranca a conta para sempre, e o
 *     lease vencido pode ser tomado por outra operação (com log, porque é anormal).
 *
 * ⚠️ O LEASE PRECISA SER MAIOR QUE A OPERAÇÃO MAIS LONGA QUE ELE COBRE.
 * Medido no repo: `mergePhoneAccount` declara `timeoutSeconds: 300` e `deleteAccount`
 * também roda em minutos (varre torneios, notificações, casuais, venues). 30 min de lease
 * é ~6× o teto declarado — folga sem virar "conta trancada por meia hora à toa".
 *
 * ⛔ NÃO ANINHAR: quem já possui o lock chama a versão INTERNA da operação. Adquirir duas
 * vezes o mesmo uid na mesma cadeia trava a si mesmo (`comLock` de fora + `comLock` de
 * dentro = a segunda vê `merging` e falha). Ver `_executeMerge` vs `_executeMergeInterno`.
 */
'use strict';
const crypto = require('crypto');
const _fase = require('./amizade-fase');

const COL = 'userLifecycle';
const LEASE_MS = 30 * 60 * 1000;        // > 300 s do maior timeout declarado
const ESTADOS = ['active', 'merging', 'deleting'];
/* ⛔ 9ª auditoria (ponto 3): ESTADOS TERMINAIS. Depois de uma fusão, o uid absorvido não
 * volta a `active` — ele está MORTO. Voltar abria a porta pra uma operação que fez a
 * validação antes e chega depois: ela veria `active` e escreveria sobre um uid que já é
 * lápide. O mesmo vale pro uid excluído.
 * Terminal NÃO expira por lease (não é operação abandonada, é fato consumado), NÃO conta
 * como `active` e NÃO pode ser adquirido de novo. */
const TERMINAIS = ['merged', 'deleted'];

const ref = (db, uid) => db.collection(COL).doc(String(uid));
const novoOperationId = () => crypto.randomBytes(16).toString('hex');

/** Estado efetivo: `active` quando ausente, quando marcado active, ou com lease vencido. */
function estadoDe(data, agoraMs) {
  if (!data || !data.estado || data.estado === 'active') return 'active';
  if (TERMINAIS.includes(data.estado)) return data.estado;   // ⛔ terminal não expira
  const exp = Date.parse(data.expiresAt || '') || 0;
  if (exp && agoraMs > exp) return 'active';                 // lease vencido
  return data.estado;
}

const _MSG = {
  merging: 'esta conta está sendo unificada agora — tente de novo em instantes',
  deleting: 'esta conta está sendo excluída',
  merged: 'esta conta foi unificada com outra — entre de novo para continuar',
  deleted: 'esta conta foi excluída',
};

class LockOcupado extends Error {
  constructor(uid, estado) {
    super(_MSG[estado] || ('conta indisponível (' + estado + ')'));
    this.name = 'LockOcupado'; this.lifecycle = estado; this.uid = uid;
    this.terminal = TERMINAIS.includes(estado);
  }
}
class MigracaoBloqueada extends Error {
  constructor(motivo) {
    super('Amizades e unificação de contas estão em manutenção. Tente de novo em instantes.');
    this.name = 'MigracaoBloqueada'; this.migracao = motivo;
  }
}

/* ⛔ LEITURA DENTRO DA TRANSAÇÃO DE AMIZADE. É isto que faz uma aquisição concorrente
 * forçar retry: o Firestore repete a transação se qualquer documento LIDO nela mudar. */
async function exigirAtivos(tx, db, uids, agoraMs) {
  const lista = [...new Set(uids.map(String).filter(Boolean))];
  const docs = await Promise.all(lista.map((u) => tx.get(ref(db, u))));
  for (let i = 0; i < lista.length; i++) {
    const est = estadoDe(docs[i].exists ? docs[i].data() : null, agoraMs);
    if (est !== 'active') throw new LockOcupado(lista[i], est);
  }
}

/* AQUISIÇÃO ATÔMICA — tudo ou nada. Devolve { operationId, uids }.
 * Lança `LockOcupado` se QUALQUER um estiver ocupado; nesse caso NENHUM foi adquirido. */
async function adquirir(db, uids, estado, opts) {
  if (!ESTADOS.includes(estado) || estado === 'active') throw new Error('estado inválido: ' + estado);
  const lista = [...new Set((uids || []).map(String).filter(Boolean))].sort();  // ordem estável
  if (!lista.length) throw new Error('adquirir sem uids');
  const operationId = (opts && opts.operationId) || novoOperationId();
  const leaseMs = (opts && opts.leaseMs) || LEASE_MS;

  await db.runTransaction(async (tx) => {
    const agoraMs = Date.now();
    /* ⛔ 9ª auditoria (ponto 6): a FASE é lida DENTRO desta transação. O check externo falha
     * cedo e dá mensagem boa, mas não é prova: entre ele e o commit cabe um
     * `maintenance=on`. Lendo o marcador aqui, ligar a manutenção durante uma aquisição
     * concorrente muda um documento LIDO — o Firestore aborta e repete, e na repetição
     * a aquisição recusa. */
    const mSnap = await tx.get(db.doc(_fase.DOC));
    const est = _fase.estadoDeSnapshot(mSnap);
    if (!_fase.operacoesLiberadas(est)) throw new MigracaoBloqueada(_fase._motivo(est));

    const docs = await Promise.all(lista.map((u) => tx.get(ref(db, u))));
    // 1) confere TODOS antes de escrever QUALQUER um
    for (let i = 0; i < lista.length; i++) {
      const d = docs[i].exists ? docs[i].data() : null;
      const est = estadoDe(d, agoraMs);
      if (est !== 'active') throw new LockOcupado(lista[i], est);
      if (d && d.estado && d.estado !== 'active' && est === 'active') {
        console.warn('[lifecycle] lease VENCIDO tomado em ' + lista[i] +
          ' (op anterior ' + (d.operationId || '?') + ' de ' + (d.acquiredAt || '?') + ')');
      }
    }
    // 2) só então grava todos, com o MESMO operationId
    const agora = new Date(agoraMs).toISOString();
    const expira = new Date(agoraMs + leaseMs).toISOString();
    lista.forEach((u) => tx.set(ref(db, u), {
      estado: estado, operationId: operationId, acquiredAt: agora, expiresAt: expira,
    }));
  });
  console.log('[lifecycle] ADQUIRIDO', lista.join(','), '→', estado, 'op=' + operationId.slice(0, 8));
  return { operationId: operationId, uids: lista };
}

/* LIBERAÇÃO COM OWNERSHIP — só solta o que é seu. Um retry atrasado, ou uma operação que
 * perdeu o lease e viu outra tomá-lo, NÃO pode destrancar o trabalho alheio. */
async function liberar(db, posse) {
  if (!posse || !posse.operationId || !posse.uids || !posse.uids.length) return { liberados: 0, alheios: 0 };
  let liberados = 0, alheios = 0;
  await db.runTransaction(async (tx) => {
    liberados = 0; alheios = 0;
    const docs = await Promise.all(posse.uids.map((u) => tx.get(ref(db, u))));
    const escritas = [];
    for (let i = 0; i < posse.uids.length; i++) {
      const d = docs[i].exists ? docs[i].data() : null;
      /* ⛔ 10ª auditoria (ponto 4): OWNERSHIP ESTRITO. Antes, documento sem `operationId`
       * era tratado como liberável — então uma posse velha (que perdeu o lease e viu outra
       * operação assumir e FINALIZAR) podia sobrescrever um estado já terminal, devolvendo
       * um uid morto para `active`. Agora só toca o que é comprovadamente seu. */
      /* ⛔ 11ª auditoria (ponto 2): DOC AUSENTE É NO-OP, não "liberável".
       * Antes, doc sem documento (ou sem `operationId`) era tratado como solto e a posse
       * escrevia `active` nele — uma posse STALE podia assim criar um `active` do nada,
       * inclusive por cima de um estado que outra operação estava prestes a finalizar.
       * Só se escreve o que é comprovadamente desta posse. */
      if (!d) {
        alheios++;
        console.warn('[lifecycle] NÃO liberou ' + posse.uids[i] + ': documento não existe (no-op)');
        continue;
      }
      if (TERMINAIS.includes(d.estado)) {
        alheios++;
        console.warn('[lifecycle] NÃO liberou ' + posse.uids[i] + ': já é TERMINAL (' + d.estado + ')');
        continue;
      }
      if (!d.operationId || d.operationId !== posse.operationId) {
        alheios++;
        console.warn('[lifecycle] NÃO liberou ' + posse.uids[i] + ': lock de ' +
          (d.operationId ? d.operationId.slice(0, 8) : '(sem dono)') + ', não da ' + posse.operationId.slice(0, 8));
        continue;
      }
      liberados++; escritas.push(posse.uids[i]);
    }
    escritas.forEach((u) => tx.set(ref(db, u), {
      estado: 'active', operationId: null, acquiredAt: null, expiresAt: null,
    }));
  });
  console.log('[lifecycle] LIBERADO', liberados, 'de', posse.uids.length,
    (alheios ? '(' + alheios + ' já pertenciam a outra operação)' : ''));
  return { liberados: liberados, alheios: alheios };
}

/* ⛔ FINALIZAÇÃO (9ª auditoria, ponto 3): marca estados TERMINAIS respeitando ownership.
 * Não se usa `liberar()` pra isso — `liberar` devolve pra `active`, e uid morto voltando a
 * `active` é exatamente o buraco. `estadosPorUid` diz o desfecho de cada um:
 *   merge  → { [drop]: 'merged',  [keep]: 'active' }
 *   delete → { [uid]:  'deleted' }
 * Terminal não carrega lease: `expiresAt: null` (não expira, por definição). */
async function finalizar(db, posse, estadosPorUid) {
  if (!posse || !posse.operationId) return { finalizados: 0, alheios: 0 };
  let finalizados = 0, alheios = 0;
  await db.runTransaction(async (tx) => {
    finalizados = 0; alheios = 0;
    const docs = await Promise.all(posse.uids.map((u) => tx.get(ref(db, u))));
    const escrever = [];
    for (let i = 0; i < posse.uids.length; i++) {
      const uid = posse.uids[i];
      const d = docs[i].exists ? docs[i].data() : null;
      /* ⛔ 11ª auditoria (ponto 2): ESCREVE SÓ SE O DOC EXISTE **E** O `operationId` É O
       * DESTA POSSE. Ausente, `null` ou diferente ⇒ NO-OP. Sem isso, uma posse stale
       * conseguia sobrescrever `active`, `merged` ou `deleted` alheios. */
      if (!d || !d.operationId || d.operationId !== posse.operationId) {
        alheios++;
        console.warn('[lifecycle] NÃO finalizou ' + uid + ': ' +
          (!d ? 'documento não existe' :
           !d.operationId ? 'documento sem dono' :
           'lock é da op ' + d.operationId.slice(0, 8)) + ' (no-op)');
        continue;
      }
      const alvo = (estadosPorUid && estadosPorUid[uid]) || 'active';
      if (!ESTADOS.includes(alvo) && !TERMINAIS.includes(alvo)) throw new Error('estado final inválido: ' + alvo);
      escrever.push([uid, alvo]); finalizados++;
    }
    const agora = new Date().toISOString();
    escrever.forEach(([uid, alvo]) => tx.set(ref(db, uid), TERMINAIS.includes(alvo)
      ? { estado: alvo, operationId: null, acquiredAt: null, expiresAt: null, terminalEm: agora }
      : { estado: 'active', operationId: null, acquiredAt: null, expiresAt: null }));
  });
  console.log('[lifecycle] FINALIZADO', JSON.stringify(estadosPorUid || {}),
    (alheios ? '(' + alheios + ' alheios)' : ''));
  return { finalizados: finalizados, alheios: alheios };
}

/* ⛔ 10ª auditoria (ponto 3): O DESFECHO SEGUE O FATO PERSISTIDO, NÃO UMA FLAG.
 * A lógica anterior era "chegou ao fim → terminal; lançou → active". Isso é falso para
 * operações com efeitos IRREVERSÍVEIS. O caso concreto:
 *   deleteAccount apaga tudo → grava `users/{uid}.deleted = true` → `admin.auth()
 *   .deleteUser` FALHA → a função lança → o catch devolve o lifecycle para `active`.
 * Ficamos com profile=deleted, Auth vivo e lifecycle=active — e o retry é recusado porque
 * o profile já diz `deleted`. Conta em limbo.
 * Aqui o estado final é DEDUZIDO do que está gravado: `mergedInto` ⇒ merged,
 * `deleted/deletedAt` ⇒ deleted. Só conta viva e não absorvida volta a `active`. */
async function estadoFinalPeloFato(db, uid) {
  try {
    const d = await db.collection('users').doc(uid).get();
    /* ⛔ 11ª auditoria (ponto 3): AUSÊNCIA DE `users/{uid}` NÃO É PROVA DE EXCLUSÃO.
     * Este projeto tem "Auth ghost": conta no Firebase Auth SEM documento em `users/` — é o
     * caso normal de quem acabou de verificar um telefone. Concluir `deleted` a partir da
     * ausência marcaria como morta uma identidade viva, e terminal não se desfaz.
     * DESCONHECIDO (`null`) faz `finalizarPeloFato` não escrever nada: o lease vence e a
     * próxima operação decide com dado fresco. Estado terminal de ghost só com prova
     * explícita de que a identidade foi consumida — quem tem essa prova é o chamador. */
    if (!d.exists) return null;                            // desconhecido: não decide
    const x = d.data() || {};
    if (x.mergedInto) return 'merged';
    if (x.deleted === true || x.deletedAt) return 'deleted';
    return 'active';
  } catch (e) {
    /* Não deu pra conferir o fato: NÃO devolve pra active por otimismo. Deixa o lock
     * como está — o lease vence sozinho e a próxima operação decide com dado fresco. */
    console.error('[lifecycle] não foi possível ler o fato de ' + uid + ':', e && e.message);
    return null;
  }
}

/** Finaliza deduzindo o estado de cada uid a partir do que ficou GRAVADO. */
async function finalizarPeloFato(db, posse) {
  if (!posse || !posse.uids) return { finalizados: 0, alheios: 0 };
  const estados = {};
  for (const uid of posse.uids) {
    const e = await estadoFinalPeloFato(db, uid);
    if (e) estados[uid] = e;
  }
  if (!Object.keys(estados).length) return { finalizados: 0, alheios: 0 };
  return finalizar(db, posse, estados);
}

/** Envolve uma operação: adquire tudo ou falha; libera no fim, só o que é seu. */
async function comLock(db, uids, estado, fn) {
  const posse = await adquirir(db, uids, estado);
  try { return await fn(posse); }
  finally {
    try { await liberar(db, posse); }
    catch (e) { console.error('[lifecycle] liberação falhou (lease vence em ' + (LEASE_MS / 60000) + ' min):', e && e.message); }
  }
}

module.exports = {
  COL, LEASE_MS, ESTADOS, TERMINAIS, LockOcupado, MigracaoBloqueada,
  estadoDe, exigirAtivos, adquirir, liberar, finalizar, finalizarPeloFato, estadoFinalPeloFato,
  comLock, novoOperationId,
};
