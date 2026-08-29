/* amizade-service.js — A IMPLEMENTAÇÃO DAS CINCO OPERAÇÕES DE AMIZADE (v2.1.48)
 *
 * ⛔ POR QUE É UM ARQUIVO SEPARADO (6ª auditoria externa, 29/ago/2026):
 * isto morava em `functions/index.js`, e de lá escrevia os QUATRO caches sociais usando os
 * aliases `AU`/`AR`. O gate `check-amizade-client-writes.js` afirmava que só
 * `amizade-lifecycle` e o backfill escreviam esses campos — e passava, porque a regex
 * procurava `arrayUnion|arrayRemove|FieldValue` e não via os aliases.
 * Gate verde contradizendo o código é pior que gate ausente: dá licença para confiar.
 * A escrita em si é LEGÍTIMA — acontece na mesma transação que muda `friendships` e
 * `friendAccess`, então cache e cânone não podem divergir. O que estava errado era a
 * FRONTEIRA. Agora ela existe, e o gate autoriza este arquivo por nome.
 *
 * `index.js` fica só com os adapters `onCall`. Aqui mora: validação transacional, mudança
 * de relação, mudança de projeção e projeção dos caches — nesta ordem, numa transação.
 * As REGRAS (transições, pairId, colisão) continuam em `amizade-authority-core.js`.
 */
'use strict';
const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const _core = require('./amizade-authority-core');
const _vivo = require('./user-vivo-core');
const _lock = require('./amizade-lock');
const _fase = require('./amizade-fase');

/* ═══════════════════════════════════════════════════════════════════════════════
 * AMIZADE — A PORTA ÚNICA (v2.1.48, 29/ago/2026)
 *
 * ANTES: o cliente escrevia `friends` / `friendRequestsSent` / `friendRequestsReceived`
 * no perfil dos DOIS lados, e `firestore.rules:639` liberava isso pra QUALQUER
 * autenticado via `isFriendArrayDiff()` — que só perguntava quais chaves mudaram, nunca
 * quem estava mudando. Como `statsVisibleToCaller` decidia leitura por
 * `request.auth.uid in u.get('friends')`, qualquer conta se tornava "amiga" de qualquer
 * pessoa e lia estatísticas marcadas como "só amigos".
 *
 * AGORA: as cinco operações vivem aqui. O `actorUid` vem do `request.auth.uid` — nunca do
 * corpo da chamada — e a transição é decidida por `amizade-authority-core.decidir()`,
 * que recusa qualquer ator fora do par. `users.friends` continua sendo escrito, mas
 * como CACHE DE EXIBIÇÃO: quem manda é `friendships/{pairId}`, e quem as Rules leem é
 * `friendAccess/{uid}/accepted/{friendUid}`.
 *
 * ⛔ Tudo numa transação: relação + projeção dos dois lados + cache dos dois perfis. Se
 * a projeção ficasse fora, existiria uma janela em que a amizade vale mas o acesso não
 * (ou pior, o contrário).
 * ═══════════════════════════════════════════════════════════════════════════════ */

