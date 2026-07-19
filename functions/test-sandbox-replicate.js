/* Validação da replicação Sandbox contra o EMULADOR do Firestore (transações reais).
 * Roda o CÓDIGO REAL: functions/sandbox-replicate.js + functions/enroll-core.js — o mesmo
 * que enrollParticipant/deenrollParticipant usam em prod. Prova: enroll no original replica
 * no SB via o MESMO core; SB sorteado é pulado; mão única (partindo do SB, nada replica);
 * deenroll idem.
 *
 * Uso:  FIRESTORE_EMULATOR_HOST=localhost:8080 node functions/test-sandbox-replicate.js
 * (o runner sobe o emulador antes — ver validate-sandbox-emulator.sh)
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
const enrollCore = require("./enroll-core");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  ✗", m); } };
const T = (id) => db.collection("tournaments").doc(id);
const now = 1000000000000;

async function seed(origExtra, sbExtra) {
  await T("ORIG").set(Object.assign({
    id: "ORIG", name: "Copa", isPublic: true, creatorUid: "uORG",
    participants: [], memberUids: ["uORG"], status: "open"
  }, origExtra || {}));
  await T("ORIG_SB").set(Object.assign({
    id: "ORIG_SB", name: "(SB) Copa", isSandbox: true, sandboxOf: "ORIG",
    notificationsMuted: true, isPublic: false, creatorUid: "uDEV",
    participants: [], memberUids: ["uDEV"], status: "open"
  }, sbExtra || {}));
}
const partsOf = async (id) => ((await T(id).get()).data().participants || []).map((p) => p.uid);

(async function () {
  console.log("──── sandbox-replicate (emulador) ────");
  const ana = { uid: "uA", displayName: "Ana" };

  // (1) enroll no original replica no SB (mesmo core).
  await seed();
  await replicateRosterToSandbox(db, "ORIG", (sb) => enrollCore.computeEnroll(sb, ana, null, now));
  ok((await partsOf("ORIG_SB")).indexOf("uA") !== -1, "1: enroll replicou no SB via o mesmo core");
  ok((await partsOf("ORIG")).length === 0, "1: original não é tocado pela replicação (só o SB)");

  // (2) SB JÁ sorteado → replicação pulada (protege o teste do dev).
  await seed({}, { matches: [{ id: "m1" }] });
  await replicateRosterToSandbox(db, "ORIG", (sb) => enrollCore.computeEnroll(sb, ana, null, now));
  ok((await partsOf("ORIG_SB")).indexOf("uA") === -1, "2: SB sorteado NÃO recebe replicação");

  // (3) mão única: partindo do id do SB, a query não acha SB-filho → nada replica.
  await seed({}, { participants: [ana], memberUids: ["uDEV", "uA"] });
  const r3 = await replicateRosterToSandbox(db, "ORIG_SB", (sb) => enrollCore.computeEnroll(sb, { uid: "uX" }, null, now));
  ok(r3.replicated === 0, "3: mão única — SB não tem SB-filho, nada replicado");

  // (4) deenroll no original replica no SB (mesmo core).
  await seed({ participants: [ana], memberUids: ["uORG", "uA"] },
             { participants: [ana], memberUids: ["uDEV", "uA"] });
  await replicateRosterToSandbox(db, "ORIG", (sb) => enrollCore.computeDeenroll(sb, "uA"));
  ok((await partsOf("ORIG_SB")).indexOf("uA") === -1, "4: deenroll replicou no SB (uA saiu)");

  // (5) sem SB → no-op silencioso.
  await T("ORIG_SB").delete();
  const r5 = await replicateRosterToSandbox(db, "ORIG", (sb) => enrollCore.computeEnroll(sb, ana, null, now));
  ok(r5.replicated === 0, "5: sem SB → 0 replicado, sem erro");

  console.log("  " + pass + " asserts OK, " + fail + " falhas");
  if (fail > 0) { console.error("❌ sandbox-replicate (emulador) FALHOU"); process.exit(1); }
  console.log("✅ sandbox-replicate (emulador): OK");
  process.exit(0);
})().catch((e) => { console.error("EXPLODIU:", e); process.exit(1); });
