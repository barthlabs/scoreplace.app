/**
 * scoreplace.app — Cloud Functions (local source)
 *
 * NOTE: This file intentionally contains ONLY the cleanup functions deployed
 * from this workspace. Other production functions (autoDraw, stripeWebhook,
 * sendPushNotification, createCheckoutSession, ext-firestore-send-email-*)
 * live in Firebase production and were deployed from a different source.
 * They are NOT touched by deploys from here — always use
 * `firebase deploy --only functions:NAME` to target specific functions.
 *
 * The WhatsApp queue function (processWhatsAppQueue) is preserved in
 * index.js.with-whatsapp.backup for when the WHATSAPP_TOKEN /
 * WHATSAPP_PHONE_ID secrets are configured and the integration is ready
 * to deploy.
 *
 * Scheduled jobs currently deployed from here:
 *
 * 1) cleanupOldNotifications: daily at 03:00 BRT, deletes read notifications
 *    older than 90 days across all users via a collection-group query.
 *
 * 2) cleanupOldCasualMatches: daily at 03:30 BRT, deletes finished
 *    casualMatches older than 30 days. Per-player stats persist separately
 *    on user profiles so the room doc is disposable.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();

// ═══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL HELPERS — account deduplication (phone + email)
// ═══════════════════════════════════════════════════════════════════════════

/** Replace name references inside a match array. Returns {arr, hit}. */
function _replaceNameInMatches(matches, oldName, newName) {
  if (!Array.isArray(matches)) return { arr: matches, hit: false };
  let hit = false;
  const arr = matches.map(m => {
    const nm = Object.assign({}, m);
    if (nm.p1 === oldName)    { nm.p1    = newName; hit = true; }
    if (nm.p2 === oldName)    { nm.p2    = newName; hit = true; }
    if (nm.winner === oldName){ nm.winner = newName; hit = true; }
    if (Array.isArray(nm.team1)) nm.team1 = nm.team1.map(x => x === oldName ? (hit = true, newName) : x);
    if (Array.isArray(nm.team2)) nm.team2 = nm.team2.map(x => x === oldName ? (hit = true, newName) : x);
    return nm;
  });
  return { arr, hit };
}

/**
 * Repair all tournaments: replace every reference to the dropped account
 * (by uid, email, or display name) with the keeper's identity. Batched.
 */
async function _repairTournaments(db, dropUid, dropEmail, dropName, keepUid, keepEmail, keepName) {
  const tourSnaps = await db.collection("tournaments").get();
  let tourFixed = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const tourDoc of tourSnaps.docs) {
    const t = tourDoc.data();
    let changed = false;
    const update = {};

    // memberEmails[]
    const memberEmails = Array.isArray(t.memberEmails) ? [...t.memberEmails] : [];
    const emailIdx = dropEmail ? memberEmails.indexOf(dropEmail) : -1;
    if (emailIdx !== -1) {
      if (keepEmail && !memberEmails.includes(keepEmail)) memberEmails.splice(emailIdx, 1, keepEmail);
      else memberEmails.splice(emailIdx, 1);
      update.memberEmails = memberEmails;
      changed = true;
    }

    // participants[]
    if (Array.isArray(t.participants)) {
      const parts = t.participants.map(p => {
        const pUid   = p.uid || p.id || "";
        const pEmail = (p.email || p.displayName || "").toLowerCase();
        const hit = (pUid && pUid === dropUid) ||
                    (dropEmail && pEmail === dropEmail.toLowerCase());
        if (!hit) return p;
        changed = true;
        const updated = Object.assign({}, p);
        if (keepUid)   updated.uid = keepUid;
        if (keepEmail) updated.email = keepEmail;
        if (keepName)  { updated.displayName = keepName; updated.name = keepName; }
        return updated;
      });
      if (changed) update.participants = parts;
    }

    // p1/p2/winner strings across all match structures
    if (dropName && keepName && dropName !== keepName) {
      const structs = [
        { key: "matches", plain: true  },
        { key: "rounds",  plain: false },
        { key: "groups",  plain: false },
        { key: "rodadas", plain: false },
      ];
      for (const { key, plain } of structs) {
        if (!Array.isArray(t[key])) continue;
        if (plain) {
          const r = _replaceNameInMatches(t[key], dropName, keepName);
          if (r.hit) { update[key] = r.arr; changed = true; }
        } else {
          let hit = false;
          const updated = t[key].map(item => {
            if (!item || !Array.isArray(item.matches)) return item;
            const r = _replaceNameInMatches(item.matches, dropName, keepName);
            if (r.hit) hit = true;
            return Object.assign({}, item, { matches: r.arr });
          });
          if (hit) { update[key] = updated; changed = true; }
        }
      }
    }

    if (changed) {
      batch.update(tourDoc.ref, update);
      tourFixed++;
      batchCount++;
      if (batchCount >= 400) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
  }
  if (batchCount > 0) await batch.commit();
  return tourFixed;
}

/**
 * Score how "complete" a user profile is. Higher = more complete = keep this one.
 * Rules: real name > phone-as-name, real email, city, birthdate, gender, sports.
 */
function _profileScore(data) {
  let s = 0;
  const name = data.displayName || data.name || "";
  if (name && !/^\+?[0-9\s\-()]{7,}$/.test(name)) s += 10; // real name, not a phone number
  if (data.email && !data.email.includes("privaterelay"))   s += 5;
  if (data.city)                                             s += 2;
  if (data.birthDate)                                        s += 2;
  if (data.gender)                                           s += 1;
  if (Array.isArray(data.preferredSports) && data.preferredSports.length) s += 1;
  if (data.photoURL && data.photoURL.startsWith("https://firebasestorage")) s += 1;
  return s;
}

/**
 * Choose which of two Firestore DocumentSnapshot objects to keep.
 * Higher profile score wins; tie → newer createdAt wins.
 * Returns { keepDoc, dropDoc }.
 */
function _determineMergeWinner(docA, docB) {
  const aScore = _profileScore(docA.data());
  const bScore = _profileScore(docB.data());
  if (aScore !== bScore) {
    return aScore > bScore
      ? { keepDoc: docA, dropDoc: docB }
      : { keepDoc: docB, dropDoc: docA };
  }
  // Tie: prefer newer account
  const ts = doc => {
    const c = doc.data().createdAt;
    return c ? (c.toMillis ? c.toMillis() : Number(c)) : 0;
  };
  return ts(docB) >= ts(docA)
    ? { keepDoc: docB, dropDoc: docA }
    : { keepDoc: docA, dropDoc: docB };
}

/** Normalise a field value to a dedup key (strips spaces/dashes from phones). */
function _dedupKey(field, value) {
  if (!value || typeof value !== "string") return null;
  if (field === "phone") return value.replace(/[\s\-()]/g, "");
  return value.trim().toLowerCase();
}

/**
 * Execute a full merge:
 *   1. Repair all tournaments (replace dropDoc identity with keepDoc identity)
 *   2. Transfer matchHistory (dedup by matchId)
 *   3. Transfer casualMatches ownership
 *   4. Mark dropDoc as mergedInto keepDoc
 *
 * keepDoc and dropDoc are Firestore DocumentSnapshot instances.
 * Returns { tourFixed, casualFixed }.
 */
async function _executeMerge(db, keepDoc, dropDoc) {
  const keepData  = keepDoc.data();
  const dropData  = dropDoc.data();
  const keepUid   = keepDoc.id;
  const dropUid   = dropDoc.id;
  const keepEmail = keepData.email || "";
  const keepName  = keepData.displayName || keepData.name || "";
  const dropEmail = dropData.email || dropData.phone || "";
  const dropName  = dropData.displayName || dropData.name || "";

  console.log(`[_executeMerge] keep=${keepUid}(${keepName}) ← drop=${dropUid}(${dropName})`);

  const tourFixed = await _repairTournaments(
    db, dropUid, dropEmail, dropName, keepUid, keepEmail, keepName
  );

  // Merge matchHistory (no duplicate matchIds)
  if (Array.isArray(dropData.matchHistory) && dropData.matchHistory.length > 0) {
    const existing = Array.isArray(keepData.matchHistory) ? keepData.matchHistory : [];
    const merged   = [...existing];
    dropData.matchHistory.forEach(entry => {
      if (!merged.some(e => e.matchId === entry.matchId)) merged.push(entry);
    });
    await db.collection("users").doc(keepUid).update({ matchHistory: merged });
  }

  // Transfer casualMatches ownership
  const casualSnap = await db.collection("casualMatches")
    .where("creatorUid", "==", dropUid).get();
  let casualFixed = 0;
  if (!casualSnap.empty) {
    let b = db.batch(); let bc = 0;
    casualSnap.docs.forEach(doc => { b.update(doc.ref, { creatorUid: keepUid }); bc++; });
    await b.commit();
    casualFixed = casualSnap.size;
  }

  // Mark old doc as merged
  await db.collection("users").doc(dropUid).set(
    { mergedInto: keepUid, mergedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  console.log(`[_executeMerge] Done: tourFixed=${tourFixed} casualFixed=${casualFixed}`);
  return { tourFixed, casualFixed };
}

/**
 * Scan all users for duplicate values of `field` ("phone" or "email").
 * For each duplicate group, merge every less-complete account into the
 * most-complete one.  Returns an array of merge result objects.
 */
async function _scanAndMergeByField(db, field) {
  const allSnap = await db.collection("users").get();
  const byKey = {};

  allSnap.docs.forEach(doc => {
    const d = doc.data();
    if (d.mergedInto) return; // already merged — skip
    const key = _dedupKey(field, d[field]);
    if (!key || key.length < 5) return;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(doc);
  });

  const results = [];

  for (const [key, docs] of Object.entries(byKey)) {
    if (docs.length < 2) continue;

    // Find the best keeper across all docs in this group
    let keepDoc = docs[0];
    for (let i = 1; i < docs.length; i++) {
      keepDoc = _determineMergeWinner(keepDoc, docs[i]).keepDoc;
    }

    // Merge all non-keepers sequentially (re-fetch each time for freshness)
    for (const dropDoc of docs) {
      if (dropDoc.id === keepDoc.id) continue;
      const [freshKeep, freshDrop] = await Promise.all([
        db.collection("users").doc(keepDoc.id).get(),
        db.collection("users").doc(dropDoc.id).get(),
      ]);
      if (!freshDrop.exists || freshDrop.data().mergedInto) continue;
      try {
        const r = await _executeMerge(db, freshKeep, freshDrop);
        results.push({ field, key, keepUid: keepDoc.id, dropUid: dropDoc.id, ...r });
      } catch (err) {
        results.push({ field, key, keepUid: keepDoc.id, dropUid: dropDoc.id,
                       error: String(err.message) });
      }
    }
  }

  return results;
}

// ─── One-shot: purge ALL perfil_foto trophies ─────────────────────────────
// v1.6.28-beta: o trofeu perfil_foto foi concedido incorretamente a usuários
// que logaram com Google mas não têm foto real. Após mudar a check pra
// exigir upload via app (firebasestorage), todos os trofeus existentes
// precisam ser revogados de uma vez — em vez de esperar cada user logar
// na nova versão pra revoke automático (pode demorar semanas).
//
// Chamada: curl 'https://us-central1-scoreplace-app.cloudfunctions.net/purgePerfilFotoTrophies?secret=SCOREPLACE_TROPHY_PURGE_20260515'
// Função one-shot. Depois do uso, pode ser removida do código no próximo deploy.
exports.purgePerfilFotoTrophies = onRequest(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    const SECRET = "SCOREPLACE_TROPHY_PURGE_20260515";
    if (req.query.secret !== SECRET) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const db = admin.firestore();
    const usersSnap = await db.collection("users").get();
    let checked = 0;
    let deleted = 0;
    const errors = [];
    // Processa em batches de 50 pra paralelizar sem esgotar conexões
    const batchSize = 50;
    for (let i = 0; i < usersSnap.docs.length; i += batchSize) {
      const batch = usersSnap.docs.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (userDoc) => {
          checked++;
          const ref = db
            .collection("users")
            .doc(userDoc.id)
            .collection("trophies")
            .doc("perfil_foto");
          try {
            const snap = await ref.get();
            if (snap.exists) {
              await ref.delete();
              deleted++;
            }
          } catch (err) {
            errors.push({ uid: userDoc.id, err: String(err && err.message) });
          }
        })
      );
    }
    res.json({
      ok: true,
      checked,
      deleted,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
      message:
        "Purge concluído. " +
        deleted +
        " trofeus 'Com Rosto' deletados de " +
        checked +
        " usuários. Quem realmente tem upload via app reganha no próximo login.",
    });
  }
);

// ─── One-shot: recover wiped adminEmails / memberEmails ──────────────────────
// v1.6.66 partial-object save bug wiped adminEmails[] and memberEmails[] on
// tournaments that auto-closed. This function scans all tournaments where
// adminEmails is missing or empty and repopulates from organizerEmail/
// creatorEmail/coHosts/participants.
//
// Chamada: curl 'https://us-central1-scoreplace-app.cloudfunctions.net/recoverAdminEmails?secret=SCOREPLACE_ADMINEMAILS_RECOVERY_20260516'
// Função one-shot. Pode ser removida no próximo deploy após confirmação.
exports.recoverAdminEmails = onRequest(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    const SECRET = "SCOREPLACE_ADMINEMAILS_RECOVERY_20260516";
    if (req.query.secret !== SECRET) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const db = admin.firestore();

    function computeAdminEmails(data) {
      const emails = new Set();
      const add = (e) => { if (e && typeof e === "string" && e.includes("@")) emails.add(e.toLowerCase().trim()); };
      add(data.creatorEmail);
      add(data.organizerEmail);
      if (Array.isArray(data.coHosts)) data.coHosts.forEach(h => add(typeof h === "string" ? h : h && h.email));
      return Array.from(emails);
    }

    function computeMemberEmails(data) {
      const emails = new Set();
      const add = (e) => { if (e && typeof e === "string" && e.includes("@")) emails.add(e.toLowerCase().trim()); };
      add(data.creatorEmail);
      add(data.organizerEmail);
      if (Array.isArray(data.coHosts)) data.coHosts.forEach(h => add(typeof h === "string" ? h : h && h.email));
      if (Array.isArray(data.participants)) {
        data.participants.forEach(p => {
          if (!p) return;
          if (typeof p === "string") { add(p); return; }
          add(p.email);
          if (typeof p.displayName === "string" && p.displayName.includes("@")) add(p.displayName);
          if (typeof p.name === "string") {
            if (p.name.includes("@")) add(p.name);
            // doubles: "email1/email2"
            if (p.name.includes("/")) p.name.split("/").forEach(n => add(n.trim()));
          }
        });
      }
      return Array.from(emails);
    }

    const snap = await db.collection("tournaments").get();
    let checked = 0;
    let repaired = 0;
    let skipped = 0;
    const errors = [];

    // Batch writes (max 500 per batch)
    const BATCH_SIZE = 400;
    let ops = [];

    snap.docs.forEach(doc => {
      checked++;
      const data = doc.data();
      const adminList = data.adminEmails;
      const isEmpty = !Array.isArray(adminList) || adminList.length === 0;
      if (!isEmpty) { skipped++; return; }

      const newAdmin = computeAdminEmails(data);
      const newMember = computeMemberEmails(data);
      if (newAdmin.length === 0) { skipped++; return; }

      ops.push({ ref: doc.ref, newAdmin, newMember, name: data.name || doc.id });
    });

    // Commit in batches
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const chunk = ops.slice(i, i + BATCH_SIZE);
      const batch = db.batch();
      chunk.forEach(op => batch.update(op.ref, { adminEmails: op.newAdmin, memberEmails: op.newMember }));
      try {
        await batch.commit();
        repaired += chunk.length;
      } catch (err) {
        chunk.forEach(op => errors.push({ id: op.ref.id, name: op.name, err: String(err && err.message) }));
      }
    }

    res.json({
      ok: true,
      checked,
      repaired,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      message: `Recovery concluído. ${repaired} torneios reparados de ${checked} verificados.`,
    });
  }
);

// ─── Helper: batched delete of a query, page by page ─────────────────────────
// Firestore caps batch writes at 500 docs. We pull pages of up to 400 and
// commit each as a batch until the query returns empty. Keeps memory bounded
// and avoids ballooning the function's runtime on large cleanups.
async function _batchDeleteQuery(query, pageSize) {
  pageSize = pageSize || 400;
  const db = admin.firestore();
  let deleted = 0;
  // Guard against runaway loops in case the query keeps matching forever.
  for (let pass = 0; pass < 100; pass++) {
    const snap = await query.limit(pageSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += snap.size;
    if (snap.size < pageSize) break;
  }
  return deleted;
}

// ─── Scheduled cleanup: old notifications ────────────────────────────────────
// Deletes notifications that are already read AND older than 90 days, across
// every user's subcollection. Uses a collection-group query, so the first
// run may need a Firestore composite index on the `notifications` collection
// group — Firebase logs an auto-generated console link if missing. The
// window is intentionally generous: users who leave the app dormant for a
// few months keep their unread history; only stale read ones go.
exports.cleanupOldNotifications = onSchedule(
  {
    schedule: "every day 03:00",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    const threshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const query = db.collectionGroup("notifications")
      .where("read", "==", true)
      .where("createdAt", "<", threshold);
    const deleted = await _batchDeleteQuery(query);
    console.log(`[cleanupOldNotifications] deleted ${deleted} docs (threshold: ${threshold})`);
  }
);

// ─── Notif email digest flush (v2.1.19) ──────────────────────────────────────
// E-mails de notificação são acumulados em `notif_email_queue` com janela por
// importância (5/15/30 min via flushAtMs). Esta função roda a cada 5 min: pega
// os itens vencidos, agrupa por destinatário, CONSOLIDA todos os itens pendentes
// daquela pessoa (mesmo os não vencidos) num ÚNICO e-mail, e limpa a fila.
// Assim um item fundamental (5 min) "puxa" o resto, reduzindo o número de e-mails.
function _digestEscape(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function _digestLevelMeta(level) {
  if (level === "fundamental") return { emoji: "🔴", color: "#ef4444", label: "Fundamental" };
  if (level === "important") return { emoji: "🟠", color: "#f59e0b", label: "Importante" };
  return { emoji: "🟢", color: "#10b981", label: "Geral" };
}
function _buildDigestHtml(items) {
  const rows = items.map((it) => {
    const meta = _digestLevelMeta(it.level);
    const msgHtml = _digestEscape(it.message).replace(/\n/g, "<br>");
    const tName = it.tournamentName ? ('<div style="font-size:0.72rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">🏆 ' + _digestEscape(it.tournamentName) + "</div>") : "";
    const link = it.tournamentUrl ? ('<div style="margin-top:8px;"><a href="' + _digestEscape(it.tournamentUrl) + '" style="color:#fbbf24;font-size:0.78rem;text-decoration:none;font-weight:600;">Ver no scoreplace.app →</a></div>') : "";
    return (
      '<tr><td style="padding:0 0 14px;">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#111827;border-left:4px solid ' + meta.color + ';border-radius:10px;">' +
          '<tr><td style="padding:14px 16px;color:#e5e7eb;">' +
            '<div style="font-size:0.68rem;font-weight:800;color:' + meta.color + ';margin-bottom:6px;">' + meta.emoji + " " + meta.label + "</div>" +
            tName +
            '<div style="font-size:0.92rem;color:#f1f5f9;line-height:1.5;">' + msgHtml + "</div>" +
            link +
          "</td></tr>" +
        "</table>" +
      "</td></tr>"
    );
  }).join("");
  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0f172a;padding:32px 16px;"><tr><td align="center">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:540px;">' +
          '<tr><td style="padding:0 4px 16px;text-align:center;">' +
            '<div style="font-size:1.3rem;">🔔</div>' +
            '<div style="font-size:1rem;font-weight:800;color:#fff;margin-top:2px;">' + (items.length === 1 ? "Você tem 1 novidade" : ("Você tem " + items.length + " novidades")) + "</div>" +
            '<div style="font-size:0.8rem;color:#94a3b8;">scoreplace.app</div>' +
          "</td></tr>" +
          "<tr><td>" + '<table cellspacing="0" cellpadding="0" border="0" width="100%">' + rows + "</table>" + "</td></tr>" +
          '<tr><td style="padding:8px 4px 0;text-align:center;border-top:1px solid #1e293b;">' +
            '<p style="margin:14px 0 0;font-size:0.7rem;color:#64748b;">scoreplace.app · Jogue em outro nível</p>' +
            '<p style="margin:6px 0 0;font-size:0.68rem;color:#64748b;">Pra ajustar a frequência/canais, abra o app → seu perfil → Canais de notificação.</p>' +
          "</td></tr>" +
        "</table>" +
      "</td></tr></table>" +
    "</body></html>"
  );
}
function _buildDigestText(items) {
  return (
    "scoreplace.app — " + (items.length === 1 ? "1 novidade" : items.length + " novidades") + "\n\n" +
    items.map((it) => {
      const meta = _digestLevelMeta(it.level);
      return meta.emoji + " " + (it.tournamentName ? "[" + it.tournamentName + "] " : "") + "\n" + it.message + (it.tournamentUrl ? "\n" + it.tournamentUrl : "");
    }).join("\n\n") +
    "\n\nscoreplace.app · Jogue em outro nível"
  );
}

exports.flushNotifEmailDigest = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    // Itens vencidos → descobre quais destinatários têm algo pronto pra sair.
    const dueSnap = await db.collection("notif_email_queue").where("flushAtMs", "<=", now).get();
    if (dueSnap.empty) {
      console.log("[flushNotifEmailDigest] nada vencido");
      return;
    }
    const dueEmails = new Set();
    dueSnap.forEach((d) => { const e = d.data().email; if (e) dueEmails.add(e); });

    let sent = 0;
    for (const email of dueEmails) {
      // Consolida TODOS os itens pendentes dessa pessoa (vencidos ou não).
      const allSnap = await db.collection("notif_email_queue").where("email", "==", email).get();
      const items = [];
      allSnap.forEach((d) => items.push(Object.assign({ _id: d.id }, d.data())));
      if (items.length === 0) continue;
      items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      try {
        const subject = items.length === 1
          ? ("scoreplace.app — " + (items[0].tournamentName || "Notificação"))
          : ("scoreplace.app — " + items.length + " novidades");
        await db.collection("mail").add({
          to: [email],
          replyTo: "scoreplace.app@gmail.com",
          message: { subject, html: _buildDigestHtml(items), text: _buildDigestText(items) },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Limpa os itens consolidados.
        let batch = db.batch();
        let n = 0;
        for (const it of items) {
          batch.delete(db.collection("notif_email_queue").doc(it._id));
          if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
        }
        if (n % 400 !== 0) await batch.commit();
        sent++;
      } catch (err) {
        console.error("[flushNotifEmailDigest] falha pra", email, err);
      }
    }
    console.log("[flushNotifEmailDigest] digests enviados:", sent, "| destinatários vencidos:", dueEmails.size);
  }
);

// ─── Scheduled cleanup: old casual matches ───────────────────────────────────
// Finished casual match docs live in the top-level `casualMatches` collection.
// Each has `status: 'finished'` and `finishedAt` (ISO string) set the moment
// the match wraps up. Detailed per-player stats are persisted separately on
// each user's profile (see _buildAndPersistMatchRecord), so the room doc
// itself is disposable after 30 days. Keeps the collection bounded so the
// per-user `playerUids` array-contains query in getCasualMatchHistory stays
// cheap as the app grows.
exports.cleanupOldCasualMatches = onSchedule(
  {
    // a cada 30min para honrar o TTL de 2h de inatividade em salas ativas
    // (pior caso: sala dissolve até 30min após completar 2h sem pontos).
    schedule: "every 30 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    // (1) Registros finalizados antigos (>30 dias) — garbage collection do histórico.
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const finishedQuery = db.collection("casualMatches")
      .where("status", "==", "finished")
      .where("finishedAt", "<", threshold);
    const deletedFinished = await _batchDeleteQuery(finishedQuery);

    // (2) Salas NÃO finalizadas abandonadas — Firestore não tem `!=`, então
    // varremos a coleção (pequena) e filtramos client-side por status.
    // Regra: finished persiste como registro histórico; todo o resto é efêmero.
    //   • status='active': dissolve se lastActivityAt > 2h (sem pontos marcados).
    //   • status='setup'/'waiting'/outro: dissolve se lastActivityAt > 12h.
    // lastActivityAt é escrito pelo cliente a cada ponto marcado (_syncLiveState).
    // Quando ausente, cai no createdAt/updatedAt como fallback.
    const now = Date.now();
    const cutoff2h  = now - 2  * 60 * 60 * 1000;
    const cutoff12h = now - 12 * 60 * 60 * 1000;
    let deletedStale = 0;
    const allSnap = await db.collection("casualMatches").get();
    let batch = db.batch();
    let inBatch = 0;
    for (const doc of allSnap.docs) {
      const d = doc.data() || {};
      if (d.status === "finished") continue; // registro — nunca apaga aqui
      const tsRaw = d.lastActivityAt || d.updatedAt || d.createdAt || null;
      let ts = 0;
      if (tsRaw) { const p = Number(tsRaw); ts = !isNaN(p) && p > 1e12 ? p : new Date(tsRaw).getTime(); }
      const cutoff = d.status === "active" ? cutoff2h : cutoff12h;
      // Sem timestamp = legado → trata como antigo (apaga).
      if (ts === 0 || ts < cutoff) {
        batch.delete(doc.ref); inBatch++; deletedStale++;
        if (inBatch >= 400) { await batch.commit(); batch = db.batch(); inBatch = 0; }
      }
    }
    if (inBatch > 0) await batch.commit();

    // (3) v2.1.75: limpa ponteiros `activeCasualRoom` PENDURADOS — perfis que
    // apontam pra uma sala que não existe mais (dissolvida acima) ou finalizada.
    // Sem isso, ao abrir o app o usuário era puxado pra uma partida casual morta.
    // Conjunto de roomCodes VIVOS (não-finished) APÓS as deleções acima.
    const liveRooms = new Set();
    const liveSnap = await db.collection("casualMatches").get();
    liveSnap.forEach((doc) => {
      const d = doc.data() || {};
      if (d.roomCode && d.status !== "finished") liveRooms.add(String(d.roomCode).toUpperCase());
    });
    let clearedPointers = 0;
    const usersSnap = await db.collection("users").get();
    let pBatch = db.batch();
    let pIn = 0;
    for (const doc of usersSnap.docs) {
      const acr = (doc.data() || {}).activeCasualRoom;
      if (acr && !liveRooms.has(String(acr).toUpperCase())) {
        pBatch.update(doc.ref, { activeCasualRoom: null });
        pIn++; clearedPointers++;
        if (pIn >= 400) { await pBatch.commit(); pBatch = db.batch(); pIn = 0; }
      }
    }
    if (pIn > 0) await pBatch.commit();

    console.log(`[cleanupOldCasualMatches] finished>30d=${deletedFinished} | active>2h=${deletedStale} | ponteirosLimpos=${clearedPointers}`);
  }
);

// ─── Scheduled cleanup: abandoned Firebase Auth accounts + merged ghosts ─────
//
// Dois tipos de lixo limpos aqui:
//
// TIPO 1 — "Incompletos": contas Auth sem doc Firestore (iniciaram login mas
// nunca completaram o perfil). Regra: criada + último login ambos > 30 dias.
// Por que 30 dias? Alguém pode receber convite de torneio, iniciar o flow e
// demorar semanas pra voltar. 30 dias = definitivamente abandonado.
//
// TIPO 2 — "Ghosts": contas cuja duplicata foi mergeada em outra conta. O doc
// Firestore fica com `mergedInto: <uid_canonico>` como tombstone. Após 7 dias
// do merge o ghost é apagado de Auth E Firestore — sem fantasmas no sistema.
// Por que 7 dias? É tempo suficiente pra qualquer sessão ativa do ghost expirar
// naturalmente. Firebase tokens duram 1h; refresh tokens duram mais, mas após
// o merge a conta não tem mais dados úteis.
//
// Implementação segura:
// - Pagina via listUsers() (1000 por vez)
// - Checa Firestore em lotes de 50
// - Contas com perfil real nunca são tocadas
exports.cleanupAbandonedAuth = onSchedule(
  {
    schedule: "every day 04:15",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    const db = admin.firestore();
    const auth = admin.auth();
    const ABANDONED_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
    const GHOST_THRESHOLD_MS     =  7 * 24 * 60 * 60 * 1000; //  7 dias
    const now = Date.now();
    let totalChecked = 0;
    let deletedAbandoned = 0;
    let deletedGhosts = 0;
    let pageToken = undefined;

    do {
      const listResult = await auth.listUsers(1000, pageToken);
      totalChecked += listResult.users.length;

      // Candidatos a incompletos (> 30 dias, sem login recente)
      const candidates = listResult.users.filter((u) => {
        const createdMs = u.metadata && u.metadata.creationTime
          ? new Date(u.metadata.creationTime).getTime() : 0;
        if (now - createdMs < ABANDONED_THRESHOLD_MS) return false;
        const lastSignInMs = u.metadata && u.metadata.lastSignInTime
          ? new Date(u.metadata.lastSignInTime).getTime() : 0;
        if (now - lastSignInMs < ABANDONED_THRESHOLD_MS) return false;
        return true;
      });

      // Todos os usuários (para detectar ghosts mesmo recentes)
      const allUsers = listResult.users;

      // ── TIPO 1: Incompletos sem Firestore doc ────────────────────────
      for (let i = 0; i < candidates.length; i += 50) {
        const batch = candidates.slice(i, i + 50);
        const refs = batch.map((u) => db.collection("users").doc(u.uid));
        const snaps = await db.getAll(...refs);
        for (let j = 0; j < batch.length; j++) {
          if (!snaps[j].exists) {
            try {
              await auth.deleteUser(batch[j].uid);
              deletedAbandoned++;
              console.log(`[cleanupAbandonedAuth] abandoned: uid=${batch[j].uid} email=${batch[j].email || batch[j].phoneNumber || "(anon)"}`);
            } catch (err) {
              console.warn(`[cleanupAbandonedAuth] failed abandoned uid=${batch[j].uid}:`, err.message);
            }
          }
        }
      }

      // ── TIPO 2: Ghosts com mergedInto ───────────────────────────────
      // Lê os docs Firestore de todos os usuários desta página em lotes de 50
      for (let i = 0; i < allUsers.length; i += 50) {
        const batch = allUsers.slice(i, i + 50);
        const refs = batch.map((u) => db.collection("users").doc(u.uid));
        const snaps = await db.getAll(...refs);
        for (let j = 0; j < batch.length; j++) {
          if (!snaps[j].exists) continue; // incompleto — já tratado acima
          const data = snaps[j].data() || {};
          if (!data.mergedInto) continue; // conta real — não tocar
          // É um ghost. Checar quando foi mergeado (campo createdAt ou updatedAt)
          const mergedAtStr = data.updatedAt || data.createdAt || "";
          const mergedMs = mergedAtStr ? new Date(mergedAtStr).getTime() : 0;
          if (mergedMs && (now - mergedMs) < GHOST_THRESHOLD_MS) continue; // recente, aguardar
          // Ghost velho o suficiente → apagar Auth + Firestore
          try {
            await auth.deleteUser(batch[j].uid);
          } catch (err) {
            if (err.code !== "auth/user-not-found") {
              console.warn(`[cleanupAbandonedAuth] failed ghost auth uid=${batch[j].uid}:`, err.message);
              continue;
            }
          }
          try {
            await snaps[j].ref.delete();
          } catch (err) {
            console.warn(`[cleanupAbandonedAuth] failed ghost fs uid=${batch[j].uid}:`, err.message);
          }
          deletedGhosts++;
          console.log(`[cleanupAbandonedAuth] ghost: uid=${batch[j].uid} mergedInto=${data.mergedInto}`);
        }
      }

      pageToken = listResult.pageToken;
    } while (pageToken);

    console.log(`[cleanupAbandonedAuth] checked=${totalChecked} abandoned=${deletedAbandoned} ghosts=${deletedGhosts}`);
  }
);

// ─── Scheduled cleanup: expired magic link wrappers ──────────────────────────
// v1.0.34-beta: docs em magicLinks/{token} guardam o firebaseLink resolvido
// pelo wrapper-URL no clique do email. Cada doc tem expiresAt = createdAt+90min
// (oobCode em si expira em 1h via Firebase). Sem cleanup, a coleção cresce
// 1 doc por magic link request. Roda 3x ao dia (04:30, 12:30, 20:30 BRT) pra
// manter a coleção pequena — cada execução remove docs com expiresAt < now.
exports.cleanupOldMagicLinks = onSchedule(
  {
    schedule: "every day 04:30",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    // expiresAt foi salvo como JS Date (Timestamp no Firestore). Comparação
    // direta com new Date() funciona via Timestamp.fromDate equivalência.
    const now = new Date();
    const query = db.collection("magicLinks").where("expiresAt", "<", now);
    const deleted = await _batchDeleteQuery(query);
    // v2.4.24: limpa também os tokens/códigos expirados da autenticação por
    // celular no gate (gateTokens/{token} e gateVerifications/{uid}).
    const delGateTokens = await _batchDeleteQuery(
      db.collection("gateTokens").where("expiresAt", "<", now));
    const delGateVerif = await _batchDeleteQuery(
      db.collection("gateVerifications").where("expiresAt", "<", now));
    console.log(`[cleanupOldMagicLinks] deleted magicLinks=${deleted} gateTokens=${delGateTokens} gateVerifications=${delGateVerif} (threshold: ${now.toISOString()})`);
  }
);

// ─── Scheduled backup: full Firestore export to Cloud Storage ───────────────
// Roda diariamente às 04:00 BRT (depois dos cleanups) e dispara um export
// nativo do Firestore pra um bucket Cloud Storage. Bucket tem lifecycle rule
// que auto-deleta exports com mais de 30 dias.
//
// ⚠️ PRÉ-REQUISITOS pra ativar (one-time, fora do código):
//
// 1. Criar bucket dedicado pra backups (Cloud Console ou gcloud):
//      gcloud storage buckets create gs://scoreplace-firestore-backup \
//        --project=scoreplace-app \
//        --location=southamerica-east1 \
//        --uniform-bucket-level-access
//
// 2. Configurar lifecycle pra auto-delete após 30 dias:
//      cat > /tmp/lifecycle.json << 'JSON'
//      {"lifecycle":{"rule":[{"action":{"type":"Delete"},"condition":{"age":30}}]}}
//      JSON
//      gcloud storage buckets update gs://scoreplace-firestore-backup \
//        --lifecycle-file=/tmp/lifecycle.json
//
// 3. Conceder à service account das Functions a role
//    `Cloud Datastore Import Export Admin` E `Storage Admin` no bucket:
//      SA="$(gcloud projects describe scoreplace-app --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
//      gcloud projects add-iam-policy-binding scoreplace-app \
//        --member="serviceAccount:$SA" \
//        --role="roles/datastore.importExportAdmin"
//      gcloud storage buckets add-iam-policy-binding \
//        gs://scoreplace-firestore-backup \
//        --member="serviceAccount:$SA" \
//        --role="roles/storage.admin"
//
// 4. Deploy:  firebase deploy --only functions:backupFirestore
//
// Depois do primeiro run, conferir no Cloud Console > Storage > o bucket
// que tem subpastas tipo `2026-04-29T04-00-00/` com `metadata` e `output-N`.
// Restore (manual em desastre):
//      gcloud firestore import gs://scoreplace-firestore-backup/<DATA>
//
// Doc completa: docs/backup.md
exports.backupFirestore = onSchedule(
  {
    schedule: "every day 04:00",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1", // mesma region do bucket pra evitar egress
    timeoutSeconds: 540, // 9 min — export é assíncrono, só dispara o job
    memory: "256MiB",
    retryConfig: { retryCount: 1 },
  },
  async () => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "scoreplace-app";
    const bucketName = "scoreplace-firestore-backup";
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outputUriPrefix = `gs://${bucketName}/${ts}`;

    // Usa @google-cloud/firestore-admin via Admin SDK ou direct REST.
    // SDK mais limpo:
    const { FirestoreAdminClient } = require("@google-cloud/firestore").v1;
    const client = new FirestoreAdminClient();
    const databaseName = client.databasePath(projectId, "(default)");

    console.log(`[backupFirestore] disparando export pra ${outputUriPrefix}`);

    try {
      const [operation] = await client.exportDocuments({
        name: databaseName,
        outputUriPrefix: outputUriPrefix,
        collectionIds: [], // vazio = export tudo (alpha tem ~9 collections)
      });
      console.log(`[backupFirestore] operation iniciada:`, operation.name);
      // Não bloqueia esperando — export pode levar minutos. O Cloud Operations
      // log mostra progresso. Retorna sucesso assim que o job foi disparado.
    } catch (err) {
      console.error(`[backupFirestore] falha ao disparar export:`, err);
      throw err; // marca a função como falha pro retry kick in
    }
  }
);

