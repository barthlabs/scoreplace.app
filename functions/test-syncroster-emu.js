// E2E do trigger syncMatchRosters (ESPELHO server-autoritativo) no emulador
// (Functions + Firestore). Roda via:
//   firebase emulators:exec --only functions,firestore --project demo-scoreplace \
//     "node functions/test-syncroster-emu.js"
// Prova, via UPDATE do doc do torneio (qualquer path): (1) avanço → re-semeia roster
// do downstream; (2) W.O. (winner+wo sem placar) → espelha no subdoc; (3) reverter/
// zerar → REMOVE o resultado do subdoc (clobber); (4) NÃO backfilla jogo sem subdoc.
const admin = require("firebase-admin");
admin.initializeApp({ projectId: "demo-scoreplace" });
const db = admin.firestore();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0;
function ok(c, msg) { if (c) console.log("  ✓ " + msg); else { fail++; console.error("  ✗ " + msg); } }

async function pollSub(tid, matchId, predicate, label, tries) {
  for (let i = 0; i < (tries || 20); i++) {
    const snap = await db.collection("tournaments").doc(tid).collection("results").doc(matchId).get();
    const data = snap.exists ? snap.data() : null;
    if (predicate(data)) return data;
    await sleep(500);
  }
  const snap = await db.collection("tournaments").doc(tid).collection("results").doc(matchId).get();
  return snap.exists ? snap.data() : null;
}

(async function main() {
  const tid = "sr-emu-1";
  const parts = [
    { uid: "uA", displayName: "A" }, { uid: "uB", displayName: "B" },
    { uid: "uC", displayName: "C" }, { uid: "uD", displayName: "D" },
  ];
  await db.collection("tournaments").doc(tid).set({
    name: "SR Emu", participants: parts,
    matches: [
      { id: "semi1", p1: "A", p2: "B", nextMatchId: "final" },
      { id: "semi2", p1: "C", p2: "D", nextMatchId: "final" },
      { id: "final", p1: "TBD", p2: "TBD" },
    ],
  });
  // semeia subdocs (como sorteio/backfill) — semi1 e final
  await db.collection("tournaments").doc(tid).collection("results").doc("semi1").set({ matchId: "semi1", playerUids: ["uA", "uB"] });
  await db.collection("tournaments").doc(tid).collection("results").doc("final").set({ matchId: "final", playerUids: [] });
  await sleep(2500);

  console.log("──── avanço (roster) ────");
  await db.collection("tournaments").doc(tid).update({
    matches: [
      { id: "semi1", p1: "A", p2: "B", nextMatchId: "final", winner: "A", scoreP1: 6, scoreP2: 3 },
      { id: "semi2", p1: "C", p2: "D", nextMatchId: "final" },
      { id: "final", p1: "A", p2: "TBD" },
    ],
  });
  const fin = await pollSub(tid, "final", (d) => d && (d.playerUids || []).join("|") === "uA");
  ok(fin && (fin.playerUids || []).join("|") === "uA", "avanço: roster do 'final' → [uA]");
  const s1 = await pollSub(tid, "semi1", (d) => d && d.winner === "A");
  ok(s1 && s1.winner === "A" && s1.scoreP1 === 6, "resultado do 'semi1' espelhado no subdoc (winner A, 6)");

  console.log("──── W.O. (winner+wo, sem placar) ────");
  await db.collection("tournaments").doc(tid).update({
    matches: [
      { id: "semi1", p1: "A", p2: "B", nextMatchId: "final", winner: "A", scoreP1: 6, scoreP2: 3 },
      { id: "semi2", p1: "C", p2: "D", nextMatchId: "final", winner: "C", wo: true, woAbsentSide: "p2" },
      { id: "final", p1: "A", p2: "C" },
    ],
  });
  // semeia subdoc do semi2 agora (como se já existisse) pra CF poder espelhar
  await db.collection("tournaments").doc(tid).collection("results").doc("semi2").set({ matchId: "semi2", playerUids: ["uC", "uD"] });
  await sleep(500);
  // re-dispara um write (a CF do update acima pode ter rodado antes do subdoc existir)
  await db.collection("tournaments").doc(tid).update({ _touch: Date.now() });
  const s2 = await pollSub(tid, "semi2", (d) => d && d.wo === true);
  ok(s2 && s2.winner === "C" && s2.wo === true && s2.woAbsentSide === "p2", "W.O. espelhado no subdoc (winner C, wo, woAbsentSide)");
  ok(s2 && s2.scoreP1 === undefined, "W.O. sem placar → subdoc sem scoreP1");

  console.log("──── reverter/zerar (clobber remove resultado) ────");
  await db.collection("tournaments").doc(tid).update({
    matches: [
      { id: "semi1", p1: "A", p2: "B", nextMatchId: "final", winner: "A", scoreP1: 6, scoreP2: 3 },
      { id: "semi2", p1: "C", p2: "D", nextMatchId: "final" }, // W.O. revertido → sem winner/wo
      { id: "final", p1: "A", p2: "TBD" },
    ],
  });
  const s2r = await pollSub(tid, "semi2", (d) => d && d.winner === undefined);
  ok(s2r && s2r.winner === undefined && s2r.wo === undefined, "reverter: subdoc do 'semi2' PERDE winner/wo (clobber)");
  ok(s2r && (s2r.playerUids || []).slice().sort().join("|") === "uC|uD", "reverter: roster do 'semi2' preservado [uC,uD]");
  const finR = await pollSub(tid, "final", (d) => d && (d.playerUids || []).join("|") === "uA");
  ok(finR && (finR.playerUids || []).join("|") === "uA", "reverter: 'final' volta a roster [uA] (C saiu)");

  console.log("──── não backfilla jogo sem subdoc ────");
  await db.collection("tournaments").doc(tid).update({
    matches: admin.firestore.FieldValue.arrayUnion({ id: "extra", p1: "A", p2: "B", winner: "A" }),
  });
  await sleep(2500);
  const ex = await db.collection("tournaments").doc(tid).collection("results").doc("extra").get();
  ok(!ex.exists, "NÃO backfilla jogo sem subdoc semeado");

  console.log("════════════════════════════════════════");
  console.log((fail === 0 ? "✅" : "❌") + " syncMatchRosters E2E: " + (fail === 0 ? "todos ok" : fail + " falharam"));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("EXCEÇÃO:", e); process.exit(1); });
