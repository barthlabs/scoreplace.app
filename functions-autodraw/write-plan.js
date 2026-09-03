/* ═══ WRITE PLAN — UM PLANEJADOR SÓ, UM EXECUTOR SÓ ═══════════════════════════════════
 *
 * Ordem do revisor externo (02/set/2026): _"Desenhe um `write plan` puro e único. A
 * checagem de limite e o executor devem consumir exatamente o mesmo plano; não aceite um
 * preflight separado de `_gravaTorneio` que possa divergir da escrita real."_
 *
 * ⛔ O QUE ISTO IMPEDE: um preflight que estime "jogos novos + documento" enquanto
 * `_gravaTorneio` escreve outra coisa. Se os dois divergirem, o teto não protege nada — ele
 * mede um plano e o banco recebe outro. Aqui existe UMA função que decide o que será
 * escrito (`planWrites`) e UMA que escreve (`applyPlan`), e a segunda não recalcula nada:
 * ela percorre o array que a primeira devolveu.
 *
 * ⚠️ PURO DE VERDADE. `planWrites` não toca `tx`, não chama `Date.now()`, não gera id
 * automático e não importa `FieldValue`. Todo instante entra por argumento (`ctx.agoraIso`),
 * calculado UMA vez antes de `runTransaction` — assim o retry do Firestore, que re-executa
 * o callback, reusa o mesmo valor em vez de produzir um plano diferente a cada tentativa.
 * O apagamento de campo é DECLARADO (`apagarCampos`) e só vira `FieldValue.delete()` dentro
 * de `applyPlan`, que é o único lugar que conhece o SDK.
 *
 * ⛔ E O EXECUTOR RECUSA O QUE NÃO ESTÁ NO PLANO: coleção fora do conjunto permitido, op
 * sem chave, op de tipo desconhecido. Uma operação fabricada no meio do caminho não passa.
 *
 * A ORDEM das operações não tem efeito de consistência — numa transação do Firestore tudo
 * é aplicado atomicamente e nada é legível no meio. Ela é fixa por outro motivo: para o
 * plano ser COMPARÁVEL e hasheável em teste (mesmas entradas ⇒ mesma sequência).
 */
'use strict';

/* Coleções que este planejador pode tocar. Qualquer outra é recusada pelo executor.
 * `null` é o documento raiz do torneio. */
const COLECOES_FIXAS = ['results', 'advanceReceipts', 'outbox'];

/* Teto conservador, bem abaixo do limite real do Firestore (500 escritas por transação).
 * ⛔ A recusa acontece ANTES de qualquer escrita, e a materialização NUNCA é quebrada em
 * lotes não atômicos: meia fase publicada é pior que fase nenhuma. */
const TETO_OPERACOES = 400;

function _clone(x) { return JSON.parse(JSON.stringify(x)); }

/* ── planWrites ────────────────────────────────────────────────────────────────────────
 * tAntes   — o torneio como estava (remontado), ou null quando não há anterior
 * tDepois  — o torneio já materializado, com `_semPesados` decidindo o que sai do doc
 * ctx      — {
 *              split,        // o módulo tournament-split-core (injetado, não importado)
 *              boundary,     // função que aplica a fronteira de escrita; devolve {persist}
 *              agoraIso,     // instante ESTÁVEL da operação (argumento, nunca Date.now())
 *              espelho,      // { buildMirrorDoc } ou null — o espelho de `results`
 *              extras: [ { colecao, chave, doc, merge? } ]  // recibo, outbox
 *            }
 * devolve  — { ops, totais, marcador }
 */
