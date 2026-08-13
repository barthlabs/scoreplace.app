/* tournament-purge-core.js — APAGAR UM TORNEIO APAGA AS CÓPIAS DELE NAS PESSOAS (12/ago/2026 · CF-only)
 *
 * PURO de propósito: o `functions/index.js` não é `require`-ável em teste (registra
 * onCall/onSchedule e lê secrets no import), então a regra que dói errar mora aqui e é
 * exercitada por `functions/test-tournament-purge-core.js` no `npm test`.
 *
 * ── O BURACO, MEDIDO (12/ago/2026) ────────────────────────────────────────────────────
 * Ordem do dono: _"um dia posso resolver apagá-lo e daí ele deve sumir de todos os dados
 * dos que participaram."_
 *
 * `FirestoreDB.deleteTournament` (js/firebase-db.js) limpa `results`, `letzplayScans`,
 * `discoveryFeed/{tid}` e o doc do torneio. **Não limpa `users/{uid}/matchHistory`**, que
 * é a CÓPIA DESNORMALIZADA gravada por participante quando o placar é lançado
 * (`saveUserMatchRecords`, chamada dos 3 construtores em bracket-ui.js).
 *
 * O efeito medido é o OPOSTO do pedido, e é assimétrico:
 *   • na ficha de TERCEIROS o torneio SOME — eles leem `collectionGroup('results')`, que
 *     o delete apagou;
 *   • na ficha da PRÓPRIA pessoa ele FICA — `_fromScoreplace` (js/views/match-history.js)
 *     lê `loadUserMatchHistory(uid)`, ou seja o matchHistory dela, que ninguém tocou.
 *
 * ── POR QUE ISTO TEM QUE SER CF, E NÃO CLIENTE ────────────────────────────────────────
 * `firestore.rules:448` — `allow write: if request.auth.uid == userId`. O organizador que
 * aperta Apagar **não pode** escrever no matchHistory dos outros 121 inscritos. Não é
 * limitação de código: é a regra, e ela está certa. Quem limpa tem que ser o Admin SDK.
 * Cânone do dono: **tudo roda na CF, o cliente apenas DISPARA** — aqui ele nem dispara,
 * quem vê o delete é o gatilho.
 *
 * ── O SEGUNDO ÓRFÃO, QUE O RELATO NÃO TINHA VISTO ─────────────────────────────────────
 * `tournaments/{tid}/participants` (o espelho do roster, v1.7.29/1.7.98) **também fica
 * pendurado**: `_tournamentSubcollections` no cliente lista só `['results','letzplayScans']`.
 * E ele NÃO pode simplesmente entrar naquela lista — **não existe `match /participants`
 * no firestore.rules** (o Firestore nega por omissão; foi esse o achado da 1.7.97), então
 * o cliente tomaria `permission-denied` e o órfão continuaria lá. Só a CF alcança.
 * É a mesma classe dos 151 `results` órfãos da 1.6.78 — órfão não é dado inerte.
 *
 * ── AS DUAS ROTAS, E POR QUE AS DUAS ──────────────────────────────────────────────────
 * (A) REFERÊNCIA DIRETA — o id do registro é DETERMINÍSTICO: `t_<tid>_<matchId>`
 *     (bracket-ui.js). Com o doc do torneio em mãos (o gatilho recebe `before` no delete)
 *     dá pra montar o caminho exato de cada cópia: zero consulta, zero índice, N deletes.
 * (B) VARREDURA — `collectionGroup('matchHistory').where('tournamentId','==',tid)`.
 *
 * (A) sozinha NÃO basta, e o motivo é deste app: quem levou **W.O. e foi substituído** sai
 * do elenco e some dos slots, mas o registro do jogo que ele JOGOU antes continua no
 * matchHistory dele. A rota (A) não enxerga esse uid — a (B) enxerga.
 * (B) sozinha depende de um índice de collection group que hoje **não existe** em
 * `firestore.indexes.json` (só `results` tem entrada COLLECTION_GROUP). Enquanto ele não
 * subir, a consulta falha com FAILED_PRECONDITION.
 * Então: (A) primeiro — sempre funciona —, (B) por cima como rede. Falha de (B) é
 * BARULHENTA mas não desfaz (A).
 */

const { collectMatches } = require("./match-roster");

/* Subcoleções de `users/{uid}` que guardam CÓPIA de algo do torneio, achadas por
 * `collectionGroup(sub).where('tournamentId','==',tid)`.
 * DECLARAÇÃO, e declaração apodrece (a lição do uid-sweep.js) — há teste confrontando esta
 * lista com o firestore.rules: subcoleção nova lá e ausente aqui deixa o teste vermelho. */
const USER_SUBCOLLECTIONS_BY_TOURNAMENT = ["matchHistory", "notifications"];

/* Coleções de TOPO cujos docs apontam pro torneio. `presences` são os planos "vou a este
 * torneio" (project_tournament_plan_2day_rule) — MEDIDO em 12/ago: 26 num único torneio.
 * Consulta de campo único em coleção de topo é auto-indexada; não pede índice. */
const TOPLEVEL_COLLECTIONS_BY_TOURNAMENT = ["presences"];

/* ⚠️ NÃO existe lista de subcoleções DE `tournaments/{tid}` — elas são ENUMERADAS em
 * tempo de execução (`doc.listCollections()`, Admin SDK). Isto é decisão de projeto, não
 * preguiça: a lista à mão do cliente (`_tournamentSubcollections`) já deixou passar DUAS
 * — `participants` (o espelho do roster) e `communications` (comunicados do organizador),
 * as duas descobertas só ao medir o banco, as duas sem regra no firestore.rules e
 * portanto inalcançáveis pelo cliente. Enumerar mata a classe inteira do bug: subcoleção
 * nova nasce já coberta, sem ninguém lembrar de atualizar lista nenhuma. */

