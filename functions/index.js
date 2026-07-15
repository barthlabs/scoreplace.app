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
const _mergeRules = require("./merge-rules");
const fetch = require("node-fetch");

admin.initializeApp();

// CORS unificado pros callables/onRequest do frontend. Inclui produção, o ambiente
// de STAGING (scoreplace-staging.web.app + .firebaseapp.com) e localhost de dev.
// Centralizado pra evitar drift entre as ~23 functions e dar paridade prod↔staging.
const APP_ORIGINS = [
  "https://scoreplace.app",
  "https://scoreplace-staging.web.app",
  "https://scoreplace-staging.firebaseapp.com",
  "http://localhost:9876",
];

// ── KILL-SWITCH DE NOTIFICAÇÕES NO STAGING ───────────────────────────────────
// O staging compartilha os MESMOS backends de prod (Evolution/WhatsApp, FCM, SMTP
// Brevo via extensão). Pra simular torneios com os inscritos REAIS sem disparar
// nada pra eles, TODA entrega externa (WhatsApp, e-mail, push) vira no-op quando
// rodando no projeto de staging. Em prod IS_STAGING é false → comportamento
// idêntico ao de sempre. As notificações in-app (docs em users/{uid}/notifications)
// continuam sendo criadas — visíveis na UI do staging, mas sem entrega externa.
const IS_STAGING = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").indexOf("staging") !== -1;

// Enfileira e-mail na coleção mail/ (consumida pela extensão firestore-send-email).
// No staging NÃO escreve nada → a extensão não tem o que entregar → zero e-mail.
async function _enqueueMail(dbRef, doc) {
  if (IS_STAGING) { console.log("[staging] e-mail suprimido (mail/ não escrito)"); return null; }
  return dbRef.collection("mail").add(doc);
}

// ═══════════════════════════════════════════════════════════════════════════
// MODULE-LEVEL HELPERS — account deduplication (phone + email)
// ═══════════════════════════════════════════════════════════════════════════

/** v4.4.116 — IDENTIDADE POR UID. Renomeia (e, no merge, re-aponta o uid) SÓ do slot cujo
 *  uid armazenado === oldUid: team1Uids/team2Uids (Rei/Rainha) e p1Uid/p2Uid (individual/
 *  dupla). Slot SEM uid é DEIXADO EM PAZ — nunca renomeia por string de nome (fim do clobber
 *  de homônimo, ex.: duas "Vivian"). newUid default = oldUid (rename puro, não-merge).
 *  Ver project_uid_audit_sweep / o incidente Vivian×Vivi Hirata. Returns {arr, hit}. */