// ─── Magic Link via Custom Email (firestore-send-email extension) ────────────
// v1.0.20-beta: substituí firebase.auth().sendSignInLinkToEmail() (que envia
// email feio do firebaseapp.com sem botão estilizado, parando no spam) por
// fluxo custom — gera o link via Admin SDK e enfileira email rico HTML com
// botão grande na collection `mail/` (a extension firestore-send-email envia).
//
// Bug reportado: "magic link continua indo pra spam e sem destaque num botão
// pra clicar". Os emails de notificação do app (criados pelo client via
// FirestoreDB.queueEmail → extension) já têm botões CTA estilizados —
// agora magic link segue o mesmo padrão.
//
// Deploy:  firebase deploy --only functions:sendMagicLink
exports.sendMagicLink = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    const email = (request.data && request.data.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "email inválido");
    }

    // Gera o link assinado oficial do Firebase. O frontend depois usará
    // `signInWithEmailLink(email, link)` pra completar — mesmo flow do
    // legacy.
    const actionCodeSettings = {
      url: `https://scoreplace.app/?eml=${encodeURIComponent(email)}#dashboard`,
      handleCodeInApp: true,
    };

    let firebaseLink;
    try {
      firebaseLink = await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings);
    } catch (err) {
      console.error("[sendMagicLink] generateSignInWithEmailLink falhou:", err);
      throw new HttpsError("internal", "não foi possível gerar o link: " + (err.code || err.message));
    }

    // v1.0.30-beta: WRAPPER URL pra evitar prefetch consumindo o oobCode.
    // Bug reportado: usuários recebendo o email e clicando, mas vendo "link
    // expirado" porque algum scanner anti-phishing (Gmail/Outlook/corp
    // security) prefetcha o link pra checar e consume o oobCode antes do
    // humano clicar. Firebase oobCode é one-time-use → quem chega antes
    // ganha. Solução: o email aponta pra https://scoreplace.app/?ml=TOKEN
    // (URL nossa, prefetch não consome nada server-side); só quando o
    // browser real do humano carrega a página, o JS busca o firebaseLink
    // do Firestore e redireciona. Scanners fazem GET/HEAD da nossa URL,
    // não executam JS, então nunca alcançam o oobCode.
    const crypto = require("crypto");
    const token = crypto.randomBytes(18).toString("base64url");
    try {
      await admin.firestore().collection("magicLinks").doc(token).set({
        firebaseLink: firebaseLink,
        email: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // expiresAt é só pra cleanup eventual — o oobCode em si tem expiry
        // próprio do Firebase (1h).
        expiresAt: new Date(Date.now() + 90 * 60 * 1000),
      });
    } catch (err) {
      console.error("[sendMagicLink] falha ao salvar magicLinks/" + token, err);
      throw new HttpsError("internal", "não foi possível registrar o link: " + (err.code || err.message));
    }
    const wrapperUrl = "https://scoreplace.app/?ml=" + encodeURIComponent(token);
    // Nome `link` mantido nas referências do HTML pra não mexer no template.
    const link = wrapperUrl;

    // HTML do email — botão grande âmbar, sem padrão "promocional" pra
    // reduzir spam classification. Header escuro + branding scoreplace.app +
    // CTA dominante + texto explicativo em copy direto.
    const html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
      '<title>Entrar no scoreplace.app</title></head>' +
      '<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0f172a;padding:40px 16px;">' +
          '<tr><td align="center">' +
            '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:520px;background:#111827;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
              // Header discreto — branding sem cor de destaque (só o botão
              // CTA recebe o âmbar pra não competir visualmente)
              '<tr><td style="padding:20px 32px 4px;text-align:center;">' +
                '<div style="font-size:1.4rem;line-height:1;margin-bottom:2px;">🎾</div>' +
                '<div style="font-size:0.92rem;font-weight:700;color:#fbbf24;letter-spacing:0.2px;">scoreplace.app</div>' +
              '</td></tr>' +
              // CTA primeiro — frase curta + botão grande, antes de qualquer
              // outra coisa. Pedido do user: "coloque o botao de entrar acima
              // de tudo só com a frase clico no botao para entrar acima dele".
              '<tr><td style="padding:24px 32px 8px;text-align:center;color:#e5e7eb;">' +
                '<p style="margin:0 0 16px;font-size:1rem;font-weight:600;color:#fff;">Clique no botão para entrar:</p>' +
                // Botão grande — table-based pra render consistente em Gmail/Outlook/Apple
                '<table cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">' +
                  '<tr><td style="background:#f59e0b;background:linear-gradient(180deg,#fcd34d 0%,#f59e0b 60%,#d97706 100%);border-bottom:4px solid #b45309;border-radius:12px;box-shadow:0 4px 12px rgba(245,158,11,0.35);">' +
                    '<a href="' + link.replace(/"/g, '&quot;') + '" style="display:inline-block;padding:18px 48px;color:#3a2300;text-decoration:none;font-weight:800;font-size:1.05rem;letter-spacing:0.3px;text-shadow:0 1px 0 rgba(255,255,255,0.3);">' +
                      '🎾 Entrar no scoreplace.app' +
                    '</a>' +
                  '</td></tr>' +
                '</table>' +
              '</td></tr>' +
              // Detalhes secundários — só depois do CTA principal
              '<tr><td style="padding:20px 32px 28px;color:#cbd5e1;">' +
                '<p style="margin:0 0 16px;font-size:0.84rem;line-height:1.55;color:#94a3b8;text-align:center;">' +
                  'O link expira em 1 hora e só funciona uma vez.' +
                '</p>' +
                // Fallback link em texto (alguns clientes não renderizam o botão)
                '<p style="margin:16px 0 0;font-size:0.76rem;color:#94a3b8;line-height:1.5;border-top:1px solid #374151;padding-top:16px;">' +
                  'Não consegue clicar no botão? Copie e cole este endereço no navegador:<br>' +
                  '<span style="color:#cbd5e1;word-break:break-all;font-family:monospace;font-size:0.7rem;">' + link.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>' +
                '</p>' +
                '<p style="margin:16px 0 0;font-size:0.74rem;color:#94a3b8;line-height:1.5;">' +
                  'Não foi você? Pode ignorar — o link expira sozinho. ' +
                  'Se receber muitos desses sem ter pedido, contate <a href="mailto:scoreplace.app@gmail.com" style="color:#fbbf24;">scoreplace.app@gmail.com</a>.' +
                '</p>' +
              '</td></tr>' +
              // Footer minimalista
              '<tr><td style="padding:14px 32px;text-align:center;background:#0f172a;border-top:1px solid #1e293b;">' +
                '<p style="margin:0;font-size:0.7rem;color:#64748b;">scoreplace.app · Jogue em outro nível · ' + new Date().getFullYear() + '</p>' +
              '</td></tr>' +
            '</table>' +
          '</td></tr>' +
        '</table>' +
      '</body></html>';

    // Versão texto puro — filtros de spam penalizam HTML-only. Alternativa
    // plain/text garante que qualquer cliente de e-mail renderize algo e
    // melhora o spam score.
    const textBody =
      "scoreplace.app — seu link de acesso\n\n" +
      "Acesse o app clicando no link abaixo (ou copie e cole no navegador):\n\n" +
      link + "\n\n" +
      "O link expira em 1 hora e só funciona uma vez.\n\n" +
      "Não foi você? Pode ignorar — o link expira sozinho.\n" +
      "Dúvidas: scoreplace.app@gmail.com\n\n" +
      "scoreplace.app · Jogue em outro nível";

    // Enfileira na mail/ collection — extension firestore-send-email pega
    // e envia via SMTP configurado (scoreplace.app@gmail.com nesse momento).
    // v1.3.82-beta: subject menos "phishing-like" + text/plain alternativo
    // pra melhorar deliverability (emails HTML-only têm score de spam maior).
    try {
      await admin.firestore().collection("mail").add({
        to: [email],
        replyTo: "scoreplace.app@gmail.com",
        message: {
          subject: "scoreplace.app — seu link de acesso",
          html: html,
          text: textBody,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log("[sendMagicLink] queued for", email);
      return { ok: true };
    } catch (err) {
      console.error("[sendMagicLink] falha ao enfileirar email:", err);
      throw new HttpsError("internal", "não foi possível enfileirar o email: " + (err.code || err.message));
    }
  }
);

// ─── sendVerificationEmail (v1.9.83) ────────────────────────────────────────
// Substitui o e-mail de verificação PADRÃO do Firebase (remetente
// noreply@scoreplace-app.firebaseapp.com, que cai no spam e é só um link cru)
// por um e-mail RICO com botão CTA, enviado pelo nosso SMTP
// (scoreplace.app@gmail.com via extension firestore-send-email). Gera o link
// oficial de verificação via Admin SDK generateEmailVerificationLink().
//
// Deploy:  firebase deploy --only functions:sendVerificationEmail
//
// v2.1.79: o endpoint generateEmailVerificationLink do Auth tem JANELAS de
// indisponibilidade transitória (~10s) maiores que a janela de retry antiga
// (~4,2s). Caso real (logs 2026-06-06 13:23:52→13:24:02): 5+ invocações
// concorrentes de contas DIFERENTES falharam todas com auth/internal-error na
// mesma janela de ~10s, e minutos depois voltou a funcionar. Como o gate de
// verificação é obrigatório, o usuário ficava PRESO sem e-mail. Fix em 2 camadas:
//   (1) janela de retry in-request alargada p/ ~13,5s (_genVerificationLink);
//   (2) na falha final NÃO joga erro — enfileira em pendingEmailVerifications,
//       que drainPendingVerifications drena assim que o Auth volta (≤2 min).

// Gera o link oficial de verificação com retry (cobre soluço transitório do
// backend do Auth). Retorna o link ou null se falhar todas as tentativas.
async function _genVerificationLink(email) {
  const actionCodeSettings = { url: "https://scoreplace.app/", handleCodeInApp: false };
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
    } catch (err) {
      console.error("[verifyLink] tentativa " + attempt + "/6 falhou:",
        (err && (err.code || err.message)) || err);
      if (attempt < 6) await new Promise((r) => setTimeout(r, attempt * 900));
    }
  }
  return null;
}

