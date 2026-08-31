/* secondary-email-reserva.js — A RESERVA DO ENVIO, ATÔMICA  (L1.1.1, 2.1.68)
 *
 * ⛔ A CORRIDA QUE ISTO FECHA. A L1.1 fazia, em `requestSecondaryEmail`:
 *     1. lê emailVerifyThrottle/{chave}
 *     2. decide se passou o cooldown
 *     3. cria emailVerifications/{hash}
 *     4. grava o throttle
 *     5. enfileira o e-mail em /mail com `.add()` (id automático)
 * Entre 1 e 4 não havia nada. Duas requisições simultâneas do MESMO uid pro MESMO
 * e-mail liam o throttle vazio, ambas concluíam "pode enviar", criavam DOIS tokens
 * diferentes e disparavam DOIS e-mails — cada um com um link válido. O `.add()` do
 * outbox ainda garantia que um retry gerasse um segundo documento de e-mail.
 *
 * ⭐ AGORA A RESERVA É UMA TRANSAÇÃO SÓ: ler o throttle, decidir, criar a verificação,
 * gravar o throttle e criar o documento do outbox acontecem juntos ou não acontecem. Duas
 * chamadas concorrentes disputam o MESMO documento de throttle: uma commita; a outra é
 * abortada pelo Firestore, re-executa, agora LÊ o throttle recém-gravado e cai no cooldown.
 * No máximo um envio válido por janela — que é a garantia pedida.
 *
 * ⭐ ID DETERMINÍSTICO NO OUTBOX. O documento em /mail passa a ter id derivado da RESERVA
 * (chave do throttle + instante), não `.add()`. Assim a re-execução interna da transação
 * (que o Firestore faz sozinho em conflito) reescreve o MESMO documento em vez de criar
 * outro. Por isso `agora` é calculado FORA da transação e passado por parâmetro: se fosse
 * lido dentro, cada re-execução mudaria o id e a idempotência morreria.
 *
 * ⛔ `tx.set`, NUNCA `tx.create`. Este módulo roda com o Admin SDK (na Function) e com o SDK
 * compat (no teste de concorrência contra o emulador) — e `transaction.create` NÃO existe no
 * compat. A proteção contra duplicata não vem do `create`: vem da leitura do throttle DENTRO
 * da transação, que é o que serializa as concorrentes.
 *
 * Sem I/O próprio: recebe `db` e as funções puras por parâmetro. Quem monta o token, o hash,
 * o registro e o e-mail é o `secondary-email-core.js`.
 */
'use strict';

/**
 * @param {object} deps
 *   db            handle do Firestore (Admin ou compat) — precisa de runTransaction/collection
 *   core          o módulo secondary-email-core.js
 *   uid           dono do pedido
 *   email         e-mail candidato JÁ normalizado
 *   agora         instante da reserva, em ms — calculado FORA (ver nota do id determinístico)
 * @returns {Promise<{ok:boolean, motivo?:string, token?:string, hash?:string, mailId?:string}>}
 */
async function reservarEnvio(deps) {
  const d = deps || {};
  const db = d.db, core = d.core;
  const uid = String(d.uid || '');
  const email = core.normalizaEmail(d.email);
  const agora = Number(d.agora || Date.now());
  if (!db || !core || !uid || !email) return { ok: false, motivo: 'invalido' };

  const chave = core.chaveDeThrottle(uid, email);
  const throttleRef = db.collection('emailVerifyThrottle').doc(chave);
  /* ⚠️ TOKEN E ID FORA DA TRANSAÇÃO, de propósito. O corpo de uma transação Firestore pode
   * re-executar; gerar o token lá dentro criaria um token novo a cada tentativa e o
   * documento do outbox mudaria de id — voltando a duplicar exatamente o que se quer evitar.
   * Gerado uma vez aqui, ele só chega ao banco se a transação COMMITAR. */
  const token = core.novoToken();
  const hash = core.hashToken(token);
  const mailId = core.mailDocIdDaReserva(chave, agora);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(throttleRef);
    const ultimo = (snap && snap.exists) ? Number((snap.data() || {}).lastSentAt || 0) : 0;
    if (ultimo && (agora - ultimo) < core.COOLDOWN_MS) {
      return { ok: false, motivo: 'cooldown', faltamMs: core.COOLDOWN_MS - (agora - ultimo) };
    }
    tx.set(db.collection('emailVerifications').doc(hash), core.novoRegistro({ uid: uid, email: email, agora: agora }));
    /* ⚠️ merge: o throttle pode ganhar campos depois; a reserva só precisa do carimbo. */
    tx.set(throttleRef, { lastSentAt: agora, uid: uid, ultimoHash: hash }, { merge: true });
    tx.set(db.collection('mail').doc(mailId), core.montaEmail(email, core.urlDeConfirmacao(token)));
    return { ok: true, token: token, hash: hash, mailId: mailId };
  });
}

module.exports = { reservarEnvio };
