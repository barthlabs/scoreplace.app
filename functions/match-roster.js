// ─── match-roster.js (project_match_result_docs, inc 3b) ──────────────────────
// Lógica PURA (sem Firebase) pra computar o ROSTER (playerUids) de cada jogo a
// partir da ESTRUTURA do torneio. ESPELHA o app — se mudar lá, mudar AQUI:
//   _collectAllMatches  → js/views/bracket-model.js
//   _matchPlayerUids    → js/store.js
//   _participantUids    → js/store.js
// Usada pela CF `syncMatchRosters` (index.js) pra sincronizar o playerUids dos
// docs de resultado por-jogo com privilégio de ADMIN — o caminho de confiança do
// mata-mata disparado por PARTICIPANTE (a regra só deixa admin mexer no roster).
// Mantida num módulo próprio pra ser testável sem carregar toda a functions app.

// Espelha window._collectAllMatches (bracket-model.js).
function collectMatches(t) {
  if (!t || typeof t !== "object") return [];
  let out = [];
  if (Array.isArray(t.matches)) out = out.concat(t.matches);
  if (Array.isArray(t.rounds)) {
    t.rounds.forEach((r) => { if (r && Array.isArray(r.matches)) out = out.concat(r.matches); });
  }
  if (Array.isArray(t.groups)) {
    t.groups.forEach((g) => {
      if (g && Array.isArray(g.matches)) out = out.concat(g.matches);
      if (g && Array.isArray(g.rounds)) {
        g.rounds.forEach((gr) => {
          if (gr && Array.isArray(gr.matches)) out = out.concat(gr.matches);
          else if (Array.isArray(gr)) out = out.concat(gr);
        });
      }
    });
  }
  if (t.phaseRounds && typeof t.phaseRounds === "object") {
    Object.keys(t.phaseRounds).forEach((k) => {
      const slot = t.phaseRounds[k];
      if (slot && Array.isArray(slot.rounds)) {
        slot.rounds.forEach((r) => { if (r && Array.isArray(r.matches)) out = out.concat(r.matches); });
      }
    });
  }
  if (t.thirdPlaceMatch) out.push(t.thirdPlaceMatch);
  if (Array.isArray(t.rodadas)) {
    t.rodadas.forEach((r) => {
      if (!r) return;
      if (Array.isArray(r.matches)) out = out.concat(r.matches);
      if (Array.isArray(r.jogos)) out = out.concat(r.jogos);
      if (Array.isArray(r)) out = out.concat(r);
    });
  }
  return out;
}

// Espelha window._participantUids (store.js) — uid + p1Uid + p2Uid + sub-participants.
function participantUids(p) {
  if (typeof p !== "object" || !p) return [];
  const seen = {};
  const uids = [];
  const add = (u) => { if (u && !seen[u]) { seen[u] = true; uids.push(u); } };
  add(p.uid); add(p.p1Uid); add(p.p2Uid);
  if (Array.isArray(p.participants)) p.participants.forEach((s) => { if (s) add(s.uid); });
  return uids;
}

// Espelha AppStore._matchPlayerUids (store.js) — resolve p1/p2 (solo ou dupla
// "A / B") pros uids dos dois lados. TBD/BYE ignorados.
function matchRoster(t, m) {
  if (!t || !m) return [];
  const parts = Array.isArray(t.participants) ? t.participants : Object.values(t.participants || {});
  const seen = {};
  ["p1", "p2"].forEach((side) => {
    const entry = m[side];
    if (!entry || entry === "TBD" || entry === "BYE") return;
    // 1) casa a ENTRADA inteira (solo ou dupla registrada como "A / B")
    const p = parts.find((pp) => typeof pp === "object" && (pp.displayName || pp.name || "") === entry);
    if (p) { participantUids(p).forEach((u) => { if (u) seen[u] = 1; }); return; }
    // 2) fallback: dupla cujo slot mostra "A / B" mas cada membro é solo
    const members = entry.indexOf("/") !== -1 ? entry.split("/").map((n) => n.trim()) : [entry];
    members.forEach((nm) => {
      const mp = parts.find((pp) => typeof pp === "object" && (pp.displayName || pp.name || "") === nm);
      if (mp) participantUids(mp).forEach((u) => { if (u) seen[u] = 1; });
    });
  });
  return Object.keys(seen);
}

// Chave canônica (ordenada) do roster pra comparar sem depender de ordem.
function rosterKey(uids) {
  return (Array.isArray(uids) ? uids.slice() : []).sort().join("|");
}