// Monta o HTML + texto do e-mail RICO de confirmação de conta.
function _buildVerificationEmailContent(link, name) {
  const greetName = name ? (", " + name) : "";
  const safeGreet = greetName.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const safeLinkAttr = link.replace(/"/g, "&quot;");
  const safeLinkText = link.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
    '<title>Confirme seu e-mail — scoreplace.app</title></head>' +
    '<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0f172a;padding:40px 16px;">' +
        '<tr><td align="center">' +
          '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:520px;background:#111827;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
            '<tr><td style="padding:20px 32px 4px;text-align:center;">' +
              '<div style="font-size:1.4rem;line-height:1;margin-bottom:2px;">🎾</div>' +
              '<div style="font-size:0.92rem;font-weight:700;color:#fbbf24;letter-spacing:0.2px;">scoreplace.app</div>' +
            '</td></tr>' +
            '<tr><td style="padding:24px 32px 8px;text-align:center;color:#e5e7eb;">' +
              '<p style="margin:0 0 6px;font-size:1.05rem;font-weight:700;color:#fff;">Bem-vindo' + safeGreet + '! 🎉</p>' +
              '<p style="margin:0 0 18px;font-size:0.92rem;color:#cbd5e1;">Falta só confirmar seu e-mail pra começar.</p>' +
              '<table cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">' +
                '<tr><td style="background:#10b981;background:linear-gradient(180deg,#34d399 0%,#10b981 55%,#059669 100%);border-top:2px solid #6ee7b7;border-bottom:5px solid #047857;border-radius:12px;box-shadow:0 6px 14px rgba(5,150,105,0.4);">' +
                  '<a href="' + safeLinkAttr + '" style="display:inline-block;padding:16px 44px;color:#ffffff;text-decoration:none;font-weight:800;font-size:1.05rem;letter-spacing:0.3px;text-shadow:0 -1px 0 rgba(0,0,0,0.25);">' +
                    '✅ Confirmar minha conta' +
                  '</a>' +
                '</td></tr>' +
              '</table>' +
            '</td></tr>' +
            '<tr><td style="padding:20px 32px 28px;color:#cbd5e1;">' +
              '<p style="margin:0 0 16px;font-size:0.84rem;line-height:1.55;color:#94a3b8;text-align:center;">' +
                'Depois de confirmar, volte ao app e clique em <b style="color:#cbd5e1;">"Já confirmei"</b>.' +
              '</p>' +
              '<p style="margin:16px 0 0;font-size:0.76rem;color:#94a3b8;line-height:1.5;border-top:1px solid #374151;padding-top:16px;">' +
                'Não consegue clicar no botão? Copie e cole este endereço no navegador:<br>' +
                '<span style="color:#cbd5e1;word-break:break-all;font-family:monospace;font-size:0.7rem;">' + safeLinkText + '</span>' +
              '</p>' +
              '<p style="margin:16px 0 0;font-size:0.74rem;color:#94a3b8;line-height:1.5;">' +
                'Não criou essa conta? Pode ignorar este e-mail. ' +
                'Dúvidas: <a href="mailto:scoreplace.app@gmail.com" style="color:#fbbf24;">scoreplace.app@gmail.com</a>.' +
              '</p>' +
            '</td></tr>' +
            '<tr><td style="padding:14px 32px;text-align:center;background:#0f172a;border-top:1px solid #1e293b;">' +
              '<p style="margin:0;font-size:0.7rem;color:#64748b;">scoreplace.app · Jogue em outro nível · ' + new Date().getFullYear() + '</p>' +
            '</td></tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +
    '</body></html>';
  const text =
    "scoreplace.app — confirme seu e-mail\n\n" +
    "Bem-vindo" + (name ? (", " + name) : "") + "! Falta confirmar seu e-mail.\n\n" +
    "Confirme clicando no link abaixo (ou copie e cole no navegador):\n\n" +
    link + "\n\n" +
    "Depois de confirmar, volte ao app e clique em \"Já confirmei\".\n\n" +
    "Não criou essa conta? Pode ignorar este e-mail.\n" +
    "Dúvidas: scoreplace.app@gmail.com\n\n" +
    "scoreplace.app · Jogue em outro nível";
  return { html, text };
}

// Enfileira o e-mail rico de verificação na coleção mail/ (SMTP via extensão
// firestore-send-email). Lança se o add falhar.
async function _queueVerificationEmail(db, email, link, name) {
  const { html, text } = _buildVerificationEmailContent(link, name);
  await db.collection("mail").add({
    to: [email],
    replyTo: "scoreplace.app@gmail.com",
    message: {
      subject: "Confirme seu e-mail no scoreplace.app",
      html: html,
      text: text,
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

exports.sendVerificationEmail = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    const email = (request.data && request.data.email || "").trim().toLowerCase();
    const name = (request.data && request.data.name || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "email inválido");
    }

    const db = admin.firestore();
    // Tenta gerar o link AGORA (retry ~13,5s cobre a maioria dos soluços).
    const link = await _genVerificationLink(email);
    if (link) {
      try {
        await _queueVerificationEmail(db, email, link, name);
        console.log("[sendVerificationEmail] queued for", email);
        return { ok: true };
      } catch (err) {
        console.error("[sendVerificationEmail] falha ao enfileirar email:", err);
        throw new HttpsError("internal", "não foi possível enfileirar o email: " + (err.code || err.message));
      }
    }
    // v2.1.79: link indisponível (janela de outage do Auth > retry). Em vez de
    // jogar erro e deixar o usuário PRESO no gate sem e-mail, enfileira um pedido
    // pendente que drainPendingVerifications drena assim que o Auth volta (≤2 min).
    // Dedup por e-mail pra não acumular pendentes/duplicar envio.
    try {
      const dup = await db.collection("pendingEmailVerifications")
        .where("email", "==", email).where("status", "==", "pending").limit(1).get();
      if (dup.empty) {
        await db.collection("pendingEmailVerifications").add({
          email: email,
          name: name || "",
          status: "pending",
          attempts: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("[sendVerificationEmail] falha ao enfileirar pendente:", e);
    }
    console.warn("[sendVerificationEmail] generateEmailVerificationLink indisponível; deferido p/ fila:", email);
    return { ok: true, deferred: true };
  }
);

// ─── drainPendingVerifications (v2.1.79) ─────────────────────────────────────
// Drena a fila pendingEmailVerifications: re-tenta gerar o link de verificação
// (que falhou na hora por outage transitório do Auth) e enfileira o e-mail rico
// assim que o backend volta. Roda a cada 2 min → entrega garantida sem deixar o
// usuário preso no gate. GC de docs sent/failed com >2 dias.
exports.drainPendingVerifications = onSchedule(
  {
    schedule: "every 2 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection("pendingEmailVerifications")
      .where("status", "==", "pending").limit(50).get();
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const email = (d.email || "").trim().toLowerCase();
      if (!email) { await doc.ref.update({ status: "failed", reason: "no-email" }); continue; }
      const link = await _genVerificationLink(email);
      if (link) {
        try {
          await _queueVerificationEmail(db, email, link, d.name || "");
          await doc.ref.update({ status: "sent", sentAt: admin.firestore.FieldValue.serverTimestamp() });
          console.log("[drainPendingVerifications] enviado:", email);
        } catch (e) {
          await doc.ref.update({ attempts: (d.attempts || 0) + 1, lastError: (e.code || e.message || "queue-fail") });
        }
      } else {
        const attempts = (d.attempts || 0) + 1;
        const upd = { attempts: attempts };
        // 15 tentativas (~30 min de outage) sem sucesso → desiste e marca falha.
        if (attempts >= 15) { upd.status = "failed"; upd.reason = "auth-internal-error-persistente"; }
        await doc.ref.update(upd);
      }
    }
    // GC: remove sent/failed antigos (>2 dias).
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oldSnap = await db.collection("pendingEmailVerifications")
      .where("status", "in", ["sent", "failed"]).get();
    let batch = db.batch();
    let n = 0;
    for (const doc of oldSnap.docs) {
      const ca = doc.get("createdAt");
      const t = ca && ca.toDate ? ca.toDate() : null;
      if (!t || t < cutoff) {
        batch.delete(doc.ref); n++;
        if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
      }
    }
    if (n > 0) await batch.commit();
  }
);

// ─── sendPasswordReset (v2.1.78) ─────────────────────────────────────────────
// Reset de senha enviado pelo NOSSO SMTP (extensão firestore-send-email) em vez
// do remetente padrão do Firebase (noreply@…firebaseapp.com), que Hotmail/Outlook
// jogam no spam/bloqueiam. Caso real: Marisa Roriz (hotmail) nunca recebia o reset.
// Também cobre ex-usuários do magic link (provider 'password' SEM senha setada):
// generatePasswordResetLink gera o link e clicar permite DEFINIR a senha.
//
// Deploy:  firebase deploy --only functions:sendPasswordReset
//
// v2.1.82: MESMA blindagem da verificação de e-mail (SCOREPLACE-WEB-22).
// generatePasswordResetLink sofre o mesmo outage transitório (~10s) do Auth —
// caso real (logs 2026-06-06 15:57 e 16:03): 4 tentativas falharam com
// auth/internal-error e a função jogava erro → e-mail de reset NUNCA saía
// (usuária Vero sem receber). Fix: retry alargado (~13,5s) + na falha de outage
// enfileira em pendingPasswordResets, drenado por drainPendingPasswordResets.

// Gera o link de reset com retry. Retorna: o link (sucesso), "USER_NOT_FOUND"
// (conta não existe — silencioso por enumeração) ou null (outage após retries).
async function _genPasswordResetLink(email) {
  const acs = { url: "https://scoreplace.app/", handleCodeInApp: false };
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      return await admin.auth().generatePasswordResetLink(email, acs);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") return "USER_NOT_FOUND";
      console.error("[resetLink] tentativa " + attempt + "/6 falhou:",
        (err && (err.code || err.message)) || err);
      if (attempt < 6) await new Promise((r) => setTimeout(r, attempt * 900));
    }
  }
  return null;
}

// Monta o HTML + texto do e-mail de redefinição de senha.
function _buildPasswordResetEmail(link, name) {
  const greetName = name ? (", " + name.replace(/&/g, "&amp;").replace(/</g, "&lt;")) : "";
  const html =
      '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1.0">' +
      '<title>Redefinir senha — scoreplace.app</title></head>' +
      '<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#0f172a;padding:40px 16px;">' +
          '<tr><td align="center">' +
            '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:520px;background:#111827;border-radius:14px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
              '<tr><td style="padding:20px 32px 4px;text-align:center;">' +
                '<div style="font-size:1.4rem;line-height:1;margin-bottom:2px;">🎾</div>' +
                '<div style="font-size:0.92rem;font-weight:700;color:#fbbf24;letter-spacing:0.2px;">scoreplace.app</div>' +
              '</td></tr>' +
              '<tr><td style="padding:24px 32px 8px;text-align:center;color:#e5e7eb;">' +
                '<p style="margin:0 0 6px;font-size:1.05rem;font-weight:700;color:#fff;">Redefinir sua senha 🔑</p>' +
                '<p style="margin:0 0 18px;font-size:0.92rem;color:#cbd5e1;">Olá' + greetName + '! Clique no botão para criar uma nova senha de acesso.</p>' +
                '<table cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">' +
                  '<tr><td style="background:#2563eb;background:linear-gradient(180deg,#60a5fa 0%,#3b82f6 55%,#2563eb 100%);border-bottom:4px solid #1d4ed8;border-radius:12px;box-shadow:0 4px 12px rgba(37,99,235,0.35);">' +
                    '<a href="' + link.replace(/"/g, "&quot;") + '" style="display:inline-block;padding:18px 44px;color:#ffffff;text-decoration:none;font-weight:800;font-size:1.05rem;letter-spacing:0.3px;text-shadow:0 1px 1px rgba(0,0,0,0.22);">' +
                      '🔑 Criar nova senha' +
                    '</a>' +
                  '</td></tr>' +
                '</table>' +
              '</td></tr>' +
              '<tr><td style="padding:20px 32px 28px;color:#cbd5e1;">' +
                '<p style="margin:0 0 16px;font-size:0.84rem;line-height:1.55;color:#94a3b8;text-align:center;">' +
                  'O link vale por 1 hora. Depois de definir a senha, é só entrar com seu e-mail e a nova senha.' +
                '</p>' +
                '<p style="margin:16px 0 0;font-size:0.76rem;color:#94a3b8;line-height:1.5;border-top:1px solid #374151;padding-top:16px;">' +
                  'Não consegue clicar no botão? Copie e cole este endereço no navegador:<br>' +
                  '<span style="color:#cbd5e1;word-break:break-all;font-family:monospace;font-size:0.7rem;">' + link.replace(/&/g, "&amp;").replace(/</g, "&lt;") + '</span>' +
                '</p>' +
                '<p style="margin:16px 0 0;font-size:0.74rem;color:#94a3b8;line-height:1.5;">' +
                  'Não pediu pra redefinir a senha? Pode ignorar este e-mail — sua senha continua a mesma. ' +
                  'Dúvidas: <a href="mailto:scoreplace.app@gmail.com" style="color:#fbbf24;">scoreplace.app@gmail.com</a>.' +
                '</p>' +
              '</td></tr>' +
              '<tr><td style="padding:14px 32px;text-align:center;background:#0f172a;border-top:1px solid #1e293b;">' +
                '<p style="margin:0;font-size:0.7rem;color:#64748b;">scoreplace.app · Jogue em outro nível · ' + new Date().getFullYear() + '</p>' +
              '</td></tr>' +
            '</table>' +
          '</td></tr>' +
        '</table>' +
      '</body></html>';

    const textBody =
      "scoreplace.app — redefinir senha\n\n" +
      "Olá" + (name ? (", " + name) : "") + "! Recebemos um pedido para redefinir sua senha.\n\n" +
      "Crie uma nova senha clicando no link abaixo (ou copie e cole no navegador):\n\n" +
      link + "\n\n" +
      "O link vale por 1 hora.\n\n" +
      "Não pediu isso? Pode ignorar este e-mail — sua senha continua a mesma.\n" +
      "Dúvidas: scoreplace.app@gmail.com\n\n" +
      "scoreplace.app · Jogue em outro nível";

    return { html: html, text: textBody };
}

// Enfileira o e-mail de redefinição de senha na coleção mail/ (SMTP). Lança se falhar.
async function _queuePasswordResetEmail(db, email, link, name) {
  const built = _buildPasswordResetEmail(link, name);
  await db.collection("mail").add({
    to: [email],
    replyTo: "scoreplace.app@gmail.com",
    message: {
      subject: "Redefinir sua senha no scoreplace.app",
      html: built.html,
      text: built.text,
      // v2.5.x: List-Unsubscribe melhora reputação no Gmail/Outlook (sinal de
      // remetente legítimo). A parte text/plain já existe (built.text).
      headers: { "List-Unsubscribe": "<mailto:scoreplace.app@gmail.com?subject=Unsubscribe>" },
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

exports.sendPasswordReset = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    const email = (request.data && request.data.email || "").trim().toLowerCase();
    const name = (request.data && request.data.name || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "email inválido");
    }

    const db = admin.firestore();
    const linkResult = await _genPasswordResetLink(email);
    if (linkResult === "USER_NOT_FOUND") return { ok: true }; // silencioso (enumeração)
    if (linkResult) {
      try {
        await _queuePasswordResetEmail(db, email, linkResult, name);
        console.log("[sendPasswordReset] queued for", email);
        return { ok: true };
      } catch (err) {
        console.error("[sendPasswordReset] falha ao enfileirar email:", err);
        throw new HttpsError("internal", "não foi possível enfileirar o email: " + (err.code || err.message));
      }
    }
    // v2.1.82: link indisponível (outage do Auth > retry). Em vez de jogar erro
    // (e o usuário nunca receber o reset), enfileira pendente — drenado em ≤2 min.
    try {
      const dup = await db.collection("pendingPasswordResets")
        .where("email", "==", email).where("status", "==", "pending").limit(1).get();
      if (dup.empty) {
        await db.collection("pendingPasswordResets").add({
          email: email,
          name: name || "",
          status: "pending",
          attempts: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("[sendPasswordReset] falha ao enfileirar pendente:", e);
    }
    console.warn("[sendPasswordReset] generatePasswordResetLink indisponível; deferido p/ fila:", email);
    return { ok: true, deferred: true };
  }
);

// ─── drainPendingPasswordResets (v2.1.82) ────────────────────────────────────
// Drena pendingPasswordResets: re-tenta gerar o link de reset (que falhou na hora
// por outage do Auth) e enfileira o e-mail assim que o backend volta. A cada 2 min.
exports.drainPendingPasswordResets = onSchedule(
  {
    schedule: "every 2 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    const snap = await db.collection("pendingPasswordResets")
      .where("status", "==", "pending").limit(50).get();
    for (const doc of snap.docs) {
      const d = doc.data() || {};
      const email = (d.email || "").trim().toLowerCase();
      if (!email) { await doc.ref.update({ status: "failed", reason: "no-email" }); continue; }
      const linkResult = await _genPasswordResetLink(email);
      if (linkResult === "USER_NOT_FOUND") {
        // Conta sumiu/não existe — encerra silenciosamente (sem e-mail).
        await doc.ref.update({ status: "sent", reason: "user-not-found", sentAt: admin.firestore.FieldValue.serverTimestamp() });
      } else if (linkResult) {
        try {
          await _queuePasswordResetEmail(db, email, linkResult, d.name || "");
          await doc.ref.update({ status: "sent", sentAt: admin.firestore.FieldValue.serverTimestamp() });
          console.log("[drainPendingPasswordResets] enviado:", email);
        } catch (e) {
          await doc.ref.update({ attempts: (d.attempts || 0) + 1, lastError: (e.code || e.message || "queue-fail") });
        }
      } else {
        const attempts = (d.attempts || 0) + 1;
        const upd = { attempts: attempts };
        if (attempts >= 15) { upd.status = "failed"; upd.reason = "auth-internal-error-persistente"; }
        await doc.ref.update(upd);
      }
    }
    // GC: remove sent/failed antigos (>2 dias).
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const oldSnap = await db.collection("pendingPasswordResets")
      .where("status", "in", ["sent", "failed"]).get();
    let batch = db.batch();
    let n = 0;
    for (const doc of oldSnap.docs) {
      const ca = doc.get("createdAt");
      const t = ca && ca.toDate ? ca.toDate() : null;
      if (!t || t < cutoff) {
        batch.delete(doc.ref); n++;
        if (n >= 400) { await batch.commit(); batch = db.batch(); n = 0; }
      }
    }
    if (n > 0) await batch.commit();
  }
);

// ─── setParticipantsGender (v2.1.20) ─────────────────────────────────────────
// O organizador de um torneio atribui o gênero de inscritos que estavam SEM
// gênero. As regras do Firestore só deixam a pessoa editar o próprio perfil, então
// essa escrita em users/{uid} de OUTRA pessoa passa por aqui (Admin SDK ignora
// rules). Verifica: caller é organizador/co-host do torneio, o alvo NÃO tinha
// gênero ainda (não sobrescreve quem já declarou) e o valor é masculino/feminino.
// Deploy:  firebase deploy --only functions:setParticipantsGender
exports.setParticipantsGender = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const assignments = (request.data && request.data.assignments) || [];
    if (!tournamentId || !Array.isArray(assignments) || assignments.length === 0) {
      throw new HttpsError("invalid-argument", "tournamentId e assignments são obrigatórios");
    }

    const db = admin.firestore();
    const tSnap = await db.collection("tournaments").doc(tournamentId).get();
    if (!tSnap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = tSnap.data();
    const adminEmails = Array.isArray(t.adminEmails) ? t.adminEmails.map((e) => String(e).toLowerCase()) : [];
    const isOrg = (t.creatorUid && t.creatorUid === callerUid) ||
      (t.creatorEmail && String(t.creatorEmail).toLowerCase() === callerEmail) ||
      (t.organizerEmail && String(t.organizerEmail).toLowerCase() === callerEmail) ||
      (callerEmail && adminEmails.indexOf(callerEmail) !== -1);
    if (!isOrg) throw new HttpsError("permission-denied", "só o organizador pode atribuir gênero");

    let written = 0; const skipped = [];
    for (const a of assignments) {
      const uid = a && a.uid ? String(a.uid) : "";
      const g = a && a.gender ? String(a.gender) : "";
      if (!uid || (g !== "masculino" && g !== "feminino")) { skipped.push({ uid, reason: "invalid" }); continue; }
      const ref = db.collection("users").doc(uid);
      const snap = await ref.get();
      if (!snap.exists) { skipped.push({ uid, reason: "no-user" }); continue; }
      const cur = snap.data().gender;
      if (cur && String(cur).trim()) { skipped.push({ uid, reason: "already-set" }); continue; }
      await ref.update({ gender: g, genderSetBy: callerUid, genderSetAt: admin.firestore.FieldValue.serverTimestamp() });
      written++;
    }
    console.log("[setParticipantsGender] torneio", tournamentId, "gravados:", written, "pulados:", skipped.length);
    return { ok: true, written, skipped };
  }
);

// ─── setParticipantsProfile (v2.1.46) ────────────────────────────────────────
// O organizador, pela Análise de Inscritos, atribui GÊNERO e CATEGORIA (skill por
// modalidade) aos participantes. Diferente de setParticipantsGender (que só grava
// se vazio), aqui SOBRESCREVE o perfil global em users/{uid} — o organizador está
// atribuindo, e o jogador pode reajustar depois no próprio perfil. Verifica que o
// caller é organizador/co-host. Admin SDK ignora as rules (escrita em perfil alheio).
// Deploy:  firebase deploy --only functions:setParticipantsProfile
exports.setParticipantsProfile = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const sport = String((request.data && request.data.sport) || "").trim();
    const assignments = (request.data && request.data.assignments) || [];
    if (!tournamentId || !Array.isArray(assignments) || assignments.length === 0) {
      throw new HttpsError("invalid-argument", "tournamentId e assignments são obrigatórios");
    }

    const db = admin.firestore();
    const tSnap = await db.collection("tournaments").doc(tournamentId).get();
    if (!tSnap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = tSnap.data();
    const adminEmails = Array.isArray(t.adminEmails) ? t.adminEmails.map((e) => String(e).toLowerCase()) : [];
    const isOrg = (t.creatorUid && t.creatorUid === callerUid) ||
      (t.creatorEmail && String(t.creatorEmail).toLowerCase() === callerEmail) ||
      (t.organizerEmail && String(t.organizerEmail).toLowerCase() === callerEmail) ||
      (callerEmail && adminEmails.indexOf(callerEmail) !== -1);
    if (!isOrg) throw new HttpsError("permission-denied", "só o organizador pode atribuir perfil");

    let written = 0; const skipped = [];
    for (const a of assignments) {
      const uid = a && a.uid ? String(a.uid) : "";
      if (!uid) { skipped.push({ uid, reason: "no-uid" }); continue; }
      const ref = db.collection("users").doc(uid);
      const snap = await ref.get();
      if (!snap.exists) { skipped.push({ uid, reason: "no-user" }); continue; }
      const upd = {};
      const g = a && a.gender ? String(a.gender) : "";
      if (g === "masculino" || g === "feminino" || g === "outro") {
        upd.gender = g;
        upd.genderSetBy = callerUid;
      }
      const cat = a && a.category ? String(a.category).trim() : "";
      if (cat && sport) {
        const curData = snap.data() || {};
        const sbs = (curData.skillBySport && typeof curData.skillBySport === "object") ? Object.assign({}, curData.skillBySport) : {};
        sbs[sport] = cat;
        upd.skillBySport = sbs;
        upd.skillSetBy = callerUid;
      }
      if (Object.keys(upd).length === 0) { skipped.push({ uid, reason: "nothing" }); continue; }
      upd.profileSetAt = admin.firestore.FieldValue.serverTimestamp();
      await ref.update(upd);
      written++;
    }
    console.log("[setParticipantsProfile] torneio", tournamentId, "sport", sport, "gravados:", written, "pulados:", skipped.length);
    return { ok: true, written, skipped };
  }
);

// ─── Comunicado do organizador (fan-out server-side) ────────────────────────
// v2.4.61: ANTES o "Comunicar Inscritos" notificava cada inscrito num loop
// SEQUENCIAL no NAVEGADOR do organizador (~1 ida ao Firestore por pessoa).
// Em torneios grandes (Confra = 88 inscritos) isso (a) demorava ~30s travado em
// "Enviando…" sem feedback — parecia que "nada acontecia"; e (b) TRUNCAVA se a
// página fosse fechada/navegada antes do fim — comprovado: inscritos no fim da
// lista (com notificações LIGADAS) não recebiam o comunicado.
// Agora o cliente faz UMA chamada e o servidor entrega a todos de forma
// confiável e rápida, independente da página ficar aberta. Espelha exatamente
// _sendUserNotification + _dispatchChannels do cliente (plataforma + fila de
// e-mail digest + fila de WhatsApp).
exports.sendOrgCommunication = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 120, cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const rawMessage = String((request.data && request.data.message) || "").trim();
    let level = String((request.data && request.data.level) || "important");
    if (["fundamental", "important", "all"].indexOf(level) === -1) level = "important";
    if (!tournamentId || !rawMessage) {
      throw new HttpsError("invalid-argument", "tournamentId e message são obrigatórios");
    }

    const db = admin.firestore();
    const tSnap = await db.collection("tournaments").doc(tournamentId).get();
    if (!tSnap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = tSnap.data();

    // Autorização: só organizador / co-organizador.
    const adminEmails = Array.isArray(t.adminEmails) ? t.adminEmails.map((e) => String(e).toLowerCase()) : [];
    const coHostUids = Array.isArray(t.coHosts)
      ? t.coHosts.filter((c) => c && c.status === "active").map((c) => String(c.uid || "")) : [];
    const isOrg = (t.creatorUid && t.creatorUid === callerUid) ||
      (t.creatorEmail && String(t.creatorEmail).toLowerCase() === callerEmail) ||
      (t.organizerEmail && String(t.organizerEmail).toLowerCase() === callerEmail) ||
      (callerEmail && adminEmails.indexOf(callerEmail) !== -1) ||
      (coHostUids.indexOf(callerUid) !== -1);
    if (!isOrg) throw new HttpsError("permission-denied", "só o organizador pode comunicar os inscritos");

    const fullMsg = '📢 Comunicado do organizador — "' + (t.name || "") + '": ' + rawMessage;

    // ── Coleta destinatários (todos os UIDs de cada inscrito; duplas têm 2) ──
    const parts = Array.isArray(t.participants)
      ? t.participants
      : (t.participants ? Object.values(t.participants) : []);
    const seenUids = {};
    const seenEmails = {};
    const recipients = [];
    function _allUids(p) {
      if (typeof p !== "object" || !p) return [];
      const seen = {}; const out = [];
      function _add(u) { if (u && !seen[u]) { seen[u] = true; out.push(u); } }
      _add(p.uid); _add(p.p1Uid); _add(p.p2Uid);
      if (Array.isArray(p.participants)) p.participants.forEach((s) => { if (s) _add(s.uid); });
      return out;
    }
    parts.forEach((p) => {
      if (typeof p === "string") return;
      const e = String(p.email || "").toLowerCase();
      const uids = _allUids(p);
      uids.forEach((u) => {
        if (u && !seenUids[u]) { seenUids[u] = true; recipients.push({ uid: u, email: e }); }
      });
      if (uids.length === 0 && e && !seenEmails[e]) {
        seenEmails[e] = true; recipients.push({ uid: "", email: e });
      }
    });

    // v2.4.64: o organizador também RECEBE o próprio comunicado (como um inscrito)
    // pra conferir formatação/entrega e monitorar abertura no painel. Marca o
    // organizador na lista (ou adiciona, se ele não for inscrito).
    let orgInList = false;
    recipients.forEach((r) => {
      if ((r.uid && r.uid === callerUid) || (r.email && callerEmail && r.email === callerEmail)) {
        r.isOrganizer = true; orgInList = true;
      }
    });
    if (!orgInList) recipients.push({ uid: callerUid, email: callerEmail, isOrganizer: true });

    function _notifLevelAllowed(userLevel, notifLevel) {
      if (!userLevel || userLevel === "todas") return true;
      if (userLevel === "none") return false;
      if (userLevel === "importantes") return notifLevel === "fundamental" || notifLevel === "important";
      if (userLevel === "fundamentais") return notifLevel === "fundamental";
      return true;
    }

    const tUrl = "https://scoreplace.app/#tournaments/" + tournamentId;
    const _day = new Date().toISOString().slice(0, 10);
    function _msgHash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(36); }
    function _notifDocId(uid) {
      const raw = ["organizer_communication", tournamentId, "", _day, _msgHash(fullMsg), uid].join("|");
      return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
    }

    const emails = [];
    const phones = [];
    let platformWritten = 0;
    const skipped = [];
    // v2.4.63: manifesto por destinatário pro painel de controle de comunicados.
    // Cada item: { uid, name, notifDocId, platform, email, whatsapp, phone }.
    // "platform/email/whatsapp" = canal foi DISPARADO pra essa pessoa. A leitura
    // (abriu) e a entrega de WhatsApp são computadas on-demand em
    // getCommunicationStats (lê a notif + o doc da fila), então o manifesto é
    // imutável — só registra o que foi enviado e por onde.
    const recipientDetails = [];

    // Resolve UID por email quando o inscrito não tem uid no objeto.
    async function _resolveUid(r) {
      if (r.uid) return r.uid;
      if (!r.email) return "";
      const snap = await db.collection("users").where("email", "==", r.email).limit(1).get();
      return snap.empty ? "" : snap.docs[0].id;
    }

    // Concorrência limitada (chunks de 20) — rápido mesmo com centenas.
    const CHUNK = 20;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const slice = recipients.slice(i, i + CHUNK);
      await Promise.all(slice.map(async (r) => {
        try {
          const uid = await _resolveUid(r);
          if (!uid) { skipped.push({ uid: "", email: r.email, reason: "no-uid" }); return; }
          const profSnap = await db.collection("users").doc(uid).get();
          if (!profSnap.exists) { skipped.push({ uid, reason: "no-user" }); return; }
          const profile = profSnap.data() || {};
          const isOrganizer = r.isOrganizer === true || uid === callerUid;
          const userLevel = profile.notifyLevel || "todas";
          // Organizador recebe sempre o próprio comunicado (bypassa filtro de nível).
          if (!isOrganizer && !_notifLevelAllowed(userLevel, level)) { skipped.push({ uid, reason: "level-filtered" }); return; }

          const detail = {
            uid: uid,
            name: profile.displayName || profile.name || r.email || uid,
            isOrganizer: isOrganizer,
            notifDocId: "",
            platform: false,
            email: false,
            whatsapp: false,
            phone: "",
          };

          // Notificação na plataforma (idempotente via doc ID determinístico).
          // Organizador sempre recebe a cópia in-app (mesmo com notifyPlatform off).
          if (isOrganizer || profile.notifyPlatform !== false) {
            const notifId = _notifDocId(uid);
            await db.collection("users").doc(uid).collection("notifications").doc(notifId).set({
              type: "organizer_communication",
              fromUid: callerUid,
              fromName: "",
              fromPhoto: "",
              tournamentId: tournamentId,
              tournamentName: t.name || "",
              message: fullMsg,
              createdAt: new Date().toISOString(),
              read: false,
            });
            platformWritten++;
            detail.platform = true;
            detail.notifDocId = notifId;
          }
          // Canais externos: e-mail (digest) e WhatsApp (fila).
          // v2.4.86: guarda o endereço de e-mail no manifesto pra o painel
          // poder casar com bounces (delivery.state==='ERROR' na coleção `mail`)
          // e rebaixar o ✓✓ presumido só quando há negativa real de entrega.
          if (profile.notifyEmail !== false && profile.email) { emails.push(profile.email); detail.email = true; detail.emailAddr = String(profile.email).toLowerCase(); }
          if (profile.notifyWhatsApp === true && profile.phone) {
            phones.push(profile.phone);
            detail.whatsapp = true;
            detail.phone = String(profile.phone);
          }
          recipientDetails.push(detail);
        } catch (e) {
          skipped.push({ uid: r.uid || "", reason: "error:" + (e && e.message || e) });
        }
      }));
    }

    // ── Fila de e-mail (digest consolidado por flushNotifEmailDigest) ──
    const WINDOWS = { fundamental: 5, important: 15, all: 30 };
    const mins = WINDOWS[level] != null ? WINDOWS[level] : 30;
    const nowMs = Date.now();
    if (emails.length) {
      let batch = db.batch(); let n = 0;
      for (const email of emails) {
        const ref = db.collection("notif_email_queue").doc();
        batch.set(ref, {
          email: email,
          level: level,
          message: fullMsg,
          tournamentName: t.name || "",
          tournamentUrl: tUrl,
          createdAt: nowMs,
          flushAtMs: nowMs + mins * 60 * 1000,
        });
        if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
      }
      if (n % 400 !== 0) await batch.commit();
    }

    // ── Fila de WhatsApp (processada por processWhatsAppQueue) ──
    let whatsappQueueId = "";
    if (phones.length) {
      const emoji = level === "fundamental" ? "🔴" : (level === "important" ? "🟠" : "🟢");
      const waRef = await db.collection("whatsapp_queue").add({
        phones: phones,
        message: emoji + " " + fullMsg,
        createdAt: new Date().toISOString(),
        status: "pending",
      });
      whatsappQueueId = waRef.id;
    }

    // ── Manifesto do comunicado (pro painel de controle do organizador) ──
    const commRef = await db.collection("tournaments").doc(tournamentId)
      .collection("communications").add({
        rawMessage: rawMessage,
        fullMessage: fullMsg,
        level: level,
        sentByUid: callerUid,
        sentByEmail: callerEmail,
        sentAt: new Date().toISOString(),
        sentAtMs: Date.now(),
        totalRecipients: recipientDetails.length,
        skippedCount: skipped.length,
        whatsappQueueId: whatsappQueueId,
        counts: {
          platformSent: recipientDetails.filter((d) => d.platform).length,
          emailSent: emails.length,
          whatsappSent: phones.length,
        },
        recipients: recipientDetails,
      });

    console.log("[sendOrgCommunication] torneio", tournamentId, "| comm", commRef.id,
      "| plataforma:", platformWritten, "| emails:", emails.length, "| whatsapp:", phones.length,
      "| pulados:", skipped.length);
    return {
      ok: true, commId: commRef.id,
      platform: platformWritten, emails: emails.length, phones: phones.length, skipped: skipped.length,
    };
  }
);

// ─── Estatísticas de um comunicado (painel de controle do organizador) ──────
// v2.4.63: computa on-demand a partir do manifesto imutável em
// tournaments/{tId}/communications/{commId}:
//   • plataforma: lê a notificação de cada destinatário → read? = "abriu".
//   • whatsapp: lê o doc da fila (whatsappQueueId) → deliveries[] por telefone.
//   • email: só "enviado" (entrega/abertura por e-mail não é rastreada nesta v1).
exports.getCommunicationStats = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 120, cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const commId = String((request.data && request.data.commId) || "");
    if (!tournamentId || !commId) throw new HttpsError("invalid-argument", "tournamentId e commId obrigatórios");

    const db = admin.firestore();
    const tSnap = await db.collection("tournaments").doc(tournamentId).get();
    if (!tSnap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = tSnap.data();
    const adminEmails = Array.isArray(t.adminEmails) ? t.adminEmails.map((e) => String(e).toLowerCase()) : [];
    const coHostUids = Array.isArray(t.coHosts)
      ? t.coHosts.filter((c) => c && c.status === "active").map((c) => String(c.uid || "")) : [];
    const isOrg = (t.creatorUid && t.creatorUid === callerUid) ||
      (t.creatorEmail && String(t.creatorEmail).toLowerCase() === callerEmail) ||
      (t.organizerEmail && String(t.organizerEmail).toLowerCase() === callerEmail) ||
      (callerEmail && adminEmails.indexOf(callerEmail) !== -1) ||
      (coHostUids.indexOf(callerUid) !== -1);
    if (!isOrg) throw new HttpsError("permission-denied", "só o organizador pode ver os comunicados");

    const cSnap = await db.collection("tournaments").doc(tournamentId)
      .collection("communications").doc(commId).get();
    if (!cSnap.exists) throw new HttpsError("not-found", "comunicado não existe");
    const comm = cSnap.data();
    const recips = Array.isArray(comm.recipients) ? comm.recipients : [];

    // Entrega de WhatsApp: phone → ok, a partir do doc da fila.
    const waDelivered = {};
    if (comm.whatsappQueueId) {
      try {
        const waSnap = await db.collection("whatsapp_queue").doc(comm.whatsappQueueId).get();
        if (waSnap.exists) {
          const dels = waSnap.data().deliveries || [];
          dels.forEach((d) => { if (d && d.phone) waDelivered[String(d.phone).replace(/\D/g, "")] = !!d.ok; });
        }
      } catch (e) { /* fila pode ter sido limpa após 30d */ }
    }

    // ── Entrega de E-MAIL (v2.4.86): presumimos ENTREGUE (✓✓) quando NÃO há
    // negativa. A negativa = doc na coleção `mail` (extension firestore-send-
    // email) com delivery.state==='ERROR' (e-mail inexistente, caixa cheia,
    // rejeição SMTP) pro endereço do destinatário, criado a partir do envio
    // deste comunicado. Sem erro → presume-se entregue. Otimização: só
    // buscamos os endereços dos destinatários se EXISTIR algum bounce — quando
    // não há bounce (caso comum), todo mundo é ✓✓ sem reads extras.
    const bouncedEmails = new Set();
    try {
      const errSnap = await db.collection("mail").where("delivery.state", "==", "ERROR").limit(1000).get();
      const sinceMs = (comm.sentAtMs || 0) - 60 * 1000; // buffer de 1 min antes do envio
      errSnap.forEach((d) => {
        const data = d.data() || {};
        let createdMs = 0;
        try { createdMs = (data.createdAt && data.createdAt.toMillis) ? data.createdAt.toMillis() : 0; } catch (e2) { createdMs = 0; }
        // Ignora erros ANTERIORES a este comunicado (não atribuíveis a ele).
        if (createdMs && sinceMs && createdMs < sinceMs) return;
        const tos = Array.isArray(data.to) ? data.to : (data.to ? [data.to] : []);
        tos.forEach((e) => { if (e) bouncedEmails.add(String(e).toLowerCase()); });
      });
    } catch (e) { /* sem índice/sem erros → presume tudo entregue */ }
    const hasBounces = bouncedEmails.size > 0;

    // "Abriu" na plataforma: lê a notificação de cada destinatário (chunks de 20).
    const out = [];
    let platformOpened = 0; let whatsappDelivered = 0;
    let emailDelivered = 0; let emailBounced = 0;
    const CHUNK = 20;
    for (let i = 0; i < recips.length; i += CHUNK) {
      const slice = recips.slice(i, i + CHUNK);
      await Promise.all(slice.map(async (r) => {
        let opened = false;
        if (r.platform && r.notifDocId && r.uid) {
          try {
            const nSnap = await db.collection("users").doc(r.uid)
              .collection("notifications").doc(r.notifDocId).get();
            opened = nSnap.exists && nSnap.data().read === true;
          } catch (e) { /* notif pode ter sido limpa */ }
        }
        if (opened) platformOpened++;
        const phoneKey = r.phone ? String(r.phone).replace(/\D/g, "") : "";
        const waOk = r.whatsapp && phoneKey ? (waDelivered[phoneKey] === true) : false;
        if (waOk) whatsappDelivered++;

        // E-mail: presume entregue; só rebaixa se o endereço bateu num bounce.
        let emBounced = false;
        if (r.email && hasBounces) {
          let addr = (r.emailAddr || "").toLowerCase();
          // Comunicados antigos não guardavam emailAddr — busca no perfil só
          // quando há bounces a casar (caso raro), pra não custar reads à toa.
          if (!addr && r.uid) {
            try {
              const pf = await db.collection("users").doc(r.uid).get();
              if (pf.exists) addr = String((pf.data() || {}).email || "").toLowerCase();
            } catch (e) { /* sem perfil → presume entregue */ }
          }
          if (addr && bouncedEmails.has(addr)) emBounced = true;
        }
        const emDelivered = !!r.email && !emBounced;
        if (r.email) { if (emBounced) emailBounced++; else emailDelivered++; }

        out.push({
          uid: r.uid, name: r.name || "", isOrganizer: !!r.isOrganizer,
          platform: !!r.platform, platformOpened: opened,
          email: !!r.email, emailDelivered: emDelivered, emailBounced: emBounced,
          whatsapp: !!r.whatsapp, whatsappDelivered: waOk,
        });
      }));
    }
    // Ordena por nome pra exibição estável.
    out.sort((a, b) => String(a.name).localeCompare(String(b.name)));

    return {
      ok: true,
      commId: commId,
      rawMessage: comm.rawMessage || "",
      level: comm.level || "all",
      sentAt: comm.sentAt || "",
      sentByEmail: comm.sentByEmail || "",
      totalRecipients: comm.totalRecipients || recips.length,
      skippedCount: comm.skippedCount || 0,
      counts: {
        platformSent: (comm.counts && comm.counts.platformSent) || 0,
        platformOpened: platformOpened,
        emailSent: (comm.counts && comm.counts.emailSent) || 0,
        emailDelivered: emailDelivered,
        emailBounced: emailBounced,
        whatsappSent: (comm.counts && comm.counts.whatsappSent) || 0,
        whatsappDelivered: whatsappDelivered,
      },
      recipients: out,
    };
  }
);

// ─── Lista de comunicados de um torneio (painel de controle) ────────────────
exports.listCommunications = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");
    const tournamentId = String((request.data && request.data.tournamentId) || "");
    if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId obrigatório");

    const db = admin.firestore();
    const tSnap = await db.collection("tournaments").doc(tournamentId).get();
    if (!tSnap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = tSnap.data();
    const adminEmails = Array.isArray(t.adminEmails) ? t.adminEmails.map((e) => String(e).toLowerCase()) : [];
    const coHostUids = Array.isArray(t.coHosts)
      ? t.coHosts.filter((c) => c && c.status === "active").map((c) => String(c.uid || "")) : [];
    const isOrg = (t.creatorUid && t.creatorUid === callerUid) ||
      (t.creatorEmail && String(t.creatorEmail).toLowerCase() === callerEmail) ||
      (t.organizerEmail && String(t.organizerEmail).toLowerCase() === callerEmail) ||
      (callerEmail && adminEmails.indexOf(callerEmail) !== -1) ||
      (coHostUids.indexOf(callerUid) !== -1);
    if (!isOrg) throw new HttpsError("permission-denied", "só o organizador pode ver os comunicados");

    const snap = await db.collection("tournaments").doc(tournamentId)
      .collection("communications").orderBy("sentAtMs", "desc").limit(100).get();
    const list = [];
    snap.forEach((d) => {
      const c = d.data();
      list.push({
        commId: d.id,
        rawMessage: c.rawMessage || "",
        level: c.level || "all",
        sentAt: c.sentAt || "",
        totalRecipients: c.totalRecipients || 0,
        counts: {
          platformSent: (c.counts && c.counts.platformSent) || 0,
          emailSent: (c.counts && c.counts.emailSent) || 0,
          whatsappSent: (c.counts && c.counts.whatsappSent) || 0,
        },
      });
    });
    return { ok: true, communications: list };
  }
);