function planWrites(tAntes, tDepois, ctx) {
  const o = ctx || {};
  if (!o.boundary) throw new Error('[write-plan] ctx.boundary é obrigatório');
  if (!o.agoraIso) throw new Error('[write-plan] ctx.agoraIso é obrigatório — instante estável entra por argumento');

  const b = o.boundary(tDepois);
  const ops = [];

  const fora = Array.isArray(tDepois._semPesados) ? tDepois._semPesados : null;

  if (!fora || !fora.length) {
    /* Torneio NÃO dividido: o documento carrega tudo, como sempre carregou. */
    ops.push({ tipo: 'set', colecao: null, chave: null, doc: b.persist });
    return _fecha(ops, o, null, b);
  }

  const split = o.split;
  if (!split || typeof split.dividir !== 'function') {
    throw new Error('[write-plan] tradutor de partes indisponível — recuso planejar torneio dividido');
  }

  const pDepois = split.dividir(_clone(b.persist), fora);
  /* Sem torneio anterior, TODA parte é "vazia antes" — derivado de PESADOS + matches, e
   * não de três nomes escritos à mão, senão a quarta parte pareceria nova a cada gravação. */
  const vazio = { matches: [] };
  (split.PESADOS || []).forEach((k) => { vazio[k] = []; });
  const pAntes = tAntes ? split.dividir(_clone(tAntes), fora) : vazio;

  /* A LISTA MANDA, não o nome escrito à mão: parte nova no marcador passa a ser planejada
   * sem ninguém lembrar deste ponto. A chave sai de `chaveDoRegistro` — uma regra só. */
  fora.forEach((nome) => {
    const d = split.jogosQueMudaram(pAntes[nome] || [], pDepois[nome] || []);
    const colecao = split.colecaoDaParte(nome);
    const chaveDe = (x) => {
      const k = split.chaveDoRegistro(x);
      if (!k) throw new Error('[write-plan] registro sem chave em "' + nome + '" — recuso planejar sem identidade');
      return String(k);
    };
    d.mudaram.forEach((m) => ops.push({ tipo: 'set', colecao: colecao, chave: chaveDe(m), doc: m }));
    d.sumiram.forEach((m) => ops.push({ tipo: 'delete', colecao: colecao, chave: chaveDe(m) }));

    /* ESPELHO DE `results` — a CF é quem escreve desde a 2.1.30. Continua aqui, com o
     * MESMO cuidado de antes, só que agora como OPERAÇÃO DO PLANO (e por isso contada no
     * teto e visível no teste) e com o instante vindo por argumento. */
    if (nome === 'matches' && o.espelho && typeof o.espelho.buildMirrorDoc === 'function' && d.mudaram.length) {
      d.mudaram.forEach((reg) => {
        const jogo = reg && reg.jogo;
        if (!jogo || jogo.id == null || jogo.id === '') return;
        let doc;
        try {
          doc = o.espelho.buildMirrorDoc(tDepois, jogo, o.tournamentId || null, o.agoraIso, null);
        } catch (e) {
          /* Best-effort declarado: o resultado JÁ está em `matches`, que é a fonte de
           * verdade. Falhar o espelho não pode derrubar a gravação. */
          if (o.onAviso) o.onAviso('[espelho-result] ' + String(jogo.id) + ': ' + (e && e.message));
          return;
        }
        const apagar = [];
        /* CONFIRMADO NÃO FICA PENDENTE: `merge:true` preservaria uma proposta já
         * respondida, e ela seguiria pedindo confirmação num jogo fechado. */
        const decidido = (jogo.winner != null && jogo.winner !== '') || jogo.draw === true || jogo.wo != null;
        if (decidido) apagar.push('pendingResult');
        /* ROSTER VAZIO NÃO SOBRESCREVE ROSTER BOM: `playerUids: []` é "não sei", e "não
         * sei" não escreve — é ele que sustenta "só quem joga ESTE jogo escreve". */
        if (!Array.isArray(doc.playerUids) || !doc.playerUids.length) delete doc.playerUids;
        ops.push({
          tipo: 'set', colecao: 'results', chave: String(jogo.id),
          doc: doc, merge: true, apagarCampos: apagar.length ? apagar : undefined
        });
      });
    }
  });

  /* devolve ao documento tudo que NÃO está no marcador */
  (split.PESADOS || ['participants', 'history']).forEach((k) => {
    if (fora.indexOf(k) === -1 && b.persist[k] !== undefined) pDepois.config[k] = b.persist[k];
  });
  pDepois.config._semPesados = fora;
  /* Os contadores dizem QUANTOS moram fora. Sem eles, "o documento não tem jogo" é ambíguo
   * entre torneio que não sorteou e torneio dividido cuja tela ainda não buscou — e os dois
   * pintam igual. `_nJogos`/`_nGrupos` continuam por compatibilidade com app já instalado. */
  if (fora.indexOf('matches') !== -1) pDepois.config._nJogos = (pDepois.matches || []).length;
  if (fora.indexOf('grupos') !== -1) pDepois.config._nGrupos = (pDepois.grupos || []).length;
  pDepois.config._nPartes = fora.reduce((acc, nome) => {
    acc[nome] = (pDepois[nome] || []).length; return acc;
  }, {});

  ops.push({ tipo: 'set', colecao: null, chave: null, doc: pDepois.config });
  return _fecha(ops, o, fora, b);
}

