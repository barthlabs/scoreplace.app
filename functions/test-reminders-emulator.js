/* Validação da ENTREGA do lembrete (item 7) contra o EMULADOR do Firestore (transações/
 * queries reais). Roda o CÓDIGO REAL: functions/reminder-run.js + reminder-core + enroll-core.
 * Prova: entrega só a inscrito na janela, respeita notifyLevel/notifyPlatform, dedup por
 * torneio, killswitch do Sandbox, pula finished/já-enviado, e é idempotente na 2ª rodada.
 *
 * Uso:  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/test-reminders-emulator.js
 */
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "demo-reminders";
if (!process.env.FIRESTORE_EMULATOR_HOST) { console.error("suba o emulador primeiro"); process.exit(2); }
const admin = require("firebase-admin");
admin.initializeApp({ projectId: process.env.GOOGLE_CLOUD_PROJECT });
const db = admin.firestore();
const { runTournamentReminders } = require("./reminder-run");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error("  ✗", m); } };
const NOW = Date.parse("2026-07-19T12:00:00Z"); // BRT 09:00 dia 19
const notifDocId = (tId, key, uid) => ["tournament_reminder", tId, key, uid].join("|").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
const hasNotif = async (uid, tId, key) => (await db.collection("users").doc(uid).collection("notifications").doc(notifDocId(tId, key, uid)).get()).exists;

async function seed() {
  // usuários com preferências variadas
  await db.collection("users").doc("uA").set({ displayName: "Ana", email: "ana@x.com", notifyLevel: "todas", notifyPlatform: true, notifyEmail: true });
  await db.collection("users").doc("uB").set({ displayName: "Bia", email: "bia@x.com", notifyLevel: "fundamentais", notifyPlatform: true, notifyEmail: true }); // r7d='all' → filtrado
  await db.collection("users").doc("uC").set({ displayName: "Ced", email: "ced@x.com", notifyLevel: "todas", notifyPlatform: false, notifyEmail: true }); // sem push, com email
  const base = { participants: [{ uid: "uA", displayName: "Ana" }, { uid: "uB", displayName: "Bia" }, { uid: "uC", displayName: "Ced" }], status: "open" };
  await db.collection("tournaments").doc("T7").set(Object.assign({ id: "T7", name: "Copa 7d", startDate: "2026-07-26" }, base));
  await db.collection("tournaments").doc("TFIN").set(Object.assign({ id: "TFIN", name: "Fim", startDate: "2026-07-26", status: "finished" }, { participants: base.participants }));
  await db.collection("tournaments").doc("TSB").set(Object.assign({ id: "TSB", name: "(SB) Copa", startDate: "2026-07-26", isSandbox: true }, base));
  await db.collection("tournaments").doc("TSENT").set(Object.assign({ id: "TSENT", name: "Já enviou", startDate: "2026-07-26", remindersSent: { r7d: "ontem" } }, base));
  await db.collection("tournaments").doc("TOUT").set(Object.assign({ id: "TOUT", name: "Fora janela", startDate: "2026-07-24" }, base)); // 5d → sem janela
}

(async function () {
  console.log("──── reminders (emulador) ────");
  await seed();
  const r1 = await runTournamentReminders(db, NOW);

  // T7 (janela 7d, nível 'all'):
  ok(await hasNotif("uA", "T7", "r7d"), "1: uA (todas) recebe o lembrete");
  ok(!(await hasNotif("uB", "T7", "r7d")), "1: uB (fundamentais) NÃO recebe — 7d é nível 'all'");
  ok(!(await hasNotif("uC", "T7", "r7d")), "1: uC (notifyPlatform=false) NÃO recebe notif in-app");
  const t7 = (await db.collection("tournaments").doc("T7").get()).data();
  ok(t7.remindersSent && t7.remindersSent.r7d, "1: T7 marcado como enviado (dedup)");

  // e-mail: uA (email on) + uC (platform off mas email on) na fila. uB filtrado por nível.
  const q = await db.collection("notif_email_queue").get();
  const mails = q.docs.map((d) => d.data().email).sort();
  ok(mails.indexOf("ana@x.com") !== -1 && mails.indexOf("ced@x.com") !== -1, "1: e-mail enfileirado pra ana e ced");
  ok(mails.indexOf("bia@x.com") === -1, "1: bia (nível) fora do e-mail");

  // isolados: finished / sandbox / já-enviado / fora-de-janela não geram notif.
  ok(!(await hasNotif("uA", "TFIN", "r7d")), "2: torneio finished não notifica");
  ok(!(await hasNotif("uA", "TSB", "r7d")), "2: SANDBOX (killswitch) não notifica");
  ok(!(await hasNotif("uA", "TSENT", "r7d")), "2: já-enviado não re-notifica");
  ok(!(await hasNotif("uA", "TOUT", "r0d")) && !(await hasNotif("uA", "TOUT", "r7d")), "2: fora da janela não notifica");
  ok(r1.processed === 1, "2: só 1 torneio processado (T7)");

  // idempotência: 2ª rodada não reprocessa T7 (dedup).
  const r2 = await runTournamentReminders(db, NOW);
  ok(r2.processed === 0, "3: 2ª rodada não reprocessa (dedup por torneio)");

  console.log("  " + pass + " asserts OK, " + fail + " falhas");
  if (fail > 0) { console.error("❌ reminders (emulador) FALHOU"); process.exit(1); }
  console.log("✅ reminders (emulador): OK");
  process.exit(0);
})().catch((e) => { console.error("EXPLODIU:", e); process.exit(1); });
