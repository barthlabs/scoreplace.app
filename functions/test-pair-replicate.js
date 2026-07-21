/* Validação da replicação Sandbox de FORMAR/DESFAZER dupla contra o EMULADOR do Firestore.
 * Roda o CÓDIGO REAL: functions/sandbox-replicate.js + functions/pair-core.js — o mesmo que
 * formPair/splitPair usam em prod. Prova que a formação/desfazer manual replica no SB via o
 * MESMO core (conserta a fidelidade do SB, o motivo da migração). Ver project_sandbox_tournament.
 *
 * Uso:  FIRESTORE_EMULATOR_HOST=localhost:8080 node functions/test-pair-replicate.js
 */
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "demo-sandbox";
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST não setado — suba o emulador primeiro.");
  process.exit(2);
}
const admin = require("firebase-admin");
admin.initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = admin.firestore();
const { replicateRosterToSandbox } = require("./sandbox-replicate");
const pairCore = require("./pair-core");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.error("  ✗", m); } };
const T = (id) => db.collection("tournaments").doc(id);

async function seed() {
  const solos = [
    { uid: "uidA", displayName: "Ana", name: "Ana", enrollSeq: 1 },
    { uid: "uidB", displayName: "Bia", name: "Bia", enrollSeq: 2 },
  ];
  await T("ORIG").set({
    id: "ORIG", name: "Copa", isPublic: true, creatorUid: "uidORG",
    enrollmentMode: "time", teamSize: 2, participants: JSON.parse(JSON.stringify(solos)),
    teamOrigins: {}, memberUids: ["uidORG", "uidA", "uidB"], status: "open",
  });
  await T("ORIG_SB").set({
    id: "ORIG_SB", name: "(SB) Copa", isSandbox: true, sandboxOf: "ORIG",
    notificationsMuted: true, isPublic: false, creatorUid: "uidDEV",
    enrollmentMode: "time", teamSize: 2, participants: JSON.parse(JSON.stringify(solos)),
    teamOrigins: {}, memberUids: ["uidDEV", "uidA", "uidB"], status: "open",
  });
}
const doc = async (id) => (await T(id).get()).data();

(async function () {
  console.log("──── pair-replicate (emulador) ────");

  // (1) formar dupla no original replica no SB via o MESMO core.
  await seed();
  await replicateRosterToSandbox(db, "ORIG", (sb) =>
    pairCore.computeFormPair(sb, { uid1: "uidA", name1: "Ana", uid2: "uidB", name2: "Bia" }));
  const sbFormed = await doc("ORIG_SB");
  const team = (sbFormed.participants || []).find((p) => p.p1Uid && p.p2Uid);
  ok(!!team && team.p1Uid === "uidA" && team.p2Uid === "uidB", "1: formPair replicou a dupla no SB");
  ok(sbFormed.teamOrigins && sbFormed.teamOrigins["Ana / Bia"] === "formada", "1: teamOrigins replicou");
  ok(sbFormed.manualPairing === "open", "1: markDuplasManual replicou (manualPairing=open)");
  ok((sbFormed.participants || []).length === 1, "1: SB tem 1 entrada (a dupla)");

  // (2) desfazer no original replica o desfazer no SB.
  await replicateRosterToSandbox(db, "ORIG", (sb) =>
    pairCore.computeSplitPair(sb, { id1: "uidA", id2: "uidB" }));
  const sbSplit = await doc("ORIG_SB");
  ok((sbSplit.participants || []).length === 2, "2: splitPair replicou o desfazer (2 solos no SB)");
  ok(!(sbSplit.participants || []).some((p) => p.p1Uid && p.p2Uid), "2: nenhuma dupla resta no SB");
  const anaBack = (sbSplit.participants || []).find((p) => p.uid === "uidA");
  ok(anaBack && anaBack.enrollSeq === 1, "2: seq original restaurado no SB");

  // (3) mão ÚNICA: partindo do SB, nada replica (SB não tem SB-filho).
  await replicateRosterToSandbox(db, "ORIG_SB", (sb) =>
    pairCore.computeFormPair(sb, { uid1: "uidA", name1: "Ana", uid2: "uidB", name2: "Bia" }));
  const origAfter = await doc("ORIG");
  ok((origAfter.participants || []).length === 2, "3: mão única — formar no SB não volta pro original");

  console.log(`\n${fail === 0 ? "✅" : "❌"} pair-replicate: ${pass} ok, ${fail} falharam`);
  if (fail > 0) process.exit(1);
  process.exit(0);
})().catch((e) => { console.error("ERRO:", e); process.exit(1); });