/** Aplica uma ação de amizade. Devolve { ok, evento }. */
async function aplicar(acao, callerUid, alvoUid) {
  if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");
  alvoUid = String(alvoUid || "");
  if (!alvoUid) throw new HttpsError("invalid-argument", "uid do outro é obrigatório");
  if (alvoUid === callerUid) throw new HttpsError("invalid-argument", "não dá pra ser amigo de si mesmo");

  const db = admin.firestore();

  /* ⛔ 7ª auditoria (ponto 4): enquanto a migração está congelada, o BACKEND também para.
   * As Rules congelam clientes; Admin SDK ignora Rules. Sem isto, uma amizade nova nasceria
   * entre o snapshot e o backfill e o plano ficaria desatualizado no instante em que roda. */
  await _fase.exigirLiberado(db, HttpsError, 'amizade:' + acao);

  /* ⛔ P0-4 (auditoria externa, 29/ago/2026): O ALVO VEM DO CORPO DA CHAMADA — logo é
   * afirmação do cliente, não identidade. Antes desta guarda dava pra:
   *   · abrir relação com uid INEXISTENTE (e o `tx.set(..., {merge:true}) CRIAVA o doc,
   *     fabricando perfil fantasma em `users/`);
   *   · mirar uma LÁPIDE (`mergedInto`) e prender a relação num uid morto;
   *   · passar um e-mail/string legado como se fosse uid canônico;
   *   · furar o `acceptFriendRequests = false` de quem desligou convites.
   * A porta é a MESMA do resto do servidor: `_userVivo` — lápide resolve pra conta viva,
   * corrente quebrada/em ciclo devolve NADA (nunca o uid morto). */
  /* ⛔ 4ª auditoria (ponto 7): a versão anterior recusava `alvoUid.length < 20`. Comprimento
   * de string NÃO é prova de identidade — não há contrato do Firebase que garanta 28 chars,
   * e a heurística recusaria um uid válido mais curto num projeto futuro. A prova é a
   * RESOLUÇÃO: existe? resolve por `userVivo`? é canônico e vivo?
   * O `@` continua recusado porque a API exige uid e e-mail nunca é uid — isso é contrato
   * da própria API, não chute. */
  if (alvoUid.indexOf("@") !== -1) {
    throw new HttpsError("invalid-argument", "alvo tem que ser uid canônico (e-mail não é identidade aqui)");
  }
  const alvoVivo = await _vivo.userVivo(db, alvoUid);
  if (!alvoVivo || !alvoVivo.uid) throw new HttpsError("not-found", "conta não encontrada");
  if (alvoVivo.data && (alvoVivo.data.deleted === true || alvoVivo.data.deletedAt)) {
    throw new HttpsError("not-found", "conta excluída");
  }
  alvoUid = alvoVivo.uid;                       // pode ter sido resolvido de uma lápide
  if (alvoUid === callerUid) throw new HttpsError("invalid-argument", "não dá pra ser amigo de si mesmo");

  /* ⛔ 3ª auditoria (ponto 6): O CALLER TAMBÉM É IDENTIDADE, e antes só o alvo passava
   * pela porta. Uma sessão antiga de conta ABSORVIDA carrega um idToken válido de um uid
   * que virou lápide — e criava relação sob uid morto, que ninguém mais lê.
   * ⛔ E aqui NÃO se age "em nome do sobrevivente": resolver o caller silenciosamente
   * faria a CF escrever amizade em nome de outra conta a partir de um token que não é
   * dela. A política é RECUSAR e mandar refazer o login — o fluxo de recuperação já
   * existe (resolveMergedLogin devolve custom token da conta viva). Falha fechado. */
  const callerSnap = await db.collection("users").doc(callerUid).get();
  if (!callerSnap.exists) throw new HttpsError("not-found", "seu perfil não existe");
  const callerData = callerSnap.data() || {};
  if (callerData.deleted === true || callerData.deletedAt) {
    throw new HttpsError("permission-denied", "conta excluída");
  }
  if (callerData.mergedInto) {
    throw new HttpsError("failed-precondition",
      "sua conta foi unificada — entre de novo para continuar (conta atual: " + String(callerData.mergedInto) + ")");
  }

  // Só pra NOVO convite: quem desligou "aceitar convites" não recebe.
  if (acao === "enviar" && alvoVivo.data && alvoVivo.data.acceptFriendRequests === false) {
    throw new HttpsError("permission-denied", "esta pessoa não está aceitando convites");
  }

  let id;
  try { id = _core.pairId(callerUid, alvoUid); }
  catch (e) { throw new HttpsError("invalid-argument", e.message); }

  const relRef = db.collection("friendships").doc(id);
  const agora = new Date().toISOString();

  const agoraMs = Date.now();
  const saida = await db.runTransaction(async (tx) => {
    /* ⛔ 6ª auditoria (ponto 3): o estado das DUAS contas é lido DENTRO da transação, antes
     * de qualquer coisa. Se um merge/delete marcar `merging`/`deleting` enquanto isto roda,
     * o Firestore aborta e repete — e na repetição a operação vê o estado e recusa.
     * Validar antes da transação (como era) não tinha essa propriedade: a leitura ficava
     * fora do conjunto observado e a mudança concorrente passava batido. */
    /* ⛔ 9ª auditoria (ponto 4): OS PERFIS SÃO LIDOS AQUI DENTRO, não fora.
     * O precheck externo (`userVivo`, `callerSnap`) resolve identidade e dá mensagem boa,
     * mas NÃO é prova: entre ele e o commit cabe uma fusão inteira do alvo. A sequência
     * que passava era esta —
     *   T0 precheck vê A e B vivos · T1 merge de B termina, B vira `mergedInto=C`,
     *   lock volta · T2 a transação começa · T3 lifecycle parece livre ·
     *   T4 nasce relação apontando pra B MORTO.
     * Lendo `users/{caller}` e `users/{alvo}` DENTRO da transação, uma mudança concorrente
     * em qualquer um deles aborta e repete — e na repetição a decisão é recusar.
     * Defesa em profundidade: os estados terminais do lifecycle cobrem o mesmo caso por
     * outro caminho, e nenhum dos dois depende do outro. */
    const [snapCaller, snapAlvo] = await Promise.all([
      tx.get(db.collection('users').doc(callerUid)),
      tx.get(db.collection('users').doc(alvoUid)),
    ]);
    const dC = snapCaller.exists ? (snapCaller.data() || {}) : null;
    const dA = snapAlvo.exists ? (snapAlvo.data() || {}) : null;
    if (!dC) throw new HttpsError('not-found', 'seu perfil não existe');
    if (!dA) throw new HttpsError('not-found', 'conta não encontrada');
    if (dC.deleted === true || dC.deletedAt) throw new HttpsError('permission-denied', 'conta excluída');
    if (dA.deleted === true || dA.deletedAt) throw new HttpsError('not-found', 'conta excluída');
    if (dC.mergedInto) {
      throw new HttpsError('failed-precondition',
        'sua conta foi unificada — entre de novo para continuar (conta atual: ' + String(dC.mergedInto) + ')');
    }
    if (dA.mergedInto) {
      // o alvo virou lápide DEPOIS do precheck: a relação não pode nascer apontando pra ele
      throw new HttpsError('aborted',
        'esta conta foi unificada com outra agora há pouco — abra o perfil de novo e tente outra vez');
    }
    // `acceptFriendRequests` também é conferido AQUI: fora, era um retrato que podia mudar
    if (acao === 'enviar' && dA.acceptFriendRequests === false) {
      throw new HttpsError('permission-denied', 'esta pessoa não está aceitando convites');
    }

    try {
      // ponto 6: o marcador da migração entra no conjunto lido pela transação
      const mSnap = await tx.get(db.doc(_fase.DOC));
      if (!_fase.operacoesLiberadas(_fase.estadoDeSnapshot(mSnap))) {
        throw new HttpsError('unavailable',
          'Amizades e unificação de contas estão em manutenção. Tente de novo em instantes.');
      }
      await _lock.exigirAtivos(tx, db, [callerUid, alvoUid], agoraMs);
    } catch (e) {
      if (e && e.lifecycle) throw new HttpsError('aborted', e.message);
      if (e && e.migracao) throw new HttpsError('unavailable', e.message);
      throw e;
    }
    const snap = await tx.get(relRef);
    const atual = snap.exists ? snap.data() : null;

    const r = _core.decidir(acao, atual, callerUid, alvoUid, agora);
    if (!r.ok) throw new HttpsError(r.codigo || "failed-precondition", r.erro);

    // 1) relação canônica
    if (r.doc) tx.set(relRef, r.doc);
    else tx.delete(relRef);

    // 2) projeção que as Rules consultam — as DUAS direções, sempre juntas
    const acA = db.collection("friendAccess").doc(callerUid).collection("accepted").doc(alvoUid);
    const acB = db.collection("friendAccess").doc(alvoUid).collection("accepted").doc(callerUid);
    if (r.acesso === "criar") {
      /* ⛔ `ownerUid`/`friendUid` no doc (6ª auditoria, ponto 4): sem eles, achar as
       * projeções de um uid dependia de ler as `friendships` dele — e no retry após falha
       * parcial a relação já não existe, deixando o órfão invisível. */
      tx.set(acA, _core.docAcesso(callerUid, alvoUid, agora));
      tx.set(acB, _core.docAcesso(alvoUid, callerUid, agora));
    } else if (r.acesso === "apagar") {
      tx.delete(acA); tx.delete(acB);
    }

    /* 3) cache de exibição em users.* — derivado, NUNCA autoridade.
     * ⛔ `update`, não `set(..., {merge:true})`: o `set` CRIA o documento quando ele não
     * existe, e era por aí que um alvo inexistente virava perfil fantasma. Os dois docs já
     * foram provados existentes acima; `update` falha alto se algum sumir no meio. */
    const uA = db.collection("users").doc(callerUid);
    const uB = db.collection("users").doc(alvoUid);
    const AU = (v) => FieldValue.arrayUnion(v);
    const AR = (v) => FieldValue.arrayRemove(v);
    const DEL = FieldValue.delete();
    const st = r.doc && r.doc.status;
    // `friendRequestsSentAt` é o mapa que a UI usa pra mostrar "enviado em" (explore.js).
    // Ele entrou em privilegedUserFields junto com os arrays, então quem o mantém é AQUI.
    const sentAtA = {}, sentAtB = {};

    if (st === "accepted") {
      sentAtA["friendRequestsSentAt." + alvoUid] = DEL;
      sentAtB["friendRequestsSentAt." + callerUid] = DEL;
      tx.update(uA, Object.assign({ friends: AU(alvoUid), friendRequestsSent: AR(alvoUid), friendRequestsReceived: AR(alvoUid) }, sentAtA));
      tx.update(uB, Object.assign({ friends: AU(callerUid), friendRequestsSent: AR(callerUid), friendRequestsReceived: AR(callerUid) }, sentAtB));
    } else if (st === "pending") {
      const quem = r.doc.requestedBy, outro = (quem === callerUid) ? alvoUid : callerUid;
      const carimbo = {}; carimbo["friendRequestsSentAt." + outro] = agora;
      tx.update(db.collection("users").doc(quem), Object.assign({ friendRequestsSent: AU(outro) }, carimbo));
      tx.update(db.collection("users").doc(outro), { friendRequestsReceived: AU(quem) });
    } else {
      // rejected, cancelado ou removido: some dos três arrays E do carimbo, nos dois lados
      sentAtA["friendRequestsSentAt." + alvoUid] = DEL;
      sentAtB["friendRequestsSentAt." + callerUid] = DEL;
      tx.update(uA, Object.assign({ friends: AR(alvoUid), friendRequestsSent: AR(alvoUid), friendRequestsReceived: AR(alvoUid) }, sentAtA));
      tx.update(uB, Object.assign({ friends: AR(callerUid), friendRequestsSent: AR(callerUid), friendRequestsReceived: AR(callerUid) }, sentAtB));
    }
    return { evento: r.evento, status: st || null, alvoUid: alvoUid };
  });

  return saida;
}

/** Notifica fora da transação — aviso não pode derrubar a operação. */
async function notificar(db, paraUid, deUid, tipo, texto) {
  try {
    const de = await db.collection("users").doc(deUid).get();
    const nome = (de.exists && de.data().displayName) || "Alguém";
    const notifId = [tipo, deUid, paraUid].join("__").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
    await db.collection("users").doc(paraUid).collection("notifications").doc(notifId).set({
      type: tipo, fromUid: deUid, fromName: nome,
      message: nome + texto,
      createdAt: new Date().toISOString(), read: false,
    }, { merge: true });
  } catch (e) {
    console.warn("[amizade] notificação falhou (operação seguiu):", e && e.message);
  }
}


module.exports = { aplicar, notificar };