// Diff entre before/after: retorna [{ id, roster }] só dos jogos cujo roster MUDOU
// (inclui jogos novos, cujo before-key é ''). Base do sync incremental da CF.
function computeRosterChanges(before, after) {
  const beforeById = {};
  collectMatches(before || {}).forEach((m) => {
    if (m && m.id != null && m.id !== "") beforeById[String(m.id)] = rosterKey(matchRoster(before, m));
  });
  const out = [];
  const seenId = {};
  collectMatches(after || {}).forEach((m) => {
    if (!m || m.id == null || m.id === "") return;
    const id = String(m.id);
    if (seenId[id]) return; // um match id só entra uma vez
    seenId[id] = true;
    const roster = matchRoster(after, m);
    if (beforeById[id] !== rosterKey(roster)) out.push({ id, roster });
  });
  return out;
}

// Campos de RESULTADO que vivem no subdoc (espelha AppStore._matchResultFields).
// O resto do match = ESTRUTURA (fica no doc do torneio).
const RESULT_FIELDS = [
  "scoreP1", "scoreP2", "winner", "draw", "sets", "setsWonP1", "setsWonP2",
  "totalGamesP1", "totalGamesP2", "fixedSet", "resultAt", "startedAt",
  "pendingResult", "wo", "woAbsent", "woAbsentSide",
];

// Campos de EXIBIÇÃO denormalizados (Fase B): deixam o jogo RENDERIZÁVEL sozinho,
// sem carregar o doc do torneio (nome dos lados, nome do torneio, rótulo da rodada).
// São ESTRUTURA denormalizada — copiados do match/torneio, não computados aqui.
const DISPLAY_FIELDS = ["p1", "p2", "tournamentName", "roundLabel"];

// Monta o doc de resultado (seed) de um jogo a partir do estado ATUAL do match:
// { matchId, playerUids, + campos de resultado + contexto de exibição }. Espelha o
// seedMatchResultDocs/_dualWriteMatchResult do app. Usado pela migração/backfill/CF.
function buildSeedDoc(t, m) {
  const doc = { matchId: String(m.id), playerUids: matchRoster(t, m) };
  RESULT_FIELDS.forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(m, k) && m[k] !== undefined) doc[k] = m[k];
  });
  // Contexto de exibição (denormalizado, best-effort — pass-through do que existe).
  // Pula slot ainda não resolvido (TBD/BYE): o consumer mostra o placeholder.
  if (m.p1 != null && m.p1 !== "" && m.p1 !== "TBD" && m.p1 !== "BYE") doc.p1 = m.p1;
  if (m.p2 != null && m.p2 !== "" && m.p2 !== "TBD" && m.p2 !== "BYE") doc.p2 = m.p2;
  if (t && t.name) doc.tournamentName = t.name;
  const rl = m.label || m.roundName || null; // rótulo já legível se o match carregar
  if (rl) doc.roundLabel = rl;
  return doc;
}

// Assinatura canônica do ESTADO ESPELHÁVEL de um subdoc (roster + campos de
// resultado, com chaves ordenadas). Usada pra decidir se o mirror MUDOU sem
// re-escrever à toa. Compara-se subdocSignature(buildSeedDoc(t,m)) (desejado) com
// subdocSignature(subdocAtual) (o que já está gravado).
function subdocSignature(data) {
  data = data || {};
  const res = {};
  RESULT_FIELDS.concat(DISPLAY_FIELDS).forEach((k) => { if (data[k] !== undefined) res[k] = data[k]; });
  const ordered = {};
  Object.keys(res).sort().forEach((k) => { ordered[k] = res[k]; });
  return rosterKey(data.playerUids) + "::" + JSON.stringify(ordered);
}

// Doc de espelho COMPLETO pra CF gravar (set SEM merge = clobber fiel, remove campos
// que sumiram do match, ex.: reset/revert). buildSeedDoc + tournamentId + updatedAt.
function buildMirrorDoc(t, m, tid, nowIso) {
  const doc = buildSeedDoc(t, m);
  doc.tournamentId = String(tid);
  doc.updatedAt = nowIso || new Date().toISOString();
  return doc;
}

module.exports = {
  collectMatches, participantUids, matchRoster, rosterKey, computeRosterChanges,
  RESULT_FIELDS, buildSeedDoc, subdocSignature, buildMirrorDoc,
};