// ─── WhatsApp via Evolution API (self-hosted no Railway) ────────────────────
// v1.3.37-beta: Cloud Function que consome `whatsapp_queue/{id}` (Firestore
// trigger onCreate) e POSTa pra Evolution API (https://docs.evolution-api.com).
// Evolution roda em Railway com WhatsApp Business pareado via QR Code num
// número eSIM Vivo dedicado. Custo total: ~R$20/mês (eSIM) + R$0-5/mês
// (Railway free tier).
//
// PRÉ-REQUISITOS pra ativar (one-time, fora do código):
//   1. Deploy Evolution API no Railway — ver infra/whatsapp/README.md
//   2. Parear instância via QR Code com o WhatsApp Business do eSIM
//   3. Configurar 3 secrets:
//        firebase functions:secrets:set EVOLUTION_API_URL
//        firebase functions:secrets:set EVOLUTION_API_KEY
//        firebase functions:secrets:set EVOLUTION_INSTANCE
//   4. Deploy:  firebase deploy --only functions:processWhatsAppQueue
//
// Schema do doc em whatsapp_queue/{id} (criado por FirestoreDB.queueWhatsApp):
//   {
//     phones: ['5511999998888', ...],   // E.164 sem '+' nem espaços
//     message: 'texto da mensagem',
//     createdAt: ISO string,
//     status: 'pending' | 'sent' | 'partial' | 'failed',
//     // Atualizado pela função:
//     processedAt?: ISO string,
//     attempts?: number,
//     lastError?: string,
//     deliveries?: { phone, ok, messageId?, error? }[]
//   }

const EVOLUTION_API_URL = defineSecret("EVOLUTION_API_URL");
const EVOLUTION_API_KEY = defineSecret("EVOLUTION_API_KEY");
const EVOLUTION_INSTANCE = defineSecret("EVOLUTION_INSTANCE");
// v2.4.65: token da API do Railway pra reiniciar o container da Evolution quando
// a conexão Baileys trava (auto-heal). Criar em railway.app (Account/Project token).
const RAILWAY_API_TOKEN = defineSecret("RAILWAY_API_TOKEN");
// v2.6.x: API key de SERVIDOR (restrita à Identity Toolkit API, SEM restrição de
// referer/IP) usada pra verificar senha server-side via accounts:signInWithPassword.
// A web key tem restrição de referer e dá 403 quando chamada do servidor. Criar:
//   gcloud services api-keys create --display-name=scoreplace-server-signin \
//     --api-target=service=identitytoolkit.googleapis.com
// e setar: firebase functions:secrets:set SIGNIN_API_KEY
const SIGNIN_API_KEY = defineSecret("SIGNIN_API_KEY");

// ─── WhatsApp Magic Link ──────────────────────────────────────────────────────
// v1.3.83-beta: quando o usuário entra com telefone, o frontend também chama
// esta função em paralelo com o Firebase SMS. Se o número estiver cadastrado
// no WhatsApp, o usuário recebe um link direto que loga sem precisar digitar o
// código SMS — usa signInWithCustomToken no cliente.
//
// Fluxo:
//   1. Verifica se o número existe no Firebase Auth (getUserByPhoneNumber).
//   2. Gera um custom token via Admin SDK (admin.auth().createCustomToken(uid)).
//   3. Armazena wrapper em magicLinks/{token} com type='customToken'.
//   4. Envia mensagem WhatsApp com link scoreplace.app/?wt=TOKEN.
//   5. Se usuário não existe ainda (primeiro login) → retorna ok:false silencioso.
//      SMS continua sendo o caminho principal nesse caso.
//
// O cliente detecta ?wt=TOKEN em auth.js, busca o Firestore, chama
// signInWithCustomToken — login direto, zero digitação.
//
// Deploy: firebase deploy --only functions:sendWhatsAppMagicLink
exports.sendWhatsAppMagicLink = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async (request) => {
    const rawPhone = (request.data && request.data.phone || "").trim();
    const phone = _normalizePhoneE164(rawPhone);
    if (!phone) {
      // Número inválido — silencioso, SMS continua.
      return { ok: false, reason: "invalid-phone" };
    }

    // Busca conta existente ou cria nova — o link funciona pra novos usuários também.
    // Seguro: o link WhatsApp vai pro dono do número; quem recebe no WhatsApp é quem
    // tem o telefone, independente de já ter conta ou não.
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByPhoneNumber("+" + phone);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        // Novo usuário — cria conta Firebase Auth com o número para poder gerar custom token.
        // O SMS do OTP já passou pelo reCAPTCHA do Firebase, então o número é válido.
        try {
          userRecord = await admin.auth().createUser({ phoneNumber: "+" + phone });
          console.log("[sendWhatsAppMagicLink] new user created for phone:", phone, "uid:", userRecord.uid);
        } catch (createErr) {
          console.error("[sendWhatsAppMagicLink] createUser failed:", createErr.code || createErr.message);
          return { ok: false, reason: "create-user-error" };
        }
      } else {
        console.error("[sendWhatsAppMagicLink] getUserByPhoneNumber failed:", err.code || err.message);
        return { ok: false, reason: "lookup-error" };
      }
    }

    // Gera custom token com validade de 1h (Firebase default é 1h pra custom tokens).
    let customToken;
    try {
      customToken = await admin.auth().createCustomToken(userRecord.uid, {
        source: "whatsapp_magic_link",
      });
    } catch (err) {
      console.error("[sendWhatsAppMagicLink] createCustomToken failed:", err.code || err.message);
      return { ok: false, reason: "token-error" };
    }

    // Armazena wrapper no mesmo schema que o email magic link usa.
    const crypto = require("crypto");
    const token = crypto.randomBytes(18).toString("base64url");
    try {
      await admin.firestore().collection("magicLinks").doc(token).set({
        type: "customToken",
        customToken: customToken,
        uid: userRecord.uid,
        phone: phone,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h
      });
    } catch (err) {
      console.error("[sendWhatsAppMagicLink] Firestore write failed:", err.code || err.message);
      return { ok: false, reason: "store-error" };
    }

    const wrapperUrl = "https://scoreplace.app/?wt=" + encodeURIComponent(token);

    // Nome de exibição para personalizar a mensagem.
    const displayName = (userRecord.displayName || "").trim();
    const firstName = displayName ? displayName.split(/[\s.]+/)[0] : "";
    const greeting = firstName ? "Olá, " + firstName + "!" : "Olá!";

    const message =
      "🎾 " + greeting + "\n\n" +
      "Acesse o *scoreplace.app* pelo link abaixo — sem digitar nenhum código:\n\n" +
      wrapperUrl + "\n\n" +
      "_O link expira em 1 hora. Se não pediu, ignore._";

    // Envia direto pela Evolution API (não usa a fila — link de login é time-sensitive).
    let apiUrl, apiKey, instance;
    try {
      apiUrl = EVOLUTION_API_URL.value();
      apiKey = EVOLUTION_API_KEY.value();
      instance = EVOLUTION_INSTANCE.value();
    } catch (err) {
      console.error("[sendWhatsAppMagicLink] secrets unavailable:", err.message);
      return { ok: false, reason: "secrets-missing" };
    }

    const result = await _sendWhatsAppText(apiUrl, apiKey, instance, phone, message);
    if (!result.ok) {
      console.warn("[sendWhatsAppMagicLink] WA send failed for", phone, ":", result.error);
      // Não joga erro — SMS já foi enviado, isto é bônus best-effort.
      return { ok: false, reason: "wa-send-failed", error: result.error };
    }

    console.log("[sendWhatsAppMagicLink] sent to", phone, "uid:", userRecord.uid);
    return { ok: true };
  }
);

// Sanitiza telefone pra E.164 sem '+' (formato Evolution API espera).
// Aceita "+55 11 99999-8888", "55 11 99999-8888", "11 99999-8888",
// "(11) 99999-8888". Sempre normaliza pra "5511999998888".
function _normalizePhoneE164(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 10) return null; // muito curto pra ser número BR
  // Se já começa com 55 e tem 12-13 dígitos (DDD + 8/9 digit number), ok.
  if (digits.length === 12 || digits.length === 13) {
    if (digits.startsWith("55")) return digits;
  }
  // Se tem 10-11 dígitos (DDD+número, sem DDI), assume BR e prefixa 55.
  if (digits.length === 10 || digits.length === 11) {
    return "55" + digits;
  }
  // Outro DDI ou número internacional — devolve como veio (sem '+').
  return digits;
}

// ─── E-mail sintético para contas de CELULAR (v2.5.x) ────────────────────────
// Firebase só faz senha nativa atrelada a um e-mail. Pra dar "celular + senha"
// damos a cada conta de celular um e-mail sintético determinístico do número
// E.164 (só dígitos). Esse e-mail NUNCA é deliverável, NUNCA é mostrado ao
// usuário e NUNCA recebe verificação — o telefone é a prova de identidade.
function _syntheticEmailForPhone(phoneDigits) {
  const d = String(phoneDigits || "").replace(/\D/g, "");
  if (!d) return null;
  return "phone_" + d + "@phone.scoreplace.app";
}
function _isSyntheticEmail(email) {
  return typeof email === "string" && /@phone\.scoreplace\.app$/i.test(email.trim());
}
// E-mail "real" do usuário (não-sintético) — null se ausente ou sintético.
function _realEmailOf(userRecord) {
  const e = userRecord && userRecord.email;
  return (e && !_isSyntheticEmail(e)) ? e : null;
}
// Mascara e-mail/telefone pra UI sem vazar o valor cheio.
function _maskEmail(email) {
  if (!email || email.indexOf("@") < 0) return null;
  const parts = email.split("@");
  const local = parts[0];
  const head = local.slice(0, Math.min(2, local.length));
  return head + "***@" + parts[1];
}
function _maskPhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length < 4) return null;
  const last2 = d.slice(-2);
  return "(••) •••••-••" + last2;
}
// Conta cujo provedor inclui senha?
function _hasPasswordProvider(userRecord) {
  return !!(userRecord && Array.isArray(userRecord.providerData) &&
    userRecord.providerData.some((p) => p && p.providerId === "password"));
}

// Send single WhatsApp text via Evolution. Retorna { ok, messageId?, error? }.
async function _sendWhatsAppText(apiUrl, apiKey, instance, phone, text) {
  const url = apiUrl.replace(/\/+$/, "") + "/message/sendText/" + encodeURIComponent(instance);
  // v2.4.37: Evolution/Baileys quer o número SÓ EM DÍGITOS (country code + DDD +
  // número), sem "+". A ficha guarda em E.164 ("+5511..."), então normaliza aqui.
  // (O único envio que já funcionou tinha "5511..." sem "+"; os 200+ que falharam
  // vinham com "+5511...".)
  const num = String(phone || "").replace(/[^\d]/g, "");
  const body = {
    number: num,
    text: text,
    // Evolution-specific options:
    delay: 1200, // ms entre msgs (parece + humano, evita ban)
    linkPreview: true,
  };
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
      },
      body: JSON.stringify(body),
      // Cloud Functions timeout é 60s — fetch sem timeout pode travar a função.
      // node-fetch v2 não tem timeout nativo; usar AbortController.
    });
  } catch (e) {
    return { ok: false, error: "fetch failed: " + (e.message || String(e)) };
  }
  let data = null;
  try { data = await resp.json(); } catch (e) { /* body não-json */ }
  if (!resp.ok) {
    return {
      ok: false,
      error: "HTTP " + resp.status + ": " + (data && data.message ? JSON.stringify(data.message) : resp.statusText),
    };
  }
  // Resposta sucesso típica: { key: { id: "..." }, ... }
  const messageId = data && data.key && data.key.id ? data.key.id : null;
  return { ok: true, messageId: messageId };
}

// ─── Autenticação por celular no gate de verificação (v2.4.24) ───────────────
// Alternativa pro usuário cujo e-mail de confirmação não chega (ex.: UOL filtra
// e-mail transacional). Em vez de depender do link no e-mail, a pessoa confirma
// a conta provando que controla um telefone. Dois canais, espelhando o login
// por celular antigo:
//   • SMS  → Firebase linkWithPhoneNumber (código do Firebase, digitado no app).
//            O cliente faz o confirm() e depois chama verifyPhoneGate({afterPhoneLink:true}).
//   • WhatsApp → sendPhoneVerifyWhatsApp manda um código NOSSO de 6 dígitos +
//            um botão (?gv=TOKEN) que autentica com 1 clique, sem digitar nada.
// Qualquer caminho marca emailVerified=true (server-side, só Admin pode) e salva
// o telefone no perfil. O telefone é a prova de identidade — não há e-mail no loop.

// Aplica a verificação: marca o e-mail como confirmado no Auth e grava o
// telefone (E.164 com '+') no perfil. Chamado pelos 3 caminhos abaixo.
async function _applyGateVerification(uid, phoneE164) {
  await admin.auth().updateUser(uid, { emailVerified: true });
  const update = { emailVerified: true, updatedAt: new Date().toISOString() };
  if (phoneE164) { update.phone = phoneE164; update.phoneCountry = "55"; }
  await admin.firestore().collection("users").doc(uid).set(update, { merge: true });
}

// Manda o código + botão pelo WhatsApp. Requer usuário logado (o gate só aparece
// pra quem já está autenticado, só falta confirmar o e-mail).
exports.sendPhoneVerifyWhatsApp = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login necessário");
    const phone = _normalizePhoneE164((request.data && request.data.phone) || "");
    if (!phone) return { ok: false, reason: "invalid-phone" };

    const crypto = require("crypto");
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const token = crypto.randomBytes(18).toString("base64url");
    const phoneE164 = "+" + phone;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    const db = admin.firestore();
    try {
      await db.collection("gateVerifications").doc(uid).set({
        uid, phone: phoneE164, otpHash, token, attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt,
      });
      await db.collection("gateTokens").doc(token).set({
        uid, phone: phoneE164, expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("[sendPhoneVerifyWhatsApp] store failed:", err.code || err.message);
      return { ok: false, reason: "store-error" };
    }

    const wrapperUrl = "https://scoreplace.app/?gv=" + encodeURIComponent(token);
    const message =
      "🎾 *scoreplace.app*\n\n" +
      "Seu código de confirmação: *" + otp + "*\n\n" +
      "Digite ele no app — ou toque no link abaixo pra confirmar e entrar direto, sem digitar nada:\n\n" +
      wrapperUrl + "\n\n" +
      "_O código expira em 15 minutos. Se não foi você, ignore._";

    let apiUrl, apiKey, instance;
    try {
      apiUrl = EVOLUTION_API_URL.value();
      apiKey = EVOLUTION_API_KEY.value();
      instance = EVOLUTION_INSTANCE.value();
    } catch (err) {
      console.error("[sendPhoneVerifyWhatsApp] secrets unavailable:", err.message);
      return { ok: false, reason: "secrets-missing" };
    }
    const result = await _sendWhatsAppText(apiUrl, apiKey, instance, phone, message);
    if (!result.ok) {
      console.warn("[sendPhoneVerifyWhatsApp] WA send failed for", phone, ":", result.error);
      return { ok: false, reason: "wa-send-failed", error: result.error };
    }
    console.log("[sendPhoneVerifyWhatsApp] sent to", phone, "uid:", uid);
    return { ok: true };
  }
);

// Verifica o código digitado no app. Dois modos:
//   • { afterPhoneLink:true } → o SMS do Firebase já foi confirmado no cliente
//     (linkWithPhoneNumber.confirm). Só confirmamos que o provider phone está
//     vinculado e marcamos o e-mail.
//   • { code:"123456" }       → código NOSSO que foi pelo WhatsApp.
exports.verifyPhoneGate = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login necessário");
    const db = admin.firestore();
    const data = request.data || {};

    if (data.afterPhoneLink) {
      const u = await admin.auth().getUser(uid);
      const hasPhone = !!u.phoneNumber ||
        (u.providerData || []).some((p) => p && p.providerId === "phone");
      if (!hasPhone) return { ok: false, reason: "phone-not-linked" };
      await _applyGateVerification(uid, u.phoneNumber || null);
      await db.collection("gateVerifications").doc(uid).delete().catch(() => {});
      return { ok: true };
    }

    const code = String(data.code || "").trim();
    if (!/^\d{6}$/.test(code)) return { ok: false, reason: "bad-code" };
    const ref = db.collection("gateVerifications").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "no-pending" };
    const v = snap.data();
    const exp = v.expiresAt && v.expiresAt.toDate ? v.expiresAt.toDate() : v.expiresAt;
    if (exp && new Date(exp) < new Date()) return { ok: false, reason: "expired" };
    if ((v.attempts || 0) >= 6) return { ok: false, reason: "too-many" };
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(code).digest("hex");
    if (hash !== v.otpHash) {
      await ref.update({ attempts: (v.attempts || 0) + 1 }).catch(() => {});
      return { ok: false, reason: "wrong-code" };
    }
    await _applyGateVerification(uid, v.phone || null);
    await ref.delete().catch(() => {});
    if (v.token) await db.collection("gateTokens").doc(v.token).delete().catch(() => {});
    console.log("[verifyPhoneGate] code OK, verified uid:", uid);
    return { ok: true };
  }
);

// Resolve o botão do WhatsApp (?gv=TOKEN). NÃO requer auth — o token é o segredo
// (vai só pro dono do telefone). Marca o e-mail verificado e devolve um custom
// token pra logar a pessoa direto, sem digitar nada.
exports.verifyPhoneGateToken = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    const token = String((request.data && request.data.token) || "").trim();
    if (!token) return { ok: false, reason: "no-token" };
    const db = admin.firestore();
    const ref = db.collection("gateTokens").doc(token);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "invalid-token" };
    const t = snap.data();
    const exp = t.expiresAt && t.expiresAt.toDate ? t.expiresAt.toDate() : t.expiresAt;
    if (exp && new Date(exp) < new Date()) return { ok: false, reason: "expired" };
    await _applyGateVerification(t.uid, t.phone || null);
    let customToken = null;
    try {
      customToken = await admin.auth().createCustomToken(t.uid, { source: "phone_gate" });
    } catch (err) {
      console.error("[verifyPhoneGateToken] createCustomToken failed:", err.code || err.message);
    }
    await ref.delete().catch(() => {});
    await db.collection("gateVerifications").doc(t.uid).delete().catch(() => {});
    console.log("[verifyPhoneGateToken] token OK, verified uid:", t.uid);
    return { ok: true, customToken };
  }
);

// ─── Redefinir senha por celular (v2.4.97) ───────────────────────────────────
// Alternativa ao link no e-mail pra quem NÃO consegue receber o e-mail de reset
// (ex.: UOL/Hotmail filtram transacional). A pessoa prova que controla o
// CELULAR JÁ CADASTRADO na conta e ganha o direito de definir uma nova senha.
//
// SEGURANÇA: o código/botão SÓ é enviado pro número JÁ cadastrado na conta
// (Auth phoneNumber OU users/{uid}.phone). Se o celular digitado não confere,
// ou a conta não tem celular cadastrado, NÃO enviamos nada — caso contrário
// qualquer um que soubesse o e-mail + tivesse um celular poderia sequestrar a
// conta. Dois canais, espelhando o gate de verificação:
//   • WhatsApp → código NOSSO de 6 dígitos + botão (?pr=TOKEN) de 1 toque.
//   • SMS      → Firebase signInWithPhoneNumber no cliente (prova via idToken).
// Verificado qualquer caminho: marca emailVerified=true e devolve um custom
// token da conta do e-mail pra logar e gravar a nova senha (updatePassword).

// Compara dois telefones ignorando DDI/+/formatação: bate se os últimos 10-11
// dígitos (DDD+número) forem iguais.
function _phoneDigitsMatch(a, b) {
  const da = String(a || "").replace(/\D/g, "");
  const db = String(b || "").replace(/\D/g, "");
  if (da.length < 10 || db.length < 10) return false;
  const ta = da.slice(-11);
  const tb = db.slice(-11);
  // Aceita match em 11 (com 9º dígito) ou 10 (fixo/legado) dígitos finais.
  if (ta === tb) return true;
  return da.slice(-10) === db.slice(-10);
}

// Telefone cadastrado na conta: prefere o perfil (Firestore), cai no Auth.
async function _registeredPhoneFor(uid, userRecord) {
  try {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    if (snap.exists) {
      const p = snap.data() && snap.data().phone;
      if (p) return p;
    }
  } catch (e) { /* ignore */ }
  return (userRecord && userRecord.phoneNumber) || null;
}