function _replaceNameInMatches(matches, oldUid, newName, newUid) {
  if (!Array.isArray(matches) || !oldUid) return { arr: matches, hit: false };
  newUid = newUid || oldUid;
  let hit = false;
  const arr = matches.map(m => {
    if (!m || typeof m !== "object") return m;
    const nm = Object.assign({}, m);
    const oldP1 = nm.p1, oldP2 = nm.p2;
    let ch1 = false, ch2 = false;
    if (Array.isArray(nm.team1) && Array.isArray(nm.team1Uids)) {
      nm.team1 = nm.team1.map((x, i) => (nm.team1Uids[i] === oldUid) ? (ch1 = true, newName) : x);
      nm.team1Uids = nm.team1Uids.map(u => u === oldUid ? newUid : u);
    }
    if (Array.isArray(nm.team2) && Array.isArray(nm.team2Uids)) {
      nm.team2 = nm.team2.map((x, i) => (nm.team2Uids[i] === oldUid) ? (ch2 = true, newName) : x);
      nm.team2Uids = nm.team2Uids.map(u => u === oldUid ? newUid : u);
    }
    if (!Array.isArray(nm.team1) && nm.p1Uid === oldUid) { nm.p1 = newName; nm.p1Uid = newUid; ch1 = true; }
    if (!Array.isArray(nm.team2) && nm.p2Uid === oldUid) { nm.p2 = newName; nm.p2Uid = newUid; ch2 = true; }
    if (ch1 && Array.isArray(nm.team1)) nm.p1 = nm.team1.join(" / ");
    if (ch2 && Array.isArray(nm.team2)) nm.p2 = nm.team2.join(" / ");
    if (ch1 || ch2) {
      hit = true;
      if (nm.winner === oldP1) nm.winner = nm.p1;
      else if (nm.winner === oldP2) nm.winner = nm.p2;
    }
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

    // v1.2.2: memberEmails[] saiu do schema — membro é uid (memberUids, logo abaixo).

    // memberUids[] — array das QUERIES (array-contains em getVisibleTournaments).
    // v3.0.59: sem repontar isto, o torneio sumia pro sobrevivente após o merge
    // (bug pego no teste E2E — memberUids continuava no uid apagado).
    const memberUids = Array.isArray(t.memberUids) ? [...t.memberUids] : [];
    const uidIdx = dropUid ? memberUids.indexOf(dropUid) : -1;
    if (uidIdx !== -1) {
      if (keepUid && !memberUids.includes(keepUid)) memberUids.splice(uidIdx, 1, keepUid);
      else memberUids.splice(uidIdx, 1);
      update.memberUids = memberUids;
      changed = true;
    }

    // Propriedade por uid: creatorUid / organizerUid → conta sobrevivente.
    if (dropUid && keepUid) {
      if (t.creatorUid === dropUid)   { update.creatorUid = keepUid;   changed = true; }
      if (t.organizerUid === dropUid) { update.organizerUid = keepUid; changed = true; }
    }
    // Propriedade por e-mail (legado): creatorEmail / organizerEmail.
    if (dropEmail && keepEmail) {
      if (String(t.creatorEmail || "").toLowerCase() === dropEmail.toLowerCase())   { update.creatorEmail = keepEmail;   changed = true; }
      if (String(t.organizerEmail || "").toLowerCase() === dropEmail.toLowerCase()) { update.organizerEmail = keepEmail; changed = true; }
    }

    // participants[]
    // v1.2.2: SLOT-AWARE. Antes só olhava p.uid — quem estava como MEMBRO DE DUPLA
    // (p1Uid/p2Uid) ou em sub-participants[] não era re-apontado, e o merge deleta a conta
    // antiga do Auth logo em seguida (deleteUser) → uid ÓRFÃO na hora, garantido. Mesma
    // classe de bug que o filtro solo-only de _executeDeleteAccount (auth.js). Aqui NÃO se
    // remove ninguém: o merge preserva a pessoa e só troca a identidade morta pela viva.
    // Ver [[project_orphan_uid_entries]] / [[project_account_merge_email]].
    if (Array.isArray(t.participants)) {
      // UID ONLY: casa exclusivamente pelo uid que está morrendo no merge. Casar por e-mail
      // aqui era rede de segurança e mordia: o merge existe justamente porque a MESMA pessoa
      // tem contas com identificadores diferentes, então o e-mail não decide identidade.
      // Ficto (organizador digitou o nome, sem uid) não é conta e nunca entra num merge.
      const _isDrop = (u) => !!(u && u === dropUid);
      const parts = t.participants.map(p => {
        if (!p || typeof p !== "object") return p;
        let hit = false;
        const updated = Object.assign({}, p);
        // slot solo
        if (_isDrop(p.uid)) {
          hit = true;
          updated.uid = keepUid;
          if (keepEmail) updated.email = keepEmail;
          if (keepName)  { updated.displayName = keepName; updated.name = keepName; }
        }
        // membro de dupla (p1/p2) — o nome da dupla (displayName "A / B") NÃO é reescrito:
        // o display reconstrói de p1Uid/p2Uid pelo perfil vivo.
        if (_isDrop(p.p1Uid)) {
          hit = true;
          updated.p1Uid = keepUid;
          if (keepEmail) updated.p1Email = keepEmail;
          if (keepName)  updated.p1Name = keepName;
        }
        if (_isDrop(p.p2Uid)) {
          hit = true;
          updated.p2Uid = keepUid;
          if (keepEmail) updated.p2Email = keepEmail;
          if (keepName)  updated.p2Name = keepName;
        }
        // sub-participants[]
        if (Array.isArray(p.participants)) {
          let subHit = false;
          const subs = p.participants.map(s => {
            if (!s || typeof s !== "object" || !_isDrop(s.uid)) return s;
            subHit = true;
            const q = Object.assign({}, s);
            q.uid = keepUid;
            if (keepEmail) q.email = keepEmail;
            if (keepName)  { q.displayName = keepName; q.name = keepName; }
            return q;
          });
          if (subHit) { hit = true; updated.participants = subs; }
        }
        if (!hit) return p;
        changed = true;
        return updated;
      });
      if (changed) update.participants = parts;
    }

    // v4.4.116: re-aponta uid + nome nos jogos POR UID (dropUid → keepUid). Nunca por nome
    // (fim do clobber de homônimo). Também trata monarchGroups[].matches, que existem além
    // de rounds[].matches em Rei/Rainha.
    if (dropUid && keepName) {
      const structs = [
        { key: "matches", plain: true  },
        { key: "rounds",  plain: false },
        { key: "groups",  plain: false },
        { key: "rodadas", plain: false },
      ];
      for (const { key, plain } of structs) {
        if (!Array.isArray(t[key])) continue;
        if (plain) {
          const r = _replaceNameInMatches(t[key], dropUid, keepName, keepUid);
          if (r.hit) { update[key] = r.arr; changed = true; }
        } else {
          let hit = false;
          const updated = t[key].map(item => {
            if (!item || typeof item !== "object") return item;
            let it = item;
            if (Array.isArray(item.matches)) {
              const r = _replaceNameInMatches(item.matches, dropUid, keepName, keepUid);
              if (r.hit) { hit = true; it = Object.assign({}, it, { matches: r.arr }); }
            }
            if (Array.isArray(item.monarchGroups)) {
              const mg = item.monarchGroups.map(g => {
                if (!g || !Array.isArray(g.matches)) return g;
                const r = _replaceNameInMatches(g.matches, dropUid, keepName, keepUid);
                if (r.hit) { hit = true; return Object.assign({}, g, { matches: r.arr }); }
                return g;
              });
              it = Object.assign({}, it, { monarchGroups: mg });
            }
            return it;
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
 *
 * v1.2.6 — REGRA DO DONO: a conta FEDERADA (Google/Apple) prevalece. Provedor federado não
 * se transfere entre uids: apagar a conta Google apaga o login da pessoa (celular e senha se
 * movem, ele não). Espelha _mergeAccountsKeepOlder — os dois pontos de decisão do merge
 * precisam concordar, senão o auto-merge e o merge explícito escolhem sobreviventes
 * diferentes pra mesma dupla. Decide pelo `authProvider` do próprio doc (gravado em 166/166
 * dos perfis) pra não precisar bater no Auth aqui.
 *
 * v3.0.57 (desempate, ainda vale): entre duas federadas — ou duas não-federadas — sobrevive a
 * MAIS ANTIGA, com o displayName dela. createdAt é o critério; ausente perde pra quem tem
 * idade conhecida; empate/ambos sem createdAt → perfil mais completo (legado).
 * Ver [[project_account_merge_email]]. Returns { keepDoc, dropDoc }.
 */
function _determineMergeWinner(docA, docB) {
  const fa = _mergeRules.isFederatedProfile(docA.data());
  const fb = _mergeRules.isFederatedProfile(docB.data());
  if (fa !== fb) {
    return fa ? { keepDoc: docA, dropDoc: docB } : { keepDoc: docB, dropDoc: docA };
  }
  const ts = doc => {
    const c = doc.data().createdAt;
    if (c == null) return null;
    return c.toMillis ? c.toMillis() : Number(c);
  };
  const a = ts(docA), b = ts(docB);
  if (a != null && b != null && a !== b) {
    return a < b ? { keepDoc: docA, dropDoc: docB } : { keepDoc: docB, dropDoc: docA };
  }
  if (a != null && b == null) return { keepDoc: docA, dropDoc: docB };
  if (b != null && a == null) return { keepDoc: docB, dropDoc: docA };
  // Sem createdAt confiável (ou exatamente igual) → desempata pelo perfil mais completo.
  const aScore = _profileScore(docA.data());
  const bScore = _profileScore(docB.data());
  return aScore >= bScore
    ? { keepDoc: docA, dropDoc: docB }
    : { keepDoc: docB, dropDoc: docA };
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

// E-mail sintético de conta phone-only — nunca é credencial "de verdade" a preservar.
function _isSyntheticAuthEmail(email) {
  return /@phone\.scoreplace\.app$/i.test(String(email || ""));
}

/**
 * MOTOR ÚNICO de fusão bidirecional.
 *
 * v1.2.6 — REGRA DO DONO: sobrevive a conta FEDERADA (Google/Apple). Entre duas federadas
 * (ou duas não-federadas) sobrevive a MAIS ANTIGA, que era a regra única até aqui (v3.0.59).
 * O motivo é técnico: provedor federado não se transfere entre uids — apagar a conta Google
 * apaga o login. Celular e e-mail/senha se movem via updateUser, então a federada é sempre a
 * que tem de ficar. Ver o bloco de comentário na escolha do keepU e [[project_account_merge_email]].
 *
 * Recebe dois uids JÁ PROVADOS como sendo da mesma pessoa (um pela sessão, o outro por
 * verificação de e-mail/celular). Mantém o sobrevivente (uid + displayName dele), move os
 * dados do outro (_executeMerge — que preserva enrollSeq, ou seja, a ORDEM DE INSCRIÇÃO nos
 * torneios), TRANSFERE a credencial que faltava (celular↔e-mail real) e APAGA o Auth do
 * absorvido. Idempotente-ish: se um já está mergedInto, não faz nada.
 * Retorna { survivorUid, droppedUid }. Direção-agnóstico: e-mail→celular E celular→e-mail.
 *
 * Nome mantido por compat (é chamado de vários pontos); hoje "KeepOlder" é só o desempate.
 */
async function _mergeAccountsKeepOlder(db, uidA, uidB) {
  if (!uidA || !uidB || uidA === uidB) throw new HttpsError("invalid-argument", "uids inválidos pra merge");
  let ua, ub;
  try { ua = await admin.auth().getUser(uidA); } catch (e) { ua = null; }
  try { ub = await admin.auth().getUser(uidB); } catch (e) { ub = null; }
  if (!ua || !ub) throw new HttpsError("not-found", "uma das contas não existe mais (já fundida?)");

  // Já fundidas? (tombstone no Firestore)
  const [da, dbb] = await Promise.all([
    db.collection("users").doc(uidA).get(),
    db.collection("users").doc(uidB).get(),
  ]);
  if ((da.exists && da.data().mergedInto) || (dbb.exists && dbb.data().mergedInto)) {
    return { survivorUid: (da.data() && da.data().mergedInto) || (dbb.data() && dbb.data().mergedInto) || uidA, droppedUid: null, already: true };
  }

  // v1.2.6 — REGRA DO DONO: a conta FEDERADA (Google/Apple) sempre vence; entre duas
  // federadas (ou duas não-federadas), volta a valer a mais antiga.
  //
  // Não é preferência, é limite do Firebase: provedor federado NÃO se transfere entre uids
  // — ele morre com a conta. Telefone e e-mail/senha se movem (updateUser, logo abaixo).
  // Então manter a "mais antiga" quando ela é phone e a nova é Google apaga justamente o
  // login que a pessoa usa: o e-mail vai pro sobrevivente, mas o provider google.com some,
  // e "Entrar com Google" passa a bater em auth/account-exists-with-different-credential
  // (o projeto usa uma conta por e-mail). O resolveMergedLogin não salva — ele depende de a
  // pessoa CONSEGUIR logar na conta com mergedInto, que acabou de ser deletada.
  //
  // Caso real (Mônica Rossi, jul/2026): phone criado 31/mai com o perfil todo + a vaga na
  // Confra; Google criado 11/jun, com os únicos logins recentes. Pela regra antiga ela
  // ganharia a Confra e perderia a entrada. Mantendo a federada: o phone é movido pra ela,
  // e a pessoa entra por Google OU telefone. Ver [[project_account_merge_email]].
  const _pick = _mergeRules.pickSurvivor(ua, ub);
  const keepU = _pick.keep, dropU = _pick.drop;
  console.log(`[merge] keep=${keepU.uid} [${(keepU.providerData || []).map((p) => p.providerId).join(",")}] ` +
    `← drop=${dropU.uid} (critério: ${_pick.reason === "federated" ? "conta federada vence" : "mais antiga vence"})`);
  const keepDoc = (keepU.uid === uidA) ? da : dbb;
  const dropDoc = (dropU.uid === uidA) ? da : dbb;

  console.log(`[mergeKeepOlder] keep=${keepU.uid} (criado ${keepU.metadata.creationTime}) ← drop=${dropU.uid} (criado ${dropU.metadata.creationTime})`);

  // Credenciais do drop a mover pro keep (antes de apagar o drop).
  const dropEmail = (dropU.email && !_isSyntheticAuthEmail(dropU.email)) ? dropU.email : null;
  const dropPhone = dropU.phoneNumber || null;

  // 1) Move TODOS os dados (torneios, matchHistory, casuais) + tombstone do dropDoc.
  if (keepDoc.exists && dropDoc.exists) {
    await _executeMerge(db, keepDoc, dropDoc);
  } else if (dropDoc.exists) {
    // keep sem doc Firestore (raro) — só marca tombstone apontando pro keep.
    await db.collection("users").doc(dropU.uid).set(
      { mergedInto: keepU.uid, mergedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  // 2) Apaga o usuário Auth mais novo — libera e-mail/celular dele.
  try { await admin.auth().deleteUser(dropU.uid); }
  catch (e) { console.error("[mergeKeepOlder] deleteUser(drop) falhou:", e.code || e.message); }

  // 3) Move a credencial que faltava pro keep (agora livre).
  const upd = {};
  if (dropEmail && (!keepU.email || _isSyntheticAuthEmail(keepU.email))) { upd.email = dropEmail; upd.emailVerified = true; }
  if (dropPhone && !keepU.phoneNumber) { upd.phoneNumber = dropPhone; }
  if (Object.keys(upd).length) {
    try { await admin.auth().updateUser(keepU.uid, upd); }
    catch (e) { console.error("[mergeKeepOlder] updateUser(keep) falhou:", e.code || e.message); }
  }
  // 4) Reflete os identificadores ganhos no perfil Firestore do keep.
  const profUpd = { updatedAt: new Date().toISOString() };
  if (upd.email) profUpd.email = upd.email;
  if (upd.phoneNumber) { profUpd.phone = upd.phoneNumber; profUpd.phoneCountry = profUpd.phoneCountry || "55"; }
  await db.collection("users").doc(keepU.uid).set(profUpd, { merge: true }).catch(() => {});

  return { survivorUid: keepU.uid, droppedUid: dropU.uid, already: false };
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
    // v3.0.x: endpoint admin one-shot (mai/2026, já executado) DESATIVADO. O "segredo"
    // ficava hardcoded num repo PÚBLICO → qualquer um podia disparar um purge em massa.
    // Sempre responde 410; o corpo abaixo ficou inalcançável.
    res.status(410).json({ error: "gone — endpoint admin desativado" });
    return;
    const SECRET = null; // (inalcançável) mantido só pra referência abaixo não quebrar parse
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

// v1.2.2: `recoverAdminEmails` REMOVIDA (~101 linhas). Era one-shot de mai/2026 pro
// bug v1.6.66 (save de objeto parcial apagava adminEmails/memberEmails), ja executada e ja
// desativada (respondia 410, corpo inalcancavel). Era o ultimo lugar que computava
// memberEmails - e o campo saiu do schema: membro e uid (memberUids).
// Ver [[project_uid_primary_identity]] / [[project_dead_code_cleanup]].

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
// v3.0.56: paleta do e-mail de digest segue o TEMA escolhido pelo destinatário
// (profile.theme: 'light'|'dark'). Default dark (tema padrão do app).
function _digestPalette(theme) {
  if (theme === "light") {
    return { pageBg: "#eef2f7", cardBg: "#ffffff", text: "#0f172a", text2: "#1f2937", muted: "#64748b", footer: "#94a3b8", divider: "#e2e8f0", heading: "#0f172a" };
  }
  return { pageBg: "#0f172a", cardBg: "#111827", text: "#f1f5f9", text2: "#e5e7eb", muted: "#94a3b8", footer: "#64748b", divider: "#1e293b", heading: "#ffffff" };
}
function _buildDigestHtml(items, theme) {
  const P = _digestPalette(theme);
  const rows = items.map((it) => {
    const meta = _digestLevelMeta(it.level);
    const msgHtml = _digestEscape(it.message).replace(/\n/g, "<br>");
    const tName = it.tournamentName ? ('<div style="font-size:0.72rem;font-weight:700;color:' + P.muted + ';text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px;">🏆 ' + _digestEscape(it.tournamentName) + "</div>") : "";
    // v2.8.51: CTA por tipo (botão âmbar). Usa ctaUrl/ctaLabel quando vierem; senão
    // cai no tournamentUrl genérico. Toda notificação ganha um botão de ação.
    const _ctaUrl = it.ctaUrl || it.tournamentUrl || "";
    const _ctaLabel = it.ctaLabel || "Ver no scoreplace.app";
    const link = _ctaUrl ? ('<div style="margin-top:10px;"><a href="' + _digestEscape(_ctaUrl) + '" style="display:inline-block;background:#fbbf24;color:#3a2300;font-size:0.82rem;text-decoration:none;font-weight:800;padding:9px 18px;border-radius:9px;">👉 ' + _digestEscape(_ctaLabel) + "</a></div>") : "";
    return (
      '<tr><td style="padding:0 0 14px;">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:' + P.cardBg + ";border-left:4px solid " + meta.color + ';border-radius:10px;' + (theme === "light" ? "border:1px solid #e2e8f0;border-left:4px solid " + meta.color + ";" : "") + '">' +
          '<tr><td style="padding:14px 16px;color:' + P.text2 + ';">' +
            '<div style="font-size:0.68rem;font-weight:800;color:' + meta.color + ';margin-bottom:6px;">' + meta.emoji + " " + meta.label + "</div>" +
            tName +
            '<div style="font-size:0.92rem;color:' + P.text + ';line-height:1.5;">' + msgHtml + "</div>" +
            link +
          "</td></tr>" +
        "</table>" +
      "</td></tr>"
    );
  }).join("");
  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>' +
    '<body style="margin:0;padding:0;background:' + P.pageBg + ';font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">' +
      '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="background:' + P.pageBg + ';padding:32px 16px;"><tr><td align="center">' +
        '<table cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:540px;">' +
          '<tr><td style="padding:0 4px 16px;text-align:center;">' +
            '<div style="font-size:1.3rem;">🔔</div>' +
            '<div style="font-size:1rem;font-weight:800;color:' + P.heading + ';margin-top:2px;">' + (items.length === 1 ? "Você tem 1 novidade" : ("Você tem " + items.length + " novidades")) + "</div>" +
            '<div style="font-size:0.8rem;color:' + P.muted + ';">scoreplace.app</div>' +
          "</td></tr>" +
          "<tr><td>" + '<table cellspacing="0" cellpadding="0" border="0" width="100%">' + rows + "</table>" + "</td></tr>" +
          '<tr><td style="padding:8px 4px 0;text-align:center;border-top:1px solid ' + P.divider + ';">' +
            '<p style="margin:14px 0 0;font-size:0.7rem;color:' + P.footer + ';">scoreplace.app · Jogue em outro nível</p>' +
            '<p style="margin:6px 0 0;font-size:0.68rem;color:' + P.footer + ';">Pra ajustar a frequência/canais, abra o app → seu perfil → Canais de notificação.</p>' +
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
      // v3.0.56: tema do destinatário (profile.theme) → e-mail segue claro/escuro
      // escolhido no app. Default dark (tema padrão). Busca por e-mail (com fallback
      // lowercase); se não achar, fica no dark — sem regressão.
      let _theme = "dark";
      try {
        let _uSnap = await db.collection("users").where("email", "==", email).limit(1).get();
        if (_uSnap.empty && email !== email.toLowerCase()) {
          _uSnap = await db.collection("users").where("email", "==", email.toLowerCase()).limit(1).get();
        }
        if (!_uSnap.empty) { const _th = _uSnap.docs[0].data().theme; if (_th === "light") _theme = "light"; }
      } catch (e) { /* default dark */ }
      try {
        const subject = items.length === 1
          ? ("scoreplace.app — " + (items[0].tournamentName || "Notificação"))
          : ("scoreplace.app — " + items.length + " novidades");
        await _enqueueMail(db, {
          to: [email],
          replyTo: "scoreplace.app@gmail.com",
          message: { subject, html: _buildDigestHtml(items, _theme), text: _buildDigestText(items) },
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

// ─── Digest de WhatsApp (v1.16) ──────────────────────────────────────────────
// Notificações com política 'agrupado' no catálogo (ex.: inscrições de terceiros)
// vão pra `whatsapp_digest_queue` (via FirestoreDB.queueWhatsAppDigest, flushAtMs =
// now + 1h). Esta função junta TODOS os itens pendentes do mesmo telefone numa
// ÚNICA mensagem e enfileira em `whatsapp_queue` (o processWhatsAppQueue envia).
// Reduz volume/custo do WhatsApp oficial. Espelha flushNotifEmailDigest.
exports.flushWhatsAppDigest = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
  },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const dueSnap = await db.collection("whatsapp_digest_queue").where("flushAtMs", "<=", now).get();
    if (dueSnap.empty) {
      console.log("[flushWhatsAppDigest] nada vencido");
      return;
    }
    const duePhones = new Set();
    dueSnap.forEach((d) => { const p = d.data().phone; if (p) duePhones.add(p); });

    let sent = 0;
    for (const phone of duePhones) {
      // Consolida TODOS os itens pendentes desse telefone (vencidos ou não).
      const allSnap = await db.collection("whatsapp_digest_queue").where("phone", "==", phone).get();
      const items = [];
      allSnap.forEach((d) => items.push(Object.assign({ _id: d.id }, d.data())));
      if (items.length === 0) continue;
      items.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      try {
        // v1.1.30: vira o template sp_inscricoes_resumo. Parâmetro de template NÃO
        // aceita \n (a Meta rejeita o envio), então as linhas são juntadas com ", "
        // — e não com quebra de linha como era no texto livre do Evolution.
        const resumo = items
          .map((it) => String(it.line || "").replace(/^[🔴🟠🟢]\s*/, "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(", ");
        const nome = String(items[0].toName || "").trim() || "jogador";
        const torneio = String(items[0].tournamentName || "").trim() || "seu torneio";
        const urls = [...new Set(items.map((it) => it.tournamentUrl).filter(Boolean))];
        let suffix = "#dashboard";
        if (urls.length === 1) { const i = urls[0].indexOf("#"); if (i !== -1) suffix = urls[0].slice(i); }
        await db.collection("whatsapp_queue").add({
          template: "sp_inscricoes_resumo",
          urlSuffix: suffix,
          recipients: [{ phone: phone, params: [nome, torneio, resumo.slice(0, 900) || "veja no app"] }],
          createdAt: new Date().toISOString(),
          status: "pending",
        });
        // Limpa os itens consolidados.
        let batch = db.batch();
        let n = 0;
        for (const it of items) {
          batch.delete(db.collection("whatsapp_digest_queue").doc(it._id));
          if (++n % 400 === 0) { await batch.commit(); batch = db.batch(); }
        }
        if (n % 400 !== 0) await batch.commit();
        sent++;
      } catch (err) {
        console.error("[flushWhatsAppDigest] falha pra", phone, err);
      }
    }
    console.log("[flushWhatsAppDigest] digests:", sent, "| telefones vencidos:", duePhones.size);
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
    // v4.0.9: UMA varredura só, SEM query indexada. A versão anterior fazia
    // primeiro um where(status==finished).where(finishedAt<thr) que exigia um
    // índice composto (status, finishedAt) — que NÃO existia. Resultado: a função
    // lançava FAILED_PRECONDITION logo no passo 1 e os passos 2/3 (dissolver salas
    // inativas + limpar ponteiros) NUNCA rodavam → salas mortas sobreviviam por
    // semanas e usuários caíam nelas. Agora um único get() resolve finished+stale,
    // client-side, sem depender de índice (a coleção é pequena).
    // Regras:
    //   • status='finished': registro histórico → apaga só após 30 dias.
    //   • status='active'  : sala em jogo → dissolve se inativa > 2h (sem pontos).
    //   • setup/waiting/outro: dissolve se inativa > 12h.
    // lastActivityAt é escrito pelo cliente a cada ponto (_syncLiveState); na
    // ausência cai em finishedAt/updatedAt/createdAt. Sem timestamp = legado → apaga.
    const now = Date.now();
    const threshold30d = now - 30 * 24 * 60 * 60 * 1000;
    const cutoff2h  = now - 2  * 60 * 60 * 1000;
    const cutoff12h = now - 12 * 60 * 60 * 1000;
    const _ts = (raw) => { if (!raw) return 0; const p = Number(raw); return (!isNaN(p) && p > 1e12) ? p : new Date(raw).getTime(); };
    let deletedFinished = 0;
    let deletedStale = 0;
    const allSnap = await db.collection("casualMatches").get();
    let batch = db.batch();
    let inBatch = 0;
    for (const doc of allSnap.docs) {
      const d = doc.data() || {};
      let del = false;
      if (d.status === "finished") {
        const ft = _ts(d.finishedAt || d.updatedAt || d.createdAt);
        if (ft === 0 || ft < threshold30d) { del = true; deletedFinished++; }
      } else {
        const ts = _ts(d.lastActivityAt || d.updatedAt || d.createdAt);
        const cutoff = d.status === "active" ? cutoff2h : cutoff12h;
        if (ts === 0 || ts < cutoff) { del = true; deletedStale++; }
      }
      if (del) {
        batch.delete(doc.ref); inBatch++;
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
    cors: APP_ORIGINS,
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
      await _enqueueMail(admin.firestore(), {
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
// v1.2.4: WRAPPER URL no e-mail de confirmação — mesma correção que a v1.0.30 fez no magic
// link, que nunca chegou aqui. `generateEmailVerificationLink` devolve uma URL com oobCode de
// USO ÚNICO; scanner anti-phishing (Outlook/corp, e o Gmail também) prefetcha o link pra
// checar e CONSOME o código antes do humano clicar → "link inválido" e a pessoa nunca entra.
// Evidência em prod (jul/2026): 7 contas travadas no gate — Val pediu 3 confirmações,
// Paulo 3 resets de senha (culpando a senha), Zilda recebia 32 e-mails do app mas não
// conseguia entrar, e está inscrita na Confra. Agora o e-mail aponta pra
// scoreplace.app/?vt=TOKEN: o scanner faz GET/HEAD na NOSSA URL (não executa JS, não
// consome nada) e só o browser real resolve o oobCode. Reusa a coleção magicLinks —
// mesmas rules (leitura pública: o token de 24 chars É o segredo) e mesmo cleanup
// (cleanupOldMagicLinks). Ver [[project_email_deliverability_hotmail]].
async function _wrapVerificationLink(firebaseLink, email) {
  const crypto = require("crypto");
  const token = crypto.randomBytes(18).toString("base64url");
  try {
    await admin.firestore().collection("magicLinks").doc(token).set({
      firebaseLink: firebaseLink,
      email: email,
      kind: "verify",   // distingue do magic link de login (o handler trata igual: redireciona)
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),  // oobCode de verificação dura mais que o de login
    });
  } catch (err) {
    console.error("[verifyLink] falha ao salvar magicLinks/" + token + " — caindo no link direto", err);
    return firebaseLink;   // degrada pro comportamento antigo em vez de não mandar e-mail
  }
  return "https://scoreplace.app/?vt=" + encodeURIComponent(token);
}

async function _queueVerificationEmail(db, email, link, name) {
  link = await _wrapVerificationLink(link, email);
  const { html, text } = _buildVerificationEmailContent(link, name);
  await _enqueueMail(db, {
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
    cors: APP_ORIGINS,
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

// ─── sendVerificationCode / verifyEmailCode (v3.0.x) ────────────────────────
// Pra provedores que DROPAM e-mail rico com link (Microsoft/UOL/BOL/Terra), o app chama
// estas em vez de sendVerificationEmail: enviamos um e-mail TEXTO PURO (sem HTML, sem link)
// com um código de 6 dígitos — muito mais chance de passar nos filtros. A pessoa digita o
// código no app e verifyEmailCode marca emailVerified. Segurança: código hasheado (sha256
// com o uid), expira em 15 min, máx. 5 tentativas, envio rate-limitado (45s). O doc fica em
// emailVerifyCodes/{uid} — SERVER-ONLY (regras Firestore negam acesso do cliente).
exports.sendVerificationCode = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "precisa estar autenticado");
    const db = admin.firestore();
    let email = "";
    try { const u = await admin.auth().getUser(uid); email = (u.email || "").toLowerCase(); } catch (e) {}
    if (!email) throw new HttpsError("failed-precondition", "conta sem e-mail");

    const crypto = require("crypto");
    const ref = db.collection("emailVerifyCodes").doc(uid);
    const now = Date.now();
    const cur = await ref.get();
    if (cur.exists && cur.data().sentAt && (now - cur.data().sentAt) < 45000) {
      throw new HttpsError("resource-exhausted", "aguarde alguns segundos pra reenviar o código");
    }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const codeHash = crypto.createHash("sha256").update(uid + ":" + code).digest("hex");
    await ref.set({ codeHash, expiresAt: now + 15 * 60 * 1000, attempts: 0, sentAt: now, email });

    const text =
      "scoreplace.app — confirme seu e-mail\n\n" +
      "Seu codigo de confirmacao e: " + code + "\n\n" +
      "Digite esse codigo no app pra ativar sua conta. Ele expira em 15 minutos.\n\n" +
      "Nao pediu? Pode ignorar este e-mail.\n\n" +
      "scoreplace.app";
    try {
      // SÓ text (sem html) → e-mail text/plain, melhor entrega em Microsoft/UOL.
      await _enqueueMail(db, {
        to: [email],
        replyTo: "scoreplace.app@gmail.com",
        message: { subject: "Seu codigo scoreplace.app: " + code, text: text },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      throw new HttpsError("internal", "não foi possível enviar o código: " + (err.code || err.message));
    }
    console.log("[sendVerificationCode] plain-text code queued for", email);
    return { ok: true };
  }
);

exports.verifyEmailCode = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "precisa estar autenticado");
    const code = String((request.data && request.data.code) || "").replace(/\D/g, "");
    if (code.length !== 6) throw new HttpsError("invalid-argument", "código inválido");

    const db = admin.firestore();
    const crypto = require("crypto");
    const ref = db.collection("emailVerifyCodes").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "nenhum código ativo. peça um novo.");
    const d = snap.data() || {};
    if (Date.now() > (d.expiresAt || 0)) { await ref.delete().catch(() => {}); throw new HttpsError("deadline-exceeded", "código expirado. peça um novo."); }
    if ((d.attempts || 0) >= 5) { await ref.delete().catch(() => {}); throw new HttpsError("resource-exhausted", "muitas tentativas. peça um novo código."); }

    const hash = crypto.createHash("sha256").update(uid + ":" + code).digest("hex");
    if (hash !== d.codeHash) {
      await ref.update({ attempts: (d.attempts || 0) + 1 }).catch(() => {});
      return { ok: false, error: "código incorreto" };
    }
    try { await admin.auth().updateUser(uid, { emailVerified: true }); }
    catch (err) { throw new HttpsError("internal", "não foi possível confirmar: " + (err.code || err.message)); }
    await ref.delete().catch(() => {});
    console.log("[verifyEmailCode] confirmed", uid);
    return { ok: true };
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
  await _enqueueMail(db, {
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
    cors: APP_ORIGINS,
  },
  async (request) => {
    const email = (request.data && request.data.email || "").trim().toLowerCase();
    const name = (request.data && request.data.name || "").trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpsError("invalid-argument", "email inválido");
    }

    const db = admin.firestore();
    // v2.6.x: wrapper `?pr=TOKEN` (token no Firestore) em vez do oobCode cru do
    // Firebase — scanners anti-phishing consumiam o oobCode de uso único antes do
    // clique ("link expirado"). Bônus: não depende mais do generatePasswordResetLink
    // (que sofria outage transitório do Auth e exigia a fila pendingPasswordResets).
    let ur = null;
    try { ur = await admin.auth().getUserByEmail(email); } catch (e) { /* not found */ }
    if (!ur) return { ok: true }; // silencioso (enumeração)
    try {
      const crypto = require("crypto");
      const token = crypto.randomBytes(18).toString("base64url");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
      await db.collection("passwordResetTokens").doc(token).set({
        uid: ur.uid, email: email, phone: ur.phoneNumber || null, expiresAt,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      const wrapperUrl = "https://scoreplace.app/?pr=" + encodeURIComponent(token);
      await _queuePasswordResetEmail(db, email, wrapperUrl, name);
      console.log("[sendPasswordReset] wrapper queued for", email);
      return { ok: true };
    } catch (err) {
      console.error("[sendPasswordReset] falha:", err);
      throw new HttpsError("internal", "não foi possível enviar o e-mail: " + (err.code || err.message));
    }
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
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
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
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
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

// ─── applyLetzplayScans (v1.1.19) ────────────────────────────────────────────
// Aplica o resultado da busca letzplay do organizador NO PERFIL de cada inscrito
// (users/{uid}): gênero, nível apurado (skillBySport) e, quando a busca foi completa,
// o histórico (letzplayImport).
//
// POR QUE ESTA FUNÇÃO EXISTE:
// As rules só deixam o DONO escrever no próprio users/{uid}. Por isso a única forma de
// o scan do organizador chegar ao perfil era o _selfPopulateFromLetzplayScan, que roda
// QUANDO A PESSOA LOGA. Efeito real (14/jul/2026): a Kelly logou depois do scan e ficou
// verde na Análise; a Flavia, com scan igualmente lido, ficou roxa por nunca ter logado.
// Regra do dono: "o preenchimento do banco de dados e a leitura pelo organizador deve
// ser independente de log do usuário." Admin SDK ignora as rules → grava agora.
//
// PRECEDÊNCIA (decidida pelo dono): o letzplay VENCE SEMPRE em gênero e nível — o dado
// veio do próprio letzplay, não há como divergir dele. O HISTÓRICO é a exceção: só
// substitui se trouxer MAIS jogos (um scan antigo nunca apaga um self-import mais novo).
//
// O servidor RELÊ letzplayScans/{uid} — não confia em payload do cliente (qualquer authed
// escreve nessa coleção; sem reler, dava pra forjar o nível de terceiros via esta função).
// Deploy:  firebase deploy --only functions:applyLetzplayScans
exports.applyLetzplayScans = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 120, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const uids = (request.data && request.data.uids) || [];
    if (!tournamentId || !Array.isArray(uids) || uids.length === 0) {
      throw new HttpsError("invalid-argument", "tournamentId e uids são obrigatórios");
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
    if (!isOrg) throw new HttpsError("permission-denied", "só o organizador pode aplicar a busca letzplay");

    // letzplay é Beach Tennis — mesma constante do cliente (_selfPopulateFromLetzplayScan).
    const SPORT = "Beach Tennis";
    let written = 0; const skipped = [];

    for (const rawUid of uids) {
      const uid = rawUid ? String(rawUid) : "";
      if (!uid) { skipped.push({ uid, reason: "no-uid" }); continue; }

      const scanSnap = await db.collection("letzplayScans").doc(uid).get();
      if (!scanSnap.exists) { skipped.push({ uid, reason: "no-scan" }); continue; }
      const data = scanSnap.data() || {};
      const scan = data.scan || {};

      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();
      if (!userSnap.exists) { skipped.push({ uid, reason: "no-user" }); continue; }
      const cur = userSnap.data() || {};

      const upd = {};
      if (scan.gender === "masculino" || scan.gender === "feminino") upd.gender = scan.gender;

      // profileSkill = borda MAIS FRACA da banda ativa (conservador — ver _spDeriveScan).
      const checked = scan.profileSkill || scan.skill;
      if (checked) {
        const sbs = (cur.skillBySport && typeof cur.skillBySport === "object") ? Object.assign({}, cur.skillBySport) : {};
        const src = (cur.skillBySportSource && typeof cur.skillBySportSource === "object") ? Object.assign({}, cur.skillBySportSource) : {};
        sbs[SPORT] = checked;
        src[SPORT] = "letzplay";
        upd.skillBySport = sbs;
        upd.skillBySportSource = src;
      }

      // Histórico: só entra se trouxer MAIS jogos que o atual (nunca regride o perfil).
      const fi = data.fullImport;
      if (fi && typeof fi === "object" && Array.isArray(fi.footprint)) {
        const fiGames = Array.isArray(fi.games) ? fi.games.length : 0;
        const curGames = (cur.letzplayImport && Array.isArray(cur.letzplayImport.games)) ? cur.letzplayImport.games.length : 0;
        if (fiGames > curGames) {
          fi.importedVia = "organizer";
          fi.importedByName = data.scannedByName || null;
          fi.importedTournamentName = data.tournamentName || null;
          fi.importedAt = data.scannedAt || fi.importedAt || null;
          upd.letzplayImport = fi;
          if (!cur.letzplayHandle && fi.handle) upd.letzplayHandle = fi.handle;
        }
      }

      if (Object.keys(upd).length === 0) { skipped.push({ uid, reason: "nothing" }); continue; }
      upd.letzplayAppliedBy = callerUid;
      upd.letzplayAppliedAt = admin.firestore.FieldValue.serverTimestamp();
      await userRef.update(upd);
      written++;
    }

    console.log("[applyLetzplayScans] torneio", tournamentId, "gravados:", written, "pulados:", skipped.length, JSON.stringify(skipped));
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
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 120, cors: APP_ORIGINS },
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
    const waRecipients = []; // v1.1.30: {phone,name} — template do Cloud API é personalizado
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
            // v1.1.30: o Cloud API manda TEMPLATE personalizado ({{1}} = primeiro
            // nome de quem recebe), então o telefone sozinho não basta.
            waRecipients.push({
              phone: String(profile.phone),
              name: String(profile.displayName || profile.name || "").trim().split(/\s+/)[0] || "",
            });
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
    if (waRecipients.length) {
      // v1.1.30: comunicado vai pelo template sp_comunicado_torneio (o Cloud API não
      // manda texto livre business-initiated). {{1}} nome, {{2}} torneio, {{3}} a
      // mensagem do organizador — texto humano, então passa pelo sanitizador (a Meta
      // rejeita \n / 4+ espaços em parâmetro). Ver project_whatsapp_meta_2fa_block.
      const _p = (v) => {
        let s = String(v == null ? "" : v).replace(/\s+/g, " ").trim();
        if (s.length > 1024) s = s.slice(0, 1021) + "...";
        return s || "-";
      };
      const waRef = await db.collection("whatsapp_queue").add({
        template: "sp_comunicado_torneio",
        urlSuffix: "#tournaments/" + tournamentId,
        recipients: waRecipients.map((r) => ({
          phone: r.phone,
          params: [_p(r.name || "jogador"), _p(t.name || "seu torneio"), _p(rawMessage || fullMsg)],
        })),
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
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 120, cors: APP_ORIGINS },
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
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
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

// ─── WhatsApp Cloud API oficial (Meta) — login por CÓDIGO de 6 dígitos (v1.1.15) ─
// Migração do Evolution (morto) pro Cloud API oficial. No login por celular, SMS
// (Firebase, código opaco) e WhatsApp (código NOSSO) são enviados ao mesmo tempo;
// o campo de código aceita QUALQUER um dos dois — o cliente tenta o confirm do
// Firebase primeiro, e se não bater cai em verifyWhatsAppLoginCode.
// GATE: o template `scoreplace_login_code` (AUTHENTICATION) só passa a existir quando
// a verificação da empresa da Meta aprovar. Até lá, sendWhatsAppLoginCode devolve
// {ok:false} e o app degrada limpo (SMS/e-mail seguem). IDs canônicos + estado na
// memória project_whatsapp_meta_2fa_block.
// ⚠️ Payload do template AUTH (COPY_CODE) NÃO foi testável até o template existir —
// validar o envio de verdade no 1º deploy pós-aprovação.
const WHATSAPP_CLOUD_TOKEN = defineSecret("WHATSAPP_CLOUD_API_TOKEN");
const WA_CLOUD_API = "https://graph.facebook.com/v22.0";
const WA_CLOUD_PHONE_ID = "1318311631355405";      // Phone Number ID Barthlabs (não é segredo)
const WA_LOGIN_TEMPLATE = "scoreplace_login_code"; // template AUTHENTICATION, OTP COPY_CODE
const WA_LOGIN_TEMPLATE_LANG = "pt_BR";

// Envia uma NOTIFICAÇÃO via template UTILITY do Cloud API (não-auth).
// v1.1.30 — substitui o _sendWhatsAppText do Evolution: o Cloud API não manda
// texto livre business-initiated, só template aprovado. `params` são os {{n}} do
// corpo ({{1}} = nome de quem recebe) e `urlSuffix` é o sufixo do botão (a base
// https://scoreplace.app/ é fixa no template). Ver project_whatsapp_meta_2fa_block.
async function _sendWhatsAppTemplateMsg(token, phone, templateName, params, urlSuffix) {
  if (IS_STAGING) { console.log("[staging] WA Cloud template suprimido →", String(phone)); return { ok: true, suppressed: true }; }
  const to = String(phone || "").replace(/[^\d]/g, "");
  const components = [];
  if (Array.isArray(params) && params.length) {
    components.push({ type: "body", parameters: params.map((p) => ({ type: "text", text: String(p) })) });
  }
  // Botão URL dinâmico: index 0, sub_type "url" — o parâmetro é só o SUFIXO.
  components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: String(urlSuffix || "#dashboard") }] });
  const body = {
    messaging_product: "whatsapp",
    to: to,
    type: "template",
    template: { name: templateName, language: { code: WA_LOGIN_TEMPLATE_LANG }, components: components },
  };
  let resp;
  try {
    resp = await fetch(WA_CLOUD_API + "/" + WA_CLOUD_PHONE_ID + "/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: "fetch failed: " + (e.message || String(e)) };
  }
  let data = null;
  try { data = await resp.json(); } catch (e) { /* body não-json */ }
  if (!resp.ok) {
    return { ok: false, error: "HTTP " + resp.status + ": " + (data && data.error ? JSON.stringify(data.error) : resp.statusText) };
  }
  const messageId = data && data.messages && data.messages[0] && data.messages[0].id;
  return { ok: true, messageId: messageId };
}

// Envia um código de autenticação via template do Cloud API. {ok} ou {ok:false,error}.
async function _sendWhatsAppAuthCode(token, phone, code) {
  if (IS_STAGING) { console.log("[staging] WA Cloud auth code suprimido →", String(phone)); return { ok: true, suppressed: true }; }
  const to = String(phone || "").replace(/[^\d]/g, "");
  const url = WA_CLOUD_API + "/" + WA_CLOUD_PHONE_ID + "/messages";
  const body = {
    messaging_product: "whatsapp",
    to: to,
    type: "template",
    template: {
      name: WA_LOGIN_TEMPLATE,
      language: { code: WA_LOGIN_TEMPLATE_LANG },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        // Botão OTP (COPY_CODE) — o parâmetro leva o mesmo código pro "copiar código".
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
      ],
    },
  };
  let resp;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: "fetch failed: " + (e.message || String(e)) };
  }
  let data = null;
  try { data = await resp.json(); } catch (e) { /* body não-json */ }
  if (!resp.ok) {
    return { ok: false, error: "HTTP " + resp.status + ": " + (data && data.error ? JSON.stringify(data.error) : resp.statusText) };
  }
  const messageId = data && data.messages && data.messages[0] && data.messages[0].id;
  return { ok: true, messageId: messageId };
}

// Gera código de 6 dígitos, guarda em whatsappLoginCodes/{phone} e manda via Cloud API.
// Chamado em paralelo com o SMS do Firebase no login por celular. Best-effort.
exports.sendWhatsAppLoginCode = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, secrets: [WHATSAPP_CLOUD_TOKEN] },
  async (request) => {
    const phone = _normalizePhoneE164((request.data && request.data.phone) || "");
    if (!phone) return { ok: false, reason: "invalid-phone" };

    // Acha ou cria a conta do telefone (o código loga essa conta via custom token).
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByPhoneNumber("+" + phone);
    } catch (err) {
      if (err.code === "auth/user-not-found") {
        try { userRecord = await admin.auth().createUser({ phoneNumber: "+" + phone }); }
        catch (e) { console.error("[sendWhatsAppLoginCode] createUser falhou:", e.code || e.message); return { ok: false, reason: "create-user-error" }; }
      } else {
        console.error("[sendWhatsAppLoginCode] lookup falhou:", err.code || err.message);
        return { ok: false, reason: "lookup-error" };
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
    try {
      await admin.firestore().collection("whatsappLoginCodes").doc(phone).set({
        code: code, uid: userRecord.uid, phone: phone, attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
      });
    } catch (e) {
      console.error("[sendWhatsAppLoginCode] Firestore write falhou:", e.code || e.message);
      return { ok: false, reason: "store-error" };
    }

    let token;
    try { token = WHATSAPP_CLOUD_TOKEN.value(); } catch (e) { return { ok: false, reason: "secret-missing" }; }
    const result = await _sendWhatsAppAuthCode(token, phone, code);
    if (!result.ok) {
      console.warn("[sendWhatsAppLoginCode] envio falhou pra", phone, ":", result.error);
      return { ok: false, reason: "wa-send-failed", error: result.error };
    }
    console.log("[sendWhatsAppLoginCode] código enviado pra", phone, "uid:", userRecord.uid);
    return { ok: true };
  }
);

// Confere o código digitado contra whatsappLoginCodes/{phone}. Se bater (não expirou /
// sob limite), devolve custom token pro cliente fazer signInWithCustomToken.
exports.verifyWhatsAppLoginCode = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const phone = _normalizePhoneE164((request.data && request.data.phone) || "");
    const code = String((request.data && request.data.code) || "").replace(/[^\d]/g, "");
    if (!phone || code.length !== 6) return { ok: false, reason: "invalid-input" };

    const ref = admin.firestore().collection("whatsappLoginCodes").doc(phone);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "no-code" };
    const d = snap.data();
    const expMs = d.expiresAt && d.expiresAt.toMillis ? d.expiresAt.toMillis() : (d.expiresAt ? new Date(d.expiresAt).getTime() : 0);
    if (!expMs || expMs < Date.now()) { try { await ref.delete(); } catch (_e) {} return { ok: false, reason: "expired" }; }
    if ((d.attempts || 0) >= 5) { try { await ref.delete(); } catch (_e) {} return { ok: false, reason: "too-many-attempts" }; }
    if (String(d.code) !== code) {
      try { await ref.update({ attempts: (d.attempts || 0) + 1 }); } catch (_e) {}
      return { ok: false, reason: "wrong-code" };
    }
    try { await ref.delete(); } catch (_e) {} // consome o código
    let customToken;
    try { customToken = await admin.auth().createCustomToken(d.uid, { source: "whatsapp_login_code" }); }
    catch (e) { console.error("[verifyWhatsAppLoginCode] createCustomToken falhou:", e.code || e.message); return { ok: false, reason: "token-error" }; }
    console.log("[verifyWhatsAppLoginCode] OK pra", phone, "uid:", d.uid);
    return { ok: true, customToken: customToken };
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
  if (IS_STAGING) { console.log("[staging] WhatsApp suprimido →", String(phone)); return { ok: true, messageId: null, suppressed: true }; }
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
    // v3.0.x: SEM preview de link — o card de pré-visualização do scoreplace.app vinha
    // como um BOX VAZIO grande e feio em cima da mensagem (sem og:image). Desligar deixa
    // a notificação enxuta; o link continua clicável no texto ("👉 Ver torneio: …").
    linkPreview: false,
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
    cors: APP_ORIGINS,
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
    cors: APP_ORIGINS,
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
    cors: APP_ORIGINS,
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
    cors: APP_ORIGINS,
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
    cors: APP_ORIGINS,
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
    cors: APP_ORIGINS,
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

// v2.6.x: acha o uid de uma conta pelo e-mail no PERFIL (Firestore), cobrindo
// e-mail primário (email_lower/email) E e-mails SECUNDÁRIOS/VINCULADOS (linkedEmails).
// Resolve o gap em que getUserByEmail (Auth) só acha pelo e-mail primário.
async function _uidByProfileEmail(db, raw) {
  const lower = String(raw || "").trim().toLowerCase();
  if (!lower) return null;
  const tries = [
    { f: "email_lower", op: "==", v: lower },
    { f: "email", op: "==", v: lower },
    { f: "linkedEmails", op: "array-contains", v: lower },
    { f: "linkedEmails", op: "array-contains", v: String(raw).trim() },
  ];
  for (const t of tries) {
    try {
      const snap = await db.collection("users").where(t.f, t.op, t.v).limit(1).get();
      if (!snap.empty) return snap.docs[0].id;
    } catch (e) { /* índice ausente/erro → tenta próximo */ }
  }
  return null;
}
// Acha o uid pelo telefone (E.164) no PERFIL — cobre conta cujo número está só no
// perfil Firestore, não no phoneNumber do Auth. Cobre TAMBÉM celulares SECUNDÁRIOS/
// VINCULADOS (linkedPhones[]), espelhando _uidByProfileEmail → linkedEmails. Assim
// qualquer celular que a pessoa vinculou no perfil funciona pra login/reset/checkAccount.
async function _uidByProfilePhone(db, phoneE164) {
  if (!phoneE164) return null;
  const tries = [
    { f: "phone", op: "==", v: phoneE164 },
    { f: "linkedPhones", op: "array-contains", v: phoneE164 },
  ];
  for (const t of tries) {
    try {
      const snap = await db.collection("users").where(t.f, t.op, t.v).limit(1).get();
      if (!snap.empty) return snap.docs[0].id;
    } catch (e) { /* índice ausente/erro → tenta próximo */ }
  }
  return null;
}

// Resolve um identificador (e-mail ou celular) → UserRecord. Tenta o Auth primeiro
// (e-mail/telefone primário + e-mail sintético) e, se falhar, cai no PERFIL Firestore
// (e-mail vinculado / telefone do perfil) → uid → getUser. Assim qualquer e-mail ou
// celular que a pessoa cadastrou funciona pra login, reset e checkAccount.
async function _resolveAccount(identifier) {
  const raw = String(identifier || "").trim();
  if (!raw) return null;
  const db = admin.firestore();
  if (raw.indexOf("@") >= 0) {
    // 1) e-mail primário do Auth
    try { return await admin.auth().getUserByEmail(raw.toLowerCase()); } catch (e) { /* fallback abaixo */ }
    // 2) e-mail secundário/vinculado no perfil
    const euid = await _uidByProfileEmail(db, raw);
    if (euid) { try { return await admin.auth().getUser(euid); } catch (e) { /* nada */ } }
    return null;
  }
  const digits = _normalizePhoneE164(raw);
  if (!digits) return null;
  // 1) phoneNumber do Auth
  try { return await admin.auth().getUserByPhoneNumber("+" + digits); }
  catch (e) { /* tenta sintético/perfil abaixo */ }
  // 2) e-mail sintético
  const syn = _syntheticEmailForPhone(digits);
  if (syn) { try { return await admin.auth().getUserByEmail(syn); } catch (e) { /* nada */ } }
  // 3) telefone no perfil Firestore
  const puid = await _uidByProfilePhone(db, "+" + digits);
  if (puid) { try { return await admin.auth().getUser(puid); } catch (e) { /* nada */ } }
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
    cors: APP_ORIGINS },
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
    // v2.6.x: provedores sociais (Google/Apple/Facebook) — pra UI oferecer "Entrar
    // com Google" quando a pessoa digita a senha do Google (que o Firebase não
    // conhece) numa conta criada via provedor social.
    var socialProviders = (ur.providerData || [])
      .map(function (p) { return p && p.providerId; })
      .filter(function (id) { return id === "google.com" || id === "apple.com" || id === "facebook.com"; });
    return {
      exists: true,
      hasPassword: _hasPasswordProvider(ur),
      socialProviders: socialProviders,
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
    cors: APP_ORIGINS },
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
    cors: APP_ORIGINS,
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
    cors: APP_ORIGINS,
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

    // Canal e-mail (só com e-mail REAL). v2.6.x: usa o wrapper `?pr=TOKEN` (token
    // no Firestore) em vez do oobCode CRU do Firebase. Scanners anti-phishing
    // (Gmail/Outlook/UOL) pré-carregam o link do e-mail e consumiam o oobCode de
    // uso único → a pessoa clicava e dava "link expirado". O wrapper resolve do
    // mesmo jeito que o magic link (v1.0.30): scanner faz GET na wrapper URL, não
    // executa JS, então nunca alcança o código real.
    if (realEmail) {
      try {
        const crypto = require("crypto");
        const token = crypto.randomBytes(18).toString("base64url");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h
        const phoneE164r = phone ? ("+" + _normalizePhoneE164(phone)) : null;
        await db.collection("passwordResetTokens").doc(token).set({
          uid: ur.uid, email: realEmail, phone: phoneE164r, expiresAt,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        const wrapperUrl = "https://scoreplace.app/?pr=" + encodeURIComponent(token);
        await _queuePasswordResetEmail(db, realEmail, wrapperUrl, (ur.displayName || ""));
        out.email = _maskEmail(realEmail);
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
    cors: APP_ORIGINS },
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
    cors: APP_ORIGINS,
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
    const db = admin.firestore();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await db.collection("phoneOwnership").doc(uid).set({
      uid, phone: "+" + phone, codeHash, attempts: 0,
      expiresAt, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    // v2.6.x: link de 1 toque (`?pv=TOKEN`) além do código. Quem abre no celular já
    // logado confirma direto, sem digitar. Token só resolve com a sessão principal
    // ativa (o cliente usa pra provar posse e vincular/unir).
    const pvToken = crypto.randomBytes(18).toString("base64url");
    await db.collection("phoneOwnershipTokens").doc(pvToken).set({
      uid, phone: "+" + phone, expiresAt, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const pvUrl = "https://scoreplace.app/?pv=" + encodeURIComponent(pvToken);
    const msg = "🎾 *scoreplace.app*\n\nConfirme este celular no seu perfil:\n\n👉 " + pvUrl + "\n\nOu digite o código no app: *" + code + "*\n\n_Expira em 10 minutos. Se não foi você, ignore._";
    try {
      const r = await _sendWhatsAppText(EVOLUTION_API_URL.value(), EVOLUTION_API_KEY.value(), EVOLUTION_INSTANCE.value(), phone, msg);
      return { ok: !!r.ok };
    } catch (e) { return { ok: false, reason: "wa-error" }; }
  }
);

// v2.6.x: troca o token do link `?pv=` por um custom token do número (conta de
// telefone). O cliente, JÁ LOGADO na conta principal, usa esse token pra provar
// posse (instância secundária) e vincular/unir via mergePhoneAccount.
exports.verifyPhoneOwnershipToken = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: APP_ORIGINS },
  async (request) => {
    const token = String((request.data && request.data.token) || "").trim();
    if (!token) return { ok: false, reason: "no-token" };
    const db = admin.firestore();
    const ref = db.collection("phoneOwnershipTokens").doc(token);
    const snap = await ref.get();
    if (!snap.exists) return { ok: false, reason: "invalid" };
    const v = snap.data();
    const exp = v.expiresAt && v.expiresAt.toDate ? v.expiresAt.toDate() : v.expiresAt;
    if (exp && new Date(exp) < new Date()) { await ref.delete().catch(() => {}); return { ok: false, reason: "expired" }; }
    let customToken;
    try { customToken = await admin.auth().createCustomToken(v.uid, { source: "phone_ownership_token" }); }
    catch (e) { return { ok: false, reason: "token-error" }; }
    await ref.delete().catch(() => {});
    return { ok: true, customToken: customToken, phone: v.phone };
  }
);

exports.verifyPhoneOwnershipWhatsApp = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30,
    cors: APP_ORIGINS },
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
    secrets: [WHATSAPP_CLOUD_TOKEN],
    retryConfig: { retryCount: 2 }, // Firebase auto-retries 2x em caso de unhandled error
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    if (IS_STAGING) { try { await snap.ref.update({ status: "suppressed_staging", processedAt: new Date().toISOString() }); } catch (_e) {} return; }
    const data = snap.data();
    // v1.1.30 — shape novo: { template, recipients:[{phone,params}], urlSuffix }.
    // O shape antigo ({phones,message}) era texto livre do Evolution e NÃO tem como
    // ser enviado pelo Cloud API (só template aprovado) → falha explícita, não silenciosa.
    if (!data || !data.template || !Array.isArray(data.recipients) || data.recipients.length === 0) {
      const legacy = data && data.message ? " (doc legado com texto livre — Evolution)" : "";
      console.warn("[processWhatsAppQueue] doc inválido — skip:", event.params.queueId, legacy);
      await snap.ref.update({
        status: "failed",
        lastError: "missing template/recipients[]" + legacy,
        processedAt: new Date().toISOString(),
      });
      return;
    }
    // Idempotência: se já processado (retry do trigger), skip
    if (data.status === "sent" || data.status === "partial") return;

    let token;
    try { token = WHATSAPP_CLOUD_TOKEN.value(); } catch (e) { token = null; }
    if (!token) {
      console.error("[processWhatsAppQueue] WHATSAPP_CLOUD_API_TOKEN ausente");
      await snap.ref.update({
        status: "failed",
        lastError: "WHATSAPP_CLOUD_API_TOKEN not configured",
        processedAt: new Date().toISOString(),
      });
      return;
    }

    const deliveries = [];
    for (const r of data.recipients) {
      const phone = _normalizePhoneE164(r && r.phone);
      if (!phone) {
        deliveries.push({ phone: String((r && r.phone) || ""), ok: false, error: "invalid phone format" });
        continue;
      }
      const result = await _sendWhatsAppTemplateMsg(token, phone, data.template, r.params || [], data.urlSuffix);
      // Omitir campos undefined — Firestore rejeita undefined como valor
      const delivery = { phone: phone, ok: result.ok };
      if (result.messageId !== undefined) delivery.messageId = result.messageId;
      if (result.error !== undefined) delivery.error = result.error;
      deliveries.push(delivery);
      if (data.recipients.length > 1) await new Promise((r2) => setTimeout(r2, 200));
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
//     cooldown → restart da instância via Evolution (/instance/restart). Marca aviso pendente.
//     Quando volta a ficar saudável após um restart → manda o aviso (WhatsApp+email).
//   • whatsappNightlyRestart (04:30 BRT): restart preventivo diário da instância.
// v3.1.45: migrado do Railway pro VPS (Hetzner) — auto-heal via restart nativo do
// Evolution, sem IDs nem token do Railway.

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

// v3.1.45: migrado do Railway pro VPS (Hetzner). Auto-heal agora usa o restart
// NATIVO do Evolution (POST /instance/restart/{instance}) — reinicia só a conexão
// Baileys da instância, sem reboot de VM nem token externo. A sessão vive no
// Postgres do VPS, então reconecta sem re-parear QR. Ver memória project_whatsapp_vps_migration.
async function _evolutionRestart(apiUrl, apiKey, instance) {
  try {
    const resp = await fetch(String(apiUrl).replace(/\/+$/, "") + "/instance/restart/" + encodeURIComponent(instance), {
      method: "POST",
      headers: { "apikey": apiKey, "Content-Type": "application/json" },
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok) {
      return { ok: false, error: "Evolution HTTP " + resp.status + ": " + JSON.stringify((data && (data.message || data.error)) || resp.statusText) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "fetch: " + (e.message || String(e)) };
  }
}

// Enfileira aviso ao dev sobre uma auto-recuperação.
// v1.1.30: o trecho de WhatsApp saiu — enfileirava texto livre no shape antigo
// (que o processWhatsAppQueue do Cloud API rejeita) e no número BANIDO
// 5511916936454. Dead code de qualquer jeito: só era chamado pelo
// whatsappHealthGuard, deletado com o Evolution/VPS. O e-mail abaixo basta.
async function _notifyDevRecovery(db, title, body) {
  try {
    await _enqueueMail(db, {
      to: ["scoreplace.app@gmail.com"],
      replyTo: "scoreplace.app@gmail.com",
      message: { subject: "scoreplace — " + title, text: body, html: "<p>" + body.replace(/\n/g, "<br>") + "</p>" },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { /* ignore */ }
}

/* DESATIVADO 2026-07-12 — Evolution/VPS Hetzner removido; número banido; migração pro Meta Cloud API
   (Meta hospeda, não precisa de restart de VPS). As duas funções abaixo (whatsappHealthGuard a cada
   10 min + whatsappNightlyRestart 04:30) só batiam no /instance/restart do Evolution morto e emailavam
   o dev a cada falha. DELETADAS do Firebase (functions:delete) e comentadas aqui pra não ressuscitarem
   num deploy futuro. Reimplementar monitoramento SÓ quando o Meta Cloud API estiver no ar (mecanismo
   diferente — sem restart de servidor). Ver memória project_whatsapp_meta_2fa_block.
exports.whatsappHealthGuard = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async () => {
    const db = admin.firestore();
    const guardRef = db.doc(GUARD_DOC);
    const apiUrl = EVOLUTION_API_URL.value();
    const apiKey = EVOLUTION_API_KEY.value();
    const instance = EVOLUTION_INSTANCE.value();
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
    console.warn("[whatsappHealthGuard] travado (" + probe.detail + ") → reiniciando a conexão do Evolution");
    const r = await _evolutionRestart(apiUrl, apiKey, instance);
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
        "Detectei o WhatsApp travado mas o restart automático (Evolution/VPS) falhou: " + r.error + ". Precisa reiniciar manualmente.");
      console.error("[whatsappHealthGuard] restart falhou:", r.error);
    } else {
      console.log("[whatsappHealthGuard] restart do Evolution disparado com sucesso");
    }
  }
);

exports.whatsappNightlyRestart = onSchedule(
  {
    schedule: "every day 04:30",
    timeZone: "America/Sao_Paulo",
    region: "us-central1",
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async () => {
    const db = admin.firestore();
    const apiUrl = EVOLUTION_API_URL.value();
    const apiKey = EVOLUTION_API_KEY.value();
    const instance = EVOLUTION_INSTANCE.value();
    if (!apiUrl || !apiKey || !instance) { console.error("[whatsappNightlyRestart] secrets Evolution ausentes"); return; }
    const r = await _evolutionRestart(apiUrl, apiKey, instance);
    await db.doc(GUARD_DOC).set({
      lastRestartAt: new Date().toISOString(),
      lastRestartAtMs: Date.now(),
      lastRestartReason: "preventivo noturno",
      lastRestartOk: r.ok,
      restartCount: admin.firestore.FieldValue.increment(1),
    }, { merge: true });
    console.log("[whatsappNightlyRestart] restart preventivo:", r.ok ? "ok" : ("falhou: " + r.error));
  }
);
*/

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
// Núcleo compartilhado: cria 1 grupo de WhatsApp por unidade da rodada (partida
// na Liga; grupo de 4 no Rei/Rainha). Usado pelo onCall `notifyLeagueRoundWhatsApp`
// (disparado pelo cliente no sorteio manual/publish) E pelo trigger de fila
// `processRoundWhatsappGroups` (disparado pelo autoDraw, que roda noutro codebase
// sem acesso a esta callable nem aos segredos do Evolution). db/secrets por parâmetro.
async function createRoundWhatsappGroups(db, apiUrl, apiKey, instance, opts) {
    const { tournamentId, roundIndex, nextDrawDateStr } = opts || {};
    if (!tournamentId) return { ok: false, reason: "missing-tournament-id" };

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
    if (!round) return { ok: false, reason: "round-not-found" };

    // ── 2a. Nomes VIVOS por uid (v4.5.73) ────────────────────────────
    // O label/mensagem do grupo mostra o nome resolvido pela CONTA (uid do slot),
    // não o nome gravado em m.p1/team1 (que pode estar velho — o motor grava a
    // partir de p.displayName). Só cai no nome gravado quando o slot não tem uid
    // (guest sem conta). Espelha window._slotUids. A resolução de TELEFONE segue
    // por nome gravado (participantMap) — não é display, e o nome bate com o slot.
    const _slotUidsOf = (m, side) => {
      if (!m) return [];
      const arr = side === "p1" ? m.team1Uids : m.team2Uids;
      if (Array.isArray(arr) && arr.length) return arr.filter(Boolean).map(String);
      const single = side === "p1" ? m.p1Uid : m.p2Uid;
      if (single) return [String(single)];
      return [];
    };
    const _monarchGroupsForNames = Array.isArray(round.monarchGroups) ? round.monarchGroups : [];
    const _roundUids = new Set();
    const _collectUids = (arr) => {
      (arr || []).forEach((m) => { if (!m) return; _slotUidsOf(m, "p1").forEach((u) => _roundUids.add(u)); _slotUidsOf(m, "p2").forEach((u) => _roundUids.add(u)); });
    };
    if (_monarchGroupsForNames.length) _monarchGroupsForNames.forEach((g) => _collectUids(g && g.matches));
    else _collectUids(round.matches);
    const _nameByUid = {};
    try {
      const _l = Array.from(_roundUids);
      for (let i = 0; i < _l.length; i += 100) {
        const refs = _l.slice(i, i + 100).map((u) => db.collection("users").doc(u));
        const docs = await db.getAll(...refs);
        docs.forEach((d) => { if (d.exists) { const dd = d.data() || {}; const dn = String(dd.displayName || dd.name || "").trim(); if (dn) _nameByUid[d.id] = dn; } });
      }
    } catch (e) { console.warn("[notifyLeagueRoundWhatsApp] live-names fetch falhou:", e.message); }
    // Nome exibido de um lado: nomes vivos dos uids do slot (dupla junta com " / ");
    // fallback pro nome gravado só quando não há uid (guest). Nunca vazio.
    const _sideDisp = (m, side, storedStr) => {
      const ns = _slotUidsOf(m, side).map((u) => _nameByUid[u]).filter(Boolean);
      return ns.length ? ns.join(" / ") : (storedStr || "?");
    };

    // ── 2b. Normaliza a rodada em "unidades" de grupo de WhatsApp ────
    // Liga/Suíço: 1 unidade por PARTIDA (dupla ou individual).
    // Rei/Rainha: 1 unidade por GRUPO de 4 (eles jogam 3 jogos com parceiros
    // rotativos e precisam se combinar entre si) — NUNCA 1 por jogo, senão
    // criaria 3 grupos redundantes com as mesmas 4 pessoas.
    const monarchGroups = Array.isArray(round.monarchGroups) ? round.monarchGroups : [];
    const isMonarchRound = monarchGroups.length > 0;
    let units;
    if (isMonarchRound) {
      units = monarchGroups
        .filter((g) => g && Array.isArray(g.players) && g.players.length >= 2)
        .map((g) => ({
          kind: "monarch",
          group: g,
          players: g.players.slice(),
          subjectLabel: g.name || "Grupo",
        }));
      if (units.length === 0) return { ok: false, reason: "no-groups" };
    } else {
      if (!Array.isArray(round.matches)) return { ok: false, reason: "round-not-found" };
      const realMatches = round.matches.filter((m) => !m.isSitOut && !m.isBye);
      if (realMatches.length === 0) return { ok: false, reason: "no-matches" };
      units = realMatches.map((m) => {
        let playerNames = [];
        if (Array.isArray(m.team1) && m.team1.length > 0) {
          playerNames = [...m.team1, ...(m.team2 || [])];
        } else {
          if (m.p1) playerNames.push(m.p1);
          if (m.p2) playerNames.push(m.p2);
        }
        // v4.5.73: label pela CONTA (uid do slot); nome gravado só como fallback.
        const matchLabel = Array.isArray(m.team1)
          ? `${_sideDisp(m, "p1", (m.team1 || []).join(" / "))} vs ${_sideDisp(m, "p2", (m.team2 || []).join(" / "))}`
          : `${_sideDisp(m, "p1", m.p1)} vs ${_sideDisp(m, "p2", m.p2)}`;
        return { kind: "match", match: m, players: playerNames, subjectLabel: matchLabel };
      });
    }

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

    // ── 4. For each unit (partida da Liga ou grupo do Rei/Rainha):
    //        create WA group + send message ───────────────────────────
    const results = [];
    for (const unit of units) {
      const playerNames = unit.players;
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

      const matchLabel = unit.subjectLabel;
      if (phones.length < 2) {
        console.log(`[notifyLeagueRoundWhatsApp] ${unit.kind} "${matchLabel}": only ${phones.length} phone(s) found — skipping group creation`);
        results.push({ match: matchLabel, created: false, reason: "insufficient-phones" });
        continue;
      }

      // Group subject — max 100 chars for WA
      const subject = `${tournamentName} R${roundNumber}: ${matchLabel}`.substring(0, 100);

      // Message body
      const nextDrawLabel = nextDrawDateStr || "Não agendado";
      const link = `https://scoreplace.app/#bracket/${tId}`;
      let message;
      if (unit.kind === "monarch") {
        // Rei/Rainha: lista os 3 jogos do grupo (parceiros rotativos) que as 4
        // pessoas precisam combinar entre si.
        const games = (unit.group.matches || [])
          .filter((m) => m && !m.isSitOut && !m.isBye)
          .map((m, gi) => `${gi + 1}) ${_sideDisp(m, "p1", m.p1)} vs ${_sideDisp(m, "p2", m.p2)}`)
          .join("\n");
        message =
          `🎾 *${tournamentName} — Rodada ${roundNumber}*\n\n` +
          `Olá! Vocês foram sorteados no mesmo grupo do Rei/Rainha da Praia.\n` +
          `Joguem os jogos abaixo (parceiros trocam a cada jogo):\n\n` +
          `${games}\n\n` +
          `⏰ *Prazo:* Lancem os resultados antes do próximo sorteio:\n` +
          `📅 *Próximo sorteio:* ${nextDrawLabel}\n\n` +
          `Combinem os horários aqui no grupo e registrem os placares no app:\n${link}`;
      } else {
        message =
          `🎾 *${tournamentName} — Rodada ${roundNumber}*\n\n` +
          `Olá! Vocês foram sorteados para jogar juntos nesta rodada.\n\n` +
          `📋 *Partida:* ${matchLabel}\n` +
          `⏰ *Prazo:* Lancem o resultado antes do próximo sorteio:\n` +
          `📅 *Próximo sorteio:* ${nextDrawLabel}\n\n` +
          `Combinem o horário aqui no grupo e registrem o placar no app:\n${link}`;
      }

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
    console.log(`[notifyLeagueRoundWhatsApp] tournament ${tId} round ${roundNumber}: ${created}/${units.length} groups created`);
    return { ok: true, groups: results };
}

exports.notifyLeagueRoundWhatsApp = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async (request) => {
    if (IS_STAGING) { console.log("[staging] notifyLeagueRoundWhatsApp suprimido (sem criação de grupo)"); return { ok: true, suppressed: true, groups: [] }; }
    return await createRoundWhatsappGroups(
      admin.firestore(),
      EVOLUTION_API_URL.value(), EVOLUTION_API_KEY.value(), EVOLUTION_INSTANCE.value(),
      request.data || {}
    );
  }
);

// ─── processRoundWhatsappGroups ─────────────────────────────────────────────
// Trigger de fila: o autoDraw (codebase functions-autodraw, sem acesso à callable
// notifyLeagueRoundWhatsApp nem aos segredos do Evolution) enfileira
// `whatsapp_round_queue/{id}` = {tournamentId, roundIndex, nextDrawDateStr} após
// sortear uma rodada da Liga/Rei-Rainha. Aqui (codebase default, COM os segredos)
// criamos os grupos e apagamos o doc. Espelha o padrão de processWhatsAppQueue.
exports.processRoundWhatsappGroups = onDocumentCreated(
  {
    document: "whatsapp_round_queue/{queueId}",
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    if (IS_STAGING) { console.log("[staging] processRoundWhatsappGroups suprimido"); try { await snap.ref.delete(); } catch (_) {} return; }
    try {
      const res = await createRoundWhatsappGroups(
        admin.firestore(),
        EVOLUTION_API_URL.value(), EVOLUTION_API_KEY.value(), EVOLUTION_INSTANCE.value(),
        { tournamentId: data.tournamentId, roundIndex: data.roundIndex, nextDrawDateStr: data.nextDrawDateStr }
      );
      const _n = (res && res.groups) ? res.groups.filter((g) => g.created).length : 0;
      console.log(`[processRoundWhatsappGroups] ${event.params.queueId}:`, (res && res.ok) ? `${_n} grupo(s) criado(s)` : ((res && res.reason) || "sem resultado"));
    } catch (e) {
      console.error(`[processRoundWhatsappGroups] erro ${event.params.queueId}:`, e.message);
    }
    try { await snap.ref.delete(); } catch (_) {}
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
    // v1.2.2: participants é a fonte; memberUids como reserva (memberEmails saiu).
    const count = (t.participants && t.participants.length) ||
                  (t.memberUids && t.memberUids.length) || 0;
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
    // v1.2.2: UID ONLY (era memberEmails — que nunca capturou slot de dupla, então
    // subcontava torneios de quem joga em dupla).
    ...(uid ? [
      db.collection("tournaments")
        .where("memberUids", "array-contains", uid)
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
    cors: APP_ORIGINS,
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

// ─── União de contas por E-MAIL (v3.0.59) ──────────────────────────────────────
// Bidirecional + mantém a conta MAIS ANTIGA. O usuário (logado na conta A — tipicamente
// criada por celular) adiciona no perfil um e-mail que pertence a outra conta B dele.
// Em vez de mandar "entre na outra conta" (o cara nem lembra da outra conta), enviamos
// um link de confirmação PRO E-MAIL (prova de posse de B). Ao clicar, confirmEmailMerge
// funde A+B via _mergeAccountsKeepOlder — sem fricção, sem precisar logar na outra conta.
// Deploy: firebase deploy --only functions:requestEmailMerge,functions:confirmEmailMerge
exports.requestEmailMerge = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const email = String((request.data && request.data.email) || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "e-mail inválido");
    if (_isSyntheticAuthEmail(email)) throw new HttpsError("invalid-argument", "e-mail interno");

    const db = admin.firestore();
    // Acha a conta B dona desse e-mail (Auth primeiro, depois Firestore).
    let targetUid = null;
    try { const tu = await admin.auth().getUserByEmail(email); targetUid = tu && tu.uid; } catch (e) { /* not-found */ }
    if (!targetUid) {
      const s = await db.collection("users").where("email", "==", email).limit(1).get();
      if (!s.empty) targetUid = s.docs[0].id;
    }
    if (!targetUid) return { ok: false, reason: "no-account" };   // não existe → caller só vincula o e-mail (verifyBeforeUpdateEmail no cliente)
    if (targetUid === callerUid) return { ok: false, reason: "same-account" };

    const crypto = require("crypto");
    const token = crypto.randomBytes(24).toString("base64url");
    await db.collection("mergeTokens").doc(token).set({
      requesterUid: callerUid, targetUid: targetUid, email: email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      used: false,
    });
    const link = "https://scoreplace.app/?mh=" + encodeURIComponent(token);
    const html =
      '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;">' +
      '<h2 style="color:#0f172a;">Unir suas contas</h2>' +
      '<p style="color:#1f2937;font-size:15px;line-height:1.5;">Você pediu pra unir esta conta de e-mail à sua outra conta no scoreplace.app. Clique pra confirmar — seus torneios, partidas e histórico ficam todos numa conta só. Você poderá entrar pelo e-mail OU pelo celular.</p>' +
      '<p style="text-align:center;margin:28px 0;"><a href="' + link + '" style="background:#10b981;color:#fff;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:16px;display:inline-block;">Unir minhas contas</a></p>' +
      '<p style="color:#64748b;font-size:13px;">O link expira em 1 hora. Se não foi você, ignore este e-mail.</p>' +
      '</div>';
    const text = "Una suas contas no scoreplace.app: " + link + " (expira em 1h; se não foi você, ignore).";
    await _enqueueMail(db, { to: [email], message: { subject: "Una suas contas no scoreplace.app", html, text } });
    console.log("[requestEmailMerge] token p/", email, "req=", callerUid, "target=", targetUid);
    return { ok: true, sent: true };
  }
);

// Confirma a união ao clicar no link do e-mail. SEM exigir login (o token, enviado só
// pro e-mail da conta B, é a prova de posse). Funde mantendo a conta mais antiga.
exports.confirmEmailMerge = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 300, cors: APP_ORIGINS },
  async (request) => {
    // v4.4.116: usa _repairTournaments/_replaceNameInMatches uid-scoped (marcador força redeploy).
    const token = String((request.data && request.data.token) || "").trim();
    if (!token) throw new HttpsError("invalid-argument", "token ausente");
    const db = admin.firestore();
    const ref = db.collection("mergeTokens").doc(token);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "link inválido ou já usado");
    const t = snap.data();
    if (t.used) throw new HttpsError("failed-precondition", "este link já foi usado");
    const exp = (t.expiresAt && t.expiresAt.toMillis) ? t.expiresAt.toMillis() : Number(t.expiresAt || 0);
    if (exp && exp < Date.now()) throw new HttpsError("deadline-exceeded", "link expirado — peça de novo no perfil");

    const res = await _mergeAccountsKeepOlder(db, t.requesterUid, t.targetUid);
    await ref.set({ used: true, usedAt: admin.firestore.FieldValue.serverTimestamp(), survivorUid: res.survivorUid }, { merge: true });
    console.log("[confirmEmailMerge] survivor=", res.survivorUid, "dropped=", res.droppedUid, "already=", res.already);
    return { ok: true, survivorUid: res.survivorUid, dropped: res.droppedUid, already: res.already };
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

    // v2.6.x: SEM MERGE. A "conta antiga" é um fantasma de Auth (telefone
    // autenticado pelo OTP, mas sem perfil/dados no Firestore) — caso típico de
    // verificar um celular NOVO, que não é de mais ninguém. Não há o que mesclar:
    // só reivindica o número pro caller e marca verificado (✅). Exige prova de
    // posse (proofIdToken da sessão do telefone == oldUid).
    if (!oldSnap.exists) {
      let ghProven = false;
      const ghProof = request.data && request.data.proofIdToken;
      if (ghProof) {
        try { const _d = await admin.auth().verifyIdToken(String(ghProof)); if (_d && _d.uid === oldUid) ghProven = true; } catch (e) { /* inválido */ }
      }
      if (!ghProven) throw new HttpsError("permission-denied", "sem prova de posse do número");
      let ghPhone = null;
      try { const _gu = await admin.auth().getUser(oldUid); ghPhone = _gu.phoneNumber || null; } catch (e) { /* nada */ }
      if (dryRun) return { ok: true, merged: false, claimedPhone: ghPhone };
      if (ghPhone) {
        // Libera o número do fantasma e seta no caller (Auth + perfil).
        try { await admin.auth().deleteUser(oldUid); } catch (e) { console.warn("[mergePhoneAccount] del ghost:", (e && (e.code || e.message)) || e); }
        try { await admin.auth().updateUser(callerUid, { phoneNumber: ghPhone }); }
        catch (e) { console.error("[mergePhoneAccount] set phone on caller failed:", (e && (e.code || e.message)) || e); }
        await db.collection("users").doc(callerUid).set(
          { phone: ghPhone, phoneCountry: "55", updatedAt: new Date().toISOString() }, { merge: true }
        ).catch(() => {});
      }
      console.log("[mergePhoneAccount] ghost claim — phone", ghPhone, "→ caller", callerUid);
      return { ok: true, merged: false, claimedPhone: ghPhone };
    }
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

      // v1.2.2: memberEmails[] saiu do schema — quem é membro é o uid (2a-bis abaixo).

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
        // v4.4.116: jogos re-apontados POR UID (oldUid → callerUid), não por nome. Cobre
        // t.matches, rounds/groups/rodadas[].matches E rounds[].monarchGroups[].matches.
        if (Array.isArray(t.matches)) {
          const r = _replaceNameInMatches(t.matches, oldUid, newName, callerUid);
          if (r.hit) { update.matches = r.arr; changed = true; }
        }
        ["rounds", "groups", "rodadas"].forEach(structKey => {
          if (!Array.isArray(t[structKey])) return;
          let structHit = false;
          const arr = t[structKey].map(col => {
            if (!col || typeof col !== "object") return col;
            let c = col;
            if (Array.isArray(col.matches)) {
              const r = _replaceNameInMatches(col.matches, oldUid, newName, callerUid);
              if (r.hit) { structHit = true; c = Object.assign({}, c, { matches: r.arr }); }
            }
            if (Array.isArray(col.monarchGroups)) {
              const mg = col.monarchGroups.map(g => {
                if (!g || !Array.isArray(g.matches)) return g;
                const r = _replaceNameInMatches(g.matches, oldUid, newName, callerUid);
                if (r.hit) { structHit = true; return Object.assign({}, g, { matches: r.arr }); }
                return g;
              });
              c = Object.assign({}, c, { monarchGroups: mg });
            }
            return c;
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
    return Object.assign({ ok: true, merged: true }, report, { casualMatches: report.casualMatches });
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
    // v3.0.x: endpoint admin one-shot (mai/2026, já executado) DESATIVADO. Segredo
    // hardcoded em repo PÚBLICO → qualquer um podia reescrever participantes em massa.
    res.status(410).json({ error: "gone — endpoint admin desativado" });
    return;
    const SECRET = null; // (inalcançável)
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

        // v1.2.2: memberEmails saiu do schema — membro é uid (memberUids, tratado abaixo).

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
    // v4.4.116: merge por uid (_scanAndMergeByField/_executeMerge/_replaceNameInMatches uid-scoped).
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

// ─── (removido em v4.5.73) propagateProfileNameChange + reconcileParticipantNames ──
// Sob identidade-por-uid, o cliente resolve o nome exibido do perfil vivo (users/{uid})
// e NUNCA lê o nome gravado no inscrito/match — então reescrever nomes velhos nos
// torneios virou trabalho morto (espelha a remoção de _autoFixStaleNames/_propagateNameChange
// no cliente, v4.5.72). O texto das notificações de sorteio passou a resolver o nome pelo
// uid do slot no momento do envio (functions-autodraw + createRoundWhatsappGroups).

// ─── scheduledAutoMergeCleanup (diário 04:45 BRT) ─────────────────────────
// Varre toda a coleção users em busca de phones E emails duplicados e mescla
// automaticamente os pares encontrados. Garante que duplicatas que existiam
// antes do trigger ser deployado (e qualquer caso que escapou do trigger)
// sejam resolvidas.
exports.scheduledAutoMergeCleanup = onSchedule(
  {
    // v4.4.117: BUG corrigido — o cron "45 7" estava em UTC (07:45) mas o timeZone é
    // Sao_Paulo, então rodava 07:45 BRT (3h ATRASADO). Agora "04:45" no fuso Sao_Paulo,
    // igual aos outros scheduled. Fireava 3h fora do pretendido.
    schedule:  "every day 04:45",  // 04:45 BRT (timeZone Sao_Paulo)
    timeZone:  "America/Sao_Paulo",
    region:    "us-central1",
    memory:    "512MiB",
    timeoutSeconds: 540,
  },
  async () => {
    // v4.4.116: merge por uid (_scanAndMergeByField/_repairTournaments/_replaceNameInMatches uid-scoped).
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

// ─── syncMatchRosters (project_match_result_docs, inc 3b + espelho de resultado) ─
// ESPELHO SERVER-AUTORITATIVO do subdoc de resultado por-jogo
// (tournaments/{tId}/results/{matchId}) a partir do doc do torneio, com privilégio
// de ADMIN. onWrite do doc do torneio → pra cada jogo cujo ESTADO ESPELHÁVEL mudou
// (roster playerUids + campos de resultado: winner/score/sets/pending/wo/...),
// reescreve o subdoc como CÓPIA FIEL do match (set SEM merge = remove campos que
// sumiram, ex.: refazer/reverter/editar). Isso torna o subdoc uma fonte confiável
// pra LEITURA independente de QUAL path mexeu no resultado no doc do torneio —
// cobre de uma vez: mata-mata participant-driven (o cliente não pode escrever
// playerUids pela regra), W.O., reverter W.O., editar resultado, placar ao vivo, e
// os paths que já fazem dual-write no cliente (aqui vira idempotente). SÓ toca
// subdoc que JÁ existe (semeado pelo sorteio/backfill) — não faz backfill de legado
// (isso é a migração). NÃO re-dispara a si mesma (escreve em results/, não no doc do
// torneio). Idempotente por assinatura (não reescreve se o espelho já bate).
// Deploy: firebase deploy --only functions:syncMatchRosters
const { collectMatches, subdocSignature, buildSeedDoc, buildMirrorDoc } = require("./match-roster");
exports.syncMatchRosters = onDocumentWritten(
  { document: "tournaments/{tid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const tid = event.params.tid;
    const after  = event.data.after.exists  ? (event.data.after.data()  || {}) : null;
    const before = event.data.before.exists ? (event.data.before.data() || {}) : null;
    if (!after) return; // torneio deletado — nada a sincronizar

    // Assinatura (roster+resultado) de cada jogo ANTES → só processa os que mudaram.
    const beforeSig = {};
    collectMatches(before || {}).forEach((m) => {
      if (m && m.id != null && m.id !== "") beforeSig[String(m.id)] = subdocSignature(buildSeedDoc(before, m));
    });
    const candidates = [];
    const seenId = {};
    collectMatches(after).forEach((m) => {
      if (!m || m.id == null || m.id === "") return;
      const id = String(m.id);
      if (seenId[id]) return;
      seenId[id] = true;
      const sig = subdocSignature(buildSeedDoc(after, m));
      if (beforeSig[id] !== sig) candidates.push({ id, m, sig });
    });
    if (!candidates.length) return; // nada mudou no espelho → barato, sai

    const nowIso = new Date().toISOString();
    const db = admin.firestore();
    const resultsCol = db.collection("tournaments").doc(tid).collection("results");
    let synced = 0;
    for (const { id, m, sig } of candidates) {
      try {
        const ref = resultsCol.doc(id);
        const snap = await ref.get();
        if (!snap.exists) continue; // não semeado → é a migração que cuida, não backfill aqui
        if (subdocSignature(snap.data()) === sig) continue; // espelho já bate → idempotente
        await ref.set(buildMirrorDoc(after, m, tid, nowIso)); // set SEM merge = cópia fiel (trata deletes)
        synced++;
      } catch (e) {
        console.error(`[syncMatchRosters] ${tid}/${id}:`, e);
      }
    }
    if (synced) console.log(`[syncMatchRosters] ${tid}: ${synced} espelho(s) de resultado sincronizado(s)`);
  }
);

// ─── backfillMatchResultDocs (project_match_result_docs, MIGRAÇÃO) ─────────────
// Semeia os docs de resultado por-jogo (tournaments/{tId}/results/{matchId}) dos
// torneios LEGADOS — os criados ANTES do wiring de seed-no-sorteio, que têm o placar
// só no doc do torneio. Pra cada jogo SEM subdoc, cria { matchId, playerUids, +
// campos de resultado atuais do match }. NÃO toca subdoc que já existe (idempotente
// — a syncMatchRosters + o dual-write mantêm os existentes frescos). Roda com ADMIN
// (bypassa a regra, pode semear playerUids). One-shot, seguro pra re-rodar.
//   ?tid=<id>   → só um torneio (teste)
//   ?dryRun=1   → conta o que criaria, NÃO escreve
//   ?limit=<n>  → processa no máx n torneios (segurança)
// Guarda: ?secret=<BACKFILL_SECRET> (secret setado via functions:secrets:set — NUNCA
// hardcoded; os endpoints admin antigos vazaram segredo em repo público → 410).
// Deploy: firebase deploy --only functions:backfillMatchResultDocs --project <proj>
const BACKFILL_SECRET = defineSecret("BACKFILL_SECRET");
exports.backfillMatchResultDocs = onRequest(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB", secrets: [BACKFILL_SECRET] },
  async (req, res) => {
    if (req.query.secret !== BACKFILL_SECRET.value()) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const db = admin.firestore();
    const dryRun = req.query.dryRun === "1" || req.query.dryRun === "true";
    // force=1: além de criar os que faltam, REFRESCA (reescreve) os subdocs que já
    // existem cujo espelho está desatualizado (ex.: ganhar os campos de exibição
    // p1/p2/tournamentName/roundLabel novos). Usa a MESMA assinatura da CF pra só
    // reescrever o que mudou (idempotente). Sem force = só cria os faltantes.
    const force = req.query.force === "1" || req.query.force === "true";
    const oneTid = req.query.tid ? String(req.query.tid) : null;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 0;

    let docs;
    if (oneTid) {
      const s = await db.collection("tournaments").doc(oneTid).get();
      docs = s.exists ? [s] : [];
    } else {
      const snap = await db.collection("tournaments").get();
      docs = snap.docs;
      if (limit > 0) docs = docs.slice(0, limit);
    }

    let tournaments = 0, withBracket = 0, created = 0, refreshed = 0, skipped = 0;
    const errors = [];
    for (const tdoc of docs) {
      tournaments++;
      const t = tdoc.data() || {};
      const matches = collectMatches(t).filter((m) => m && m.id != null && m.id !== "");
      if (!matches.length) continue; // sem chave (fase de inscrição) → nada a semear
      withBracket++;
      const resultsCol = db.collection("tournaments").doc(tdoc.id).collection("results");
      // lê os subdocs já existentes de uma vez (evita N gets)
      const existingSnap = await resultsCol.get();
      const existingData = {};
      existingSnap.docs.forEach((d) => { existingData[d.id] = d.data() || {}; });
      const seen = new Set();
      for (const m of matches) {
        const id = String(m.id);
        if (seen.has(id)) continue; // um match id só uma vez
        seen.add(id);
        const exists = Object.prototype.hasOwnProperty.call(existingData, id);
        if (exists && !force) { skipped++; continue; } // já semeado → não clobbera
        try {
          if (exists) {
            // force: só reescreve se o espelho mudou (idempotente por assinatura)
            if (subdocSignature(existingData[id]) === subdocSignature(buildSeedDoc(t, m))) { skipped++; continue; }
            if (dryRun) { refreshed++; continue; }
            await resultsCol.doc(id).set(buildMirrorDoc(t, m, tdoc.id));
            refreshed++;
          } else {
            if (dryRun) { created++; continue; }
            const seed = buildSeedDoc(t, m);
            seed.updatedAt = new Date().toISOString();
            await resultsCol.doc(id).set(seed); // create (não existe) — set sem merge
            created++;
          }
        } catch (e) {
          errors.push({ tid: tdoc.id, matchId: id, err: String(e && e.message) });
        }
      }
    }
    console.log(`[backfillMatchResultDocs] dryRun=${dryRun} force=${force} tournaments=${tournaments} withBracket=${withBracket} created=${created} refreshed=${refreshed} skipped=${skipped} errors=${errors.length}`);
    res.json({ ok: true, dryRun, force, tournaments, withBracket, created, refreshed, skipped, errors: errors.slice(0, 20) });
  }
);
