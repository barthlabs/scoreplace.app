// E2E do endpoint backfillMatchResultDocs no emulador (Functions + Firestore).
// Roda via (com functions/.secret.local definindo BACKFILL_SECRET):
//   firebase emulators:exec --only functions,firestore --project demo-scoreplace \
//     "node functions/test-backfill-emu.js"
// Prova: (1) dryRun conta sem escrever; (2) backfill cria subdocs dos legados com
// playerUids + campos de resultado; (3) NÃO recria subdoc existente; (4) pula
// torneio sem chave (inscrição); (5) idempotente; (6) secret errado → 403.
const admin = require("firebase-admin");
const fetch = require("node-fetch");
admin.initializeApp({ projectId: "demo-scoreplace" });
const db = admin.firestore();

const SECRET = "emu-backfill-test";
const PORT = process.env.FUNCTIONS_EMULATOR_PORT || "5001";
const BASE = `http://127.0.0.1:${PORT}/demo-scoreplace/us-central1/backfillMatchResultDocs`;
let fail = 0;
function ok(c, msg) { if (c) console.log("  ✓ " + msg); else { fail++; console.error("  ✗ " + msg); } }
async function call(qs) { const r = await fetch(BASE + qs); return { status: r.status, body: await r.json().catch(() => ({})) }; }

(async function main() {
  const parts = [
    { uid: "uA", displayName: "A" }, { uid: "uB", displayName: "B" },
    { uid: "uC", displayName: "C" }, { uid: "uD", displayName: "D" },
  ];
  // legado: placar no doc, SEM subdocs. semi1 já jogado (A venceu → final.p1=A)
  await db.collection("tournaments").doc("bf-legacy").set({
    name: "Legacy", participants: parts,
    matches: [
      { id: "semi1", p1: "A", p2: "B", nextMatchId: "final", winner: "A", scoreP1: 6, scoreP2: 3, resultAt: 100 },
      { id: "semi2", p1: "C", p2: "D", nextMatchId: "final" },
      { id: "final", p1: "A", p2: "TBD" },
    ],
  });
  // já tem 1 subdoc (semi1) — backfill deve PULAR esse e criar só os que faltam
  await db.collection("tournaments").doc("bf-hassub").set({
    name: "HasSub", participants: parts,
    matches: [
      { id: "g1", p1: "A", p2: "B", winner: "B", scoreP1: 2, scoreP2: 6 },
      { id: "g2", p1: "C", p2: "D" },
    ],
  });
  await db.collection("tournaments").doc("bf-hassub").collection("results").doc("g1")
    .set({ matchId: "g1", playerUids: ["uA", "uB"], winner: "B", scoreP1: 2, scoreP2: 6 });
  // fase de inscrição: sem matches → pulado
  await db.collection("tournaments").doc("bf-enroll").set({ name: "Enroll", participants: parts });

  console.log("──── secret guard ────");
  const bad = await call("?secret=wrong");
  ok(bad.status === 403, "secret errado → 403");

  console.log("──── dryRun (não escreve) ────");
  const dry = await call(`?secret=${SECRET}&dryRun=1`);
  ok(dry.body.ok && dry.body.created >= 4, `dryRun conta o que criaria (created=${dry.body.created})`);
  const legacyAfterDry = await db.collection("tournaments").doc("bf-legacy").collection("results").get();
  ok(legacyAfterDry.empty, "dryRun NÃO escreveu subdoc no legado");

  console.log("──── backfill real ────");
  const run = await call(`?secret=${SECRET}`);
  ok(run.body.ok, "backfill respondeu ok");
  // legado: 3 subdocs criados (semi1, semi2, final)
  const lg = await db.collection("tournaments").doc("bf-legacy").collection("results").get();
  const lgById = {}; lg.forEach((d) => (lgById[d.id] = d.data()));
  ok(lg.size === 3, `legado ganhou 3 subdocs (got ${lg.size})`);
  ok(lgById.semi1 && lgById.semi1.winner === "A" && lgById.semi1.scoreP1 === 6, "semi1 subdoc tem resultado (winner A, 6)");
  ok(lgById.semi1 && (lgById.semi1.playerUids || []).slice().sort().join("|") === "uA|uB", "semi1 subdoc tem roster [uA,uB]");
  ok(lgById.final && (lgById.final.playerUids || []).join("|") === "uA", "final subdoc tem roster [uA] (só A avançou)");
  ok(lgById.final && !("winner" in lgById.final), "final subdoc sem resultado (jogo não jogado)");
  // hassub: g1 preservado (não recriado), g2 criado
  const hs = await db.collection("tournaments").doc("bf-hassub").collection("results").get();
  ok(hs.size === 2, `hassub tem 2 subdocs (g1 preservado + g2 novo) (got ${hs.size})`);
  // enroll: nada
  const en = await db.collection("tournaments").doc("bf-enroll").collection("results").get();
  ok(en.empty, "torneio de inscrição (sem chave) não ganhou subdoc");

  console.log("──── idempotente (re-rodar) ────");
  const run2 = await call(`?secret=${SECRET}`);
  ok(run2.body.created === 0, `2ª rodada cria 0 (created=${run2.body.created})`);
  ok(run2.body.skipped >= 5, `2ª rodada pula os já semeados (skipped=${run2.body.skipped})`);

  console.log("──── force=1: refresca contexto de exibição em subdoc antigo ────");
  // hassub/g1 foi semeado SEM contexto de exibição (p1/p2/tournamentName) → force preenche
  const g1Before = (await db.collection("tournaments").doc("bf-hassub").collection("results").doc("g1").get()).data();
  ok(!("p1" in g1Before), "g1 (subdoc antigo) NÃO tinha p1 (display)");
  const forceRun = await call(`?secret=${SECRET}&force=1`);
  ok(forceRun.body.refreshed >= 1, `force refrescou subdocs desatualizados (refreshed=${forceRun.body.refreshed})`);
  const g1After = (await db.collection("tournaments").doc("bf-hassub").collection("results").doc("g1").get()).data();
  ok(g1After.p1 === "A" && g1After.p2 === "B" && g1After.tournamentName === "HasSub", "g1 GANHOU contexto de exibição (p1/p2/tournamentName) via force");
  ok(g1After.winner === "B" && g1After.scoreP1 === 2, "force preservou o resultado (winner B, 2)");
  const forceRun2 = await call(`?secret=${SECRET}&force=1`);
  ok(forceRun2.body.refreshed === 0, `force idempotente: 2ª vez refresca 0 (refreshed=${forceRun2.body.refreshed})`);

  console.log("════════════════════════════════════════");
  console.log((fail === 0 ? "✅" : "❌") + " backfill E2E: " + (fail === 0 ? "todos ok" : fail + " falharam"));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("EXCEÇÃO:", e); process.exit(1); });