exports.sendPasswordResetPhone = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async (request) => {
    const data = request.data || {};
    const email = String(data.email || "").trim().toLowerCase();
    const phoneDigits = _normalizePhoneE164(data.phone || "");
    if (!email || email.indexOf("@") < 0) return { ok: false, reason: "bad-email" };
    if (!phoneDigits) return { ok: false, reason: "bad-phone" };

    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (e) {
      return { ok: false, reason: "no-account" };
    }

    const registered = await _registeredPhoneFor(userRecord.uid, userRecord);
    if (!registered) return { ok: false, reason: "no-phone" };
    if (!_phoneDigitsMatch(registered, phoneDigits)) return { ok: false, reason: "phone-mismatch" };

    const crypto = require("crypto");
    const otp = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const token = crypto.randomBytes(18).toString("base64url");
    const phoneE164 = "+" + phoneDigits;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    const db = admin.firestore();
    try {
      await db.collection("passwordResetPhone").doc(userRecord.uid).set({
        uid: userRecord.uid, email, phone: phoneE164, otpHash, token, attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt,
      });
      await db.collection("passwordResetTokens").doc(token).set({
        uid: userRecord.uid, email, phone: phoneE164, expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("[sendPasswordResetPhone] store failed:", err.code || err.message);
      return { ok: false, reason: "store-error" };
    }

    const wrapperUrl = "https://scoreplace.app/?pr=" + encodeURIComponent(token);
    const message =
      "🎾 *scoreplace.app*\n\n" +
      "Você pediu pra redefinir sua senha.\n\n" +
      "Seu código: *" + otp + "*\n\n" +
      "Digite ele no app — ou toque no link abaixo pra redefinir e entrar direto:\n\n" +
      wrapperUrl + "\n\n" +
      "_O código expira em 15 minutos. Se não foi você, ignore._";

    let apiUrl, apiKey, instance;
    try {
      apiUrl = EVOLUTION_API_URL.value();
      apiKey = EVOLUTION_API_KEY.value();
      instance = EVOLUTION_INSTANCE.value();
    } catch (err) {
      console.error("[sendPasswordResetPhone] secrets unavailable:", err.message);
      return { ok: false, reason: "secrets-missing" };
    }
    const result = await _sendWhatsAppText(apiUrl, apiKey, instance, phoneDigits, message);
    if (!result.ok) {
      console.warn("[sendPasswordResetPhone] WA send failed for", phoneDigits, ":", result.error);
      // Mesmo se o WhatsApp falhar, o SMS (Firebase, no cliente) pode ter ido.
      // Devolve ok:true pra não bloquear — o pendente já está gravado.
      return { ok: true, waFailed: true };
    }
    console.log("[sendPasswordResetPhone] sent to", phoneDigits, "uid:", userRecord.uid);
    return { ok: true };
  }
);

// Marca a verificação como aprovada e devolve um custom token da conta do
// e-mail. Compartilhado pelos dois caminhos (código digitado / botão do WA).
async function _approvePasswordResetPhone(uid, phoneE164, token) {
  const db = admin.firestore();
  // v2.5.x: se a conta de celular ainda não tem e-mail (OTP legado), cria o
  // e-mail sintético AGORA — sem um e-mail atrelado, o updatePassword do cliente
  // não tem onde fixar a senha. O telefone é a prova, então emailVerified=true.
  const authUpdate = { emailVerified: true };
  try {
    const ur = await admin.auth().getUser(uid);
    if (!ur.email && phoneE164) {
      const syn = _syntheticEmailForPhone(phoneE164);
      if (syn) authUpdate.email = syn;
    }
  } catch (e) { /* segue só com emailVerified */ }
  await admin.auth().updateUser(uid, authUpdate).catch(() => {});
  const upd = { emailVerified: true, updatedAt: new Date().toISOString() };
  if (phoneE164) { upd.phone = phoneE164; upd.phoneCountry = "55"; }
  await db.collection("users").doc(uid).set(upd, { merge: true }).catch(() => {});
  let customToken = null;
  try {
    customToken = await admin.auth().createCustomToken(uid, { source: "pw_reset_phone" });
  } catch (err) {
    console.error("[pwResetPhone] createCustomToken failed:", err.code || err.message);
  }
  await db.collection("passwordResetPhone").doc(uid).delete().catch(() => {});
  if (token) await db.collection("passwordResetTokens").doc(token).delete().catch(() => {});
  return customToken;
}

// Verifica o código digitado no app. Aceita:
//   • { email, code:"123456" } → código NOSSO que foi pelo WhatsApp.
//   • { email, idToken }       → prova do SMS do Firebase (idToken da sessão
//     de telefone criada por signInWithPhoneNumber). Confere se o phone_number
//     do token bate com o pendente.
exports.verifyPasswordResetPhone = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    const data = request.data || {};
    const email = String(data.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") < 0) return { ok: false, reason: "bad-email" };

    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(email);
    } catch (e) {
      return { ok: false, reason: "no-account" };
    }
    const uid = userRecord.uid;
    const db = admin.firestore();
    const ref = db.collection("passwordResetPhone").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "no-pending" };
    const v = snap.data();
    const exp = v.expiresAt && v.expiresAt.toDate ? v.expiresAt.toDate() : v.expiresAt;
    if (exp && new Date(exp) < new Date()) { await ref.delete().catch(() => {}); return { ok: false, reason: "expired" }; }

    if (data.idToken) {
      let decoded;
      try {
        decoded = await admin.auth().verifyIdToken(String(data.idToken));
      } catch (e) {
        return { ok: false, reason: "bad-idtoken" };
      }
      const tokenPhone = decoded && decoded.phone_number;
      if (!tokenPhone || !_phoneDigitsMatch(tokenPhone, v.phone)) {
        return { ok: false, reason: "sms-mismatch" };
      }
      const ct = await _approvePasswordResetPhone(uid, v.phone || null, v.token);
      console.log("[verifyPasswordResetPhone] SMS ok, uid:", uid);
      return { ok: true, customToken: ct, email };
    }

    const code = String(data.code || "").trim();
    if (!/^\d{6}$/.test(code)) return { ok: false, reason: "bad-code" };
    if ((v.attempts || 0) >= 6) return { ok: false, reason: "too-many" };
    const crypto = require("crypto");
    const hash = crypto.createHash("sha256").update(code).digest("hex");
    if (hash !== v.otpHash) {
      await ref.update({ attempts: (v.attempts || 0) + 1 }).catch(() => {});
      return { ok: false, reason: "wrong-code" };
    }
    const ct = await _approvePasswordResetPhone(uid, v.phone || null, v.token);
    console.log("[verifyPasswordResetPhone] code ok, uid:", uid);
    return { ok: true, customToken: ct, email };
  }
);

// Resolve o botão do WhatsApp (?pr=TOKEN). NÃO requer auth — o token é o segredo
// (vai só pro dono do telefone cadastrado). Devolve custom token pra logar e
// definir a nova senha no app.
exports.verifyPasswordResetPhoneToken = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    const token = String((request.data && request.data.token) || "").trim();
    if (!token) return { ok: false, reason: "no-token" };
    const db = admin.firestore();
    const ref = db.collection("passwordResetTokens").doc(token);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "invalid-token" };
    const t = snap.data();
    const exp = t.expiresAt && t.expiresAt.toDate ? t.expiresAt.toDate() : t.expiresAt;
    if (exp && new Date(exp) < new Date()) { await ref.delete().catch(() => {}); return { ok: false, reason: "expired" }; }
    const ct = await _approvePasswordResetPhone(t.uid, t.phone || null, token);
    console.log("[verifyPasswordResetPhoneToken] token ok, uid:", t.uid);
    return { ok: true, customToken: ct, email: t.email };
  }
);

// ─── Login unificado (v2.5.x): checkAccount / registerPhonePassword / ─────────
// dispatchAccountRecovery. Backend do campo único (e-mail OU celular) + senha.

// Resolve um identificador (e-mail ou celular) → UserRecord. Celular tenta por
// phoneNumber e cai no e-mail sintético.
async function _resolveAccount(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  if (raw.indexOf("@") >= 0) {
    try { return await admin.auth().getUserByEmail(raw.toLowerCase()); }
    catch (e) { return null; }
  }
  const digits = _normalizePhoneE164(raw);
  if (!digits) return null;
  try { return await admin.auth().getUserByPhoneNumber("+" + digits); }
  catch (e) { /* tenta sintético abaixo */ }
  const syn = _syntheticEmailForPhone(digits);
  if (syn) { try { return await admin.auth().getUserByEmail(syn); } catch (e) { /* nada */ } }
  return null;
}

// Rate-limit por chave (janela de 60s). true = bloqueado. Fail-open em erro.
async function _throttleHit(db, coll, key, maxPerMin) {
  const crypto = require("crypto");
  const id = crypto.createHash("sha256").update(String(key)).digest("hex");
  const ref = db.collection(coll).doc(id);
  const now = Date.now();
  let blocked = false;
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const d = snap.exists ? snap.data() : null;
      const winStart = (d && d.windowStart) || 0;
      let count = (d && d.count) || 0;
      if (now - winStart > 60000) {
        tx.set(ref, { windowStart: now, count: 1 });
      } else {
        count += 1;
        if (count > maxPerMin) blocked = true;
        tx.set(ref, { windowStart: winStart || now, count: count }, { merge: true });
      }
    });
  } catch (e) { /* fail-open */ }
  return blocked;
}

// Existência de conta + canais (mascarados). Oráculo de enumeração ACEITO pela
// UX (distinguir "logar" de "cadastrar"); por isso rate-limit + resposta mascarada.
exports.checkAccount = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const identifier = String((request.data && request.data.identifier) || "").trim();
    if (!identifier) throw new HttpsError("invalid-argument", "identifier vazio");
    const db = admin.firestore();
    if (await _throttleHit(db, "checkAccountThrottle", identifier.toLowerCase(), 20)) {
      throw new HttpsError("resource-exhausted", "muitas tentativas — aguarde");
    }
    const ur = await _resolveAccount(identifier);
    if (!ur) return { exists: false };
    const realEmail = _realEmailOf(ur);
    const phone = await _registeredPhoneFor(ur.uid, ur);
    return {
      exists: true,
      hasPassword: _hasPasswordProvider(ur),
      channels: {
        email: realEmail ? _maskEmail(realEmail) : null,
        phone: phone ? _maskPhone(phone) : null,
      },
    };
  }
);

// Define e-mail sintético + senha numa conta de CELULAR. Só roda APÓS prova de
// posse: o cliente já está logado como o usuário do telefone (signInWithPhoneNumber
// OU custom token do WhatsApp). Cobre cadastro novo E 1ª senha de OTP legado.
exports.registerPhonePassword = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const auth = request.auth;
    if (!auth || !auth.uid) throw new HttpsError("unauthenticated", "sessão de telefone ausente");
    const data = request.data || {};
    const password = String(data.password || "");
    const displayName = String(data.displayName || "").trim();
    const phoneIn = _normalizePhoneE164(data.phone || "");
    if (password.length < 6) throw new HttpsError("invalid-argument", "senha precisa de 6+ caracteres");
    if (!phoneIn) throw new HttpsError("invalid-argument", "telefone inválido");

    // Prova de posse: o número da sessão (claim phone_number do OTP, OU o
    // phoneNumber do usuário no caso do custom token do WhatsApp) tem que bater.
    let verifiedPhone = (auth.token && auth.token.phone_number) || null;
    if (!verifiedPhone) {
      try { const u = await admin.auth().getUser(auth.uid); verifiedPhone = u.phoneNumber || null; } catch (e) { /* nada */ }
    }
    if (!verifiedPhone || !_phoneDigitsMatch(verifiedPhone, phoneIn)) {
      throw new HttpsError("permission-denied", "telefone não confere com a sessão verificada");
    }

    const uid = auth.uid;
    const synthetic = _syntheticEmailForPhone(phoneIn);
    const phoneE164 = "+" + phoneIn;
    try {
      const owner = await admin.auth().getUserByEmail(synthetic);
      if (owner && owner.uid !== uid) throw new HttpsError("already-exists", "número já vinculado a outra conta");
    } catch (e) {
      if (e instanceof HttpsError) throw e; // user-not-found = ok
    }

    const upd = { email: synthetic, emailVerified: true, password: password, phoneNumber: phoneE164 };
    if (displayName) upd.displayName = displayName;
    try {
      await admin.auth().updateUser(uid, upd);
    } catch (err) {
      console.error("[registerPhonePassword] updateUser failed:", err.code || err.message);
      throw new HttpsError("internal", "não foi possível salvar: " + (err.code || err.message));
    }
    const prof = { phone: phoneE164, phoneCountry: "55", authProvider: "phone+password", updatedAt: new Date().toISOString() };
    if (displayName) prof.displayName = displayName;
    await admin.firestore().collection("users").doc(uid).set(prof, { merge: true }).catch(() => {});
    console.log("[registerPhonePassword] set for uid:", uid);
    return { ok: true };
  }
);

// ─── Login por celular uid-first (v2.6.x) ────────────────────────────────────
// Resolve o identificador (celular OU e-mail) → conta/uid pelo NÚMERO/e-mail
// (independe do e-mail sintético), verifica a senha SERVER-SIDE contra a
// credencial REAL da conta (seja ela o e-mail real ou o sintético) e devolve um
// custom token. Conserta o bug: conta de celular que vinculou e-mail real tinha
// o e-mail primário trocado do sintético→real, mas o login por celular no cliente
// entrava contra o sintético (que deixou de existir) → "senha errada". Aqui o
// e-mail nunca volta pro cliente; o cliente só recebe o token. uid-first.
exports.phonePasswordLogin = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
    secrets: [SIGNIN_API_KEY] },
  async (request) => {
    const data = request.data || {};
    const identifier = String(data.phone || data.identifier || "").trim();
    const password = String(data.password || "");
    if (!identifier) throw new HttpsError("invalid-argument", "identificador vazio");
    if (password.length < 6) throw new HttpsError("invalid-argument", "senha precisa de 6+ caracteres");

    const db = admin.firestore();
    // Rate-limit por identificador (15/min) — fail-open em erro.
    if (await _throttleHit(db, "phoneLoginThrottle", identifier.toLowerCase(), 15)) {
      throw new HttpsError("resource-exhausted", "muitas tentativas — aguarde um momento");
    }

    // Resolve conta pelo número (getUserByPhoneNumber) ou e-mail — independe do
    // e-mail sintético ter sido substituído pelo real.
    const ur = await _resolveAccount(identifier);
    if (!ur) return { ok: false, reason: "no-account" };
    const signInEmail = ur.email; // e-mail REAL de login do Firebase Auth (real ou sintético)
    if (!signInEmail || !_hasPasswordProvider(ur)) return { ok: false, reason: "no-password" };

    // Verifica a senha server-side contra a credencial real da conta.
    let verifyOk = false; let verifyLocalId = null;
    try {
      const apiKey = SIGNIN_API_KEY.value();
      const resp = await fetch(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + encodeURIComponent(apiKey),
        { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: signInEmail, password: password, returnSecureToken: false }) }
      );
      if (resp.ok) {
        const j = await resp.json();
        verifyOk = true; verifyLocalId = j.localId || null;
      } else {
        // 400 = senha errada / e-mail inexistente (esperado). Outros = logar.
        if (resp.status !== 400) {
          const body = await resp.text().catch(() => "");
          console.error("[phonePasswordLogin] signInWithPassword status:", resp.status, body.slice(0, 200));
        }
      }
    } catch (e) {
      console.error("[phonePasswordLogin] verify error:", (e && (e.code || e.message)) || e);
      throw new HttpsError("internal", "falha ao verificar a senha");
    }

    if (!verifyOk) return { ok: false, reason: "wrong-password" };
    // Sanidade: a credencial verificada tem que ser a MESMA conta resolvida.
    if (verifyLocalId && verifyLocalId !== ur.uid) {
      console.error("[phonePasswordLogin] uid mismatch resolve=", ur.uid, "verify=", verifyLocalId);
      return { ok: false, reason: "mismatch" };
    }

    const token = await admin.auth().createCustomToken(ur.uid, { source: "phone_password_login" });
    console.log("[phonePasswordLogin] ok uid:", ur.uid);
    return { ok: true, token: token };
  }
);

// Recuperação automática (senha errada/ausente): dispara WhatsApp + e-mail nos
// canais que a conta tem, com cooldown de 10 min/conta. SMS não é server-side.
exports.dispatchAccountRecovery = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 45,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE] },
  async (request) => {
    const identifier = String((request.data && request.data.identifier) || "").trim();
    if (!identifier) throw new HttpsError("invalid-argument", "identifier vazio");
    const db = admin.firestore();
    const ur = await _resolveAccount(identifier);
    if (!ur) return { ok: true }; // silencioso (enumeração)

    const realEmail = _realEmailOf(ur);
    const phone = await _registeredPhoneFor(ur.uid, ur);

    // Cooldown por conta (10 min).
    const throttleRef = db.collection("recoveryThrottle").doc(ur.uid);
    const tSnap = await throttleRef.get().catch(() => null);
    const last = (tSnap && tSnap.exists && tSnap.data().lastSentAt) || 0;
    if (last && (Date.now() - last) < 10 * 60 * 1000) {
      return { ok: true, throttled: true,
        channels: { email: realEmail ? _maskEmail(realEmail) : null, phone: phone ? _maskPhone(phone) : null } };
    }

    const out = { email: null, phone: null };

    // Canal e-mail (só com e-mail REAL).
    if (realEmail) {
      try {
        const link = await _genPasswordResetLink(realEmail);
        if (link && link !== "USER_NOT_FOUND") {
          await _queuePasswordResetEmail(db, realEmail, link, (ur.displayName || ""));
          out.email = _maskEmail(realEmail);
        }
      } catch (e) { console.warn("[dispatchAccountRecovery] email leg:", e.message || e); }
    }

    // Canal WhatsApp (só com telefone) — mesma mecânica do sendPasswordResetPhone.
    if (phone) {
      try {
        const phoneDigits = _normalizePhoneE164(phone);
        const crypto = require("crypto");
        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
        const token = crypto.randomBytes(18).toString("base64url");
        const phoneE164 = "+" + phoneDigits;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const emailForReset = realEmail || _syntheticEmailForPhone(phoneDigits);
        await db.collection("passwordResetPhone").doc(ur.uid).set({
          uid: ur.uid, email: emailForReset, phone: phoneE164, otpHash, token, attempts: 0,
          createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt,
        });
        await db.collection("passwordResetTokens").doc(token).set({
          uid: ur.uid, email: emailForReset, phone: phoneE164, expiresAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const wrapperUrl = "https://scoreplace.app/?pr=" + encodeURIComponent(token);
        const message =
          "🎾 *scoreplace.app*\n\n" +
          "Tentaram entrar e a senha não bateu.\n\n" +
          "Código pra redefinir: *" + otp + "*\n\n" +
          "Digite no app — ou toque pra redefinir e entrar direto:\n\n" +
          wrapperUrl + "\n\n" +
          "_Expira em 15 minutos. Se não foi você, ignore._";
        const apiUrl = EVOLUTION_API_URL.value();
        const apiKey = EVOLUTION_API_KEY.value();
        const instance = EVOLUTION_INSTANCE.value();
        const r = await _sendWhatsAppText(apiUrl, apiKey, instance, phoneDigits, message);
        if (r.ok) out.phone = _maskPhone(phone);
        else console.warn("[dispatchAccountRecovery] WA failed:", r.error);
      } catch (e) { console.warn("[dispatchAccountRecovery] phone leg:", e.message || e); }
    }

    await throttleRef.set({ lastSentAt: Date.now() }, { merge: true }).catch(() => {});
    return { ok: true, channels: out };
  }
);

// v2.5.x: login pós-merge. O Firebase não move credenciais entre uids, então a
// credencial (celular/e-mail) da conta antiga continua nela após o merge. Se a
// pessoa loga por esse identificador, cai no uid tombstoned (mergedInto). Esta
// função devolve um custom token do SOBREVIVENTE pra o cliente re-logar nele —
// só funciona pra quem JÁ provou ser dono da conta antiga (está autenticado nela).
exports.resolveMergedLogin = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login obrigatório");
    const db = admin.firestore();
    const snap = await db.collection("users").doc(uid).get();
    const mergedInto = snap.exists && snap.data().mergedInto;
    if (!mergedInto || typeof mergedInto !== "string" || mergedInto === uid) return { merged: false };
    // Segue a cadeia (caso o sobrevivente também tenha sido mesclado depois).
    let target = mergedInto; let guard = 0;
    while (guard++ < 5) {
      const ts = await db.collection("users").doc(target).get();
      const next = ts.exists && ts.data().mergedInto;
      if (next && typeof next === "string" && next !== target) { target = next; continue; }
      if (!ts.exists) return { merged: false };
      break;
    }
    let customToken;
    try {
      customToken = await admin.auth().createCustomToken(target, { source: "merged_login_redirect" });
    } catch (err) {
      console.error("[resolveMergedLogin] createCustomToken failed:", err.code || err.message);
      throw new HttpsError("internal", "não foi possível redirecionar o login");
    }
    return { merged: true, survivorUid: target, customToken };
  }
);

// v2.5.x: confirmação de posse de celular no PERFIL via WhatsApp (além do SMS
// nativo do Firebase). Manda um CÓDIGO nosso (não um link, que trocaria a
// sessão) — a pessoa digita no mesmo campo do OTP. verify devolve um custom
// token da conta do telefone, que vira a PROVA pro merge (proofIdToken).
exports.sendPhoneOwnershipWhatsApp = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE] },
  async (request) => {
    if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "login obrigatório");
    const phone = _normalizePhoneE164(request.data && request.data.phone);
    if (!phone) return { ok: false, reason: "bad-phone" };
    let uid;
    try { uid = (await admin.auth().getUserByPhoneNumber("+" + phone)).uid; }
    catch (e) { try { uid = (await admin.auth().createUser({ phoneNumber: "+" + phone })).uid; } catch (e2) { return { ok: false, reason: "auth-error" }; } }
    const crypto = require("crypto");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    await admin.firestore().collection("phoneOwnership").doc(uid).set({
      uid, phone: "+" + phone, codeHash, attempts: 0,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const msg = "🎾 *scoreplace.app*\n\nSeu código pra confirmar este celular no seu perfil: *" + code + "*\n\n_Expira em 10 minutos. Se não foi você, ignore._";
    try {
      const r = await _sendWhatsAppText(EVOLUTION_API_URL.value(), EVOLUTION_API_KEY.value(), EVOLUTION_INSTANCE.value(), phone, msg);
      return { ok: !!r.ok };
    } catch (e) { return { ok: false, reason: "wa-error" }; }
  }
);

exports.verifyPhoneOwnershipWhatsApp = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: ["https://scoreplace.app", "http://localhost:9876"] },
  async (request) => {
    if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "login obrigatório");
    const phone = _normalizePhoneE164(request.data && request.data.phone);
    const code = String((request.data && request.data.code) || "").trim();
    if (!phone || !/^\d{6}$/.test(code)) return { ok: false, reason: "bad-input" };
    let uid;
    try { uid = (await admin.auth().getUserByPhoneNumber("+" + phone)).uid; } catch (e) { return { ok: false, reason: "no-account" }; }
    const db = admin.firestore(); const ref = db.collection("phoneOwnership").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "no-pending" };
    const v = snap.data();
    const exp = v.expiresAt && v.expiresAt.toDate ? v.expiresAt.toDate() : v.expiresAt;
    if (exp && new Date(exp) < new Date()) { await ref.delete().catch(() => {}); return { ok: false, reason: "expired" }; }
    if ((v.attempts || 0) >= 6) return { ok: false, reason: "too-many" };
    const crypto = require("crypto");
    if (crypto.createHash("sha256").update(code).digest("hex") !== v.codeHash) {
      await ref.update({ attempts: (v.attempts || 0) + 1 }).catch(() => {});
      return { ok: false, reason: "wrong-code" };
    }
    await ref.delete().catch(() => {});
    let customToken;
    try { customToken = await admin.auth().createCustomToken(uid, { source: "phone_ownership_wa" }); }
    catch (e) { return { ok: false, reason: "token-error" }; }
    return { ok: true, customToken: customToken };
  }
);

exports.processWhatsAppQueue = onDocumentCreated(
  {
    document: "whatsapp_queue/{queueId}",
    region: "us-central1",
    timeoutSeconds: 60,
    memory: "256MiB",
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
    retryConfig: { retryCount: 2 }, // Firebase auto-retries 2x em caso de unhandled error
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    if (!data || !data.message || !Array.isArray(data.phones) || data.phones.length === 0) {
      console.warn("[processWhatsAppQueue] doc inválido — skip:", event.params.queueId);
      await snap.ref.update({
        status: "failed",
        lastError: "missing phones[] or message",
        processedAt: new Date().toISOString(),
      });
      return;
    }
    // Idempotência: se já processado (retry do trigger), skip
    if (data.status === "sent" || data.status === "partial") return;

    const apiUrl = EVOLUTION_API_URL.value();
    const apiKey = EVOLUTION_API_KEY.value();
    const instance = EVOLUTION_INSTANCE.value();
    if (!apiUrl || !apiKey || !instance) {
      console.error("[processWhatsAppQueue] secrets ausentes");
      await snap.ref.update({
        status: "failed",
        lastError: "Evolution secrets not configured",
        processedAt: new Date().toISOString(),
      });
      return;
    }

    const deliveries = [];
    for (const rawPhone of data.phones) {
      const phone = _normalizePhoneE164(rawPhone);
      if (!phone) {
        deliveries.push({ phone: String(rawPhone), ok: false, error: "invalid phone format" });
        continue;
      }
      const result = await _sendWhatsAppText(apiUrl, apiKey, instance, phone, data.message);
      // Omitir campos undefined — Firestore rejeita undefined como valor
      const delivery = { phone: phone, ok: result.ok };
      if (result.messageId !== undefined) delivery.messageId = result.messageId;
      if (result.error !== undefined) delivery.error = result.error;
      deliveries.push(delivery);
      // Pequena pausa entre msgs múltiplas — Evolution já tem delay interno
      // mas adicional 200ms reduz chance de rate-limit do WhatsApp Web.
      if (data.phones.length > 1) await new Promise((r) => setTimeout(r, 200));
    }

    const okCount = deliveries.filter((d) => d.ok).length;
    const totalCount = deliveries.length;
    const status = okCount === totalCount ? "sent" : (okCount === 0 ? "failed" : "partial");
    const attempts = (data.attempts || 0) + 1;

    await snap.ref.update({
      status: status,
      attempts: attempts,
      processedAt: new Date().toISOString(),
      deliveries: deliveries,
      lastError: status === "failed" ? (deliveries[0] && deliveries[0].error) || "unknown" : admin.firestore.FieldValue.delete(),
    });

    console.log(`[processWhatsAppQueue] ${event.params.queueId}: ${okCount}/${totalCount} entregues`);
  }
);

// ─── Scheduled cleanup: WhatsApp queue antigos ────────────────────────────
// Roda diariamente 03:45 BRT, deleta docs `sent`/`failed` com mais de 30 dias.
// `pending` não toca — pode estar em retry.
exports.cleanupOldWhatsAppQueue = onSchedule(
  {
    schedule: "every day 03:45",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const query = db.collection("whatsapp_queue")
      .where("status", "in", ["sent", "failed"])
      .where("processedAt", "<", threshold);
    const deleted = await _batchDeleteQuery(query);
    console.log(`[cleanupOldWhatsAppQueue] deleted ${deleted} docs (threshold: ${threshold})`);
  }
);

// ═══ Auto-heal da conexão WhatsApp (Evolution/Baileys no Railway) ════════════
// v2.4.65: a conexão Baileys trava periodicamente — reporta state=open mas todo
// send falha com 500 "Connection Closed". O ÚNICO fix é reiniciar o container do
// Railway (restart/logout/delete via Evolution API não revivem). Aqui:
//   • whatsappHealthGuard (a cada 10 min): sonda o socket VIVO via
//     /chat/whatsappNumbers (não envia msg). Se travado e fora da janela de
//     cooldown → redeploy do container via API do Railway. Marca aviso pendente.
//     Quando volta a ficar saudável após um restart → manda o aviso (WhatsApp+email).
//   • whatsappNightlyRestart (04:30 BRT): redeploy preventivo diário.
// IDs do Railway são estáveis (projeto scoreplace-whatsapp / serviço evolution-api).

const RAILWAY_PROJECT_ID = "f9c9cc88-9b26-443a-ab01-58fc397c7e91";
const RAILWAY_ENVIRONMENT_ID = "8cc8728f-6f6e-459a-a545-f434e73cebb6";
const RAILWAY_SERVICE_ID = "823562f0-02c6-4447-97f1-0977223b7a97";
const GUARD_DOC = "system/whatsappGuard";
const RESTART_COOLDOWN_MS = 20 * 60 * 1000; // não reinicia 2x em < 20 min