/** Espelha o recordId de bracket-ui.js. Mudar aqui sem mudar lá deixa cópia pra trás. */
function recordIdDe(tid, matchId) {
  return "t_" + String(tid) + "_" + String(matchId);
}

/** Todo uid que pode ter cópia: elenco, fila, desativados e os SLOTS dos jogos.
 *  Identidade é o UID, sempre — inclusive os dois lados de uma dupla. */
function uidsDoTorneio(t) {
  const out = new Set();
  if (!t || typeof t !== "object") return out;

  const daEntrada = (p) => {
    if (!p || typeof p !== "object") return;
    [p.uid, p.p1Uid, p.p2Uid].forEach((u) => { if (u) out.add(String(u)); });
    // Dupla pré-formada guarda os membros aninhados.
    if (Array.isArray(p.participants)) p.participants.forEach(daEntrada);
  };

  [t.participants, t.standbyParticipants, t.waitlist].forEach((lista) => {
    if (Array.isArray(lista)) lista.forEach(daEntrada);
  });

  // Os slots são a fonte mais confiável de "quem de fato jogou este jogo".
  collectMatches(t).forEach((m) => {
    if (!m || typeof m !== "object") return;
    [m.team1Uids, m.team2Uids, m.playersUids, m.playerUids].forEach((arr) => {
      if (Array.isArray(arr)) arr.forEach((u) => { if (u) out.add(String(u)); });
    });
    [m.p1Uid, m.p2Uid].forEach((u) => { if (u) out.add(String(u)); });
  });

  // memberUids é o denormalizado que já engloba elenco + espera (1.6.86).
  if (Array.isArray(t.memberUids)) t.memberUids.forEach((u) => { if (u) out.add(String(u)); });

  return out;
}

/** Os ids de registro que este torneio pode ter gerado (um por jogo com id). */
function recordIdsDoTorneio(tid, t) {
  const out = new Set();
  collectMatches(t).forEach((m) => {
    if (m && m.id !== undefined && m.id !== null && m.id !== "") {
      out.add(recordIdDe(tid, m.id));
    }
  });
  return out;
}

/**
 * ROTA (A) — o plano por referência direta, sem consulta nenhuma.
 * Devolve { refs:[{uid, recordId}], uids, recordIds }.
 * O produto uid × jogo é intencional: `.delete()` de doc inexistente é no-op barato no
 * Firestore, e errar por excesso aqui não apaga nada de ninguém (o caminho carrega o tid).
 */
function planPurgePorReferencia(tid, t) {
  const uids = Array.from(uidsDoTorneio(t)).sort();
  const recordIds = Array.from(recordIdsDoTorneio(tid, t)).sort();
  const refs = [];
  uids.forEach((uid) => {
    recordIds.forEach((recordId) => { refs.push({ uid, recordId }); });
  });
  return { refs, uids, recordIds };
}

/**
 * Junta a rota (A) com o que a varredura (B) achou, sem repetir delete.
 * `achadosNaVarredura` = [{uid, recordId}] montado a partir de `doc.ref.parent.parent.id`.
 */
function unirPlanos(planoA, achadosNaVarredura) {
  const vistos = new Set();
  const refs = [];
  const push = (r) => {
    if (!r || !r.uid || !r.recordId) return;
    const k = r.uid + "/" + r.recordId;
    if (vistos.has(k)) return;
    vistos.add(k);
    refs.push({ uid: String(r.uid), recordId: String(r.recordId) });
  };
  ((planoA && planoA.refs) || []).forEach(push);
  (Array.isArray(achadosNaVarredura) ? achadosNaVarredura : []).forEach(push);
  return { refs, total: refs.length };
}

/**
 * `notif_email_queue` NÃO tem `tournamentId` — só `tournamentUrl` (que carrega o tid).
 * Como é fila TRANSITÓRIA (janela de no máximo 30 min, e o flush apaga o que enviou),
 * varrer a coleção inteira e filtrar aqui sai mais barato que criar índice pra ela.
 * `docs` = [{ id, tournamentUrl }].
 *
 * Casa por FRONTEIRA, não por `includes` cru: `tour_1780009816637` é prefixo de
 * `tour_17800098166370`, e um `includes` apagaria e-mail do torneio errado.
 */
function filaDoTorneio(tid, docs) {
  const alvo = String(tid || "");
  if (!alvo) return [];
  return (Array.isArray(docs) ? docs : [])
    .filter((d) => {
      const url = String((d && d.tournamentUrl) || "");
      const i = url.indexOf(alvo);
      if (i < 0) return false;
      const depois = url.charAt(i + alvo.length);
      return depois === "" || !/[A-Za-z0-9_-]/.test(depois);   // nada de id mais longo
    })
    .map((d) => d.id);
}

/** Fatia em lotes de `tamanho` (o teto do batch do Firestore é 500; usamos 400). */
function emLotes(itens, tamanho) {
  const t = tamanho || 400;
  const out = [];
  for (let i = 0; i < (itens || []).length; i += t) out.push(itens.slice(i, i + t));
  return out;
}

module.exports = {
  USER_SUBCOLLECTIONS_BY_TOURNAMENT,
  TOPLEVEL_COLLECTIONS_BY_TOURNAMENT,
  filaDoTorneio,
  recordIdDe,
  uidsDoTorneio,
  recordIdsDoTorneio,
  planPurgePorReferencia,
  unirPlanos,
  emLotes
};
