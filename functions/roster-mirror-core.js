/* roster-mirror-core.js — O ESPELHO DO ROSTER, AGORA NO SERVIDOR (v1.7.99)
 *
 * PURO de propósito: o `functions/index.js` não é `require`-ável em teste (registra
 * onCall/onSchedule e lê secrets no import), então toda regra que dói errar mora aqui e é
 * exercitada por `functions/test-roster-mirror-core.js` no `npm test`.
 *
 * ── POR QUE ISTO MUDOU DE CASA ────────────────────────────────────────────────────────
 * O espelho (`tournaments/{id}/participants/{uid}`) é a REDE contra perda de inscrito,
 * criada depois do sumiço do Gersom (1.7.29). Ele vivia no CLIENTE — e MEDIDO em 10/ago:
 * **não existe regra pra essa subcoleção** no firestore.rules, e o Firestore nega por
 * omissão. Logo a escrita do cliente SEMPRE voltou `permission-denied`: a rede nunca
 * existiu de fato, e cada tentativa ainda virava *unhandled rejection* (era a issue nº1
 * do Sentry, 57 eventos / 24 usuários).
 *
 * Cânone do dono: **tudo roda na CF, o cliente apenas DISPARA.** Então o espelho passa a
 * ser mantido pelo gatilho `syncMatchRosters` (onDocumentWritten em `tournaments/{tid}`),
 * que roda no Admin SDK (as regras não se aplicam) e — o ponto que importa — enxerga
 * **TODA escrita, de QUALQUER cliente**, inclusive o app nativo antigo, que não tem
 * auto-update e nunca vai chamar CF nenhuma.
 *
 * ── O QUE O SERVIDOR FAZ MELHOR QUE O CLIENTE FAZIA ───────────────────────────────────
 * O cliente precisava de um cache em memória (`_rosterMirrorCache`) pra saber o que tinha
 * mudado — e por isso a 1ª gravação de cada sessão não escrevia nada, que era justamente
 * quando a inscrição da própria pessoa acontecia (o buraco (2) da 1.7.56). Aqui o gatilho
 * recebe `before` e `after` do MESMO evento: o delta é exato, sem estado e sem sessão.
 *
 * Delta = só quem mudou. Um torneio de 122 pessoas gera 0–2 escritas por evento, não 122.
 */

// Precedência: elenco > fila. Quem aparece nos dois (resíduo) conta como inscrito.
const PESO = { enrolled: 3, inactive: 3, waitlisted: 1 };

// Identidade é o UID, sempre — inclusive os DOIS lados de uma dupla.
function uidsDe(p) {
  if (!p || typeof p !== "object") return [];
  return [p.uid, p.p1Uid, p.p2Uid].filter(Boolean);
}

/** Fotografa o roster de um doc de torneio: { uid → {status, wo, entry} }. */
function fotografar(t) {
  const out = {};
  if (!t || typeof t !== "object") return out;

  const marca = (u, status, p) => {
    if (!u) return;
    if (out[u] && PESO[out[u].status] >= PESO[status]) return;
    out[u] = { status, wo: (out[u] && out[u].wo) || false, entry: p || null };
  };
  const coleta = (lista, status) => {
    (Array.isArray(lista) ? lista : []).forEach((p) => {
      if (!p || typeof p !== "object") return;
      // DESATIVADO é estado próprio: a pessoa está inscrita mas fora dos sorteios.
      // Sem isto, "sumiu" e "está desativada" ficam indistinguíveis no espelho.
      const st = (status === "enrolled" && p.ligaActive === false) ? "inactive" : status;
      uidsDe(p).forEach((u) => marca(u, st, p));
    });
  };

  coleta(t.participants, "enrolled");
  coleta(t.standbyParticipants, "waitlisted");
  coleta(t.waitlist, "waitlisted");

  // ⚠️ `monarchWaitlist` (3º storage da espera) NÃO é lido de propósito: é MAPA
  // categoria→NOMES, e IDENTIDADE É O UID, SEMPRE. Resolver nome→uid poria o nome de
  // volta no meio da identidade — o hack que o uid veio matar (homônimo, nome trocado,
  // entrada strippada). E não se perde ninguém: esse mapa é espelho POR NOME de quem já
  // está em standbyParticipants/waitlist COM uid, e é de lá que essas pessoas saem acima.
  // Quem só existe no mapa e não tem uid é fictício — não tem conta, logo não tem doc.

  // W.O. DECRETADO na rodada corrente. O marcador é a partida `isSitOut` com
  // `sitOutReason:'wo'`, e o uid vem DO SLOT. Sem uid no slot não há W.O. a espelhar: ou
  // é fictício, ou é doc velho — e em nenhum dos dois o nome decide quem é a pessoa.
  // É MARCA SEPARADA, não um 5º status: quem leva W.O. termina desativado OU na fila (a
  // escolha do organizador), e enfiar "wo" no status apagaria em qual dos dois a pessoa
  // está — que é a única informação acionável.
  const rs = Array.isArray(t.rounds) ? t.rounds : [];
  const ult = rs.length ? rs[rs.length - 1] : null;
  ((ult && ult.matches) || []).forEach((m) => {
    if (!m || !m.isSitOut || m.sitOutReason !== "wo") return;
    [].concat(m.team1Uids || [], m.p1Uid || []).forEach((u) => {
      if (u && out[u]) out[u].wo = true;
    });
  });

  return out;
}

/**
 * Plano de escrita do espelho a partir do before/after do gatilho.
 * Devolve { writes: [{uid, doc}], total } — SÓ o delta.
 *
 * Quem sai NÃO é apagado: é MARCADO `left`. O histórico de quem saiu é exatamente o que
 * faltou pra reconstruir o incidente do Gersom — apagar destruiria a prova que a rede existe
 * pra guardar.
 */
function planRosterMirror(before, after, agoraISO) {
  const at = agoraISO || new Date().toISOString();
  const A = fotografar(after);
  const B = fotografar(before);
  const writes = [];

  const chave = (r) => (r ? r.status + (r.wo ? "|wo" : "") : "");

  Object.keys(A).forEach((u) => {
    if (chave(B[u]) === chave(A[u])) return;          // mesmo estado: nada a escrever
    const doc = { uid: u, status: A[u].status, wo: !!A[u].wo, at };
    if (A[u].entry) doc.entry = A[u].entry;
    writes.push({ uid: u, doc });
  });

  Object.keys(B).forEach((u) => {
    if (A[u]) return;                                  // continua em alguma lista
    writes.push({ uid: u, doc: { uid: u, status: "left", leftAt: at } });
  });

  return { writes, total: writes.length };
}

module.exports = { planRosterMirror, fotografar, uidsDe };