// Sonda não-intrusiva: usa o socket vivo, não envia mensagem. true = saudável.
async function _probeWhatsAppHealth(apiUrl, apiKey, instance) {
  const url = apiUrl.replace(/\/+$/, "") + "/chat/whatsappNumbers/" + encodeURIComponent(instance);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": apiKey },
      body: JSON.stringify({ numbers: ["5511916936454"] }),
    });
    if (!resp.ok) return { healthy: false, detail: "HTTP " + resp.status };
    const data = await resp.json().catch(() => null);
    // Resposta saudável é um array (lista de números checados).
    if (Array.isArray(data)) return { healthy: true };
    return { healthy: false, detail: "resposta inesperada" };
  } catch (e) {
    return { healthy: false, detail: "fetch: " + (e.message || String(e)) };
  }
}

// Reinicia o container do serviço no Railway (mesmo efeito de `railway redeploy`).
async function _railwayRedeploy(token) {
  const query = "mutation($e:String!,$s:String!){serviceInstanceRedeploy(environmentId:$e,serviceId:$s)}";
  try {
    const resp = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ query, variables: { e: RAILWAY_ENVIRONMENT_ID, s: RAILWAY_SERVICE_ID } }),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || (data && data.errors)) {
      return { ok: false, error: "Railway HTTP " + resp.status + ": " + JSON.stringify(data && data.errors || resp.statusText) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "fetch: " + (e.message || String(e)) };
  }
}

// Enfileira aviso ao dev (WhatsApp + e-mail) sobre uma auto-recuperação.
async function _notifyDevRecovery(db, title, body) {
  try {
    await db.collection("whatsapp_queue").add({
      phones: ["5511916936454"],
      message: "🩺 " + title + "\n" + body,
      createdAt: new Date().toISOString(),
      status: "pending",
    });
  } catch (e) { /* ignore */ }
  try {
    await db.collection("mail").add({
      to: ["scoreplace.app@gmail.com"],
      replyTo: "scoreplace.app@gmail.com",
      message: { subject: "scoreplace — " + title, text: body, html: "<p>" + body.replace(/\n/g, "<br>") + "</p>" },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { /* ignore */ }
}

exports.whatsappHealthGuard = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE, RAILWAY_API_TOKEN],
  },
  async () => {
    const db = admin.firestore();
    const guardRef = db.doc(GUARD_DOC);
    const apiUrl = EVOLUTION_API_URL.value();
    const apiKey = EVOLUTION_API_KEY.value();
    const instance = EVOLUTION_INSTANCE.value();
    const railwayToken = RAILWAY_API_TOKEN.value();
    if (!apiUrl || !apiKey || !instance) { console.error("[whatsappHealthGuard] secrets Evolution ausentes"); return; }

    const probe = await _probeWhatsAppHealth(apiUrl, apiKey, instance);
    const nowMs = Date.now();
    const guardSnap = await guardRef.get();
    const guard = guardSnap.exists ? guardSnap.data() : {};

    if (probe.healthy) {
      // Se acabamos de recuperar de um restart, avisa o dev (agora que dá pra enviar).
      const upd = { lastHealthyAt: new Date().toISOString(), lastHealthyAtMs: nowMs };
      if (guard.pendingRecoveryNotice) {
        await _notifyDevRecovery(db, "WhatsApp recuperado automaticamente",
          "A conexão do WhatsApp tinha caído (\"Connection Closed\") e foi reiniciada automaticamente. Já está entregando de novo.");
        upd.pendingRecoveryNotice = false;
        upd.lastRecoveryNoticeAt = new Date().toISOString();
      }
      await guardRef.set(upd, { merge: true });
      console.log("[whatsappHealthGuard] saudável");
      return;
    }

    // Travado. Respeita cooldown pra não reiniciar enquanto o container ainda sobe.
    const sinceLast = guard.lastRestartAtMs ? (nowMs - guard.lastRestartAtMs) : Infinity;
    if (sinceLast < RESTART_COOLDOWN_MS) {
      console.warn("[whatsappHealthGuard] travado (" + probe.detail + ") mas em cooldown (" + Math.round(sinceLast / 60000) + " min) — aguardando subir");
      return;
    }
    if (!railwayToken) {
      console.error("[whatsappHealthGuard] travado (" + probe.detail + ") mas RAILWAY_API_TOKEN ausente — não dá pra reiniciar");
      return;
    }

    console.warn("[whatsappHealthGuard] travado (" + probe.detail + ") → reiniciando container Railway");
    const r = await _railwayRedeploy(railwayToken);
    await guardRef.set({
      lastRestartAt: new Date().toISOString(),
      lastRestartAtMs: nowMs,
      lastRestartReason: "auto: " + (probe.detail || "unhealthy"),
      lastRestartOk: r.ok,
      lastRestartError: r.ok ? admin.firestore.FieldValue.delete() : (r.error || "?"),
      restartCount: (guard.restartCount || 0) + 1,
      pendingRecoveryNotice: r.ok ? true : (guard.pendingRecoveryNotice || false),
    }, { merge: true });

    if (!r.ok) {
      // Restart falhou (token inválido?). Avisa o dev por e-mail (WhatsApp está fora).
      await _notifyDevRecovery(db, "Falha ao reiniciar WhatsApp automaticamente",
        "Detectei o WhatsApp travado mas o restart automático no Railway falhou: " + r.error + ". Precisa reiniciar manualmente.");
      console.error("[whatsappHealthGuard] redeploy falhou:", r.error);
    } else {
      console.log("[whatsappHealthGuard] redeploy disparado com sucesso");
    }
  }
);

exports.whatsappNightlyRestart = onSchedule(
  {
    schedule: "every day 04:30",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    secrets: [RAILWAY_API_TOKEN],
  },
  async () => {
    const db = admin.firestore();
    const railwayToken = RAILWAY_API_TOKEN.value();
    if (!railwayToken) { console.error("[whatsappNightlyRestart] RAILWAY_API_TOKEN ausente"); return; }
    const r = await _railwayRedeploy(railwayToken);
    await db.doc(GUARD_DOC).set({
      lastRestartAt: new Date().toISOString(),
      lastRestartAtMs: Date.now(),
      lastRestartReason: "preventivo noturno",
      lastRestartOk: r.ok,
      restartCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
    console.log("[whatsappNightlyRestart] redeploy preventivo:", r.ok ? "ok" : ("falhou: " + r.error));
  }
);

// ─── notifyLeagueRoundWhatsApp ─────────────────────────────────────────────
// Chamada pelo cliente após sortear nova rodada da Liga/Suíço.
// Para cada partida da rodada, busca o telefone de cada jogador no Firestore,
// cria um grupo no WhatsApp com eles via Evolution API e envia uma mensagem
// informando que precisam combinar o jogo e lançar o resultado antes do
// próximo sorteio agendado.
//
// Input: {
//   tournamentId: string,
//   roundIndex: number,       // índice do round em t.rounds (0-based)
//   nextDrawDateStr: string,  // "DD/MM/YYYY às HH:MM" ou "Não agendado"
// }
// Output: { ok: true, groups: [{match, created, groupJid, error?}] }
exports.notifyLeagueRoundWhatsApp = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async (request) => {
    const { tournamentId, roundIndex, nextDrawDateStr } = request.data || {};
    if (!tournamentId) return { ok: false, reason: "missing-tournament-id" };

    const db = admin.firestore();
    const apiUrl = EVOLUTION_API_URL.value();
    const apiKey = EVOLUTION_API_KEY.value();
    const instance = EVOLUTION_INSTANCE.value();

    // ── 1. Fetch tournament ──────────────────────────────────────────
    let t;
    try {
      const snap = await db.collection("tournaments").doc(String(tournamentId)).get();
      if (!snap.exists) return { ok: false, reason: "tournament-not-found" };
      t = snap.data();
    } catch (e) {
      console.error("[notifyLeagueRoundWhatsApp] fetch tournament failed:", e.message);
      return { ok: false, reason: "firestore-error" };
    }

    // ── 2. Get the round ────────────────────────────────────────────
    const rounds = t.rounds || [];
    const ri = (typeof roundIndex === "number") ? roundIndex : rounds.length - 1;
    const round = rounds[ri];
    if (!round || !Array.isArray(round.matches)) {
      return { ok: false, reason: "round-not-found" };
    }
    const realMatches = round.matches.filter((m) => !m.isSitOut && !m.isBye);
    if (realMatches.length === 0) return { ok: false, reason: "no-matches" };

    // ── 3. Build phone lookup from participants + users collection ───
    // participants[] can have: { displayName, name, uid, email, phone }
    const participants = Array.isArray(t.participants)
      ? t.participants
      : Object.values(t.participants || {});

    // Map: normalizedName → { uid, email, phone }
    // For doubles teams ("Alice/Bob"), we add entries for:
    //  1. The full team name ("alice/bob") → primary registrant's uid/email/phone
    //  2. Each nested member in p.participants[] → their own uid/email/phone (best path)
    //  3. Each slash-split individual ("alice", "bob") → fallback to team entry
    // This ensures resolvePhone works for all 4 players in a doubles match.
    const participantMap = {};
    const normalize = (s) => String(s || "").trim().toLowerCase();
    participants.forEach((p) => {
      if (!p || typeof p !== "object") return;
      const fullName = normalize(p.displayName || p.name || "");
      const teamEntry = {
        uid: p.uid || null,
        email: p.email || null,
        phone: p.phone || null,
      };
      if (fullName) participantMap[fullName] = teamEntry;

      // Path 1: nested participants[] — each member has their own uid (doubles teams with full data)
      if (Array.isArray(p.participants)) {
        p.participants.forEach((member) => {
          if (!member || typeof member !== "object") return;
          const mName = normalize(member.displayName || member.name || "");
          if (mName && !participantMap[mName]) {
            participantMap[mName] = {
              uid: member.uid || null,
              email: member.email || null,
              phone: member.phone || null,
            };
          }
        });
      }

      // Path 2: slash-split fallback — "alice/bob" → also map "alice" and "bob"
      // Points to the team entry (uid = primary registrant); at minimum, the primary's
      // phone will be found. If the partner has their own nested entry (path 1), that
      // was already added above and won't be overwritten here (check `!participantMap[m]`).
      if (fullName && fullName.includes("/")) {
        fullName.split("/").map((s) => s.trim()).filter(Boolean).forEach((m) => {
          const mKey = normalize(m);
          if (mKey && !participantMap[mKey]) {
            participantMap[mKey] = teamEntry;
          }
        });
      }
    });

    // Resolve phone for a player name: first from participants map, then
    // from users collection (by uid or by email_lower).
    // v2.4.3: respeita a privacidade — usuário com omitPhone===true NÃO entra no
    // grupo de WhatsApp (grupo revelaria o número aos demais). Retorna null → ele
    // fica de fora do grupo, mas segue avisado por notificação 1:1 + plataforma/email.
    // Ordem uid-first (autoridade) pra checar omitPhone antes do phone informal.
    async function resolvePhone(playerName) {
      const key = normalize(playerName);
      const entry = participantMap[key];
      if (!entry) return null;
      // 1. uid → perfil (fonte da verdade; checa omitPhone)
      if (entry.uid) {
        try {
          const userDoc = await db.collection("users").doc(entry.uid).get();
          if (userDoc.exists) {
            const d = userDoc.data() || {};
            if (d.omitPhone === true) return null; // privacidade: fora do grupo
            if (d.phone) return _normalizePhone(d.phone);
          }
        } catch (_) {}
      }
      // 2. phone direto no participante (informal, sem conta — omitPhone não se aplica)
      if (entry.phone) return _normalizePhone(entry.phone);
      // 3. email_lower → perfil (checa omitPhone)
      if (entry.email) {
        try {
          const emailLower = String(entry.email).toLowerCase().trim();
          const q = await db.collection("users")
            .where("email_lower", "==", emailLower).limit(1).get();
          if (!q.empty) {
            const d = q.docs[0].data() || {};
            if (d.omitPhone === true) return null; // privacidade: fora do grupo
            if (d.phone) return _normalizePhone(d.phone);
          }
        } catch (_) {}
      }
      return null;
    }

    const tournamentName = t.name || "Liga";
    const roundNumber = ri + 1;
    const tId = String(tournamentId);

    // ── 4. For each match: create WA group + send message ───────────
    const results = [];
    for (const match of realMatches) {
      // Extract player names (supports singles p1/p2 and doubles team1/team2)
      let playerNames = [];
      if (Array.isArray(match.team1) && match.team1.length > 0) {
        playerNames = [...match.team1, ...(match.team2 || [])];
      } else {
        if (match.p1) playerNames.push(match.p1);
        if (match.p2) playerNames.push(match.p2);
      }
      // For doubles: expand "Alice/Bob" → ["Alice/Bob", "Alice", "Bob"]
      // We include both the full team name AND individual members so that resolvePhone
      // can match via the team-key fallback AND via individual participant entries.
      const expandedNames = [];
      playerNames.forEach((n) => {
        const teamName = String(n).trim();
        if (!teamName) return;
        expandedNames.push(teamName); // full name (e.g. "Alice/Bob") — covers slash-map fallback
        if (teamName.includes("/")) {
          // Also add individual members so their own uid/phone can be found
          teamName.split("/").map((s) => s.trim()).filter(Boolean).forEach((m) => {
            if (m && m !== teamName) expandedNames.push(m);
          });
        }
      });

      // Resolve phones (in parallel) — deduplicate so same phone isn't added twice
      // (e.g. "Alice/Bob" and "Alice" both resolving to Alice's phone)
      const phoneResults = await Promise.all(expandedNames.map(resolvePhone));
      const phones = [...new Set(phoneResults.filter(Boolean))];

      if (phones.length < 2) {
        console.log(`[notifyLeagueRoundWhatsApp] match "${match.p1 || (match.team1||[]).join('+')} vs ${match.p2 || (match.team2||[]).join('+')}": only ${phones.length} phone(s) found — skipping group creation`);
        results.push({ match: `${match.p1} vs ${match.p2}`, created: false, reason: "insufficient-phones" });
        continue;
      }

      // Group subject — max 100 chars for WA
      const matchLabel = Array.isArray(match.team1)
        ? `${(match.team1 || []).join("+")} vs ${(match.team2 || []).join("+")}`
        : `${match.p1 || "?"} vs ${match.p2 || "?"}`;
      const subject = `${tournamentName} R${roundNumber}: ${matchLabel}`.substring(0, 100);

      // Message body
      const nextDrawLabel = nextDrawDateStr || "Não agendado";
      const link = `https://scoreplace.app/#bracket/${tId}`;
      const message =
        `🎾 *${tournamentName} — Rodada ${roundNumber}*\n\n` +
        `Olá! Vocês foram sorteados para jogar juntos nesta rodada.\n\n` +
        `📋 *Partida:* ${matchLabel}\n` +
        `⏰ *Prazo:* Lancem o resultado antes do próximo sorteio:\n` +
        `📅 *Próximo sorteio:* ${nextDrawLabel}\n\n` +
        `Combinem o horário aqui no grupo e registrem o placar no app:\n${link}`;

      // ── Create group ────────────────────────────────────────────────
      let groupJid = null;
      try {
        const createUrl = apiUrl.replace(/\/+$/, "") + "/group/create/" + encodeURIComponent(instance);
        // Evolution API expects participants as "55XXXXXXXXXXX" (no @s.whatsapp.net for creation)
        const participantsList = phones.map((p) => p.replace(/[^0-9]/g, ""));
        const createResp = await fetch(createUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": apiKey,
          },
          body: JSON.stringify({
            subject: subject,
            description: `Partida da ${tournamentName}. Combinem e lancem o resultado antes de ${nextDrawLabel}.`,
            participants: participantsList,
          }),
        });
        const createData = await createResp.json().catch(() => null);
        if (!createResp.ok) {
          const errMsg = (createData && createData.message) ? JSON.stringify(createData.message) : createResp.statusText;
          console.error(`[notifyLeagueRoundWhatsApp] group create failed for "${matchLabel}": HTTP ${createResp.status} — ${errMsg}`);
          results.push({ match: matchLabel, created: false, reason: `group-create-failed: ${createResp.status}` });
          continue;
        }
        // Extract group JID — Evolution returns different shapes depending on version
        groupJid =
          (createData && createData._serialized) ||
          (createData && createData.id && createData.id._serialized) ||
          (createData && createData.id && typeof createData.id === "string" ? createData.id : null) ||
          null;
        if (!groupJid && createData) {
          // Try to find any key containing "@g.us"
          const raw = JSON.stringify(createData);
          const m = raw.match(/"([0-9\-]+@g\.us)"/);
          if (m) groupJid = m[1];
        }
        console.log(`[notifyLeagueRoundWhatsApp] group created for "${matchLabel}": jid=${groupJid}`);
      } catch (e) {
        console.error(`[notifyLeagueRoundWhatsApp] group create exception for "${matchLabel}":`, e.message);
        results.push({ match: matchLabel, created: false, reason: `group-create-exception: ${e.message}` });
        continue;
      }

      if (!groupJid) {
        results.push({ match: matchLabel, created: true, groupJid: null, reason: "group-jid-not-found-in-response" });
        continue;
      }

      // Small delay before sending message
      await new Promise((r) => setTimeout(r, 1500));

      // ── Send message to the group ───────────────────────────────────
      const msgResult = await _sendWhatsAppText(apiUrl, apiKey, instance, groupJid, message);
      console.log(`[notifyLeagueRoundWhatsApp] message to group ${groupJid}:`, msgResult.ok ? "ok" : msgResult.error);
      results.push({ match: matchLabel, created: true, groupJid, messageSent: msgResult.ok, messageError: msgResult.error });

      // Small delay between groups to avoid rate limiting
      await new Promise((r) => setTimeout(r, 1000));
    }

    const created = results.filter((r) => r.created).length;
    console.log(`[notifyLeagueRoundWhatsApp] tournament ${tId} round ${roundNumber}: ${created}/${realMatches.length} groups created`);
    return { ok: true, groups: results };
  }
);

// ─── Retroactive Trophy Backfill ─────────────────────────────────────────────
// Callable function that sweeps ALL existing users and awards trophies/milestones
// based on their historical Firestore data.  Uses Admin SDK so it bypasses
// Firestore security rules (no user login required per target uid).
//
// Only callable by the app owner (rstbarth@gmail.com).
// Expected runtime: a few minutes for tens of users; ~5-10 min for hundreds.
//
// Trophies that depend on real-time event payload (madrugador, noturno, virada)
// are SKIPPED in backfill — they will be awarded going forward on new events.
//
// Returns: { processed, trophiesAwarded, milestonesAwarded, errors, counts }
//
// Trigger from the app: click "🔧 Backfill Troféus" on the admin dashboard panel.

// ── Inline trophy conditions (ported from trophy-catalog.js) ─────────────────
// Only includes trophies that CAN be retroactively verified from stored data.
const BACKFILL_TROPHY_DEFS = [
  // PERFIL
  { id: "perfil_completo",    check: (u, s) => !!(u.displayName && u.preferredSports && u.preferredSports.length > 0 && u.gender && u.city && (u.skill || (u.skillBySport && Object.keys(u.skillBySport).length > 0))) },
  { id: "perfil_foto",        check: (u, s) => !!(u.photoURL && u.photoURL.length > 0) },
  { id: "perfil_local",       check: (u, s) => !!(u.preferredLocations && u.preferredLocations.length > 0) },
  { id: "perfil_skills",      check: (u, s) => !!(u.skillBySport && Object.keys(u.skillBySport).length >= 3) },
  // CASUAIS
  { id: "casual_primeira",            check: (u, s) => (s.casualMatchesPlayed || 0) >= 1 },
  { id: "casual_primeira_vitoria",    check: (u, s) => (s.casualMatchesWon || 0) >= 1 },
  { id: "casual_multimodalidade",     check: (u, s) => (s.casualSportsPlayed || 0) >= 3 },
  { id: "casual_maratonista",         check: (u, s) => (s.casualActiveDaysThisMonth || 0) >= 7 },
  // especial_all_modalities
  { id: "especial_all_modalities",    check: (u, s) => (s.casualSportsPlayed || 0) >= 9 },
  // TORNEIOS
  { id: "torneio_primeiro_inscrito",  check: (u, s) => (s.tournamentsEnrolled || 0) >= 1 },
  { id: "torneio_campeao",            check: (u, s) => (s.tournamentWins || 0) >= 1 },
  { id: "torneio_liga",               check: (u, s) => (s.ligaParticipations || 0) >= 1 },
  { id: "torneio_criou_primeiro",     check: (u, s) => (s.tournamentsCreated || 0) >= 1 },
  { id: "especial_organizador_serie", check: (u, s) => (s.tournamentsWithTenPlus || 0) >= 5 },
  // PRESENÇA
  { id: "presenca_primeira",          check: (u, s) => (s.checkinsTotal || 0) >= 1 },
  { id: "presenca_planejou",          check: (u, s) => (s.plansCreated || 0) >= 1 },
  { id: "presenca_3_locais",          check: (u, s) => (s.uniqueVenuesVisited || 0) >= 3 },
  { id: "presenca_toda_semana",       check: (u, s) => (s.checkInWeekStreak || 0) >= 4 },
  // SOCIAL
  { id: "social_primeiro_amigo",      check: (u, s) => (s.friendsCount || 0) >= 1 },
  { id: "social_encontrou_amigos",    check: (u, s) => (s.friendsCount || 0) >= 5 },
  { id: "social_10_amigos",           check: (u, s) => (s.friendsCount || 0) >= 10 },
  { id: "social_convidou",            check: (u, s) => (s.invitesSent || 0) >= 1 },
  { id: "social_notificou_amigos",    check: (u, s) => (s.friendNotifications || 0) >= 5 },
  // ESPECIAL FUNDADOR (criou conta antes de 2026-06-01)
  { id: "especial_fundador",          check: (u, s) => {
    if (!u.createdAt) return false;
    return new Date(u.createdAt) < new Date("2026-06-01T00:00:00Z");
  }},
];

// Milestones: id, metric, step, startAt
const BACKFILL_MILESTONES = [
  { id: "milestone_casual_jogadas",              metric: "casualMatchesPlayed",  step: 25, startAt: 25 },
  { id: "milestone_casual_vitorias",             metric: "casualMatchesWon",     step: 25, startAt: 25 },
  { id: "milestone_torneios_participados",       metric: "tournamentsEnrolled",  step: 3,  startAt: 3  },
  { id: "milestone_torneios_campeao",            metric: "tournamentWins",       step: 2,  startAt: 2  },
  { id: "milestone_torneios_criados",            metric: "tournamentsCreated",   step: 3,  startAt: 3  },
  { id: "milestone_partidas_torneio_vitorias",   metric: "tournamentMatchesWon", step: 25, startAt: 25 },
  { id: "milestone_checkins",                    metric: "checkinsTotal",        step: 10, startAt: 10 },
  { id: "milestone_locais_visitados",            metric: "uniqueVenuesVisited",  step: 5,  startAt: 5  },
  { id: "milestone_amigos",                      metric: "friendsCount",         step: 5,  startAt: 5  },
];

// Category-complete trophies: awarded when ALL required trophies in a category are earned.
// cat_casual/torneio exclude trophies that require real-time event data (virada, madrugador, noturno)
// because those can only be awarded when the event happens. Once the user has earned those
// via real-time flow, the category becomes completable by the next scheduled check.
const BACKFILL_CAT_TROPHIES = [
  { id: "cat_perfil",   required: ["perfil_completo","perfil_foto","perfil_local","perfil_skills"] },
  { id: "cat_casual",   required: ["casual_primeira","casual_primeira_vitoria","casual_virada","casual_sequencia_5","casual_maratonista","casual_multimodalidade"] },
  { id: "cat_torneio",  required: ["torneio_primeiro_inscrito","torneio_primeira_vitoria","torneio_campeao","torneio_podio","torneio_criou_primeiro","torneio_50_inscritos","torneio_liga"] },
  { id: "cat_presenca", required: ["presenca_primeira","presenca_planejou","presenca_3_locais","presenca_madrugador","presenca_noturna","presenca_toda_semana"] },
  { id: "cat_social",   required: ["social_primeiro_amigo","social_convidou","social_encontrou_amigos","social_10_amigos","social_notificou_amigos"] },
  { id: "cat_especial", required: ["especial_streak_30","especial_all_modalities","especial_organizador_serie"] },
];

function _milestoneTierFromLevel(level) {
  if (level <= 4)  return "bronze";
  if (level <= 8)  return "prata";
  if (level <= 12) return "ouro";
  return "platina";
}

function _trophyTierFromPct(pct) {
  if (pct > 60) return "bronze";
  if (pct > 20) return "prata";
  if (pct > 5)  return "ouro";
  return "platina";
}

