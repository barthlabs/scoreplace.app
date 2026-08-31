/* tournament-invite-reserva.js — RESERVA ATÔMICA do convite avulso  (L1.3a, 2.1.69)
 *
 * ⛔ TRÊS COISAS QUE PRECISAM ACONTECER JUNTAS OU NÃO ACONTECER: conferir o cooldown do par
 * (organizador, torneio, e-mail), conferir a cota diária de (organizador, torneio) e criar o
 * documento de outbox. Separadas, duas requisições simultâneas leem "0 de 20" e "sem
 * cooldown" ao mesmo tempo, e ambas enviam — a cota vira decoração e o convidado recebe dois
 * e-mails. É a mesma corrida que a L1.1.1 fechou no e-mail secundário, e aqui ela é pior:
 * a cota EXISTE justamente para limitar quantos e-mails saem.
 *
 * ⭐ DUAS LEITURAS, UMA TRANSAÇÃO. `tx.get` do cooldown e da cota antes de qualquer escrita —
 * o Firestore exige ler tudo antes de escrever, e é essa leitura que serializa as
 * concorrentes: quem perde a corrida re-executa, lê a cota já incrementada e o cooldown já
 * gravado, e para.
 *
 * ⛔ `tx.set`, NUNCA `tx.create`: este módulo roda com o Admin SDK na Function e com o SDK
 * compat no teste de concorrência contra o emulador, e `transaction.create` não existe no
 * compat. A proteção vem da leitura dentro da transação, não do verbo.
 *
 * ⚠️ `agora` vem de FORA. O corpo de uma transação re-executa; calcular o instante lá dentro
 * mudaria o id determinístico do outbox a cada tentativa e a idempotência morreria — foi
 * exatamente a lição da L1.1.1.
 */
'use strict';

/**
 * @param {object} deps  db, core, uid, tournamentId, email (normalizado), agora (ms),
 *                       dadosDoEmail { tournamentName, inviterName, dateText, venue }
 * @returns {Promise<{ok:boolean, motivo?:string, mailId?:string, usadosHoje?:number}>}
 *   motivos: 'cooldown' | 'limite-diario'
 */
async function reservarConvite(deps) {
  const d = deps || {};
  const db = d.db, core = d.core;
  const uid = String(d.uid || '');
  const tid = String(d.tournamentId || '');
  const email = core.normalizaEmail(d.email);
  const agora = Number(d.agora || Date.now());
  if (!db || !core || !uid || !tid || !email) return { ok: false, motivo: 'invalido' };

  const chaveCd = core.chaveDeCooldown(uid, tid, email);
  const chaveCota = core.chaveDeCota(uid, tid, agora);
  const cdRef = db.collection('tournamentInviteCooldown').doc(chaveCd);
  const cotaRef = db.collection('tournamentInviteQuota').doc(chaveCota);
  const mailId = core.mailDocIdDoConvite(chaveCd, agora);

  return db.runTransaction(async (tx) => {
    /* ⚠️ TODAS as leituras ANTES de qualquer escrita — o Firestore recusa o contrário. */
    const [cdSnap, cotaSnap] = await Promise.all([tx.get(cdRef), tx.get(cotaRef)]);

    const ultimo = (cdSnap && cdSnap.exists) ? Number((cdSnap.data() || {}).lastSentAt || 0) : 0;
    if (ultimo && (agora - ultimo) < core.COOLDOWN_MS) {
      return { ok: false, motivo: 'cooldown', faltamMs: core.COOLDOWN_MS - (agora - ultimo) };
    }
    const usados = (cotaSnap && cotaSnap.exists) ? Number((cotaSnap.data() || {}).enviados || 0) : 0;
    if (usados >= core.LIMITE_DIARIO) {
      return { ok: false, motivo: 'limite-diario', usadosHoje: usados };
    }

    tx.set(cdRef, { lastSentAt: agora, uid: uid, tournamentId: tid }, { merge: true });
    /* ⛔ contador gravado com o valor LIDO + 1, não com `increment()`: dentro de uma
     * transação o valor lido é o que vale, e somar à mão deixa a corrida visível no teste.
     * `increment()` funcionaria, mas esconderia a serialização que este módulo existe pra
     * garantir — e é ela que o teste de concorrência precisa provar. */
    tx.set(cotaRef, { enviados: usados + 1, uid: uid, tournamentId: tid, dia: core.diaDe(agora) }, { merge: true });
    tx.set(db.collection('mail').doc(mailId), core.montaEmail({
      email: email, tournamentId: tid, agora: agora,
      tournamentName: (d.dadosDoEmail && d.dadosDoEmail.tournamentName) || '',
      inviterName: (d.dadosDoEmail && d.dadosDoEmail.inviterName) || '',
      dateText: (d.dadosDoEmail && d.dadosDoEmail.dateText) || '',
      venue: (d.dadosDoEmail && d.dadosDoEmail.venue) || ''
    }));
    return { ok: true, mailId: mailId, usadosHoje: usados + 1 };
  });
}

module.exports = { reservarConvite };