function _fecha(ops, o, fora, b) {
  /* extras (recibo, outbox) entram por último e são declarados pelo chamador — nunca
   * inventados aqui. O executor confere a coleção de cada um. */
  (o.extras || []).forEach((e) => {
    if (!e || !e.colecao || !e.chave) throw new Error('[write-plan] extra sem colecao/chave');
    ops.push({ tipo: 'set', colecao: String(e.colecao), chave: String(e.chave), doc: e.doc, merge: !!e.merge });
  });

  const totais = ops.reduce((acc, op) => {
    if (op.tipo === 'delete') acc.deletes++; else acc.escritas++;
    if (op.colecao === null) acc.docRaiz++;
    acc.bytesEstimados += op.doc ? JSON.stringify(op.doc).length : 0;
    return acc;
  }, { escritas: 0, deletes: 0, docRaiz: 0, bytesEstimados: 0 });
  totais.operacoes = ops.length;

  return {
    ops: ops,
    totais: totais,
    marcador: fora,
    boundary: b,
    /* colecoes permitidas para ESTE plano — o executor recusa qualquer outra */
    colecoesPermitidas: COLECOES_FIXAS.concat((fora || []).map((n) => (o.split ? o.split.colecaoDaParte(n) : n)))
  };
}

/* Recusa ANTES de escrever. Devolve null quando cabe, ou o motivo. */
function checaTeto(plan, teto) {
  const limite = (typeof teto === 'number' && teto > 0) ? teto : TETO_OPERACOES;
  if (plan.totais.operacoes > limite) {
    return 'plano com ' + plan.totais.operacoes + ' operações excede o teto de ' + limite +
           ' — recuso escrever pela metade';
  }
  return null;
}

/* ── applyPlan ─────────────────────────────────────────────────────────────────────────
 * Único ponto que toca a transação. NÃO decide nada: percorre `plan.ops`.
 * `deps` = { FieldValue } — injetado, para o módulo continuar puro de SDK.
 */
function applyPlan(tx, ref, plan, deps) {
  if (!plan || !Array.isArray(plan.ops)) throw new Error('[write-plan] plano inválido');
  const FieldValue = deps && deps.FieldValue;
  const permitidas = plan.colecoesPermitidas || COLECOES_FIXAS;

  plan.ops.forEach((op, i) => {
    if (!op || (op.tipo !== 'set' && op.tipo !== 'delete')) {
      throw new Error('[write-plan] op ' + i + ' com tipo desconhecido — recuso executar fora do plano');
    }
    if (op.colecao !== null && permitidas.indexOf(op.colecao) === -1) {
      throw new Error('[write-plan] op ' + i + ' aponta para a coleção "' + op.colecao +
                      '", que não está no plano — recuso');
    }
    const alvo = (op.colecao === null) ? ref : ref.collection(op.colecao).doc(String(op.chave));
    if (op.colecao !== null && (op.chave == null || op.chave === '')) {
      throw new Error('[write-plan] op ' + i + ' sem chave em "' + op.colecao + '"');
    }
    if (op.tipo === 'delete') { tx.delete(alvo); return; }

    let doc = op.doc;
    if (op.apagarCampos && op.apagarCampos.length) {
      if (!FieldValue) throw new Error('[write-plan] apagarCampos exige deps.FieldValue');
      doc = Object.assign({}, doc);
      op.apagarCampos.forEach((c) => { doc[c] = FieldValue.delete(); });
    }
    if (op.merge) tx.set(alvo, doc, { merge: true });
    else tx.set(alvo, doc);
  });
  return plan;
}

module.exports = { planWrites, applyPlan, checaTeto, TETO_OPERACOES, COLECOES_FIXAS };
