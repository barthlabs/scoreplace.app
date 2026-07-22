// Sandbox (SB): replicação one-way original→SB via a MESMA função + o MESMO core.
// Depois que enrollParticipant/deenrollParticipant aplicam a operação no original, ELAS
// rodam o MESMO computeEnroll/computeDeenroll (via computeFn) no doc do SB. Sem CF de
// espelho separada — o código que roda em prod é ESTE. Módulo isolado só pra ser testável
// contra o emulador do Firestore (transações reais). Ver project_sandbox_tournament.
//
// Regras (todas provadas em functions/test-sandbox-replicate.js):
//  - acha os SBs por `sandboxOf == origId && isSandbox == true` (mão única: um SB não tem
//    SB-filho, então partindo de um SB a query volta vazia);
//  - PULA o SB que já foi sorteado (matches/rounds/groups não-vazios) — protege o teste do dev;
//  - aplica o MESMO computeFn (mesmo core do original) sobre o doc fresco do SB, numa transação;
//  - best-effort: erro aqui NUNCA propaga (a operação real no original já foi commitada).
async function replicateRosterToSandbox(db, origId, computeFn) {
  try {
    const q = await db.collection("tournaments")
      .where("sandboxOf", "==", String(origId))
      .where("isSandbox", "==", true).limit(5).get();
    if (q.empty) return { replicated: 0 };
    let n = 0;
    for (const sbDoc of q.docs) {
      try {
        const applied = await db.runTransaction(async (tx) => {
          const snap = await tx.get(sbDoc.ref);
          if (!snap.exists) return false;
          const sb = snap.data();
          const drawn = (Array.isArray(sb.matches) && sb.matches.length > 0) ||
            (Array.isArray(sb.rounds) && sb.rounds.length > 0) ||
            (Array.isArray(sb.groups) && sb.groups.length > 0);
          if (drawn) return false; // protege o teste do dev
          const r = computeFn(sb);
          if (r && r.updateData) { tx.update(sbDoc.ref, r.updateData); return true; }
          return false;
        });
        if (applied) n++;
      } catch (e) { console.error("replicateRosterToSandbox SB", sbDoc.id, e && e.message); }
    }
    return { replicated: n };
  } catch (e) {
    console.error("replicateRosterToSandbox query", e && e.message);
    return { replicated: 0, error: e && e.message };
  }
}

module.exports = { replicateRosterToSandbox };