// Compute all user stats from Firestore collections
async function _computeBackfillStats(db, uid, userData) {
  const email = (userData.email || "").toLowerCase();
  const stats = {
    friendsCount:              (userData.friends && userData.friends.length) || 0,
    invitesSent:               userData.invitesSent || 0,
    friendNotifications:       userData.friendNotifications || 0,
    activityDayStreak:         userData.activityDayStreak || 0,
    checkInWeekStreak:         userData.checkInWeekStreak || 0,
    casualActiveDaysThisMonth: userData.casualActiveDaysThisMonth || 0,
    casualMatchesPlayed:       0,
    casualMatchesWon:          0,
    casualSportsPlayed:        0,
    tournamentsEnrolled:       0,
    tournamentWins:            0,
    tournamentPodiums:         0,
    ligaParticipations:        0,
    tournamentsWithTenPlus:    0,
    tournamentsCreated:        0,
    tournamentMatchesWon:      0,
    checkinsTotal:             0,
    uniqueVenuesVisited:       0,
    plansCreated:              0,
  };

  const LIGA_KEYWORDS = ["Liga", "Ranking", "Suíço", "Suico", "Swiss"];

  // ── Anti-fraude (inline — mesma lógica de trophy-catalog.js) ─────────────
  const DAILY_MATCH_LIMIT = 5;

  function _isMatchQualified(d) {
    if (d.status !== "finished") return false;
    const h = String(d.hostUid  || "").trim();
    const g = String(d.guestUid || "").trim();
    if (!h || !g || h === g) return false;
    if (/^bot[_\-]|^bot$/i.test(h) || /^bot[_\-]|^bot$/i.test(g)) return false;
    const created  = d.createdAt  || d.startedAt;
    const finished = d.finishedAt || d.updatedAt;
    if (created && finished) {
      const ts = (t) => (t && typeof t.toDate === "function" ? t.toDate() : new Date(t));
      const t0 = ts(created).getTime();
      const t1 = ts(finished).getTime();
      if (!isNaN(t0) && !isNaN(t1) && t1 > t0 && (t1 - t0) < 3 * 60 * 1000) return false;
    }
    return true;
  }

  function _applyDailyLimit(docs, limitPerDay) {
    const byDay = {};
    const out   = [];
    for (const d of docs) {
      const ts = d.finishedAt || d.updatedAt || d.createdAt;
      if (!ts) { out.push(d); continue; }
      const dt = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
      if (isNaN(dt.getTime())) { out.push(d); continue; }
      const key = `${dt.getFullYear()}-${dt.getMonth() + 1}-${dt.getDate()}`;
      byDay[key] = (byDay[key] || 0) + 1;
      if (byDay[key] <= limitPerDay) out.push(d);
    }
    return out;
  }

  function _isTournamentQualified(t) {
    if (t.status !== "finished") return false;
    const count = (t.participants && t.participants.length) ||
                  (t.memberEmails && t.memberEmails.length) || 0;
    return count >= 4;
  }

  // Coleta casual matches (host + guest) com dedup por docId
  const _casualMap = {};  // docId → {data, role}

  const queries = [
    // Casual matches where user is host
    db.collection("casualMatches")
      .where("hostUid", "==", uid)
      .where("status", "==", "finished")
      .get()
      .then((snap) => {
        snap.forEach((doc) => {
          if (!_casualMap[doc.id]) _casualMap[doc.id] = { data: doc.data(), role: "host" };
        });
      })
      .catch(() => {}),

    // Casual matches where user is guest
    db.collection("casualMatches")
      .where("guestUid", "==", uid)
      .where("status", "==", "finished")
      .get()
      .then((snap) => {
        snap.forEach((doc) => {
          if (!_casualMap[doc.id]) _casualMap[doc.id] = { data: doc.data(), role: "guest" };
        });
      })
      .catch(() => {}),

    // Tournaments the user is enrolled in
    ...(email ? [
      db.collection("tournaments")
        .where("memberEmails", "array-contains", email)
        .get()
        .then((snap) => {
          snap.forEach((doc) => {
            const t = doc.data();
            stats.tournamentsEnrolled++;
            if (t.format && LIGA_KEYWORDS.some((k) => t.format.includes(k))) {
              stats.ligaParticipations++;
            }
            // Vitória só conta em torneios com >= 4 participantes (anti-fraude)
            if (_isTournamentQualified(t)) {
              const displayName = userData.displayName || "";
              if (t.winner && (t.winner === displayName || t.winner === email)) {
                stats.tournamentWins++;
              }
            }
            // Organizer with 10+ participants
            if (t.organizerEmail === email || t.organizerUid === uid) {
              const count = (t.participants && t.participants.length) || 0;
              if (count >= 10) stats.tournamentsWithTenPlus++;
            }
          });
        })
        .catch(() => {})
    ] : []),

    // Tournaments created
    ...(email ? [
      db.collection("tournaments")
        .where("organizerEmail", "==", email)
        .get()
        .then((snap) => { stats.tournamentsCreated = snap.size; })
        .catch(() => {})
    ] : []),

    // Presences
    db.collection("presences")
      .where("uid", "==", uid)
      .where("type", "in", ["checkin", "plan"])
      .get()
      .then((snap) => {
        const venueSet = {};
        snap.forEach((doc) => {
          const d = doc.data();
          if (d.type === "checkin") {
            stats.checkinsTotal++;
            if (d.placeId) venueSet[d.placeId] = true;
          }
          if (d.type === "plan") stats.plansCreated++;
        });
        stats.uniqueVenuesVisited = Object.keys(venueSet).length;
      })
      .catch(() => {}),
  ];

  await Promise.all(queries);

  // ── Processa casual matches com anti-fraude após ambas as queries ──────────
  // _casualMap: { docId → { data, role } }
  // Etapas: qualificação individual → limite diário → contagem de stats
  {
    // 1. Filtra por qualificação individual, preservando o role
    const qualified = Object.entries(_casualMap)
      .filter(([, item]) => _isMatchQualified(item.data));

    // 2. Aplica limite diário sobre os dados, mantendo mapeamento para role
    // Injeta docId no data temporariamente para rastreamento
    const dataWithIds = qualified.map(([docId, item]) => {
      return Object.assign({ _backfillDocId: docId }, item.data);
    });
    const limited = _applyDailyLimit(dataWithIds, DAILY_MATCH_LIMIT);

    // 3. Conta stats a partir do conjunto limitado
    const sportsSet = {};
    let played = 0, won = 0;
    for (const d of limited) {
      const item = _casualMap[d._backfillDocId];
      if (!item) continue;
      played++;
      const myColor = item.role === "host" ? d.hostColor : d.guestColor;
      if (d.winner && d.winner === myColor) won++;
      if (d.sport) sportsSet[d.sport] = true;
    }
    stats.casualMatchesPlayed = played;
    stats.casualMatchesWon    = won;
    stats.casualSportsPlayed  = Object.keys(sportsSet).length;
  }

  return stats;
}

exports.backfillAllUserTrophies = onCall(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 540,
    cors: ["https://scoreplace.app", "http://localhost:9876"],
  },
  async (request) => {
    // ── Auth guard: only owner ───────────────────────────────────────────────
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login required");

    const db = admin.firestore();
    const callerDoc = await db.collection("users").doc(callerUid).get().catch(() => null);
    if (!callerDoc || !callerDoc.exists) throw new HttpsError("permission-denied", "No profile");
    const callerData = callerDoc.data() || {};
    if (callerData.email !== "rstbarth@gmail.com") {
      throw new HttpsError("permission-denied", "Owner only");
    }

    // ── Fetch all user docs ──────────────────────────────────────────────────
    const usersSnap = await db.collection("users").get();
    const totalUsers = usersSnap.docs.filter((d) => d.data() && d.data().email).length;
    console.log(`[backfill] Starting trophy backfill: ${totalUsers} users with profiles`);

    // Update totalUsers in trophyStats so rarity calculations work
    await db.collection("_meta").doc("trophyStats").set(
      { totalUsers: Math.max(totalUsers, 1) },
      { merge: true }
    ).catch(() => {});

    let processed = 0;
    let trophiesAwarded = 0;
    let milestonesAwarded = 0;
    let errors = 0;
    const trophyCounts = {};  // trophyId → how many new awards

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data() || {};
      if (!userData.email) continue;  // skip incomplete/ghost docs

      try {
        // ── 1. Compute stats ───────────────────────────────────────────────
        const stats = await _computeBackfillStats(db, uid, userData);

        // ── 2. Load existing trophies (idempotent) ─────────────────────────
        const existTrophySnap = await db.collection("users").doc(uid)
          .collection("trophies").get().catch(() => null);
        const existTrophies = {};
        if (existTrophySnap) existTrophySnap.forEach((d) => { existTrophies[d.id] = true; });

        // ── 3. Check and award trophies ────────────────────────────────────
        const newTrophies = [];
        for (const def of BACKFILL_TROPHY_DEFS) {
          if (existTrophies[def.id]) continue;
          try {
            if (def.check(userData, stats)) newTrophies.push(def.id);
          } catch (_) {}
        }

        // ── 3.5. Check category-completion trophies ────────────────────────
        // Build the set of all earned trophies (existing + newly awarded)
        const allEarnedSet = Object.assign({}, existTrophies);
        newTrophies.forEach((t) => { allEarnedSet[t] = true; });
        for (const catDef of BACKFILL_CAT_TROPHIES) {
          if (allEarnedSet[catDef.id]) continue;
          if (catDef.required.every((r) => allEarnedSet[r])) {
            newTrophies.push(catDef.id);
            allEarnedSet[catDef.id] = true;
          }
        }

        if (newTrophies.length > 0) {
          const now = new Date().toISOString();
          // Use batched writes (max 500 per batch)
          for (let i = 0; i < newTrophies.length; i += 400) {
            const batch = db.batch();
            const chunk = newTrophies.slice(i, i + 400);
            for (const tid of chunk) {
              // Tier starts as bronze; will be recalculated client-side when user opens trophies page
              const ref = db.collection("users").doc(uid).collection("trophies").doc(tid);
              batch.set(ref, { awardedAt: now, tier: "bronze", backfilled: true });
              trophyCounts[tid] = (trophyCounts[tid] || 0) + 1;
            }
            await batch.commit();
            trophiesAwarded += chunk.length;
          }
        }

        // ── 4. Check milestones ────────────────────────────────────────────
        const existMilestoneSnap = await db.collection("users").doc(uid)
          .collection("milestones").get().catch(() => null);
        const existMilestones = {};
        if (existMilestoneSnap) existMilestoneSnap.forEach((d) => {
          existMilestones[d.id] = d.data() || {};
        });

        const milestoneBatch = db.batch();
        let hasMilestoneBatch = false;

        for (const ms of BACKFILL_MILESTONES) {
          const currentValue = stats[ms.metric] || 0;
          if (currentValue < ms.startAt) continue;

          const newLevel = Math.floor((currentValue - ms.startAt) / ms.step) + 1;
          if (newLevel <= 0) continue;

          const prevLevel = (existMilestones[ms.id] && existMilestones[ms.id].level) || 0;
          if (newLevel <= prevLevel) continue;

          const now = new Date().toISOString();

          // Award individual level documents for new levels
          for (let lvl = prevLevel + 1; lvl <= newLevel; lvl++) {
            // Check if this level doc already exists
            const levelId = ms.id + "_" + lvl;
            if (existMilestones[levelId]) continue;  // already awarded
            const threshold = ms.startAt + ms.step * (lvl - 1);
            const tier = _milestoneTierFromLevel(lvl);
            const ref = db.collection("users").doc(uid).collection("milestones").doc(levelId);
            milestoneBatch.set(ref, { level: lvl, threshold, tier, awardedAt: now, metric: ms.metric, value: currentValue, backfilled: true });
            hasMilestoneBatch = true;
            milestonesAwarded++;
          }

          // Update root milestone doc
          const rootRef = db.collection("users").doc(uid).collection("milestones").doc(ms.id);
          milestoneBatch.set(rootRef, { level: newLevel, awardedAt: new Date().toISOString(), backfilled: true }, { merge: true });
          hasMilestoneBatch = true;
        }

        if (hasMilestoneBatch) await milestoneBatch.commit();

        // ── 4.5. Write _rankStats snapshot to user doc ─────────────────────
        // Persisted as a direct field so _loadFriendRanking (client-side)
        // can read cross-user metrics in a single users collection query.
        const rankStats = {
          casualMatchesPlayed: stats.casualMatchesPlayed || 0,
          checkinsTotal:       stats.checkinsTotal       || 0,
          tournamentsEnrolled: stats.tournamentsEnrolled  || 0,
          tournamentWins:      stats.tournamentWins       || 0
        };
        // Build complete _trophyIds list from existTrophies + newly awarded
        const allTrophyIdsForDoc = Object.keys(Object.assign({}, existTrophies));
        newTrophies.forEach((t) => { if (!allTrophyIdsForDoc.includes(t)) allTrophyIdsForDoc.push(t); });
        await db.collection("users").doc(uid).update({ _rankStats: rankStats, _trophyIds: allTrophyIdsForDoc }).catch(() => {});

      } catch (e) {
        console.warn(`[backfill] uid=${uid} email=${userData.email} error:`, e.message || e);
        errors++;
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`[backfill] progress: ${processed} / ${totalUsers} users processed`);
      }
    }

    // ── 5. Update global trophy counts ────────────────────────────────────────
    if (Object.keys(trophyCounts).length > 0) {
      const countsUpdate = {};
      Object.entries(trophyCounts).forEach(([id, count]) => {
        countsUpdate["counts." + id] = admin.firestore.FieldValue.increment(count);
      });
      await db.collection("_meta").doc("trophyStats").update(countsUpdate).catch(() => {});
    }

    console.log(`[backfill] DONE: processed=${processed} trophiesAwarded=${trophiesAwarded} milestonesAwarded=${milestonesAwarded} errors=${errors}`);
    return { ok: true, processed, trophiesAwarded, milestonesAwarded, errors, trophyCounts };
  }
);


// ─── Scheduled daily trophy check ────────────────────────────────────────────────
// Roda diariamente às 02:00 BRT. Verifica todos os usuários e concede troféus
// e marcos que qualificam — sem precisar que o usuário abra o app.
// Isso resolve "o sistema não deve depender do login do usuário para dar o troféu".
//
// Lógica idêntica ao backfillAllUserTrophies mas:
//   1. Roda automaticamente (cron, sem auth check)
//   2. Envia push notification (FCM) para novos troféus
//   3. Processa só usuários com fcmToken (candidatos a notificação)
//      + todos os outros sem push (só award silencioso)
exports.scheduledTrophyCheck = onSchedule(
  {
    schedule: "every day 02:00",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    const db = admin.firestore();
    const usersSnap = await db.collection("users").get();
    const totalUsers = usersSnap.docs.filter((d) => d.data() && d.data().email).length;
    console.log(`[scheduledTrophyCheck] starting: ${totalUsers} users`);

    // Update totalUsers for rarity calculations
    await db.collection("_meta").doc("trophyStats").set(
      { totalUsers: Math.max(totalUsers, 1) },
      { merge: true }
    ).catch(() => {});

    let processed = 0, trophiesAwarded = 0, milestonesAwarded = 0, pushSent = 0, errors = 0;
    const trophyCounts = {};

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data() || {};
      if (!userData.email) continue;

      try {
        const stats = await _computeBackfillStats(db, uid, userData);

        const existTrophySnap = await db.collection("users").doc(uid)
          .collection("trophies").get().catch(() => null);
        const existTrophies = {};
        if (existTrophySnap) existTrophySnap.forEach((d) => { existTrophies[d.id] = true; });

        const newTrophies = [];
        for (const def of BACKFILL_TROPHY_DEFS) {
          if (existTrophies[def.id]) continue;
          try { if (def.check(userData, stats)) newTrophies.push(def.id); } catch (_) {}
        }

        // Category-completion trophies (second pass)
        const allEarnedSet = Object.assign({}, existTrophies);
        newTrophies.forEach((t) => { allEarnedSet[t] = true; });
        for (const catDef of BACKFILL_CAT_TROPHIES) {
          if (allEarnedSet[catDef.id]) continue;
          if (catDef.required.every((r) => allEarnedSet[r])) {
            newTrophies.push(catDef.id);
            allEarnedSet[catDef.id] = true;
          }
        }

        if (newTrophies.length > 0) {
          const now = new Date().toISOString();
          for (let i = 0; i < newTrophies.length; i += 400) {
            const batch = db.batch();
            const chunk = newTrophies.slice(i, i + 400);
            for (const tid of chunk) {
              const ref = db.collection("users").doc(uid).collection("trophies").doc(tid);
              batch.set(ref, { awardedAt: now, tier: "bronze", scheduled: true });
              trophyCounts[tid] = (trophyCounts[tid] || 0) + 1;
            }
            await batch.commit();
            trophiesAwarded += chunk.length;
          }

          // Send FCM push notification for new trophies
          const fcmToken = userData.fcmToken;
          if (fcmToken && newTrophies.length > 0) {
            try {
              const firstTrophyId = newTrophies[0];
              const title = newTrophies.length === 1
                ? "🏆 Novo troféu desbloqueado!"
                : `🏆 ${newTrophies.length} troféus desbloqueados!`;
              const body = newTrophies.length === 1
                ? `Você ganhou "${firstTrophyId.replace(/_/g, " ")}" — abra o app para ver!`
                : "Você ganhou novos troféus — abra o app para ver!";
              await admin.messaging().send({
                token: fcmToken,
                notification: { title, body },
                data: { link: "/", type: "trophy_awarded", trophyId: firstTrophyId },
                android: { priority: "normal" },
                apns: { payload: { aps: { badge: 1 } } },
              });
              pushSent++;
            } catch (pushErr) {
              // Invalid token is common (user revoked) — don't fail the whole run
              console.warn(`[scheduledTrophyCheck] push failed uid=${uid}:`, pushErr.code || pushErr.message);
            }
          }
        }

        // Milestones
        const existMilestoneSnap = await db.collection("users").doc(uid)
          .collection("milestones").get().catch(() => null);
        const existMilestones = {};
        if (existMilestoneSnap) existMilestoneSnap.forEach((d) => {
          existMilestones[d.id] = d.data() || {};
        });

        const milestoneBatch = db.batch();
        let hasMilestoneBatch = false;
        for (const ms of BACKFILL_MILESTONES) {
          const currentValue = stats[ms.metric] || 0;
          if (currentValue < ms.startAt) continue;
          const newLevel = Math.floor((currentValue - ms.startAt) / ms.step) + 1;
          if (newLevel <= 0) continue;
          const prevLevel = (existMilestones[ms.id] && existMilestones[ms.id].level) || 0;
          if (newLevel <= prevLevel) continue;
          const now = new Date().toISOString();
          for (let lvl = prevLevel + 1; lvl <= newLevel; lvl++) {
            const levelId = ms.id + "_" + lvl;
            if (existMilestones[levelId]) continue;
            const threshold = ms.startAt + ms.step * (lvl - 1);
            const tier = _milestoneTierFromLevel(lvl);
            const ref = db.collection("users").doc(uid).collection("milestones").doc(levelId);
            milestoneBatch.set(ref, { level: lvl, threshold, tier, awardedAt: now, metric: ms.metric, value: currentValue, scheduled: true });
            hasMilestoneBatch = true;
            milestonesAwarded++;
          }
          const rootRef = db.collection("users").doc(uid).collection("milestones").doc(ms.id);
          milestoneBatch.set(rootRef, { level: newLevel, awardedAt: new Date().toISOString(), scheduled: true }, { merge: true });
          hasMilestoneBatch = true;
        }
        if (hasMilestoneBatch) await milestoneBatch.commit();

        // Write _rankStats + _trophyIds snapshot
        const rankStats = {
          casualMatchesPlayed: stats.casualMatchesPlayed || 0,
          checkinsTotal:       stats.checkinsTotal       || 0,
          tournamentsEnrolled: stats.tournamentsEnrolled  || 0,
          tournamentWins:      stats.tournamentWins       || 0
        };
        const allTrophyIds = Object.keys(Object.assign({}, existTrophies));
        newTrophies.forEach((t) => { if (!allTrophyIds.includes(t)) allTrophyIds.push(t); });
        await db.collection("users").doc(uid).update({ _rankStats: rankStats, _trophyIds: allTrophyIds }).catch(() => {});

      } catch (e) {
        console.warn(`[scheduledTrophyCheck] uid=${uid} error:`, e.message || e);
        errors++;
      }

      processed++;
      if (processed % 10 === 0) {
        console.log(`[scheduledTrophyCheck] progress: ${processed}/${totalUsers}`);
      }
    }

    // Update global trophy counts
    if (Object.keys(trophyCounts).length > 0) {
      const countsUpdate = {};
      Object.entries(trophyCounts).forEach(([id, count]) => {
        countsUpdate["counts." + id] = admin.firestore.FieldValue.increment(count);
      });
      await db.collection("_meta").doc("trophyStats").update(countsUpdate).catch(() => {});
    }

    console.log(`[scheduledTrophyCheck] DONE: processed=${processed} trophiesAwarded=${trophiesAwarded} milestonesAwarded=${milestonesAwarded} pushSent=${pushSent} errors=${errors}`);
  }
);

