// Entrega do lembrete de torneio (item 7) — extraída da CF sendTournamentReminders pra ser
// testável contra o emulador do Firestore (o código que roda em prod é ESTE). Recebe `db` +
// `nowMs`. Espelha as janelas do cliente via reminder-core e os uids via enroll-core. Dedup
// por torneio (t.remindersSent.rNd) + idempotência por notif-doc determinístico; respeita
// notifyLevel/notifyPlatform/notifyEmail e o killswitch do Sandbox. Ver project_tournament_reminder_cf.
const _reminderCore = require("./reminder-core");
const _enrollCore = require("./enroll-core");

async function runTournamentReminders(db, nowMs) {
  const todayStr = _reminderCore.brtDateStr(nowMs);
  const upperStr = _reminderCore.brtDateStr(nowMs + 8 * 86400000); // hoje+8 (cobre até hoje+7)
  let snap;
  try {
    snap = await db.collection("tournaments")
      .where("startDate", ">=", todayStr)
      .where("startDate", "<", upperStr)
      .get();
  } catch (e) { console.error("[reminders] query falhou:", e && e.message); return { processed: 0, notifs: 0, emailsQueued: 0, error: e && e.message }; }

  let processed = 0, notifs = 0, emailsQueued = 0;
  for (const doc of snap.docs) {
    const t = doc.data();
    if (!t || t.status === "finished") continue;
    if (t.isSandbox === true || t.notificationsMuted === true) continue; // killswitch do Sandbox
    const win = _reminderCore.reminderWindowFor(t.startDate, nowMs);
    if (!win) continue;
    if (t.remindersSent && t.remindersSent[win.key]) continue; // dedup por torneio
    processed++;
    const msg = _reminderCore.reminderMessage(win, t.name);
    const tUrl = "https://scoreplace.app/#tournaments/" + doc.id;

    const parts = Array.isArray(t.participants) ? t.participants : [];
    const uidSet = new Set();
    parts.forEach((p) => {
      if (p && typeof p === "object") _enrollCore.participantUids(p).forEach((u) => { if (u) uidSet.add(String(u)); });
    });
    const uidArr = Array.from(uidSet);

    const notifId = (uid) =>
      ["tournament_reminder", doc.id, win.key, uid].join("|").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
    const emails = [];
    const CHUNK = 20;
    for (let i = 0; i < uidArr.length; i += CHUNK) {
      await Promise.all(uidArr.slice(i, i + CHUNK).map(async (uid) => {
        try {
          const ps = await db.collection("users").doc(uid).get();
          if (!ps.exists) return;
          const profile = ps.data() || {};
          if (!_reminderCore.notifLevelAllowed(profile.notifyLevel || "todas", win.level)) return;
          if (profile.notifyPlatform !== false) {
            await db.collection("users").doc(uid).collection("notifications").doc(notifId(uid)).set({
              type: "tournament_reminder", fromUid: "system", fromName: "scoreplace.app", fromPhoto: "",
              tournamentId: doc.id, tournamentName: t.name || "", message: msg,
              createdAt: new Date().toISOString(), read: false,
            });
            notifs++;
          }
          if (profile.notifyEmail !== false && profile.email) emails.push(String(profile.email).toLowerCase());
        } catch (e) { console.warn("[reminders] uid", uid, e && e.message); }
      }));
    }

    const WINDOWS = { fundamental: 5, important: 15, all: 30 };
    const mins = WINDOWS[win.level] != null ? WINDOWS[win.level] : 30;
    if (emails.length) {
      let batch = db.batch(); let n = 0;
      for (const email of emails) {
        batch.set(db.collection("notif_email_queue").doc(), {
          email, level: win.level, message: msg, tournamentName: t.name || "",
          tournamentUrl: tUrl, createdAt: nowMs, flushAtMs: nowMs + mins * 60 * 1000,
        });
        emailsQueued++;
        if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
      }
      if (n % 400 !== 0) await batch.commit();
    }

    try {
      const upd = {}; upd["remindersSent." + win.key] = new Date().toISOString();
      await doc.ref.update(upd);
    } catch (e) { console.error("[reminders] marcar", doc.id, e && e.message); }
  }
  console.log(`[reminders] ${todayStr}: torneios=${snap.size} processados=${processed} notifs=${notifs} emails=${emailsQueued}`);
  return { processed, notifs, emailsQueued, scanned: snap.size };
}

module.exports = { runTournamentReminders };
