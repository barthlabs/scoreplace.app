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

    /* Espera o gatilho assentar. Teto de ~10s: se não curar, o teste ACUSA em vez de
   * ficar pendurado. */
  async function pollDoc(tid, docId, pred, tries) {
    const ref = db.collection("tournaments").doc(tid).collection("results").doc(docId);
    for (let i = 0; i < (tries || 20); i++) {
      const snap = await ref.get();
      const d = snap.exists ? snap.data() : null;
      if (pred(d)) return d;
      await new Promise((r) => setTimeout(r, 500));
    }
    const snap = await ref.get();
    return snap.exists ? snap.data() : null;
  }

  async function pollColecao(tid, pred, tries) {
    let snap = await db.collection("tournaments").doc(tid).collection("results").get();
    for (let i = 0; i < (tries || 20) && !pred(snap); i++) {
      await new Promise((r) => setTimeout(r, 500));
      snap = await db.collection("tournaments").doc(tid).collection("results").get();
    }
    return snap;
  }

  console.log("──── secret guard ────");
  const bad = await call("?secret=wrong");
  ok(bad.status === 403, "secret errado → 403");

  /* ⛔ O ESPELHO SE CURA SOZINHO ANTES DE O BACKFILL RODAR — e este bloco afirmava o
   * contrário. Até 10/ago/2026 o subdoc só nascia pela migração, então `bf-legacy` chegava
   * ao dryRun com a subcoleção VAZIA e o backfill contava `created >= 4`.
   * Em 6c2570cb ("1.7.99 — o espelho do roster passa a se manter sozinho, no servidor") o
   * gatilho `syncMatchRosters` passou a CRIAR o espelho quando falta
   * (functions/index.js:8074-8089), com o motivo medido em produção: o seed vivia no
   * CLIENTE e o sorteio AUTOMÁTICO roda no SERVIDOR, que nunca o chamava — "quem dependesse
   * do subdoc existir tinha cobertura aleatória".
   * ⚠️ Como o `seed()` acima escreve o torneio com o emulador de FUNCTIONS ligado, o
   * gatilho dispara e cura os espelhos: no log do próprio teste,
   * "[espelho-roster] bf-legacy · 4 doc(s) atualizados". Esperar coleção vazia aqui é
   * esperar o mundo de antes do conserto.
   *
   * ⭐ O QUE CONTINUA VALENDO, e é o que este bloco passa a travar: o dryRun **não pode
   * escrever nada NOVO**. Em vez de "a coleção está vazia" (que o gatilho invalida), mede-se
   * o ANTES e o DEPOIS: o dryRun não muda um documento sequer. */
  console.log("──── cura automática do espelho (6c2570cb) ────");
  /* ⚠️ O GATILHO É ASSÍNCRONO — medir logo depois do `seed()` lê o mundo antes de ele
   * rodar, e o teste acusaria uma corrida em vez do comportamento. Espera-se a cura
   * ACONTECER (com teto), que é o que o `pollSub` do test-syncroster-emu já fazia. */
  const legacyAntes = await pollColecao("bf-legacy", (snap) => snap.size >= 3);
  ok(legacyAntes.size >= 3,
    `⭐ o gatilho syncMatchRosters CURA o espelho do legado sozinho, sem backfill (got ${legacyAntes.size})`);
  const antesPorId = {};
  legacyAntes.forEach((d) => (antesPorId[d.id] = JSON.stringify(d.data())));

  console.log("──── dryRun (não escreve) ────");
  const dry = await call(`?secret=${SECRET}&dryRun=1`);
  ok(dry.body.ok, `dryRun respondeu ok (created=${dry.body.created})`);
  const legacyAfterDry = await db.collection("tournaments").doc("bf-legacy").collection("results").get();
  ok(legacyAfterDry.size === legacyAntes.size,
    `⛔ dryRun NÃO criou subdoc novo (antes=${legacyAntes.size} depois=${legacyAfterDry.size})`);
  let mexeu = 0;
  legacyAfterDry.forEach((d) => { if (antesPorId[d.id] !== JSON.stringify(d.data())) mexeu++; });
  ok(mexeu === 0, `⛔ dryRun NÃO alterou nenhum subdoc existente (mexeu em ${mexeu})`);

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

  /* ⛔ ESTE BLOCO AFIRMAVA QUE SÓ O `force` CURAVA O SUBDOC ANTIGO. `bf-hassub/g1` é
   * semeado sem contexto de exibição (p1/p2/tournamentName), e o teste exigia
   * `!("p1" in g1Before)` — ou seja, que ele CONTINUASSE torto até o backfill passar.
   * Desde 6c2570cb o gatilho refresca sozinho todo espelho cuja ASSINATURA mudou
   * (functions/index.js:8086-8089: `if (existia && subdocSignature(...) === sig) continue`),
   * então o contexto chega antes — e é isso que se afirma agora.
   * ⛔ NÃO se restaurou o comportamento antigo: o que era "estava torto" virou "já está
   * curado", e o `force` é medido pelo que ele de fato garante hoje — não estragar nada e
   * ser idempotente. */
  console.log("──── cura automática do contexto de exibição + force idempotente ────");
  const g1Curado = await pollDoc("bf-hassub", "g1", (d) => d && "p1" in d);
  ok(g1Curado && g1Curado.p1 === "A" && g1Curado.p2 === "B" && g1Curado.tournamentName === "HasSub",
    "⭐ o gatilho deu a g1 o contexto de exibição (p1/p2/tournamentName) SEM backfill");
  ok(g1Curado && g1Curado.winner === "B" && g1Curado.scoreP1 === 2,
    "⭐ e preservou o RESULTADO que já estava lá (winner B, 2)");
  const forceRun = await call(`?secret=${SECRET}&force=1`);
  ok(forceRun.body.ok, `force respondeu ok (refreshed=${forceRun.body.refreshed})`);
  const g1After = (await db.collection("tournaments").doc("bf-hassub").collection("results").doc("g1").get()).data();
  ok(g1After.p1 === "A" && g1After.p2 === "B" && g1After.tournamentName === "HasSub",
    "⛔ force NÃO desfez o contexto");
  ok(g1After.winner === "B" && g1After.scoreP1 === 2, "⛔ force preservou o resultado (winner B, 2)");
  const forceRun2 = await call(`?secret=${SECRET}&force=1`);
  ok(forceRun2.body.refreshed === 0, `force idempotente: 2ª vez refresca 0 (refreshed=${forceRun2.body.refreshed})`);

  console.log("════════════════════════════════════════");
  console.log((fail === 0 ? "✅" : "❌") + " backfill E2E: " + (fail === 0 ? "todos ok" : fail + " falharam"));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("EXCEÇÃO:", e); process.exit(1); });