// ─── mergePhoneAccount ────────────────────────────────────────────────────────
// Chamada pelo client quando o usuário salva seu telefone no perfil e o sistema
// detecta uma conta anterior criada via SMS com o mesmo número.
// Transfere inscrições em torneios, partidas casuais e presença para a conta
// atual. Marca a conta antiga com mergedInto para desativação.
//
// Deploy: firebase deploy --only functions:mergePhoneAccount
exports.mergePhoneAccount = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 300 },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");

    const oldUid = request.data && request.data.oldUid;
    if (!oldUid || typeof oldUid !== "string") throw new HttpsError("invalid-argument", "oldUid obrigatório");
    if (oldUid === callerUid) throw new HttpsError("invalid-argument", "oldUid deve ser diferente da conta atual");

    // v2.5.x: dryRun=true → calcula e RELATA tudo que mudaria, sem escrever nada.
    const dryRun = !!(request.data && request.data.dryRun);
    const db = admin.firestore();
    const report = {
      dryRun, tournaments: 0, memberUidsFixed: 0, casualMatches: 0,
      friendRefsRepointed: 0, presences: 0, venues: 0, reviews: 0,
      notifications: 0, matchHistoryDocs: 0, templates: 0, emailVerifications: 0,
      profileUnion: false,
    };

    // ── 1. Carrega dados de ambas as contas ──────────────────────────────────
    const [newSnap, oldSnap] = await Promise.all([
      db.collection("users").doc(callerUid).get(),
      db.collection("users").doc(oldUid).get(),
    ]);

    if (!oldSnap.exists) throw new HttpsError("not-found", "Conta antiga não encontrada");
    if (newSnap.exists && newSnap.data().mergedInto) throw new HttpsError("failed-precondition", "Conta atual já foi mesclada em outra");

    const newData = newSnap.exists ? newSnap.data() : {};
    const oldData = oldSnap.data();
    if (oldData.mergedInto) throw new HttpsError("failed-precondition", "Conta antiga já foi mesclada");

    // v2.5.x SEGURANÇA: prova de posse de oldUid. Sem isso, qualquer um poderia
    // absorver a conta de outra pessoa só passando o uid. Aceita duas provas:
    //  (a) proofIdToken — ID token de quem se autenticou COMO oldUid (perfil:
    //      a pessoa autentica o identificador novo numa instância separada);
    //  (b) implícita — o caller se autenticou com um identificador (e-mail OU
    //      celular no próprio token) que oldUid possui (cobre o auto-merge do
    //      login por cross-ref, onde a posse do identificador já foi provada).
    let _proven = false;
    const _proofToken = request.data && request.data.proofIdToken;
    if (_proofToken) {
      try { const _dec = await admin.auth().verifyIdToken(String(_proofToken)); if (_dec && _dec.uid === oldUid) _proven = true; } catch (e) { /* inválido */ }
    }
    let _oldAuth = null;
    try { _oldAuth = await admin.auth().getUser(oldUid); } catch (e) { /* sem Auth record */ }
    if (!_proven) {
      const _callerEmail = String((request.auth.token && request.auth.token.email) || "").toLowerCase();
      const _callerPhone = request.auth.token && request.auth.token.phone_number;
      if (_callerEmail) {
        if (_oldAuth && _oldAuth.email && _oldAuth.email.toLowerCase() === _callerEmail) _proven = true;
        if (!_proven && oldData.email && String(oldData.email).toLowerCase() === _callerEmail) _proven = true;
        if (!_proven && Array.isArray(oldData.linkedEmails) && oldData.linkedEmails.map(e => String(e).toLowerCase()).indexOf(_callerEmail) !== -1) _proven = true;
      }
      if (!_proven && _callerPhone) {
        if (_oldAuth && _oldAuth.phoneNumber && _phoneDigitsMatch(_callerPhone, _oldAuth.phoneNumber)) _proven = true;
        if (!_proven) { const _op = await _registeredPhoneFor(oldUid, _oldAuth); if (_op && _phoneDigitsMatch(_callerPhone, _op)) _proven = true; }
      }
    }
    if (!_proven) throw new HttpsError("permission-denied", "sem prova de posse da conta a mesclar");

    const newName = newData.displayName || newData.name || "";
    const newEmail = (newData.email || "").toLowerCase();
    const oldEmailRaw = oldData.email || "";
    const oldEmail = (oldData.email || oldData.phone || "").toLowerCase();
    const oldName = oldData.displayName || oldData.name || "";

    console.log(`[mergePhoneAccount] ${dryRun ? "DRY-RUN " : ""}Merging oldUid=${oldUid} (${oldName}/${oldEmail}) → newUid=${callerUid} (${newName}/${newEmail})`);

    // ── 2. Torneios: busca por oldUid OU oldEmail; re-aponta uid/email/nome ────
    const tourSnaps = await db.collection("tournaments").get();
    let batch1 = db.batch();
    let batchCount = 0;

    for (const tourDoc of tourSnaps.docs) {
      const t = tourDoc.data();
      let changed = false;
      const update = {};

      // 2a. memberEmails[]
      const memberEmails = Array.isArray(t.memberEmails) ? [...t.memberEmails] : [];
      const emailIdx = oldEmail ? memberEmails.indexOf(oldEmail) : -1;
      if (emailIdx !== -1 && newEmail && !memberEmails.includes(newEmail)) {
        memberEmails.splice(emailIdx, 1, newEmail);
        update.memberEmails = memberEmails;
        changed = true;
      } else if (emailIdx !== -1 && newEmail && memberEmails.includes(newEmail)) {
        memberEmails.splice(emailIdx, 1);
        update.memberEmails = memberEmails;
        changed = true;
      }

      // 2a-bis. memberUids[] (v2.5.x — antes não era migrado; quebrava visibilidade)
      if (Array.isArray(t.memberUids) && t.memberUids.indexOf(oldUid) !== -1) {
        const mu = t.memberUids.filter(x => x !== oldUid);
        if (mu.indexOf(callerUid) === -1) mu.push(callerUid);
        update.memberUids = mu;
        changed = true;
        report.memberUidsFixed++;
      }
      // 2a-ter. creatorUid / creatorEmail / organizerEmail / coHosts
      if (t.creatorUid === oldUid) { update.creatorUid = callerUid; changed = true; }
      if (oldEmail && t.creatorEmail && String(t.creatorEmail).toLowerCase() === oldEmail) { update.creatorEmail = newEmail || t.creatorEmail; changed = true; }
      if (oldEmail && t.organizerEmail && String(t.organizerEmail).toLowerCase() === oldEmail) { update.organizerEmail = newEmail || t.organizerEmail; changed = true; }
      if (Array.isArray(t.coHosts)) {
        let chHit = false;
        const ch = t.coHosts.map(c => {
          if (c && (c.uid === oldUid || (oldEmail && String(c.email || "").toLowerCase() === oldEmail))) {
            chHit = true;
            return Object.assign({}, c, { uid: callerUid, email: newEmail || c.email, displayName: newName || c.displayName });
          }
          return c;
        });
        if (chHit) { update.coHosts = ch; changed = true; }
      }

      // 2b. participants[] — atualiza uid/p1Uid/p2Uid/email/displayName/name
      const participants = Array.isArray(t.participants) ? t.participants.map(p => {
        if (typeof p !== "object" || !p) return p;
        const pUid = p.uid || p.id || "";
        const pEmail = (p.email || p.displayName || "").toLowerCase();
        const matches = (pUid && pUid === oldUid) ||
                        (oldEmail && pEmail === oldEmail.toLowerCase());
        let upd = p;
        if (matches) {
          changed = true;
          upd = Object.assign({}, p);
          if (callerUid) upd.uid = callerUid;
          if (newEmail) upd.email = newEmail;
          if (newName) { upd.displayName = newName; upd.name = newName; }
        }
        // p1Uid/p2Uid de duplas
        if (upd.p1Uid === oldUid || upd.p2Uid === oldUid) {
          changed = true;
          upd = (upd === p) ? Object.assign({}, p) : upd;
          if (upd.p1Uid === oldUid) upd.p1Uid = callerUid;
          if (upd.p2Uid === oldUid) upd.p2Uid = callerUid;
        }
        return upd;
      }) : null;
      if (participants) update.participants = participants;

      // 2c. Strings p1/p2 em matches/rounds/groups que referenciam o nome antigo
      if (oldName && newName && oldName !== newName) {
        function replaceNameInMatches(matches) {
          if (!Array.isArray(matches)) return { arr: matches, hit: false };
          let hit = false;
          const arr = matches.map(m => {
            const nm = Object.assign({}, m);
            if (nm.p1 === oldName) { nm.p1 = newName; hit = true; }
            if (nm.p2 === oldName) { nm.p2 = newName; hit = true; }
            if (nm.winner === oldName) { nm.winner = newName; hit = true; }
            if (Array.isArray(nm.team1)) nm.team1 = nm.team1.map(x => x === oldName ? (hit = true, newName) : x);
            if (Array.isArray(nm.team2)) nm.team2 = nm.team2.map(x => x === oldName ? (hit = true, newName) : x);
            return nm;
          });
          return { arr, hit };
        }
        if (Array.isArray(t.matches)) {
          const r = replaceNameInMatches(t.matches);
          if (r.hit) { update.matches = r.arr; changed = true; }
        }
        ["rounds", "groups", "rodadas"].forEach(structKey => {
          if (!Array.isArray(t[structKey])) return;
          let structHit = false;
          const arr = t[structKey].map(col => {
            if (!col || !Array.isArray(col.matches)) return col;
            const r = replaceNameInMatches(col.matches);
            if (r.hit) structHit = true;
            return Object.assign({}, col, { matches: r.arr });
          });
          if (structHit) { update[structKey] = arr; changed = true; }
        });
        // standings[].name (classificação Liga/Suíço)
        if (Array.isArray(t.standings)) {
          let sHit = false;
          const st = t.standings.map(s => {
            if (s && s.name === oldName) { sHit = true; return Object.assign({}, s, { name: newName }); }
            return s;
          });
          if (sHit) { update.standings = st; changed = true; }
        }
        // waitlist / standbyParticipants (strings OU objetos {name/displayName/uid})
        ["waitlist", "standbyParticipants"].forEach(wk => {
          if (!Array.isArray(t[wk])) return;
          let wHit = false;
          const arr = t[wk].map(w => {
            if (typeof w === "string") { if (w === oldName) { wHit = true; return newName; } return w; }
            if (w && typeof w === "object") {
              let ww = w;
              if (w.name === oldName || w.displayName === oldName || w.uid === oldUid) {
                wHit = true; ww = Object.assign({}, w);
                if (ww.name === oldName) ww.name = newName;
                if (ww.displayName === oldName) ww.displayName = newName;
                if (ww.uid === oldUid) ww.uid = callerUid;
              }
              return ww;
            }
            return w;
          });
          if (wHit) { update[wk] = arr; changed = true; }
        });
      }

      if (changed) {
        if (!dryRun) batch1.update(tourDoc.ref, update);
        report.tournaments++;
        batchCount++;
        if (batchCount >= 400) {
          if (!dryRun) await batch1.commit();
          batch1 = db.batch();
          batchCount = 0;
        }
      }
    }
    if (!dryRun && batchCount > 0) await batch1.commit();

    // ── 3. Partidas casuais: creatorUid + playerUids[] + players[].uid ────────
    const casualSnap = await db.collection("casualMatches").get();
    let cbatch = db.batch(); let ccount = 0;
    for (const doc of casualSnap.docs) {
      const c = doc.data(); const cu = {}; let cChanged = false;
      if (c.creatorUid === oldUid) { cu.creatorUid = callerUid; cChanged = true; }
      if (Array.isArray(c.playerUids) && c.playerUids.indexOf(oldUid) !== -1) {
        const pu = c.playerUids.filter(x => x !== oldUid);
        if (pu.indexOf(callerUid) === -1) pu.push(callerUid);
        cu.playerUids = pu; cChanged = true;
      }
      if (Array.isArray(c.players) && c.players.some(p => p && p.uid === oldUid)) {
        cu.players = c.players.map(p => (p && p.uid === oldUid)
          ? Object.assign({}, p, { uid: callerUid, displayName: newName || p.displayName, name: newName || p.name })
          : p);
        cChanged = true;
      }
      if (cChanged) {
        if (!dryRun) cbatch.update(doc.ref, cu);
        report.casualMatches++; ccount++;
        if (ccount >= 400) { if (!dryRun) await cbatch.commit(); cbatch = db.batch(); ccount = 0; }
      }
    }
    if (!dryRun && ccount > 0) await cbatch.commit();

    // ── 4. users sobrevivente: UNIÃO de amigos/pedidos/e-mails/locais/sports ──
    const unionArr = (a, b) => {
      const out = Array.isArray(a) ? a.slice() : [];
      (Array.isArray(b) ? b : []).forEach(x => { if (out.indexOf(x) === -1) out.push(x); });
      return out;
    };
    const locKey = (l) => (l && typeof l === "object")
      ? [String(l.label || "").trim().toLowerCase(), (l.lat != null ? Number(l.lat).toFixed(4) : ""), (l.lng != null ? Number(l.lng).toFixed(4) : "")].join("|")
      : String(l);
    const unionLocations = (a, b) => {
      const out = Array.isArray(a) ? a.slice() : [];
      const seen = {}; out.forEach(l => { seen[locKey(l)] = 1; });
      (Array.isArray(b) ? b : []).forEach(l => { const k = locKey(l); if (!seen[k]) { seen[k] = 1; out.push(l); } });
      return out;
    };
    const surv = {};
    surv.friends = unionArr(newData.friends, oldData.friends).filter(u => u !== callerUid && u !== oldUid);
    surv.friendRequestsSent = unionArr(newData.friendRequestsSent, oldData.friendRequestsSent).filter(u => u !== callerUid && u !== oldUid);
    surv.friendRequestsReceived = unionArr(newData.friendRequestsReceived, oldData.friendRequestsReceived).filter(u => u !== callerUid && u !== oldUid);
    surv.linkedEmails = unionArr(newData.linkedEmails, oldData.linkedEmails);
    if (oldEmailRaw) {
      const oe = oldEmailRaw.toLowerCase();
      if (oe !== newEmail && surv.linkedEmails.indexOf(oe) === -1) surv.linkedEmails.push(oe);
    }
    surv.preferredSports = unionArr(newData.preferredSports, oldData.preferredSports);
    surv.preferredCeps = unionArr(newData.preferredCeps, oldData.preferredCeps);
    surv.preferredLocations = unionLocations(newData.preferredLocations, oldData.preferredLocations);
    surv.skillBySport = Object.assign({}, oldData.skillBySport || {}, newData.skillBySport || {});
    // matchHistory (campo-array legado): união por matchId
    if (Array.isArray(oldData.matchHistory) && oldData.matchHistory.length) {
      const mh = Array.isArray(newData.matchHistory) ? newData.matchHistory.slice() : [];
      oldData.matchHistory.forEach(e => { if (!mh.some(x => x.matchId === e.matchId)) mh.push(e); });
      surv.matchHistory = mh;
    }
    // Preenche lacunas de perfil (sobrevivente mantém o que já tem)
    ["displayName", "photoURL", "city", "birthDate", "gender"].forEach(k => {
      if ((newData[k] === undefined || newData[k] === null || newData[k] === "") && oldData[k]) surv[k] = oldData[k];
    });
    // v2.5.x: TELEFONE — se o sobrevivente não tem celular e o antigo tem, herda
    // (ex.: mescla conta-celular numa conta-e-mail → resultado fica com os dois).
    var _oldPhone = oldData.phone || (_oldAuth && _oldAuth.phoneNumber) || null;
    if ((!newData.phone) && _oldPhone) {
      surv.phone = _oldPhone;
      surv.phoneCountry = oldData.phoneCountry || "55";
    }
    // PLANO/Pro — nunca rebaixar: Pro vence; mantém a validade mais longa.
    const _exp = (d) => { const v = d && d.planExpiresAt; const n = v ? Date.parse(v) : 0; return isNaN(n) ? 0 : n; };
    if (oldData.plan === "pro" && (newData.plan !== "pro" || _exp(oldData) > _exp(newData))) {
      surv.plan = "pro";
      if (oldData.planExpiresAt) surv.planExpiresAt = oldData.planExpiresAt;
    }
    // TERMOS — se o sobrevivente ainda não aceitou e o antigo aceitou, herda.
    if (!newData.acceptedTerms && oldData.acceptedTerms === true) {
      surv.acceptedTerms = true;
      if (oldData.acceptedTermsAt) surv.acceptedTermsAt = oldData.acceptedTermsAt;
      if (oldData.acceptedTermsVersion) surv.acceptedTermsVersion = oldData.acceptedTermsVersion;
    }
    report.profileUnion = true;
    if (!dryRun) await db.collection("users").doc(callerUid).set(surv, { merge: true });

    // ── 5. Amizades de TERCEIROS apontando pra oldUid (full scan) ─────────────
    const allUsers = await db.collection("users").get();
    let fbatch = db.batch(); let fcount = 0;
    for (const ud of allUsers.docs) {
      if (ud.id === callerUid || ud.id === oldUid) continue;
      const d = ud.data(); const fu = {}; let fChanged = false;
      ["friends", "friendRequestsSent", "friendRequestsReceived"].forEach(field => {
        if (Array.isArray(d[field]) && d[field].indexOf(oldUid) !== -1) {
          const arr = d[field].filter(x => x !== oldUid);
          if (arr.indexOf(callerUid) === -1) arr.push(callerUid);
          fu[field] = arr; fChanged = true;
        }
      });
      if (fChanged) {
        if (!dryRun) fbatch.update(ud.ref, fu);
        report.friendRefsRepointed++; fcount++;
        if (fcount >= 400) { if (!dryRun) await fbatch.commit(); fbatch = db.batch(); fcount = 0; }
      }
    }
    if (!dryRun && fcount > 0) await fbatch.commit();

    // ── 6. Presenças ──────────────────────────────────────────────────────────
    const presSnap = await db.collection("presences").where("uid", "==", oldUid).get();
    if (!presSnap.empty) {
      let pbatch = db.batch();
      presSnap.docs.forEach(d => {
        const u = { uid: callerUid };
        if (newName) u.displayName = newName;
        if (!dryRun) pbatch.update(d.ref, u);
      });
      if (!dryRun) await pbatch.commit();
      report.presences = presSnap.size;
    }

    // ── 7. Venues: ownerUid/createdByUid + review do oldUid ───────────────────
    const venSnap = await db.collection("venues").get();
    let vbatch = db.batch(); let vcount = 0;
    for (const vd of venSnap.docs) {
      const v = vd.data(); const vu = {}; let vChanged = false;
      if (v.ownerUid === oldUid) { vu.ownerUid = callerUid; if (newEmail) vu.ownerEmail = newEmail; vChanged = true; }
      if (v.createdByUid === oldUid) { vu.createdByUid = callerUid; if (newName) vu.createdByName = newName; vChanged = true; }
      if (vChanged) {
        if (!dryRun) vbatch.update(vd.ref, vu);
        report.venues++; vcount++;
        if (vcount >= 400) { if (!dryRun) await vbatch.commit(); vbatch = db.batch(); vcount = 0; }
      }
      const rev = await vd.ref.collection("reviews").doc(oldUid).get();
      if (rev.exists) {
        report.reviews++;
        if (!dryRun) {
          const rdata = Object.assign({}, rev.data(), { uid: callerUid });
          if (newName) rdata.displayName = newName;
          await vd.ref.collection("reviews").doc(callerUid).set(rdata, { merge: true });
          await vd.ref.collection("reviews").doc(oldUid).delete();
        }
      }
    }
    if (!dryRun && vcount > 0) await vbatch.commit();

    // ── 8. Copia subcoleções do oldUid → sobrevivente ────────────────────────
    for (const sub of ["notifications", "matchHistory", "templates"]) {
      const ssnap = await db.collection("users").doc(oldUid).collection(sub).get();
      if (ssnap.empty) continue;
      let sbatch = db.batch(); let scount = 0;
      for (const sdoc of ssnap.docs) {
        if (!dryRun) sbatch.set(db.collection("users").doc(callerUid).collection(sub).doc(sdoc.id), sdoc.data(), { merge: true });
        scount++;
        if (scount >= 400) { if (!dryRun) await sbatch.commit(); sbatch = db.batch(); scount = 0; }
      }
      if (!dryRun && scount > 0) await sbatch.commit();
      if (sub === "notifications") report.notifications = ssnap.size;
      else if (sub === "matchHistory") report.matchHistoryDocs = ssnap.size;
      else report.templates = ssnap.size;
    }

    // ── 9. emailVerifications pendentes do oldUid ─────────────────────────────
    const evSnap = await db.collection("emailVerifications").where("ownerUid", "==", oldUid).get();
    if (!evSnap.empty) {
      let ebatch = db.batch();
      evSnap.docs.forEach(d => { if (!dryRun) ebatch.update(d.ref, { ownerUid: callerUid }); });
      if (!dryRun) await ebatch.commit();
      report.emailVerifications = evSnap.size;
    }

    // ── 10. Tombstone da conta antiga ─────────────────────────────────────────
    if (!dryRun) {
      await db.collection("users").doc(oldUid).set({
        mergedInto: callerUid,
        mergedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    console.log(`[mergePhoneAccount] ${dryRun ? "DRY-RUN " : ""}DONE ` + JSON.stringify(report));
    // Compat: mantém os campos antigos (tournaments/casualMatches) no retorno.
    return Object.assign({ ok: true }, report, { casualMatches: report.casualMatches });
  }
);

// ─── fixMergedParticipants (one-shot) ─────────────────────────────────────────
// Repara torneios onde participantes da conta antiga ainda aparecem com identidade
// antiga. Funciona em dois modos:
//
// Modo 1 — UIDs explícitos (para corrigir caso específico como Zilda):
//   curl '...fixMergedParticipants?secret=...&oldUid=AAA&newUid=BBB'
//
// Modo 2 — varredura por mergedInto (pós-merge automático):
//   curl '...fixMergedParticipants?secret=...'
//
// Modo 3 — varredura por pares de phone duplicados (sem mergedInto):
//   curl '...fixMergedParticipants?secret=...&scanPhone=1'
exports.fixMergedParticipants = onRequest(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (req, res) => {
    const SECRET = "SCOREPLACE_FIX_MERGED_20260516";
    if (req.query.secret !== SECRET) { res.status(403).json({ error: "forbidden" }); return; }

    const db = admin.firestore();

    // ── Função auxiliar: aplica a substituição em todos os torneios ───────────
    async function repairTournaments(oldUid, oldEmail, oldName, newUid, newEmail, newName) {
      const tourSnaps = await db.collection("tournaments").get();
      let tourFixed = 0;

      function replaceNameInMatches(matches) {
        if (!Array.isArray(matches)) return { arr: matches, hit: false };
        let hit = false;
        const arr = matches.map(m => {
          const nm = Object.assign({}, m);
          if (nm.p1 === oldName) { nm.p1 = newName; hit = true; }
          if (nm.p2 === oldName) { nm.p2 = newName; hit = true; }
          if (nm.winner === oldName) { nm.winner = newName; hit = true; }
          if (Array.isArray(nm.team1)) nm.team1 = nm.team1.map(x => x === oldName ? (hit = true, newName) : x);
          if (Array.isArray(nm.team2)) nm.team2 = nm.team2.map(x => x === oldName ? (hit = true, newName) : x);
          return nm;
        });
        return { arr, hit };
      }

      for (const tourDoc of tourSnaps.docs) {
        const t = tourDoc.data();
        let changed = false;
        const update = {};

        // memberEmails
        const memberEmails = Array.isArray(t.memberEmails) ? [...t.memberEmails] : [];
        const emailIdx = oldEmail ? memberEmails.indexOf(oldEmail) : -1;
        if (emailIdx !== -1) {
          if (newEmail && !memberEmails.includes(newEmail)) memberEmails.splice(emailIdx, 1, newEmail);
          else memberEmails.splice(emailIdx, 1);
          update.memberEmails = memberEmails;
          changed = true;
        }

        // participants[]
        if (Array.isArray(t.participants)) {
          const participants = t.participants.map(p => {
            const pUid = p.uid || p.id || "";
            const pEmail = (p.email || p.displayName || "").toLowerCase();
            const matches = (pUid && pUid === oldUid) ||
                            (oldEmail && pEmail === oldEmail.toLowerCase());
            if (!matches) return p;
            changed = true;
            const updated = Object.assign({}, p);
            if (newUid) updated.uid = newUid;
            if (newEmail) updated.email = newEmail;
            if (newName) { updated.displayName = newName; updated.name = newName; }
            return updated;
          });
          if (changed) update.participants = participants;
        }

        // p1/p2/winner strings em matches/rounds/groups/rodadas
        if (oldName && newName && oldName !== newName) {
          if (Array.isArray(t.matches)) {
            const r = replaceNameInMatches(t.matches);
            if (r.hit) { update.matches = r.arr; changed = true; }
          }
          if (Array.isArray(t.rounds)) {
            let hit = false;
            const rounds = t.rounds.map(rod => {
              const r = replaceNameInMatches(rod.matches);
              if (r.hit) hit = true;
              return Object.assign({}, rod, { matches: r.arr });
            });
            if (hit) { update.rounds = rounds; changed = true; }
          }
          if (Array.isArray(t.groups)) {
            let hit = false;
            const groups = t.groups.map(g => {
              const r = replaceNameInMatches(g.matches);
              if (r.hit) hit = true;
              return Object.assign({}, g, { matches: r.arr });
            });
            if (hit) { update.groups = groups; changed = true; }
          }
          if (Array.isArray(t.rodadas)) {
            let hit = false;
            const rodadas = t.rodadas.map(rod => {
              const r = replaceNameInMatches(rod.matches);
              if (r.hit) hit = true;
              return Object.assign({}, rod, { matches: r.arr });
            });
            if (hit) { update.rodadas = rodadas; changed = true; }
          }
        }

        if (changed) { await tourDoc.ref.update(update); tourFixed++; }
      }
      return tourFixed;
    }

    // ── Modo 1: UIDs explícitos ───────────────────────────────────────────────
    if (req.query.oldUid && req.query.newUid) {
      const oldUid = req.query.oldUid;
      const newUid = req.query.newUid;
      const [oldDoc, newDoc] = await Promise.all([
        db.collection("users").doc(oldUid).get(),
        db.collection("users").doc(newUid).get(),
      ]);
      if (!oldDoc.exists) { res.status(404).json({ error: "oldUid não encontrado" }); return; }
      if (!newDoc.exists) { res.status(404).json({ error: "newUid não encontrado" }); return; }
      const oldData = oldDoc.data();
      const newData = newDoc.data();
      const oldEmail = oldData.email || oldData.phone || "";
      const oldName  = oldData.displayName || oldData.name || "";
      const newEmail = newData.email || "";
      const newName  = newData.displayName || newData.name || "";
      console.log(`[fixMergedParticipants] Modo explícito: ${oldUid} (${oldName}) → ${newUid} (${newName})`);
      const tourFixed = await repairTournaments(oldUid, oldEmail, oldName, newUid, newEmail, newName);
      // Marca conta antiga como mesclada
      await db.collection("users").doc(oldUid).set({ mergedInto: newUid, mergedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      res.json({ ok: true, mode: "explicit", oldUid, newUid, oldName, newName, tourFixed });
      return;
    }

    // ── Modo 3: varredura por pares de phone duplicados ───────────────────────
    if (req.query.scanPhone) {
      const allUsersSnap = await db.collection("users").get();
      const byPhone = {};
      allUsersSnap.docs.forEach(doc => {
        const d = doc.data();
        if (!d.phone || d.mergedInto) return;
        const phone = d.phone.replace(/\s+/g, "");
        if (!byPhone[phone]) byPhone[phone] = [];
        byPhone[phone].push({ id: doc.id, data: d });
      });
      const duplicates = Object.entries(byPhone).filter(([, docs]) => docs.length > 1);
      if (duplicates.length === 0) {
        res.json({ ok: true, message: "Nenhum par de phone duplicado encontrado" });
        return;
      }
      const report = [];
      for (const [phone, docs] of duplicates) {
        // "novo" = tem displayName real (não é número), ou tem email real
        const sorted = docs.sort((a, b) => {
          const aIsPhone = /^\+?[0-9\s\-()]+$/.test(a.data.displayName || "");
          const bIsPhone = /^\+?[0-9\s\-()]+$/.test(b.data.displayName || "");
          if (aIsPhone && !bIsPhone) return 1;  // b é novo
          if (!aIsPhone && bIsPhone) return -1; // a é novo
          return 0;
        });
        const newDoc = sorted[0];
        const oldDocs = sorted.slice(1);
        for (const oldDoc of oldDocs) {
          const oldEmail = oldDoc.data.email || oldDoc.data.phone || "";
          const oldName  = oldDoc.data.displayName || oldDoc.data.name || "";
          const newEmail = newDoc.data.email || "";
          const newName  = newDoc.data.displayName || newDoc.data.name || "";
          console.log(`[fixMergedParticipants] Phone pair: ${oldDoc.id} (${oldName}) → ${newDoc.id} (${newName})`);
          const tourFixed = await repairTournaments(oldDoc.id, oldEmail, oldName, newDoc.id, newEmail, newName);
          await db.collection("users").doc(oldDoc.id).set({ mergedInto: newDoc.id, mergedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          report.push({ phone, oldUid: oldDoc.id, oldName, newUid: newDoc.id, newName, tourFixed });
        }
      }
      res.json({ ok: true, mode: "scanPhone", report });
      return;
    }

    // ── Modo 4: varredura por email duplicados ────────────────────────────────
    if (req.query.scanEmail) {
      const results = await _scanAndMergeByField(db, "email");
      if (results.length === 0) {
        res.json({ ok: true, message: "Nenhum par de email duplicado encontrado" });
        return;
      }
      res.json({ ok: true, mode: "scanEmail", results });
      return;
    }

    // ── Modo 2: varredura por mergedInto ──────────────────────────────────────
    const mergedSnap = await db.collection("users").where("mergedInto", "!=", null).get();
    if (mergedSnap.empty) { res.json({ ok: true, message: "Nenhum usuário mesclado encontrado" }); return; }

    const report = [];

    for (const oldDoc of mergedSnap.docs) {
      const oldUid = oldDoc.id;
      const oldData = oldDoc.data();
      const newUid = oldData.mergedInto;
      if (!newUid) continue;

      const newDoc = await db.collection("users").doc(newUid).get();
      if (!newDoc.exists) { report.push({ oldUid, error: "newUid doc not found" }); continue; }

      const newData = newDoc.data();
      const oldEmail = oldData.email || oldData.phone || "";
      const oldName = oldData.displayName || oldData.name || "";
      const newEmail = newData.email || "";
      const newName = newData.displayName || newData.name || "";

      console.log(`[fixMergedParticipants] Modo mergedInto: ${oldUid} (${oldName}) → ${newUid} (${newName})`);
      const tourFixed = await repairTournaments(oldUid, oldEmail, oldName, newUid, newEmail, newName);
      report.push({ oldUid, oldName, newUid, newName, tourFixed });
    }

    res.json({ ok: true, mode: "mergedInto", report });
  }
);

// ─── autoMergeOnProfileUpdate (Firestore trigger) ─────────────────────────
// Dispara sempre que um doc users/{uid} é criado ou atualizado.
// Se phone ou email mudou, varre o banco por outros usuários com o mesmo
// valor e mescla automaticamente (conta mais completa ganha; empate → mais nova).
//
// Proteção anti-loop:
//   • Docs com mergedInto ignorados (já mesclados).
//   • _executeMerge só altera matchHistory e mergedInto — phone/email não mudam,
//     então o trigger não dispara novamente para os docs atualizados.
exports.autoMergeOnProfileUpdate = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 120 },
  async (event) => {
    const after  = event.data.after;
    const before = event.data.before;

    if (!after.exists) return; // doc deletado — nada a fazer

    const afterData  = after.data();
    const beforeData = before.exists ? (before.data() || {}) : {};

    if (afterData.mergedInto) return; // conta já mesclada — ignorar

    const phoneChanged = afterData.phone && afterData.phone !== beforeData.phone;
    const emailChanged = afterData.email && afterData.email !== beforeData.email;
    if (!phoneChanged && !emailChanged) return; // mudança irrelevante

    const db  = admin.firestore();
    const uid = event.params.uid;
    console.log(`[autoMergeOnProfileUpdate] uid=${uid} phoneChanged=${phoneChanged} emailChanged=${emailChanged}`);

    const checkFields = [];
    if (phoneChanged) checkFields.push({ field: "phone", value: afterData.phone });
    if (emailChanged) checkFields.push({ field: "email", value: afterData.email });

    for (const { field, value } of checkFields) {
      const key = _dedupKey(field, value);
      if (!key || key.length < 5) continue;

      // Busca outros usuários com o mesmo valor no campo
      const snap = await db.collection("users").where(field, "==", value).get();
      const others = snap.docs.filter(d => d.id !== uid && !d.data().mergedInto);

      // Para phone: tenta também a versão normalizada (sem espaços/traços)
      if (field === "phone") {
        const normalized = value.replace(/[\s\-()]/g, "");
        if (normalized !== value) {
          const snap2 = await db.collection("users").where(field, "==", normalized).get();
          snap2.docs.forEach(d => {
            if (d.id !== uid && !d.data().mergedInto && !others.find(o => o.id === d.id)) {
              others.push(d);
            }
          });
        }
      }

      if (others.length === 0) continue;

      // Re-fetch conta atual (pode ter sido atualizada desde que o trigger disparou)
      const currentDoc = await db.collection("users").doc(uid).get();
      if (!currentDoc.exists || currentDoc.data().mergedInto) continue;

      for (const other of others) {
        const freshOther = await db.collection("users").doc(other.id).get();
        if (!freshOther.exists || freshOther.data().mergedInto) continue;

        const { keepDoc, dropDoc } = _determineMergeWinner(currentDoc, freshOther);
        try {
          const r = await _executeMerge(db, keepDoc, dropDoc);
          console.log(`[autoMergeOnProfileUpdate] Merged by ${field}: drop=${dropDoc.id} → keep=${keepDoc.id}`, r);
        } catch (err) {
          console.error(`[autoMergeOnProfileUpdate] Merge error for uid=${uid}:`, err);
        }
      }
    }
  }
);

// ─── scheduledAutoMergeCleanup (diário 04:45 BRT) ─────────────────────────
// Varre toda a coleção users em busca de phones E emails duplicados e mescla
// automaticamente os pares encontrados. Garante que duplicatas que existiam
// antes do trigger ser deployado (e qualquer caso que escapou do trigger)
// sejam resolvidas.
exports.scheduledAutoMergeCleanup = onSchedule(
  {
    schedule:  "45 7 * * *",       // 04:45 BRT = 07:45 UTC
    timeZone:  "America/Sao_Paulo",
    region:    "us-central1",
    memory:    "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const db = admin.firestore();
    console.log("[scheduledAutoMergeCleanup] Iniciando varredura diária de duplicatas");

    const [phoneResults, emailResults] = await Promise.all([
      _scanAndMergeByField(db, "phone"),
      _scanAndMergeByField(db, "email"),
    ]);

    const total = phoneResults.length + emailResults.length;
    console.log(
      `[scheduledAutoMergeCleanup] Concluído: phone_merges=${phoneResults.length} ` +
      `email_merges=${emailResults.length}`
    );
    if (total > 0) {
      console.log("[scheduledAutoMergeCleanup] phone:", JSON.stringify(phoneResults));
      console.log("[scheduledAutoMergeCleanup] email:", JSON.stringify(emailResults));
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// syncDiscoveryFeed — mantém a coleção leve `discoveryFeed` para descoberta
// pública em tempo real. NÃO é a fonte de verdade: o frontend continua lendo de
// `tournaments`. Este doc serve só como GATILHO (o cliente escuta discoveryFeed
// e, ao mudar, re-busca o feed real) + resumo leve. Só escreve quando um campo
// RELEVANTE à descoberta muda — assim updates de placar/presença/etc. (a maioria
// esmagadora das escritas) NÃO disparam fan-out para todos os clientes.
// ═══════════════════════════════════════════════════════════════════════════
function _discoverySummary(t) {
  if (!t) return null;
  const hasDraw = !!(
    (Array.isArray(t.matches) && t.matches.length) ||
    (Array.isArray(t.rounds) && t.rounds.length) ||
    (Array.isArray(t.groups) && t.groups.length)
  );
  return {
    name: t.name || "",
    sport: t.sport || "",
    format: t.format || "",
    status: t.status || "",
    isPublic: t.isPublic === true,
    startDate: t.startDate || null,
    endDate: t.endDate || null,
    hasDraw: hasDraw
  };
}

exports.syncDiscoveryFeed = onDocumentWritten(
  { document: "tournaments/{tid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const tid = event.params.tid;
    const after  = event.data.after.exists  ? (event.data.after.data()  || {}) : null;
    const before = event.data.before.exists ? (event.data.before.data() || {}) : null;
    const feedRef = admin.firestore().collection("discoveryFeed").doc(tid);

    // Deletado OU deixou de ser público → remover do feed (se lá estava).
    if (!after || after.isPublic !== true) {
      if (before && before.isPublic === true) {
        await feedRef.delete().catch(() => {});
        console.log(`[syncDiscoveryFeed] removed ${tid} (deleted/private)`);
      }
      return;
    }

    // É público. Só escreve se algo RELEVANTE à descoberta mudou.
    const sa = _discoverySummary(after);
    const sb = before ? _discoverySummary(before) : null;
    if (sb && JSON.stringify(sa) === JSON.stringify(sb)) {
      return; // mudança irrelevante (placar/presença/etc.) — não dispara fan-out
    }

    sa.tid = tid;
    sa.syncedAt = admin.firestore.FieldValue.serverTimestamp();
    await feedRef.set(sa, { merge: true }).catch((e) => {
      console.error(`[syncDiscoveryFeed] set error ${tid}:`, e);
    });
    console.log(`[syncDiscoveryFeed] synced ${tid} status=${sa.status}`);
  }
);
