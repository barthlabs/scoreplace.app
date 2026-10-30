"use strict";

// O censo externo é só uma lista de candidatos. Toda decisão e toda escrita
// usam a leitura fresca da mesma transação, para não apagar um avanço de fase
// que ocorreu depois do censo.
async function cleanParticipantTournament(db, ref, uid, deps) {
  if (!db || !ref || !uid || !deps || typeof db.runTransaction !== "function") {
    throw new Error("limpeza de torneio sem transação ou identidade");
  }
  return db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) return null;
    const t = fresh.data() || {};
    if (!deps.findUidPaths(t, uid).length) return null;
    const jogou = deps.hasPlayedMatches(t, uid);
    let next;
    if (jogou) {
      next = deps.stripNamesInMatches(deps.anonymizeEntries(t, uid), uid);
    } else {
      const parts = (t.participants || []).filter((p) => !p || typeof p !== "object" ||
        !deps.findUidPaths(p, uid).length);
      next = Object.assign({}, t, { participants: parts });
    }
    next = deps.purgeUidEverywhere(next, uid, jogou);
    next.memberUids = (next.memberUids || []).filter((u) => u !== uid);
    next.updatedAt = deps.nowIso;
    tx.set(ref, next);
    return jogou ? "anonymized" : "left";
  });
}

module.exports = { cleanParticipantTournament };
