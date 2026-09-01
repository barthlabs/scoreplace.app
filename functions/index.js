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
 * v1.2.9: a integração de WhatsApp foi REMOVIDA por inteiro (Evolution API e
 * Meta Cloud API). O número foi banido, a apelação negada e o portfólio Meta
 * está morto — não volta. O que restou de WhatsApp no produto não passa por
 * aqui: é 100% cliente (link wa.me pra abrir conversa e o grupo criado pelo
 * próprio usuário, js/views/wa-group.js). Ver project_whatsapp_meta_2fa_block.
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
const { onDocumentCreated, onDocumentWritten, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const _mergeRules = require("./merge-rules");
const _mergeSweep = require("./merge-sweep-core");
const _profileMerge = require("./profile-merge-core");
const _uidSweep = require("./uid-sweep");
const _mergeCols = require("./merge-collections-core");
const _dupPerson = require("./duplicate-person-core");

// v1.8.38 — RARIDADE DO TOKEN, em UM lugar só (os dois caminhos de detecção usam este).
// O subconjunto de 1 token só vira sinal quando o token existe SÓ nas duas contas
// comparadas: "betania" está em 2 contas, "fabio" em 4 — e é isso que impede
// "Fabio" × "Fábio Simão". Conta apenas os tokens de nomes que TÊM um token só, dos dois
// lados. Falha na contagem devolve {} e a exceção simplesmente não dispara (fail-closed:
// erro de consulta NUNCA vira sinal, e o comportamento volta a ser o de antes).
async function _freqDosTokensSoltos(db, dup, nomeMeu, pessoas) {
  const out = {};
  try {
    const aContar = new Set();
    const meus = dup.tokensNome(nomeMeu || "");
    if (meus.length === 1) aContar.add(meus[0]);
    (pessoas || []).forEach((p) => {
      const t = dup.tokensNome((p && p.nome) || "");
      if (t.length === 1) aContar.add(t[0]);
    });
    await Promise.all(Array.from(aContar).map(async (tk) => {
      // user-vivo:isento — CONTAGEM de raridade do token, não resolução de pessoa. Devolve
      // um número (count()), nunca um uid, e ninguém age sobre conta nenhuma a partir dele.
      const c = await db.collection("users").where("displayName_tokens", "array-contains", tk).count().get();
      out[tk] = c.data().count;
    }));
  } catch (e) {
    console.error("[dup] contagem de token falhou (sinal de 1 token desligado):", e && e.message);
    return {};
  }
  return out;
}
const _enrollCore = require("./enroll-core");
const _splitParts = require("./split-parts.js");   // torneio dividido: elenco na subcoleção
const _partesPerm = require("./partes-permissao.js");   // allowlist: quem pode mexer em que
const _tSplitFn = require("./vendor/tournament-split-core.js"); // colecaoDaParte
const _splitResultMirror = require("./match-result-mirror-core.js");
const _woReconcile = require("./wo-split-reconcile-core.js"); // W.O. chega nas subcoleções
const _secEmail = require("./secondary-email-core.js");       // e-mail secundário: decisões puras
const _secReserva = require("./secondary-email-reserva.js"); // e-mail secundário: reserva ATÔMICA
const _tInvCore = require("./tournament-invite-core.js");     // convite avulso: decisões puras
const _invEmail = require("./invite-email-core.js");         // convite de dupla / co-org: decisões puras
const _tInvReserva = require("./tournament-invite-reserva.js"); // convite avulso: reserva ATÔMICA
const _amizadeAuth = require("./amizade-authority-core");   // a AUTORIDADE: pairId, transições, merge, exclusão
/* ⚠️ FieldValue pelo SUBPATH, não por `admin.firestore.FieldValue`. MEDIDO em 29/ago/2026:
 * dentro do runtime do emulador de Functions o namespace vem sem `.FieldValue`, e a
 * transação morria com "Cannot read properties of undefined (reading 'arrayUnion')" — o
 * teste ponta-a-ponta (tests/amizade/run.js) pegou. O subpath é o caminho documentado e
 * funciona nos dois runtimes. O resto do arquivo segue no padrão antigo de propósito:
 * trocar tudo é outra leva. */
const { FieldValue: _FV } = require("firebase-admin/firestore");
/* ═══ AMIZADE (v2.1.48) — requires no TOPO, e isso não é estilo ═══════════════
 * `_executeMerge` (~linha 424) e `_mergeAccountsKeepOlder` (~845) usam estes módulos.
 * Enquanto os `const` ficaram no FIM do arquivo, funcionavam por acaso: a chamada é em
 * runtime, então a zona morta já tinha passado. Bastava alguém mover uma dessas chamadas
 * pro tempo de carga pra derrubar calado — a armadilha que já custou caro neste projeto.
 *   amizade-service   → as 5 operações (transação: relação + projeção + cache)
 *   amizade-lock      → exclusão mútua de ciclo de vida (aquisição transacional, ownership)
 *   amizade-fase      → fase da migração + manutenção (o backend congela junto do cliente)
 *   amizade-lifecycle → projeção do cânone em merge/exclusão + a guarda de merge
 */
const _amizadeSvc = require("./amizade-service");
const _amizadeLock = require("./amizade-lock");
const _amizadeFase = require("./amizade-fase");
const _amizadeVida = require("./amizade-lifecycle");
// Os 4 campos de cache social: quem os escreve é SÓ o amizade-lifecycle (e o backfill).
const _AMIZADE_CACHE_CAMPOS = new Set(["friends", "friendRequestsSent", "friendRequestsReceived", "friendRequestsSentAt"]);
const _nameUnique = require("./name-unique-core");
const _nameVariant = require("./name-variant-core");
// v1.7.36: vigia estrutural — quem troca jogadores de um jogo que JÁ EXISTE sem ter
// autoridade pra isso. Pendurado no syncMatchRosters (mesmo gatilho, custo zero).
const _rosterWatch = require("./roster-watch-core");
const _rosterMirror = require("./roster-mirror-core");
const _delGuard = require("./delete-account-guard-core");
const _renameProp = require("./rename-propagate-core");
// A PORTA DA CONTA VIVA. Toda busca ampla em users/ por campo de identidade (email /
// email_lower / phone / displayName / letzplayHandle) que resolva UMA pessoa e AJA sobre ela
// passa por aqui — a lápide de fusão fica com o MESMO contato do sobrevivente, então
// `snap.docs[0]` pode ser o uid morto. Espelha window._userVivo do cliente (v1.9.33).
const _userVivo = require("./user-vivo-core");
// v1.9.97 — CAMADA 3 do celular: número registrado pelo ORGANIZADOR, com procedência.
// `isIdentityPhone` é a porta que impede esse número de virar identidade (recuperação
// de senha, dedup, fusão). Ver functions/contact-phone-core.js.
const _contactPhone = require("./contact-phone-core");
const fetch = require("node-fetch");

admin.initializeApp();

// CORS unificado pros callables/onRequest do frontend: produção, os esquemas do app
// nativo e localhost de dev. Centralizado pra evitar drift entre as ~23 functions.
// (Até a 1.8.3 listava também scoreplace-staging.web.app/.firebaseapp.com; o ambiente
// foi deletado em 19/jul/2026 e nenhum cliente pode originar de um host que não
// resolve — as duas entradas saíram.)
// ORIGENS que podem chamar as CFs. O APP NATIVO NÃO fala "https://scoreplace.app": o WKWebView
// PROÍBE registrar handler pra http/https, então o Capacitor descarta iosScheme:"https" e cai no
// default → a origem no iPhone é "capacitor://scoreplace.app" (CAPInstanceDescriptor: se
// WKWebView.handlesURLScheme(scheme) o esquema é inválido → InstanceDescriptorDefaults.scheme).
// Sem essa origem aqui, o preflight volta 204 SEM Access-Control-Allow-Origin → o WebKit barra e o
// POST nunca sai: erro "Load failed" (TypeError) em TODA CF sem fallback — o que o dono viu ao
// desfazer dupla no TestFlight. O Android usa androidScheme:"https" → já casava.
// (CORS não é fronteira de segurança aqui: toda CF exige ID token no Authorization.)
const APP_ORIGINS = [
  "https://scoreplace.app",
  "capacitor://scoreplace.app",   // iOS nativo (Capacitor)
  "ionic://scoreplace.app",       // iOS legado (iosScheme antigo)
  "capacitor://localhost",        // iOS nativo sem hostname configurado
  "http://localhost",             // Android WebView legado
  "https://localhost",            // Android nativo (androidScheme https sem hostname)
  "http://localhost:9876",
];

// Enfileira e-mail na coleção mail/ (consumida pela extensão firestore-send-email).
// Até 19/jul/2026 havia aqui um kill-switch IS_STAGING (no-op de toda entrega
// externa quando GCLOUD_PROJECT continha "staging"); o projeto scoreplace-staging
// foi deletado e o guard saiu na 1.8.2 — só existe produção, ele era constante
// false. O killswitch que continua VIVO e importa é o do SANDBOX, que é por
// TORNEIO e roda em produção. Ver [[project_sandbox_tournament]].
async function _enqueueMail(dbRef, doc) {
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

/**
 * Varre as SUBCOLEÇÕES de um torneio trocando o uid — nas duas formas em que ele aparece:
 *   • ID DO DOCUMENTO — o espelho do roster é `participants/{uid}`. Aqui não dá pra
 *     renomear: copia pro id novo e apaga o velho, COPIANDO PRIMEIRO (falha no meio deixa
 *     o doc nos dois lados por um instante, nunca o faz sumir). Se o destino JÁ existe, o
 *     do sobrevivente prevalece e o do drop é só removido — mesma regra de colisão do
 *     uid-sweep (estado atual > estado da conta absorvida).
 *   • CONTEÚDO — `results/*.playerUids` e afins, pelo mesmo remapUid do documento.
 *
 * Best-effort: falhar aqui não desfaz a fusão, que já gravou o essencial.
 */
async function _sweepTournamentSubcollections(db, tourRef, dropUid, keepUid) {
  if (!dropUid || !keepUid) return 0;
  let n = 0;
  let cols = [];
  try { cols = await tourRef.listCollections(); } catch (e) { return 0; }
  for (const col of cols) {
    try {
      // (a) doc cujo ID é o uid morto
      const velho = await col.doc(dropUid).get();
      if (velho.exists) {
        const novoRef = col.doc(keepUid);
        const novo = await novoRef.get();
        if (!novo.exists) await novoRef.set(velho.data());   // cópia PRIMEIRO
        await velho.ref.delete();
        n++;
      }
      // (b) uid dentro do conteúdo
      const snap = await col.get();
      let b = db.batch();
      let k = 0;
      for (const doc of snap.docs) {
        const atual = doc.data();
        const swept = _uidSweep.remapUid(atual, dropUid, keepUid);
        if (!swept.changed) continue;
        const payload = {};
        for (const campo of Object.keys(swept.value)) {
          if (JSON.stringify(swept.value[campo]) !== JSON.stringify(atual[campo])) payload[campo] = swept.value[campo];
        }
        if (!Object.keys(payload).length) continue;
        b.update(doc.ref, payload);
        k++; n++;
        if (k % 400 === 0) { await b.commit(); b = db.batch(); }
      }
      if (k) await b.commit();
    } catch (e) {
      console.error(`[_sweepTournamentSubcollections] ${tourRef.id}/${col.id} falhou:`, e && e.message);
    }
  }
  if (n) console.log(`[_sweepTournamentSubcollections] ${tourRef.id}: ${n} doc(s)`);
  return n;
}

async function _repairTournaments(db, dropUid, dropEmail, dropName, keepUid, keepEmail, keepName) {
  const tourSnaps = await db.collection("tournaments").get();
  let tourFixed = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const tourDoc of tourSnaps.docs) {
    const t = tourDoc.data();
    let changed = false;
    let next = t;

    // ── UID: varredura CANÔNICA (functions/uid-sweep.js) ──────────────────────
    // Regra do dono (jul/2026): "onde estiver o uid, merja ou exclui. TUDO" — e canonizar,
    // pra que campo NOVO com uid já nasça coberto sem ninguém lembrar de atualizar lista.
    // Aqui havia ~140 linhas listando campo por campo, e a lista SEMPRE ficou incompleta:
    // não via membro de dupla (p1Uid/p2Uid), não via mapa por uid (checkedIn/absent/vips/
    // votos de enquete), e não via `organizerId` — que existe em 6 dos 8 torneios de prod e
    // nunca foi re-apontado em merge nenhum. Todos achados de forma reativa, depois do
    // estrago. A varredura acha o uid onde ele estiver, em qualquer profundidade, inclusive
    // como CHAVE de mapa; preserva Timestamp/GeoPoint por referência; dedupa array quando os
    // dois uids estavam no mesmo; e no choque de chave o valor do SOBREVIVENTE prevalece.
    if (dropUid && keepUid) {
      const swept = _uidSweep.remapUid(t, dropUid, keepUid);
      if (swept.changed) { next = swept.value; changed = true; }
    }

    // ── E-MAIL/NOME: não são identidade, mas seguem gravados em campos legados ──
    // (o uid acima é a identidade; isto aqui é só higiene de dados antigos)
    const update = {};
    if (dropEmail && keepEmail) {
      if (String(next.creatorEmail || "").toLowerCase() === dropEmail.toLowerCase())   { update.creatorEmail = keepEmail;   changed = true; }
      if (String(next.organizerEmail || "").toLowerCase() === dropEmail.toLowerCase()) { update.organizerEmail = keepEmail; changed = true; }
      const parts = Array.isArray(next.participants) ? next.participants : null;
      if (parts) {
        let hit = false;
        const novos = parts.map((p) => {
          if (!p || typeof p !== "object") return p;
          const q = Object.assign({}, p);
          let h = false;
          if (String(p.email || "").toLowerCase() === dropEmail.toLowerCase())   { q.email = keepEmail; h = true; }
          if (String(p.p1Email || "").toLowerCase() === dropEmail.toLowerCase()) { q.p1Email = keepEmail; h = true; }
          if (String(p.p2Email || "").toLowerCase() === dropEmail.toLowerCase()) { q.p2Email = keepEmail; h = true; }
          if (!h) return p;
          hit = true;
          return q;
        });
        if (hit) { next = Object.assign({}, next, { participants: novos }); changed = true; }
      }
    }

    if (!changed) continue;

    // O sweep devolve o doc INTEIRO; grava só os campos que mudaram de fato.
    const payload = Object.assign({}, update);
    for (const k of Object.keys(next)) {
      if (JSON.stringify(next[k]) !== JSON.stringify(t[k])) payload[k] = next[k];
    }
    if (!Object.keys(payload).length) continue;

    // ── v1.7.27 · O SERVIDOR TAMBÉM NÃO PODE ENCOLHER LISTA ───────────────────
    // Servidor não é sinônimo de seguro: este método faz `.get()` de TODOS os torneios
    // e só depois `batch.commit()`, gravando CAMPOS INTEIROS. Entre a leitura e o commit
    // cabe qualquer inscrição — e ela seria apagada, exatamente como no cliente (o sumiço
    // do Gersom, v1.7.26). O que protege é a forma de gravar, não o lugar onde roda.
    // O sweep de uid TROCA valores; ele nunca deveria REMOVER ninguém. Então: se a lista
    // reescrita ficou menor que a lida, a gravação daquele campo é DESCARTADA e o caso é
    // logado. Preferimos um uid velho sobrevivendo (que a próxima varredura corrige) a
    // uma pessoa desaparecendo do torneio.
    for (const campo of ["participants", "standbyParticipants", "waitlist"]) {
      if (!Array.isArray(payload[campo])) continue;
      const antes = Array.isArray(t[campo]) ? t[campo].length : 0;
      if (payload[campo].length < antes) {
        console.error(`[_repairTournaments] DESCARTADO ${campo} de ${tourDoc.id}: ` +
          `sweep reduziu ${antes} → ${payload[campo].length}. Uma varredura de uid NUNCA ` +
          `remove pessoa; gravar isso apagaria inscrito. Campo preservado como está no banco.`);
        delete payload[campo];
      }
    }
    // ── SUBCOLEÇÕES do torneio (v1.7.40) ────────────────────────────────────
    // A varredura acima cobre o DOCUMENTO. As subcoleções ficavam de fora, e nelas o uid
    // aparece de DUAS formas: como ID DO DOC (o espelho do roster é `participants/{uid}`,
    // o dual-write da 1.7.29) e DENTRO do conteúdo (`results/*.playerUids`).
    // MEDIDO em 05/ago/2026, depois de fundir: o espelho do Eduardo continuou sob o uid
    // MORTO — o doc respondia 200 no uid apagado e 404 no sobrevivente. O espelho existe
    // justamente pra ser a rede contra perda de inscrito; apontando pra uid morto, ele não
    // protege ninguém. Roda pra todo torneio, não só os que o sweep do doc alterou.
    await _sweepTournamentSubcollections(db, tourDoc.ref, dropUid, keepUid);

    if (!Object.keys(payload).length) continue;

    batch.update(tourDoc.ref, payload);
    tourFixed++;
    batchCount++;
    if (batchCount >= 400) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }
  if (batchCount > 0) await batch.commit();
  return tourFixed;
}

/**
 * Choose which of two Firestore DocumentSnapshot objects to keep.
 *
 * v1.2.6 — REGRA DO DONO: a conta FEDERADA (Google/Apple) prevalece. Provedor federado não
 * se transfere entre uids: apagar a conta Google apaga o login da pessoa (celular e senha se
 * movem, ele não). Espelha _mergeAccountsKeepOlder — os dois pontos de decisão do merge
 * precisam concordar, senão o auto-merge e o merge explícito escolhem sobreviventes
 * diferentes pra mesma dupla.
 *
 * v1.6.86 — a decisão CONSULTA O AUTH (incidente 02/ago/2026, conta de junho perdeu pra de
 * julho): perfil sem `createdAt` perdia pra perfil com createdAt, sendo que o Firebase Auth
 * SEMPRE sabe a idade da conta (metadata.creationTime — o MESMO critério do pickSurvivor).
 * Federação também sai do providerData real quando o UserRecord está disponível; os campos
 * do doc (authProvider/createdAt) viram fallback pra quando o Auth já foi apagado.
 * A regra inteira mora em functions/merge-rules.js (pickSurvivorProfiles), testável.
 * Ver [[project_account_merge_email]]. Returns Promise<{ keepDoc, dropDoc }>.
 */
async function _determineMergeWinner(docA, docB) {
  const fetchAuth = (uid) => admin.auth().getUser(uid).catch(() => null);
  const db = admin.firestore();
  const [authA, authB, tcA, tcB] = await Promise.all([
    fetchAuth(docA.id), fetchAuth(docB.id),
    _tournamentCountFor(db, docA.id), _tournamentCountFor(db, docB.id),
  ]);
  const pick = _mergeRules.pickSurvivorByActivity(
    { data: docA.data(), authUser: authA, tournamentCount: tcA },
    { data: docB.data(), authUser: authB, tournamentCount: tcB },
    docA.id, docB.id
  );
  const keepDoc = pick.keep === "a" ? docA : docB;
  const dropDoc = pick.keep === "a" ? docB : docA;
  console.log(`[_determineMergeWinner] keep=${keepDoc.id} ← drop=${dropDoc.id} ` +
    `(critério: ${pick.reason}${pick.detail ? " — " + pick.detail : ""})`);
  return { keepDoc, dropDoc };
}

/**
 * Quantos torneios este uid integra — o sinal MAIS FORTE de atividade (é o que o dono citou
 * primeiro). Query indexada por `memberUids`, com `count()` quando disponível pra não ler os
 * docs. Devolve null quando a consulta falha: aí o degrau é PULADO na decisão, em vez de
 * virar zero — um erro de query não pode decidir qual conta morre.
 */
async function _tournamentCountFor(db, uid) {
  try {
    const q = db.collection("tournaments").where("memberUids", "array-contains", uid);
    if (typeof q.count === "function") {
      const agg = await q.count().get();
      const n = agg.data() && agg.data().count;
      if (typeof n === "number") return n;
    }
    const s = await q.get();
    return s.size;
  } catch (e) {
    console.warn("[_tournamentCountFor] falhou p/", uid, (e && (e.code || e.message)) || e);
    return null;
  }
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
/* ⛔ FRONTEIRA DO LOCK (7ª auditoria, ponto 3): EXTERNA adquire, INTERNA pressupõe.
 * `_executeMerge` é o ponto de entrada para quem AINDA NÃO tem o lock. Quem já tem —
 * `_mergeAccountsKeepOlder`, que precisa cobrir as duas ramificações dele, inclusive a
 * rara em que `keepDoc` não existe e só se grava a lápide — chama `_executeMergeInterno`
 * direto. Adquirir duas vezes o mesmo uid na mesma cadeia seria deadlock consigo mesmo:
 * a segunda aquisição veria `merging` e falharia. */
async function _executeMerge(db, keepDoc, dropDoc) {
  /* ⛔ 8ª auditoria (ponto 1): A TRAVA DE FASE MORA AQUI, não em cada caller.
   * `autoMergeOnProfileUpdate` chama `_executeMerge` DIRETO — ele não passa por
   * `_scanAndMergeByField` nem por `_mergeAccountsKeepOlder`, que eram os únicos gates.
   * Ou seja: uma edição de perfil disparava o gatilho e a fusão atravessava o freeze,
   * contradizendo o runbook. Pôr a trava na fronteira comum faz QUALQUER caller futuro
   * nascer protegido — gate por caller apodrece na primeira chamada nova. */
  return _amizadeVida.guardaDeMerge(db, HttpsError, [dropDoc.id, keepDoc.id], async () => {
    /* ⛔ 9ª auditoria (ponto 5): RELÊ E REAVALIA DEPOIS DO LOCK.
     * Os callers (`autoMergeOnProfileUpdate`, `_scanAndMergeByField`) escolheram o par com
     * snapshots capturados ANTES da aquisição. Lock impede simultaneidade, não atualiza
     * retrato: entre a escolha e a aquisição outra operação pode ter fundido o drop — e
     * fundi-lo de novo criaria um SEGUNDO tombstone e reescreveria amizade usando um uid
     * morto. */
    const [fk, fd] = await Promise.all([
      db.collection("users").doc(keepDoc.id).get(),
      db.collection("users").doc(dropDoc.id).get(),
    ]);
    if (!fd.exists || (fd.data() || {}).mergedInto) {
      console.log("[_executeMerge] " + dropDoc.id + " já foi fundido/removido por outra operação — abortado");
      return { resultado: { pulado: true, motivo: "drop-ja-fundido" }, finais: null };
    }
    if (!fk.exists || (fk.data() || {}).mergedInto) {
      console.log("[_executeMerge] o sobrevivente " + keepDoc.id + " virou lápide — abortado");
      return { resultado: { pulado: true, motivo: "keep-virou-lapide" }, finais: null };
    }
    if ((fd.data() || {}).deleted === true || (fk.data() || {}).deleted === true) {
      console.log("[_executeMerge] uma das contas foi excluída — abortado");
      return { resultado: { pulado: true, motivo: "conta-excluida" }, finais: null };
    }
    // e a REGRA também é reavaliada com o dado de agora
    const prova = await _mayAutoMerge(fk, fd);
    if (!prova.allowed) {
      console.log("[_executeMerge] reavaliação pós-lock RECUSOU " + keepDoc.id + " × " + dropDoc.id + ": " + prova.reason);
      return { resultado: { pulado: true, motivo: "reavaliacao-" + prova.reason }, finais: null };
    }
    /* ⛔ 10ª auditoria (ponto 2): O VENCEDOR É RECALCULADO AQUI, sob o lock.
     * Confirmar que os dois perfis existem não bastava: `pickSurvivorByActivity` decide por
     * PROVEDOR do Auth, atividade e CONTAGEM DE TORNEIOS — tudo isso muda enquanto a
     * operação espera o lock. Manter a direção escolhida antes pode fundir na direção
     * errada e apagar a conta que deveria sobreviver, que é irreversível.
     * `_determineMergeWinner` relê Auth e recontagem, então rodá-lo aqui é a decisão de
     * agora, não a de antes. */
    const { keepDoc: kNovo, dropDoc: dNovo } = await _determineMergeWinner(fk, fd);
    if (kNovo.id !== keepDoc.id) {
      console.warn("[_executeMerge] a direção MUDOU sob o lock: antes keep=" + keepDoc.id +
        ", agora keep=" + kNovo.id + " — seguindo a decisão de AGORA");
    }
    const r = await _executeMergeInterno(db, kNovo, dNovo);
    // o drop (o de AGORA) virou lápide: estado TERMINAL, não `active`
    return { resultado: r, finais: { [dNovo.id]: "merged", [kNovo.id]: "active" } };
  });
}

/** ⚠️ PRESSUPÕE (a) a trava de fase JÁ conferida e (b) o lock JÁ adquirido pelos dois uids.
 * Quem entra por fora usa `_executeMerge`, que faz as duas coisas. Chamar esta direto sem
 * isso fura o freeze e roda sem exclusão mútua. */
async function _executeMergeInterno(db, keepDoc, dropDoc) {
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

  // v1.7.11 — NADA SE PERDE: o perfil do drop é absorvido pelo sobrevivente.
  // Até aqui o merge movia torneios/matchHistory/casuais e ZERO campos de perfil, então
  // quando a conta que sobrevivia tinha perfil pobre os dados da outra evaporavam (caso
  // medido: Silvia Moura Ferreira, 44 campos × 17). A regra é varredura genérica com lista
  // de exclusão — campo novo no perfil é preservado por padrão, sem ninguém lembrar de
  // atualizar lista. Conflito: o valor VIVO do sobrevivente sempre vence.
  const profileUpd = _profileMerge.computeProfileMerge(keepData, dropData, keepUid);

  // matchHistory tem regra própria (dedup por matchId) — por isso fica fora da varredura.
  if (Array.isArray(dropData.matchHistory) && dropData.matchHistory.length > 0) {
    const existing = Array.isArray(keepData.matchHistory) ? keepData.matchHistory : [];
    const merged   = [...existing];
    dropData.matchHistory.forEach(entry => {
      if (!merged.some(e => e.matchId === entry.matchId)) merged.push(entry);
    });
    profileUpd.matchHistory = merged;
  }

  if (Object.keys(profileUpd).length > 0) {
    console.log(`[_executeMerge] perfil absorvido: ${Object.keys(profileUpd).join(", ")}`);
    await db.collection("users").doc(keepUid).update(profileUpd);
  }

  // v1.7.13 — IMPORTAÇÃO DO LETZPLAY. Vive em `letzplayScans/{uid}` (handle, scan,
  // fullImport, totaisLetzplay, cursor) — coleção PRÓPRIA, indexada por uid, que o merge não
  // tocava: a leitura inteira do letzplay da pessoa sumia junto com a conta. `scannedBy`
  // (quem rodou a leitura) também é uid e precisa ser repontado, senão a autoria vira órfã.
  // O acervo `letzplayTournaments/*` NÃO entra: é indexado por competição, compartilhado
  // entre todo mundo, e não guarda uid — não há o que remapear ali.
  try {
    const lzCol = db.collection("letzplayScans");
    const [lzKeep, lzDrop] = await Promise.all([
      lzCol.doc(keepUid).get(), lzCol.doc(dropUid).get(),
    ]);
    if (lzDrop.exists) {
      const lzDropData = lzDrop.data() || {};
      if (!lzKeep.exists) {
        await lzCol.doc(keepUid).set(lzDropData);
      } else {
        // ATÔMICO: escolhe um doc INTEIRO, nunca funde campo a campo. A regra da união de
        // PERFIL não serve aqui — ela funde objeto por chave, e num ensaio com 2 docs reais
        // isso alterava `scan`, `fullImport` e `totaisLetzplay` do sobrevivente. Uma leitura
        // do letzplay é um retrato coerente (cursor, totais e jogos combinam entre si);
        // misturar duas produz totais que não batem com os jogos, e o app lê esses números
        // como verdade. Fica a mais recente — ou a com mais jogos, sem data confiável.
        if (_profileMerge.pickLetzplayScan(lzKeep.data(), lzDropData) === "drop") {
          await lzCol.doc(keepUid).set(lzDropData);   // substitui INTEIRO, sem merge
          console.log(`[_executeMerge] letzplay: leitura do drop era mais nova — substituiu a do keep`);
        }
      }
      // Apaga o doc do drop: deixado pra trás ele vira ÓRFÃO respondendo por uid — foi
      // exatamente assim que placares de torneios apagados reapareceram na ficha das pessoas.
      await lzCol.doc(dropUid).delete();
      console.log(`[_executeMerge] letzplay: scan de ${dropUid} absorvido por ${keepUid}`);
    }
    // Autoria das leituras que o drop rodou em OUTRAS pessoas.
    const lzBy = await lzCol.where("scannedBy", "==", dropUid).get();
    if (!lzBy.empty) {
      const b = db.batch();
      lzBy.docs.forEach((doc) => { if (doc.id !== dropUid) b.update(doc.ref, { scannedBy: keepUid }); });
      await b.commit();
      console.log(`[_executeMerge] letzplay: ${lzBy.size} leitura(s) repontada(s) pra ${keepUid}`);
    }
  } catch (e) {
    // Não derruba a fusão (os dados principais já viajaram), mas precisa ser barulhento.
    console.error("[_executeMerge] letzplay falhou:", (e && (e.code || e.message)) || e);
  }

  // ── TODAS as coleções, sempre ("se mescla tudo é tudo sempre", regra do dono) ──────
  // Antes só `casualMatches` era tratado aqui, e por um campo que NEM EXISTE nos docs
  // (`creatorUid`; o real é `createdBy`) — no-op desde sempre. `presences` ficava de fora
  // (3 check-ins apontariam pra uid morto). A varredura agora DESCOBRE as coleções em tempo
  // de execução e varre todas, menos as que têm tratamento próprio (lista de EXCLUSÃO no
  // core). Coleção nova nasce coberta, sem ninguém lembrar de cadastrá-la.
  // ⛔ AMIZADE ANTES da varredura genérica: `friendships`/`friendAccess` estão EXCLUÍDAS
  // dela de propósito (a chave é o par; o sweep corromperia). Se isto falhar, a fusão para —
  // cânone de amizade meio migrado é pior que fusão interrompida.
  /* ⛔ 6ª auditoria (ponto 3): o lock cobre a fusão INTEIRA, não só a migração da amizade.
   * A `mergedInto` só é gravada lá no fim; sem o lock, cabia uma amizade nova com o uid
   * absorvido DEPOIS de a migração já ter passado por ele — relação órfã garantida. */
  // (o lock `merging` já está posto por `_executeMerge`, que envolve tudo)
  const amizadeFixed = await _amizadeNoMerge(db, dropUid, keepUid);

  const sweptFixed = await _sweepAllCollectionsByUid(db, dropUid, keepUid);
  const casualFixed = sweptFixed.casualMatches || 0;
  const colFixed = sweptFixed;

  // ── Notificações: a caixa da conta absorvida vai pra do sobrevivente, SEM duplicar ──
  const notifFixed = await _migrateNotifications(db, dropUid, keepUid);

  // Mark old doc as merged
  await db.collection("users").doc(dropUid).set(
    { mergedInto: keepUid, mergedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  // v1.3.18: loginRedirects — cobre TODO caminho de fusão que passa por aqui (inclui o SCAN
  // automático: _scanAndMergeByField / autoMergeOnProfileUpdate), não só os merges interativos.
  // Credenciais REAIS do drop vêm do Auth (e-mail/telefone E.164 = o que a resolveLoginRedirect
  // lê do token); se o Auth já sumiu, cai nos campos do perfil. Idempotente (item 9).
  let _drEmail = null, _drPhone = null;
  try { const _da = await admin.auth().getUser(dropUid); _drEmail = _da.email || null; _drPhone = _da.phoneNumber || null; }
  catch (e) { _drEmail = dropData.email || null; _drPhone = dropData.phone || null; }
  await _recordLoginRedirects(db, keepUid, _drEmail, _drPhone);

  // v1.7.61 — E O IDENTIFICADOR TAMBÉM VIRA VÍNCULO. `loginRedirects` só é lido no LOGIN;
  // quem responde "este e-mail também é dessa pessoa" é `linkedEmails` (é o que
  // _uidByProfileEmail consulta e o que a fila de e-mail usa pra alcançar o endereço antigo).
  // Medido na fusão da Fabiana: o `fabiana@sialdrill.com.br` ficou SÓ no redirect, e ela
  // parou de receber e-mail no endereço pelo qual se cadastrou. A varredura de perfil não
  // pega isso porque `email` está em NUNCA_COPIAR — o dado a preservar é escalar, não array.
  // Base = perfil do keep JÁ com o que a varredura acabou de gravar (senão sobrescreveria).
  try {
    const _linkUpd = _profileMerge.computeLinkedIdentifiers(
      Object.assign({}, keepData, profileUpd), _drEmail, _drPhone);
    if (Object.keys(_linkUpd).length > 0) {
      await db.collection("users").doc(keepUid).update(_linkUpd);
      console.log(`[_executeMerge] identificadores vinculados: ${JSON.stringify(_linkUpd)}`);
    }
  } catch (e) { console.error("[_executeMerge] vincular identificadores falhou:", e.code || e.message); }

  console.log(`[_executeMerge] Done: tourFixed=${tourFixed} casualFixed=${casualFixed} ` +
    `presences=${sweptFixed.presences || 0} venues=${sweptFixed.venues || 0} ` +
    `notifMovidas=${notifFixed.moved} notifDuplicadas=${notifFixed.duplicates} notifDeTerceiros=${notifFixed.fromUid}`);
  return { tourFixed, casualFixed, colFixed, notifFixed };
}

/**
 * VARREDURA GENÉRICA DE UID EM TODAS AS COLEÇÕES.
 *
 * Não recebe lista: pergunta ao Firestore quais coleções existem (`listCollections`) e varre
 * cada uma que não esteja na exclusão do core, aplicando o mesmo motor dos torneios
 * (`uid-sweep.remapUid` — acha o uid em qualquer profundidade, inclusive como chave de mapa,
 * preserva Timestamp por referência e dedupa array). Grava só os campos que mudaram.
 *
 * Best-effort POR COLEÇÃO: uma falhar não aborta a fusão nem as outras — o essencial
 * (torneios, perfil, Auth) já rodou antes daqui.
 *
 * ⚠️ Nunca ENCOLHE lista: o sweep TROCA valores, jamais remove. Se algum array reescrito vier
 * menor que o lido, aquele campo é descartado e o caso é logado — mesma trava do
 * _repairTournaments (o sumiço do Gersom, v1.7.26).
 * @returns {Object} contagem de docs alterados por coleção
 */
/* ═══ AMIZADE NO CICLO DE VIDA DE UID ══════════════════════════════════════════
 * A rotina vive em `amizade-lifecycle.js` (módulo à parte, `db` por parâmetro) porque
 * `index.js` NÃO é `require`-ável em teste — ele registra onCall e lê secrets no import.
 * Sem extrair, a única prova possível seria regex sobre o fonte, e a auditoria externa
 * recusou isso com razão: regex não prova o EFEITO da operação.
 * Agora `tests/amizade/lifecycle.test.js` roda estas funções contra o emulador de verdade.
 */
const _relacoesDe = (db, uid) => _amizadeVida.relacoesDe(db, uid);
const _mergeAmizade = (db, o, k) => _amizadeVida.mergeAmizade(db, o, k);
const _reconstruirCacheAmizade = (db, uids) => _amizadeVida.reconstruirCache(db, uids);
const _amizadeNoMerge = (db, o, k) => _amizadeVida.amizadeNoMerge(db, o, k);
const _excluirAmizade = (db, uid) => _amizadeVida.excluirAmizade(db, uid);

async function _sweepAllCollectionsByUid(db, dropUid, keepUid) {
  const out = {};
  if (!dropUid || !keepUid) return out;
  let cols = [];
  try { cols = await db.listCollections(); }
  catch (e) { console.error("[_sweepAllCollectionsByUid] listCollections falhou:", e && e.message); return out; }

  for (const ref of cols) {
    const nome = ref.id;
    if (!_mergeCols.shouldSweepCollection(nome)) continue;
    out[nome] = 0;
    try {
      const snap = await ref.get();
      let b = db.batch();
      let n = 0;
      for (const doc of snap.docs) {
        // Os DOIS docs de perfil envolvidos têm regra própria (computeProfileMerge +
        // tombstone) — varrê-los aqui sobrescreveria essa decisão. Os de TERCEIROS entram:
        // é onde vivem `friends[]` e `friendRequestsSent[]` com o uid morto.
        if (nome === "users" && (doc.id === dropUid || doc.id === keepUid)) continue;
        const atual = doc.data();
        const swept = _uidSweep.remapUid(atual, dropUid, keepUid);
        if (!swept.changed) continue;
        const payload = {};
        for (const k of Object.keys(swept.value)) {
          /* ⛔ v2.1.48 (4ª auditoria, ponto 4B) — A VARREDURA NÃO EDITA OS 4 CAMPOS DE
           * CACHE DE AMIZADE. Eles são projeção do cânone (`friendships`), já reescrita
           * pelo `amizade-lifecycle` ANTES desta varredura. Se o sweep os tocasse, acharia
           * lixo legado com o oldUid, trocaria por keepUid e REINVENTARIA uma amizade que
           * o cânone não tem — gravando por cima do que acabou de ser reconstruído.
           * Ordem de escrita não pode ser a única defesa. */
          if (nome === "users" && !_mergeCols.shouldSweepUserField(k)) continue;
          if (JSON.stringify(swept.value[k]) !== JSON.stringify(atual[k])) payload[k] = swept.value[k];
        }
        // ── trava anti-encolhimento ────────────────────────────────────────────
        // A varredura TROCA uid; ela nunca deve fazer PESSOA sumir de uma lista. Mas há um
        // encolhimento LEGÍTIMO: quando alguém tinha as DUAS contas na lista (é amigo do
        // Eduardo pelo Google E pelo Apple), a troca colapsa as duas numa — e aí o array
        // encolhe justamente porque a fusão funcionou. Comparar só o TAMANHO confunde os dois
        // casos e descartava o `friends[]` do dono (medido em 05/ago/2026).
        // Regra certa: o resultado tem que bater com o esperado — a lista original com
        // drop→keep aplicado e duplicata removida. Qualquer perda ALÉM disso é descartada.
        for (const k of Object.keys(payload)) {
          const antes = atual[k], depois = payload[k];
          if (!Array.isArray(depois) || !Array.isArray(antes)) continue;
          if (depois.length >= antes.length) continue;
          const soStrings = antes.every((x) => typeof x === "string");
          const esperado = soStrings
            ? Array.from(new Set(antes.map((x) => (x === dropUid ? keepUid : x))))
            : null;
          if (esperado && esperado.length === depois.length &&
              esperado.every((x) => depois.indexOf(x) !== -1)) continue;   // dedup legítimo
          console.error(`[_sweepAllCollectionsByUid] DESCARTADO ${nome}/${doc.id}.${k}: ` +
            `${antes.length} → ${depois.length}. Sweep de uid não remove item além do dedup.`);
          delete payload[k];
        }
        if (!Object.keys(payload).length) continue;
        b.update(doc.ref, payload);
        n++;
        out[nome]++;
        if (n % 400 === 0) { await b.commit(); b = db.batch(); }
      }
      if (n % 400 !== 0 || n === 0) await b.commit();
      if (out[nome]) console.log(`[_sweepAllCollectionsByUid] ${nome}: ${out[nome]} doc(s)`);
    } catch (e) {
      console.error(`[_sweepAllCollectionsByUid] ${nome} falhou:`, e && e.message);
    }
  }
  return out;
}

/**
 * users/{drop}/notifications/* → users/{keep}/notifications/*, sem duplicar, e reaponta o
 * `fromUid` das notificações de TERCEIROS que citam o uid morto (senão o nome e a foto do
 * remetente deixam de resolver na caixa de outra pessoa).
 *
 * Copia-e-apaga em vez de mover (o Firestore não tem move): a cópia vai PRIMEIRO e só depois
 * o original é apagado — se algo falhar no meio, o pior caso é a notificação existir nos dois
 * lados por um instante, nunca sumir. Duplicata detectada pela assinatura é apagada na
 * origem sem ser copiada: a conta vai deixar de existir e o aviso já está na caixa certa.
 */
async function _migrateNotifications(db, dropUid, keepUid) {
  const res = { moved: 0, duplicates: 0, fromUid: 0 };
  try {
    const [dropSnap, keepSnap] = await Promise.all([
      db.collection("users").doc(dropUid).collection("notifications").get(),
      db.collection("users").doc(keepUid).collection("notifications").get(),
    ]);
    const plano = _mergeCols.planNotifMigration(
      dropSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
      keepSnap.docs.map((d) => ({ id: d.id, data: d.data() })),
      dropUid, keepUid
    );
    const keepCol = db.collection("users").doc(keepUid).collection("notifications");
    const dropCol = db.collection("users").doc(dropUid).collection("notifications");
    for (const m of plano.moves) {
      await keepCol.doc(m.toId).set(m.data);
      await dropCol.doc(m.fromId).delete();
      res.moved++;
    }
    for (const d of plano.duplicates) {
      await dropCol.doc(d.id).delete();
      res.duplicates++;
    }
  } catch (e) {
    console.error("[_migrateNotifications] caixa do drop falhou:", e && e.message);
  }
  // Remetente: percorre TODAS as caixas (collectionGroup) atrás do uid morto.
  try {
    const from = await db.collectionGroup("notifications").where("fromUid", "==", dropUid).get();
    if (!from.empty) {
      let b = db.batch();
      let n = 0;
      for (const doc of from.docs) {
        b.update(doc.ref, { fromUid: keepUid });
        n++;
        if (n % 400 === 0) { await b.commit(); b = db.batch(); }
      }
      await b.commit();
      res.fromUid = from.size;
    }
  } catch (e) {
    console.error("[_migrateNotifications] fromUid falhou:", e && e.message);
  }
  return res;
}

// E-mail sintético de conta phone-only — nunca é credencial "de verdade" a preservar.
function _isSyntheticAuthEmail(email) {
  return /@phone\.scoreplace\.app$/i.test(String(email || ""));
}

// v1.3.18 — POPULA `loginRedirects` na fusão. Furo do item 9: a resolveLoginRedirect LIA essa
// coleção mas NADA a escrevia → o redirect nunca disparava (feature morta). Aqui gravamos
// {e-mail | telefone do DROP} → uid do sobrevivente. Motivo: numa fusão do MESMO provedor (duas
// Google), o provedor da conta absorvida não migra; logar com aquele e-mail cria uma conta VAZIA,
// e a resolveLoginRedirect precisa deste mapa pra jogar a sessão na conta certa.
// SEGURANÇA: só o Admin SDK escreve (rules deny-all — [[project_privileged_fields_never_client_writable]]).
// Chave = e-mail MINÚSCULO / telefone E.164, EXATAMENTE como a resolveLoginRedirect lê do token
// verificado (tok.email.toLowerCase() / tok.phone_number). Idempotente (merge:true). Ignora
// e-mail sintético (@phone.scoreplace.app) — não é login real. Escrever pra credencial que FOI
// transferida ao keep é inócuo: logar com ela cai numa conta COM perfil → resolveLoginRedirect
// devolve has_profile (nunca redireciona quem já tem perfil).
async function _recordLoginRedirects(db, ownerUid, dropEmail, dropPhone) {
  if (!ownerUid) return;
  const keys = [];
  if (dropEmail && !_isSyntheticAuthEmail(dropEmail)) keys.push(String(dropEmail).toLowerCase());
  if (dropPhone) keys.push(String(dropPhone));
  for (const k of keys) {
    try {
      await db.collection("loginRedirects").doc(k).set(
        { ownerUid: ownerUid, at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      console.log(`[loginRedirects] ${k} → ${ownerUid}`);
    } catch (e) { console.error("[loginRedirects] write falhou:", k, e.code || e.message); }
  }
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
  // ponto 4: a fusão muda a autoridade social — não roda com a migração congelada
  await _amizadeFase.exigirLiberado(db, HttpsError, "mergeAccountsKeepOlder");
  let ua, ub;
  /* ⛔ 10ª auditoria (ponto 2): O LOCK VEM ANTES DE TUDO QUE DECIDE.
   * A ordem anterior lia Auth, perfis e contagem de torneios, escolhia keep/drop, e SÓ
   * DEPOIS adquiria o lock. Lock impede simultaneidade, não atualiza retrato: entre a
   * decisão e a aquisição cabe uma fusão inteira, e a direção escolhida podia estar
   * invertida — fundir na direção errada apaga a conta que deveria sobreviver, e isso é
   * irreversível. Agora nada que decide é lido antes da posse. */
  let _terminouMerge = false;
  const posseMerge = await _amizadeLock.adquirir(db, [uidA, uidB], "merging");
  try {

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
  // v1.7.13 — A MAIS ATIVA VENCE (decisão do dono). Os DOIS pontos de decisão usam a MESMA
  // regra: se divergirem, auto-merge e merge explícito escolhem sobreviventes diferentes pra
  // mesma dupla. A atividade mora no Firestore, então este ponto (que só tinha UserRecords)
  // passou a carregar os docs + a contagem de torneios.
  const [_tcA, _tcB] = await Promise.all([
    _tournamentCountFor(db, uidA), _tournamentCountFor(db, uidB),
  ]);
  const _byUid = (u) => (u === uidA)
    ? { data: da.exists ? da.data() : {}, authUser: ua, tournamentCount: _tcA }
    : { data: dbb.exists ? dbb.data() : {}, authUser: ub, tournamentCount: _tcB };
  const _pickAct = _mergeRules.pickSurvivorByActivity(_byUid(uidA), _byUid(uidB), uidA, uidB);
  const keepU = (_pickAct.keep === "a") ? ua : ub;
  const dropU = (_pickAct.keep === "a") ? ub : ua;
  console.log(`[merge] keep=${keepU.uid} [${(keepU.providerData || []).map((p) => p.providerId).join(",")}] ` +
    `← drop=${dropU.uid} (critério: ${_pickAct.reason}${_pickAct.detail ? " — " + _pickAct.detail : ""})`);

  console.log(`[mergeKeepOlder] keep=${keepU.uid} (criado ${keepU.metadata.creationTime}) ← drop=${dropU.uid} (criado ${dropU.metadata.creationTime})`);

  // Credenciais do drop a mover pro keep (antes de apagar o drop).
  /* ⚠️ 10ª auditoria (ponto 2): estas credenciais são lidas SÓ AGORA, depois de a direção
   * ter sido decidida sob o lock. Calculá-las antes seria fixar `dropEmail`/`dropPhone`/
   * providers de um "drop" que a decisão de agora pode ter invertido. */
  const dropEmail = (dropU.email && !_isSyntheticAuthEmail(dropU.email)) ? dropU.email : null;
  const dropPhone = dropU.phoneNumber || null;
  // v1.7.11 — o provedor FEDERADO também viaja. Tem que ser lido AQUI: o "sub" do provedor
  // (providerData[i].uid) só existe enquanto a conta existe, e depois do deleteUser não há
  // de onde tirá-lo. Ver planProviderTransfer: o que o keep já tem não entra (1 instância
  // por providerId) — nesse caso aquele login morre e quem cobre é loginRedirects.
  const _fedToLink = _mergeRules.planProviderTransfer(keepU.providerData, dropU.providerData);

  /* `da`/`dbb` já foram lidos SOB O LOCK (logo depois da aquisição), então descrevem o
   * estado de agora — não precisam ser relidos. */
  const keepDoc = (keepU.uid === uidA) ? da : dbb;
  const dropDoc = (dropU.uid === uidA) ? da : dbb;

  // 1) Move TODOS os dados (torneios, matchHistory, casuais) + tombstone do dropDoc.
  if (keepDoc.exists && dropDoc.exists) {
    await _executeMergeInterno(db, keepDoc, dropDoc);    // já chama _amizadeNoMerge dentro
  } else if (dropDoc.exists) {
    // keep sem doc Firestore (raro) — só marca tombstone apontando pro keep.
    /* ⛔ 3ª auditoria (ponto 1): ESTA RAMIFICAÇÃO NÃO PASSAVA POR NENHUMA MIGRAÇÃO DE
     * AMIZADE. Gravava a lápide e pronto — as relações do uid absorvido continuariam
     * apontando pra um uid que acabou de morrer, e a projeção `friendAccess` dele
     * continuaria CONCEDENDO leitura. Tombstone sem migrar amizade não é aceitável.
     * A porta é a mesma dos outros caminhos, e ela é idempotente. */
    await _amizadeNoMerge(db, dropU.uid, keepU.uid);
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
  // 3b) Leva o provedor FEDERADO do drop pro keep — "Entrar com Google/Apple" continua
  // funcionando depois da fusão. Só agora: o provedor tem que estar LIVRE (a conta dona
  // foi apagada no passo 2), senão o Auth recusa. Um updateUser por provedor (a API aceita
  // um providerToLink por chamada). Best-effort: falhar aqui não desfaz a fusão — o
  // loginRedirects, gravado no _executeMerge, continua sendo a rede.
  for (const _p of _fedToLink) {
    try {
      await admin.auth().updateUser(keepU.uid, { providerToLink: _p });
      console.log(`[mergeKeepOlder] provedor ${_p.providerId} transferido pro keep=${keepU.uid}`);
    } catch (e) {
      console.error(`[mergeKeepOlder] providerToLink(${_p.providerId}) falhou:`, e.code || e.message);
    }
  }
  // 4) Reflete os identificadores ganhos no perfil Firestore do keep.
  const profUpd = { updatedAt: new Date().toISOString() };
  if (upd.email) profUpd.email = upd.email;
  if (upd.phoneNumber) { profUpd.phone = upd.phoneNumber; profUpd.phoneCountry = profUpd.phoneCountry || "55"; }
  await db.collection("users").doc(keepU.uid).set(profUpd, { merge: true }).catch(() => {});

  // 5) loginRedirects: futuro login com a credencial do DROP → cai no keep. Essencial na fusão
  //    do MESMO provedor (2 Google): o provider não migra, logar com aquele e-mail cria conta
  //    vazia, e a resolveLoginRedirect usa este mapa pra corrigir. Ver _recordLoginRedirects.
  await _recordLoginRedirects(db, keepU.uid, dropEmail, dropPhone);

  _terminouMerge = true;      // daqui pra frente o drop é lápide: lifecycle terminal
  return { survivorUid: keepU.uid, droppedUid: dropU.uid, already: false };
  } finally {
    /* ⛔ 9ª auditoria (ponto 3): o DROP vira TERMINAL (`merged`), não `active` — ele acabou
     * de virar lápide, e devolvê-lo a `active` deixaria uma operação com validação velha
     * escrever sobre uid morto. O KEEP volta a `active`, que é a verdade dele.
     * Se a fusão FALHOU antes de terminar, `_terminou` fica falso e os dois voltam a
     * `active` (ownership-aware), pra a operação poder ser repetida. */
    /* ⛔ 10ª auditoria (ponto 3): o desfecho vem do FATO. Se a lápide (`mergedInto`) já
     * foi gravada e uma etapa POSTERIOR falhou (transferir provedor, refletir e-mail),
     * o drop continua morto — devolvê-lo a `active` por causa do erro seria ressuscitar
     * um uid que já não existe. `_terminouMerge` sozinho não sabia disso. */
    await _amizadeLock.finalizarPeloFato(db, posseMerge).catch((e) =>
      console.error("[mergeKeepOlder] finalização do lifecycle falhou:", e && e.message));
  }
}

/**
 * Scan all users for duplicate values of `field` ("phone" or "email").
 * For each duplicate group, merge every less-complete account into the
 * most-complete one.  Returns an array of merge result objects.
 */
/**
 * PORTA ÚNICA das fusões automáticas: busca os dois UserRecords e delega a decisão pra
 * `mayAutoMerge` (merge-rules.js, pura e testada) — credencial AUTENTICADA dos dois lados
 * E ninguém tendo dispensado o outro. Os DOIS caminhos automáticos — o trigger
 * `autoMergeOnProfileUpdate` e a varredura diária `_scanAndMergeByField` — passam por aqui.
 * Foi a SEGUNDA porta, sem gate, que fundiu duas pessoas diferentes em 19/ago/2026 — e
 * fundiu 8h43 DEPOIS de uma delas ter respondido "não somos a mesma pessoa" na tela.
 * Auth ausente (conta já apagada) → não autoriza, que é o lado seguro.
 */
async function _mayAutoMerge(docA, docB) {
  const [autA, autB] = await Promise.all([
    admin.auth().getUser(docA.id).catch(() => null),
    admin.auth().getUser(docB.id).catch(() => null),
  ]);
  return _mergeRules.mayAutoMerge(
    { uid: docA.id, auth: autA, data: (docA.data && docA.data()) || {} },
    { uid: docB.id, auth: autB, data: (docB.data && docB.data()) || {} });
}

async function _scanAndMergeByField(db, field) {
  /* ⛔ 7ª auditoria (ponto 4): a varredura automática e a agendada passam por aqui. Elas
   * não têm HttpsError nem quem as escute — então simplesmente NÃO RODAM enquanto a
   * migração estiver congelada. Voltam sozinhas quando a fase liberar. */
  if (!(await _amizadeFase.liberado(db))) {
    /* ⛔ 9ª auditoria (ponto 7): devolve ARRAY, como em toda outra saída desta função.
     * Antes devolvia `{pulado:true,...}` e o `scheduledAutoMergeCleanup` fazia
     * `phoneResults.length` — que num objeto sem `length` vira `undefined`, e a soma vira
     * `NaN` no log. Função que às vezes é array e às vezes é objeto é armadilha pro
     * próximo caller. */
    console.warn('[_scanAndMergeByField] PULADO (' + field + '): migração de amizade em manutenção');
    return [];
  }
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

    // ⚠️ QUEM DECIDE É O `merge-sweep-core` — MESMA PORTA DO TRIGGER (`_mayAutoMerge`).
    // Sem credencial AUTENTICADA batendo dos dois lados o par fica de pé: quem resolve é o
    // fluxo interativo de duplicata, que sabe pedir prova de posse. Duplicata não fundida é
    // incômodo reversível; fusão errada apaga uma conta do Auth e não tem volta. A decisão
    // mora num módulo puro porque enquanto morava AQUI nenhum teste alcançava ela — e foi
    // assim que a varredura fundiu duas pessoas diferentes em 19/ago/2026.
    const plano = await _mergeSweep.planSweepMerges(docs, {
      pickKeep: async (a, b) => (await _determineMergeWinner(a, b)).keepDoc,
      proof: _mayAutoMerge,
    });
    if (!plano.keepUid) continue;

    plano.refused.forEach((r) => {
      console.log(`[scanAndMergeByField] RECUSADO ${plano.keepUid} × ${r.dropUid}: ` +
        `"${field}" bate no PERFIL mas não há credencial AUTENTICADA nos dois lados — ` +
        `fundir por texto digitado apagaria conta de terceiro.`);
      results.push({ field, key, keepUid: plano.keepUid, dropUid: r.dropUid, refused: r.reason });
    });

    // Executa o plano (re-fetch a cada par, pra pegar estado fresco)
    for (const m of plano.merges) {
      const [freshKeep, freshDrop] = await Promise.all([
        db.collection("users").doc(plano.keepUid).get(),
        db.collection("users").doc(m.dropUid).get(),
      ]);
      if (!freshDrop.exists || freshDrop.data().mergedInto) continue;
      try {
        const r = await _executeMerge(db, freshKeep, freshDrop);
        results.push({ field, key, keepUid: plano.keepUid, dropUid: m.dropUid, by: m.by, ...r });
      } catch (err) {
        results.push({ field, key, keepUid: plano.keepUid, dropUid: m.dropUid,
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
        // limit(8), não limit(1): o e-mail casa a lápide E o sobrevivente, e com limit(1) o
        // Firestore pode entregar justamente a morta — cujo `theme` é o de antes da fusão.
        let _uSnap = await db.collection("users").where("email", "==", email).limit(8).get();
        if (_uSnap.empty && email !== email.toLowerCase()) {
          _uSnap = await db.collection("users").where("email", "==", email.toLowerCase()).limit(8).get();
        }
        const _vivo = await _userVivo.userVivo(db, _uSnap);
        if (_vivo && _vivo.data.theme === "light") _theme = "light";
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
// Firestore fica com `mergedInto: <uid_canonico>` como tombstone.
//
// ⛔ A LÁPIDE NÃO SE APAGA — ISTO AQUI JÁ APAGOU UMA PESSOA REAL (30/ago/2026).
// Este bloco dizia "após 7 dias do merge o ghost é apagado de Auth E Firestore — sem
// fantasmas no sistema", e a premissa ("após o merge a conta não tem mais dados úteis") é
// FALSA: o uid antigo continua gravado nos JOGOS, e é a lápide que permite ao resolvedor
// seguir dele até a conta viva. Apagar a lápide não some com um fantasma — quebra toda
// referência histórica àquele uid.
//
// O CASO MEDIDO, ponta a ponta: a Loraine criou uma conta Google em 27/ago 23:03; a dedup
// fundiu a antiga (e-mail/senha) na nova às 23:05, gravando a lápide; às 04:15 do dia
// seguinte ESTA rotina apagou a conta antiga inteira, lápide junto. Resultado na tela do
// dono: o card do jogo mostrando "…" no lugar do nome dela, porque o uid gravado no jogo
// não resolvia mais pra lugar nenhum.
//
// ⛔ E ELA NÃO DEVERIA NEM TER PASSADO NA PENEIRA DOS 7 DIAS: a idade da lápide era lida de
// `updatedAt || createdAt`, e o merge NÃO mexe nesses campos — ele grava `mergedAt`. O
// `updatedAt` dela era de 19/ago, então uma lápide de DOIS MINUTOS foi julgada com 9 dias e
// morreu na mesma noite. Pior: sem nenhum carimbo, `mergedMs` virava 0 e o `if (mergedMs &&
// …)` deixava PASSAR — idade desconhecida resultava em APAGAR, que é o default errado.
//
// AGORA: a idade sai de `mergedAt` (o campo que o merge de fato grava), desconhecida =
// PULA, e o documento Firestore NUNCA é apagado. Só a conta Auth órfã sai — o login já é
// feito pela conta canônica, e o merge (`mergeKeepOlder`) inclusive já apaga o Auth do drop
// no ato, o que torna esta passagem quase sempre um no-op.
// [[project_lapide_mergedinto_e_carga_nao_lixo]] [[project_fusao_indevida_cilone]]
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
          /* ⭐ A IDADE SAI DE `mergedAt`, que é o campo que o merge REALMENTE grava
           * (mergeKeepOlder e os outros três pontos gravam `mergedInto` + `mergedAt`
           * juntos). `updatedAt`/`createdAt` descrevem a vida da PESSOA, não a da lápide —
           * e foi lendo eles que uma lápide de dois minutos foi julgada com nove dias. */
          const _ts = data.mergedAt;
          const mergedMs = (_ts && typeof _ts.toMillis === "function") ? _ts.toMillis()
            : (_ts && typeof _ts === "string") ? new Date(_ts).getTime() : 0;
          /* ⛔ SEM CARIMBO, NÃO SE DECIDE. Antes, `mergedMs = 0` caía no `if (mergedMs && …)`
           * e seguia direto pra exclusão: idade desconhecida virava "apagar". O default de
           * uma rotina destrutiva tem que ser NÃO FAZER. */
          if (!mergedMs) {
            console.warn(`[cleanupAbandonedAuth] ghost sem mergedAt — PULANDO uid=${batch[j].uid}`);
            continue;
          }
          if ((now - mergedMs) < GHOST_THRESHOLD_MS) continue; // recente, aguardar
          /* ⛔ SÓ O AUTH ÓRFÃO SAI. O documento Firestore É A LÁPIDE e fica PRA SEMPRE: o uid
           * antigo segue gravado nos jogos, e é por ela que o resolvedor chega na conta viva.
           * Apagá-lo foi o que pôs "…" no lugar do nome da Loraine no card. */
          try {
            await auth.deleteUser(batch[j].uid);
          } catch (err) {
            if (err.code !== "auth/user-not-found") {
              console.warn(`[cleanupAbandonedAuth] failed ghost auth uid=${batch[j].uid}:`, err.message);
              continue;
            }
          }
          deletedGhosts++;
          console.log(`[cleanupAbandonedAuth] ghost auth removido (lápide PRESERVADA): uid=${batch[j].uid} mergedInto=${data.mergedInto}`);
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

// ─── Lembrete de torneio CONFIÁVEL (item 7) ─────────────────────────────────
// ANTES o lembrete (7d/2d/dia) só saía quando ALGUÉM abria o app (_checkTournamentReminders
// no cliente, dedup por localStorage por-dispositivo). Quem não abria no dia certo NUNCA
// recebia — gente ficou sem aviso do torneio real. Agora uma CF AGENDADA roda todo dia e
// entrega server-side, com dedup POR TORNEIO (t.remindersSent.rNd) e idempotência por notif
// doc determinístico. Espelha EXATAMENTE as janelas/níveis do cliente (reminder-core.js, o
// mesmo módulo, testado). Respeita notifyLevel/notifyPlatform/notifyEmail de cada um e o
// killswitch do Sandbox (isSandbox/notificationsMuted). E-mail via a MESMA fila digest do
// comunicado do organizador (notif_email_queue → flushNotifEmailDigest). Ver
// [[project_tournament_reminder_cf]]. O cliente deixa de disparar (fim do envio duplo).
// Deploy:  firebase deploy --only functions:sendTournamentReminders
const { runTournamentReminders: _runTournamentReminders } = require("./reminder-run");
exports.sendTournamentReminders = onSchedule(
  { schedule: "every day 09:00", timeZone: "America/Sao_Paulo", region: "us-central1",
    timeoutSeconds: 300, memory: "256MiB" },
  async () => { await _runTournamentReminders(admin.firestore(), Date.now()); }
);

// ─── Torneios ABANDONADOS: avisa 48h antes e encerra por inatividade ─────────
// Pedido do dono (02/ago/2026): torneio de 1 dia que nunca chegou à final e que o
// organizador nunca encerrou fica aparecendo pra todo usuário novo. Medido: de 8 torneios
// vivos, 4 abandonados.
//
// A REGRA MORA SÓ AQUI (abandon-core). O cliente não recalcula nada — ele lê `autoClosed` e
// obedece. Sem espelho, sem drift.
//
// Encerrar NÃO fecha a classificação (sem pódio/troféu/título) e deixa o torneio reabrível
// pelo organizador informando as datas. Liga/Pontos Corridos nunca entra: é temporada
// contínua. Quem nunca teve placar não é encerrado — só sai da vitrine, e isso é decisão de
// leitura no cliente, sem escrita nenhuma.
// Deploy:  firebase deploy --only functions:sweepAbandonedTournaments
const { runAbandonSweep: _runAbandonSweep } = require("./abandon-run");
exports.sweepAbandonedTournaments = onSchedule(
  { schedule: "every day 04:00", timeZone: "America/Sao_Paulo", region: "us-central1",
    timeoutSeconds: 540, memory: "256MiB" },
  async () => { await _runAbandonSweep(admin.firestore(), Date.now()); }
);

// ─── Cobrança DIÁRIA de celular no perfil (Confra) ───────────────────────────
// Pedido do dono (19/ago/2026): reenviar o pedido de Whats no perfil todo dia a
// quem AINDA não cadastrou; quem cadastrou nunca mais recebe; e o consolidado pro
// dono mostra, POR LEVA, quem recebeu e quantos atenderam. A leva fica GRAVADA em
// phoneNudgeWaves/{dia}__{torneio} — foi a ausência disso que tornou "quantos
// atenderam?" incalculável no envio manual do dia 18. A regra mora em
// phone-nudge-core.js (puro, testado); o I/O em phone-nudge-run.js.
// ⚠️ NASCE EM ENSAIO: só o consolidado sai até appConfig/phoneNudge.enabled=true.
// Ver [[project_cobranca_de_celular_no_perfil]].
// Deploy:  firebase deploy --only functions:nudgeMissingPhones
const { runPhoneNudge: _runPhoneNudge } = require("./phone-nudge-run");
exports.nudgeMissingPhones = onSchedule(
  { schedule: "every day 09:30", timeZone: "America/Sao_Paulo", region: "us-central1",
    timeoutSeconds: 540, memory: "256MiB" },
  async () => { await _runPhoneNudge(admin.firestore(), Date.now()); }
);

// ─── Conta no Auth SEM perfil no Firestore (conta órfã) ──────────────────────
// MEDIDO em 22/ago/2026: 236 contas no Auth × 248 docs em `users/` → 2 órfãs,
// ambas Apple com e-mail oculto, ambas com lastSignIn == creation (entraram uma
// vez e nunca voltaram). Sem doc de perfil a pessoa não existe pro app: não
// aparece na busca, não entra em lista de espera, não se inscreve — e o
// organizador vê "Jogador sem perfil (XXXX)".
//
// O cliente já foi endurecido (prazo nas idas à rede, escrita com espera/retry/
// Sentry, semente gravada assim que o resgate responde — js/views/auth.js), mas
// se o Firestore RECUSAR a escrita, ou a aba morrer no meio, não sobra ninguém
// pra tentar de novo: essas pessoas não voltam. Esta varredura é esse "alguém".
//
// ⚠️ E TEM PRAZO: a cleanupAbandonedAuth (04:15) APAGA do Auth conta sem doc com
// mais de 30 dias. Sem esta cura, órfã vira conta deletada em silêncio.
//
// ⛔ NÃO cria perfil de quem tem entrada em `loginRedirects` — é o doc inexistente
// que faz o resgate de conta absorvida funcionar (v1.2.9). A regra mora em
// orphan-profile-core.js (puro, testado); o I/O em orphan-profile-run.js.
// ⚠️ NASCE EM ENSAIO: só mede até appConfig/orphanProfiles.enabled = true.
// Deploy:  scripts/deploy-functions.sh main
const { run: _runOrphanProfiles } = require("./orphan-profile-run");
exports.healOrphanProfiles = onSchedule(
  { schedule: "every day 05:10", timeZone: "America/Sao_Paulo", region: "us-central1",
    timeoutSeconds: 540, memory: "256MiB" },
  async () => { await _runOrphanProfiles(admin.auth(), admin.firestore(), Date.now()); }
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
    const isOrg = _isTournamentOrgCaller(t, callerUid);
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
    const isOrg = _isTournamentOrgCaller(t, callerUid);
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
// ─── enrollParticipant / deenrollParticipant (inscrição no SERVIDOR) ─────────
// Portam as transações de js/firebase-db.js pro Admin SDK. Motivação: o SDK
// Firestore 10.8.1 do browser tem um bug FATAL de persistência (INTERNAL
// ASSERTION FAILED: Unexpected state) que mata a AsyncQueue no iOS Safari — daí
// a runTransaction do cliente estoura e a inscrição/desinscrição falha (rollback
// + "Erro"). Aqui a escrita não passa pela fila IndexedDB nem pelas rules. E um
// bug de inscrição vira `firebase deploy` de minutos, não release nativo de dias.
// Lógica pura vive em ./enroll-core.js (espelha o cliente). Ver
// [[project_firestore_assertion_bug]] / [[project_result_launch_cf_evaluation]].
// Sandbox (SB): replicação one-way original→SB via a MESMA CF + o MESMO core. A lógica
// vive em ./sandbox-replicate.js (módulo isolado só pra ser testável contra o emulador —
// o código que roda é ESTE, não uma cópia). enrollParticipant/deenrollParticipant, depois
// de aplicar no original, rodam o MESMO computeEnroll/computeDeenroll no doc do SB.
const { replicateRosterToSandbox: _replicateRosterToSandbox } = require("./sandbox-replicate");

// Deploy:  firebase deploy --only functions:enrollParticipant,functions:deenrollParticipant

/**
 * "Esta pessoa já não está inscrita neste torneio com OUTRA conta?"
 *
 * Não lê o roster inteiro (o Confra tem 111 inscritos — seriam 111 leituras por inscrição).
 * Faz o caminho inverso: 2 consultas INDEXADAS em `users` (nome e celular) devolvem os
 * poucos candidatos, e o cruzamento com `memberUids` do torneio — que já está na memória —
 * diz se algum deles está aqui dentro.
 *
 * Devolve o uid do suspeito pro CHAMADOR interno (o dismiss precisa dele), mas o que vai pro
 * cliente é só o MASCARADO — ver o retorno montado em enrollParticipant.
 * Fail-open: erro de consulta não pode atrapalhar inscrição ([[feedback_enrollment_fail_open]]).
 */

/**
 * AVISA A PESSOA de que ela já parece estar inscrita com OUTRA conta — pelo SERVIDOR.
 *
 * POR QUE AQUI E NÃO NA TELA (regra do dono, 06/ago/2026): _"esse é o tipo de coisa que
 * deveria rodar em CF e não no cliente"_. A pergunta que a 1.7.41 construiu mora no JS do
 * app — e o app NATIVO embarca o JS e **não tem auto-update**: só chega numa submissão nova,
 * dias depois, contando revisão da loja. Ou seja, quem se inscreve pelo celular não seria
 * interpelado, que é justamente onde a inscrição às pressas pela vaga na fila acontece.
 * Notificação é DADO, não código de tela: alcança toda versão, inclusive a nativa velha que
 * nunca vai chamar o diálogo novo. Mesmo raciocínio do vigia estrutural da 1.7.36.
 *
 * Usa a MESMA fila de e-mail do app (`notif_email_queue` → flushNotifEmailDigest). Escrever
 * direto em `mail` faria um segundo caminho, com outro digest e outro agrupamento — foi
 * exatamente o buraco do sorteio automático, que existia só no cliente.
 *
 * IDEMPOTENTE por (pessoa, torneio, outra conta): o id do doc é determinístico, então
 * reinscrever não vira spam. Nível `important` — a pessoa pode perder a vaga, mas não é
 * emergência; quem desligou "só fundamentais" não é incomodado.
 * Best-effort: falhar aqui não desfaz a inscrição, que já está gravada.
 */
async function _avisarDuplicataSuspeita(db, alvoUid, tournamentId, tournamentName, dup) {
  try {
    if (!alvoUid || !dup) return false;
    const prof = await db.collection("users").doc(alvoUid).get();
    if (!prof.exists) return false;
    const p = prof.data() || {};
    const nivelUsuario = p.notifyLevel || "todas";
    const NIVEL = "important";
    const permitido = (nivelUsuario === "todas" || !nivelUsuario) ? true
      : (nivelUsuario === "none" ? false
        : (nivelUsuario === "importantes" ? true : false));   // "fundamentais" fica de fora
    if (!permitido) return false;

    const contato = dup.maskedEmail || dup.maskedPhone || "";
    const msg = "Você já parece estar inscrito em \"" + (tournamentName || "este torneio") +
      "\" com outra conta" + (contato ? (" (" + contato + ")") : "") + ". " +
      (dup.motivo === "celular"
        ? "As duas contas têm o mesmo celular. "
        : "As duas usam o mesmo nome. ") +
      "Se for você, abra seu perfil e una as duas — seus jogos e seu histórico ficam num " +
      "lugar só, e você deixa de ocupar duas vagas. A união só acontece depois que você " +
      "confirmar a posse da outra conta. Se for outra pessoa com o mesmo nome, é só ignorar.";

    // id determinístico → reinscrever não duplica o aviso
    const notifId = ["dup_suspect", tournamentId, dup.uid, alvoUid].join("|")
      .replace(/[^a-zA-Z0-9_|-]/g, "_").replace(/\|/g, "__").slice(0, 200);

    if (p.notifyPlatform !== false) {
      await db.collection("users").doc(alvoUid).collection("notifications").doc(notifId).set({
        type: "duplicate_account_suspected",
        tournamentId: tournamentId,
        tournamentName: tournamentName || "",
        title: "👥 Duas contas suas neste torneio?",
        message: msg,
        createdAt: new Date().toISOString(),
        read: false,
      }, { merge: true });
    }
    // E-mail: opt-out INDEPENDENTE do in-app (quem desligou o sininho segue querendo e-mail).
    if (p.notifyEmail !== false && p.email && !_isSyntheticAuthEmail(p.email)) {
      const nowMs = Date.now();
      await db.collection("notif_email_queue").add({
        email: String(p.email).toLowerCase(),
        level: NIVEL,
        message: msg,
        tournamentName: tournamentName || "",
        tournamentUrl: "https://scoreplace.app/#tournaments/" + tournamentId,
        createdAt: nowMs,
        flushAtMs: nowMs + 15 * 60 * 1000,
      });
    }
    console.log("[dup-suspect] avisado " + alvoUid + " sobre " + dup.uid + " em " + tournamentId);
    return true;
  } catch (e) {
    console.error("[_avisarDuplicataSuspeita] falhou (best-effort):", e && e.message);
    return false;
  }
}

async function _detectarDuplicataNoTorneio(db, callerUid, tData) {
  try {
    const meuDoc = await db.collection("users").doc(callerUid).get();
    if (!meuDoc.exists) return null;
    const meu = meuDoc.data() || {};
    if (meu.mergedInto) return null;

    const membros = {};
    (Array.isArray(tData && tData.memberUids) ? tData.memberUids : []).forEach((u) => { membros[u] = true; });
    if (!Object.keys(membros).length) return null;

    // ── CANDIDATOS ────────────────────────────────────────────────────────────────
    // ⚠️ v1.8.3 — AQUI ESTAVA O FURO. A única consulta por nome era
    // `displayName_lower == nomeLower`, e `displayName_lower` é `toLowerCase()` CRU:
    // preserva acento, ponto e espaço. Resultado medido no Confra (11/ago/2026):
    // "Dėbora Castello" nunca casava com "Debora Castello" (o `ė` é U+0117) e
    // "M.Delia Fernandez" nunca casava com "MDelia Fernandez". As duas pessoas ficaram
    // com DUAS contas cada, jogando em grupos diferentes da MESMA rodada.
    // O comparador (`compararNomes`) sabia resolver o caso da Debora — mas nunca era
    // chamado, porque a consulta não entregava o candidato. Havia normalização FORTE pra
    // comparar e FRACA pra buscar, e quem decide é a fraca.
    // Agora a busca usa as MESMAS chaves que o comparador gera:
    //   • `displayName_keys` (array) — grafia e inicial omitida: cobre M.Delia×MDelia×Delia
    //     e Debora×Dėbora e Castello×Castelo (chave sem letra dobrada).
    //   • `displayName_lastkey` — o sobrenome, como REDE: traz quem tem o mesmo sobrenome e
    //     deixa `compararNomes` decidir (é por ela que "MDelia" alcança "Delia").
    // `displayName_lower` fica como 3ª consulta pra perfil legado ainda sem as chaves.
    // Ver [[project_duplicate_detection_two_normalizations]].
    const nomeMeu = String(meu.displayName || "").trim();
    const nomeLower = nomeMeu.toLowerCase();
    // user-vivo:isento (vale pro bloco de `consultas` abaixo) — isto LISTA candidatos pra um
    // julgamento de duplicata, não resolve UMA pessoa pra agir sobre ela. Passar pela porta
    // seria errado aqui, por dois motivos: a lápide precisa ser DESCARTADA e não seguida (uma
    // conta já fundida não é uma duplicata a resolver), e colapsar lápide+sobrevivente
    // esconderia justamente o par que o julgamento existe pra enxergar. O descarte é
    // explícito logo abaixo (`if (x.mergedInto) return;`), junto com o do próprio caller.
    const telCanon = _dupPerson.normalizarTelefone(meu.phone);
    const consultas = [];
    if (nomeMeu && !_nameUnique.isUnfriendlyName(nomeLower)) {
      const chaves = _dupPerson.chavesDeBusca(nomeMeu).slice(0, 10);   // teto do array-contains-any
      const sobren = _dupPerson.chaveSobrenome(nomeMeu);
      if (chaves.length) {
        consultas.push(db.collection("users")
          .where("displayName_keys", "array-contains-any", chaves).limit(20).get());
      }
      if (sobren) {
        // Limite maior: sobrenome comum traz gente de fora do torneio, e o filtro por
        // membro roda DEPOIS do limit — apertar aqui perderia o candidato certo.
        consultas.push(db.collection("users")
          .where("displayName_lastkey", "==", sobren).limit(40).get());
      }
      // Nome com INICIAL abreviada ("Mariana C", "M.Delia", "Marcos a Alvarez"): aí o
      // sobrenome pode ser uma letra e nenhuma chave cruza com a forma por extenso
      // ("Mariana Ciocci"). Só nesse caso vale consultar pelo PRIMEIRO nome — é amplo, e
      // fora daqui traria todas as "Mariana" da base à toa.
      if (_dupPerson.temInicialAbreviada(nomeMeu)) {
        const pk = _dupPerson.chavePrimeiroNome(nomeMeu);
        if (pk) {
          consultas.push(db.collection("users")
            .where("displayName_firstkey", "==", pk).limit(40).get());
        }
      }
      // v1.8.38 — nome de UM TOKEN só: nenhuma consulta acima alcança quem tem esse token
      // no MEIO do nome. Mesmo buraco do cadastro; ver o bloco gêmeo em dup-cadastro.
      if (_dupPerson.tokensNome(nomeMeu).length === 1) {
        const tk = _dupPerson.tokensNome(nomeMeu)[0];
        if (tk) {
          consultas.push(db.collection("users")
            .where("displayName_tokens", "array-contains", tk).limit(30).get());
        }
      }
      consultas.push(db.collection("users").where("displayName_lower", "==", nomeLower).limit(8).get());
    }
    // v1.9.97: telefone só é EVIDÊNCIA de duplicata quando é identidade. O número que o
    // organizador registrou pode ser compartilhado de propósito (casal com um aparelho
    // só) — perguntar "vocês são a mesma pessoa?" por causa disso é falso positivo
    // fabricado por nós.
    if (telCanon && _contactPhone.isIdentityPhone(meu)) {
      consultas.push(db.collection("users").where("phone", "==", meu.phone).limit(8).get());
    }
    if (!consultas.length) return null;

    const snaps = await Promise.all(consultas.map((p) => p.catch(() => null)));
    const vistos = {};
    const pessoas = [];
    for (const snap of snaps) {
      if (!snap) continue;
      snap.forEach((d) => {
        if (d.id === callerUid || vistos[d.id] || !membros[d.id]) return;   // só quem está NESTE torneio
        const x = d.data() || {};
        if (x.mergedInto) return;
        vistos[d.id] = true;
        pessoas.push({
          uid: d.id, nome: x.displayName || "",
          // mesma regra do lado de cá: número do organizador não conta como evidência
          telefone: _contactPhone.isIdentityPhone(x) ? (x.phone || "") : "",
          letzplayHandle: x.letzplayHandle || "", email: x.email || "",
        });
      });
    }
    if (!pessoas.length) return null;

    // ⚠️ RIGOR DE TORNEIO. Regra do dono (11/ago/2026): _"quando a pessoa se inscreve de
    // novo no mesmo torneio aumenta a chance de ser a mesma pessoa. a busca deve ser mais
    // dura aqui."_ O universo aqui são os ~130 inscritos DESTE torneio, não a base inteira,
    // e todos já demonstraram intenção no mesmo evento — a mesma semelhança vale mais.
    // O que o rigor alto acrescenta foi MEDIDO nos 131 do Confra (0 falso positivo):
    // 1 caractere sem piso de comprimento, e 2 caracteres em nome longo. Ver compararNomes.
    const r = _dupPerson.detectarMesmaPessoa({
      uid: callerUid, nome: meu.displayName || "", telefone: meu.phone || "",
      letzplayHandle: meu.letzplayHandle || "",
      // Memória do "não sou eu": a RICA (com força) manda; o array legado entra junto e
      // vale como força 0 — reabre uma vez, porque não se sabe de que sinal ele era.
      dispensados: [].concat(
        Array.isArray(meu.dupDismissedInfo) ? meu.dupDismissedInfo : [],
        Array.isArray(meu.dupDismissed) ? meu.dupDismissed : []),
    }, pessoas, { rigor: "torneio", freqTokens: await _freqDosTokensSoltos(db, _dupPerson, meu.displayName || "", pessoas) });
    if (!r.suspeito) return null;

    // ─── CELULAR AUTENTICADO NÃO PERGUNTA: FUNDE (v1.8.3) ──────────────────────────
    // Regra do dono (11/ago/2026): _"no mesmo celular autenticado, já mescla, nem pergunta."_
    //
    // ⚠️ "AUTENTICADO" É O TELEFONE DO **AUTH**, NUNCA O CAMPO `phone` DO PERFIL.
    // O campo do perfil é TEXTO DIGITADO: a pessoa pode errar um dígito e cair no número de
    // outra, ou digitar o do marido. Fundir por isso apagaria a conta de um terceiro — e
    // fusão apaga do Auth, não tem volta. O `phoneNumber` do Auth só existe depois de um SMS
    // conferido: é posse provada, que é exatamente o que o dono qualificou com "autenticado".
    // (O `autoMergeOnProfileUpdate` funde pelo campo do PERFIL — mais frouxo que isto de
    // propósito? não: é dívida conhecida, ver [[project-automerge-trigger-footgun]].)
    //
    // Os DOIS lados precisam ter o número no Auth. Um só provando não diz nada sobre o outro.
    if (r.suspeito.motivo === "celular" || r.suspeito.motivo === "email") {
      try {
        const [_meuAuth, _outroAuth] = await Promise.all([
          admin.auth().getUser(callerUid).catch(() => null),
          admin.auth().getUser(r.suspeito.uid).catch(() => null),
        ]);
        const _p1 = _meuAuth && _meuAuth.phoneNumber;
        const _p2 = _outroAuth && _outroAuth.phoneNumber;
        const _telProvado = !!(_p1 && _p2 &&
          _dupPerson.normalizarTelefone(_p1) === _dupPerson.normalizarTelefone(_p2));
        // E-MAIL vale igual ao celular, com a MESMA exigência: verificado NO AUTH dos dois
        // lados. `emailVerified` é o que separa "provou que recebe nesse endereço" de
        // "digitou esse endereço" — sem ele, fundir por e-mail apagaria a conta de quem
        // teve o endereço digitado por engano.
        const _e1 = _meuAuth && _meuAuth.emailVerified && _dupPerson.normalizarEmail(_meuAuth.email);
        const _e2 = _outroAuth && _outroAuth.emailVerified && _dupPerson.normalizarEmail(_outroAuth.email);
        const _mailProvado = !!(_e1 && _e2 && _e1 === _e2);
        if (_telProvado || _mailProvado) {
          console.log(`[dup] ${_telProvado ? "celular" : "e-mail"} AUTENTICADO igual nos dois ` +
            `(${callerUid} × ${r.suspeito.uid}) — fundindo sem perguntar`);
          const _res = await _mergeAccountsKeepOlder(db, callerUid, r.suspeito.uid);
          console.log(`[dup] fusão automática por credencial autenticada:`, JSON.stringify(_res));
          return null;   // não há o que perguntar — as contas viraram uma
        }
      } catch (e) {
        // Falhar aqui NÃO pode barrar a inscrição: cai na pergunta, que é o caminho seguro.
        console.error("[dup] fusão por credencial autenticada falhou (segue pra pergunta):", e && e.message);
      }
    }

    const alvo = pessoas.filter((p) => p.uid === r.suspeito.uid)[0] || {};
    const emailReal = (alvo.email && !_nameUnique.isSyntheticEmail(alvo.email)) ? alvo.email : "";
    return {
      uid: r.suspeito.uid,                       // ⚠️ interno — NUNCA vai pro cliente
      motivo: r.suspeito.motivo,
      semelhanca: r.suspeito.semelhanca || null, // como os nomes bateram (muda o texto)
      corroboracoes: r.suspeito.corroboracoes,
      nome: alvo.nome || "",
      maskedEmail: _nameUnique.maskEmail(emailReal) || null,
      maskedPhone: _nameUnique.maskPhone(alvo.telefone) || null,
    };
  } catch (e) {
    console.error("[_detectarDuplicataNoTorneio] fail-open:", e && e.message);
    return null;
  }
}

exports.enrollParticipant = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const participantObj = request.data && request.data.participantObj;
    const extraUpdates = (request.data && request.data.extraUpdates) || null;
    if (!tournamentId || !participantObj || typeof participantObj !== "object") {
      throw new HttpsError("invalid-argument", "tournamentId e participantObj são obrigatórios");
    }
    // Espelha o guard do cliente: recusa objeto sem NENHUM identificador.
    const hasId = !!(participantObj.uid || participantObj.email ||
      participantObj.displayName || participantObj.name || participantObj.phone);
    if (!hasId) throw new HttpsError("invalid-argument", "participantObj sem identificador válido");

    const db = admin.firestore();
    const docRef = db.collection("tournaments").doc(tournamentId);
    const nowMs = Date.now();

    // ── PORTA: esta pessoa já não está aqui com OUTRA conta? ─────────────────
    // Roda ANTES de gravar e RECUSA, devolvendo o desfecho `alreadyEnrolled` — que TODO
    // cliente já sabe exibir ("Já Inscrito — Você já está inscrito neste torneio"),
    // inclusive o nativo velho, que embarca o JS e não tem auto-update.
    //
    // POR QUE NÃO BASTA AVISAR (regra do dono, 06/ago): _"as pessoas não leem as
    // notificações… nem os emails"_. Notificação informa quem lê; a recusa intercepta
    // todo mundo, na hora, na tela em que a pessoa está. E é literalmente o que ele pediu
    // na primeira conversa: "indicar que a pessoa já está inscrita".
    //
    // ⚠️ ISTO É EXCEÇÃO AO FAIL-OPEN da inscrição ([[feedback_enrollment_fail_open]]), e só
    // se justifica porque os sinais que disparam são os FORTES (celular integral, nome
    // idêntico) e porque o erro tem saída: o "não sou eu" (dismissDuplicateSuspicion) apaga
    // a suspeita pros dois lados, e o ORGANIZADOR pode inscrever a pessoa direto — o gate
    // não vale pra quem inscreve OUTRA pessoa. Erro de detecção nunca deixa alguém de fora
    // sem caminho.
    let _dupSuspect = null;
    try {
      const _alvoUid0 = String((participantObj && participantObj.uid) || callerUid);
      const _euMesmo = _alvoUid0 === callerUid;   // organizador inscrevendo TERCEIRO passa
      if (_euMesmo) {
        const _pre = await docRef.get();
        if (_pre.exists) {
          const _d0 = await _detectarDuplicataNoTorneio(db, _alvoUid0, _pre.data());
          if (_d0) {
            const _tNome0 = (_pre.data() || {}).name || "";
            await _avisarDuplicataSuspeita(db, _alvoUid0, tournamentId, _tNome0, _d0);
            console.log(`[enrollParticipant] RECUSADO por duplicata: ${_alvoUid0} ~ ${_d0.uid} (${_d0.motivo}) em ${tournamentId}`);
            const _parts0 = Array.isArray((_pre.data() || {}).participants) ? _pre.data().participants : [];
            return {
              alreadyEnrolled: true,
              participants: _parts0,
              dupSuspect: {   // ⚠️ SEM uid e SEM contato cheio
                motivo: _d0.motivo, nome: _d0.nome,
                maskedEmail: _d0.maskedEmail, maskedPhone: _d0.maskedPhone,
                texto: _dupPerson.textoDaPergunta(_d0.nome, _d0.maskedEmail || _d0.maskedPhone, _d0.motivo, _d0.semelhanca),
              },
            };
          }
        }
      }
    } catch (e) { console.error("[enrollParticipant] porta de duplicata falhou (fail-open):", e && e.message); }

    /* ── TORNEIO DIVIDIDO: O ELENCO MORA FORA DO DOCUMENTO (2.0.120) ────────────
     * ⛔ Aqui era `computeEnroll(snap.data(), …)` direto. Num torneio dividido o campo
     * `participants` do doc é `[]` — o elenco está na subcoleção `inscritos`. Então a
     * conferência de LOTAÇÃO e de DUPLICATA rodava contra lista vazia (deixaria entrar
     * quem já estava dentro e ignoraria o limite de vagas), e o `tx.update` gravava o
     * novo inscrito num campo que a leitura sobrescreve com a subcoleção: a pessoa
     * entrava e sumia. Medido no Confra antes do conserto: 148 uids no doc, 148 docs em
     * `inscritos`, `participants: []` — ainda não tinha acontecido com ninguém.
     * ⚠️ `hidratar` roda ANTES de qualquer escrita: transação do Firestore lê tudo
     * primeiro. E ela LANÇA se uma parte não vier — decidir vaga com elenco vazio é pior
     * que falhar. [[project_teto_do_documento_e_arquitetura_de_dados]] */
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
      const _dados = await _splitParts.hidratar(tx, docRef, snap.data());
      const r = _enrollCore.computeEnroll(_dados, participantObj, extraUpdates, nowMs);
      if (r.updateData) _splitParts.gravar(tx, docRef, _dados, r.updateData);
      return r;
    });

    // Sandbox: a MESMA CF replica a inscrição no SB via o MESMO core (best-effort).
    await _replicateRosterToSandbox(db, tournamentId, function (sbData) {
      return _enrollCore.computeEnroll(sbData, participantObj, extraUpdates, nowMs);
    });

    // ── ESPELHO DO ROSTER (v1.7.40) ─────────────────────────────────────────
    // O dual-write da 1.7.29 (`tournaments/{id}/participants/{uid}`) existe pra ser a rede
    // contra perda de inscrito. Só que ele vivia SÓ no cliente (`_mirrorRoster`), e:
    //   (a) ele grava DELTA e a 1ª gravação de cada sessão apenas semeia a base
    //       (`if (!antes) return`) — a inscrição da própria pessoa costuma ser essa 1ª; e
    //   (b) a inscrição REAL passa por esta CF, que nunca o chamava.
    // MEDIDO em 05/ago: 116 docs no espelho para 119 pessoas — faltavam exatamente as três
    // que se inscreveram naquele dia. Um espelho que não recebe quem acabou de entrar não
    // protege justamente quem está mais exposto.
    // Espelhar aqui é escrever onde a escrita de verdade acontece ([[feedback_functions_must_mirror_app]]).
    // Best-effort: falhar aqui não desfaz a inscrição, que já está gravada.
    if (out.outcome === "enrolled" || out.outcome === "waitlisted") {
      try {
        const _alvo = String((participantObj && participantObj.uid) || "");
        if (_alvo) {
          await docRef.collection("participants").doc(_alvo).set({
            uid: _alvo,
            status: (out.outcome === "waitlisted") ? "waitlisted" : "enrolled",
            at: new Date().toISOString(),
            entry: _enrollCore.cleanUndefined(participantObj),
          }, { merge: true });
        }
      } catch (e) { console.error("[enrollParticipant] espelho do roster falhou:", e && e.message); }
    }

    if (out.outcome === "capacityFull") return { capacityFull: true, participants: out.participants };
    if (out.outcome === "already") return { alreadyEnrolled: true, participants: out.participants };
    if (out.outcome === "closed") return { alreadyEnrolled: false, enrollmentClosed: true, participants: out.participants };
    // v1.6.86: fase já sorteada → a pessoa entrou na LISTA DE ESPERA (não no roster).
    // No caminho normal o cliente já detecta e chama a espera direto; este ramo cobre a
    // CORRIDA (o sorteio disparou entre a checagem do cliente e a escrita do servidor),
    // que é exatamente como o caso do Confra nasceu — 57s de diferença.
    if (out.outcome === "waitlisted" || out.outcome === "alreadyWaitlisted") {
      return {
        alreadyEnrolled: false, waitlisted: true,
        alreadyWaitlisted: out.outcome === "alreadyWaitlisted",
        participants: out.participants, standbyParticipants: out.standbyParticipants || null
      };
    }
    return {
      alreadyEnrolled: false,
      participants: out.participants,
      autoCloseTriggered: !!out.autoClose,
      reachedCapacityDraw: !!out.reachedDraw
    };
  }
);


// "NÃO SOU EU" — a memória que impede a mesma pergunta em todo torneio novo.
//
// Nasceu do caso Nelson Barth: duas contas com nome IDÊNTICO que NÃO são a mesma pessoa (uma
// é a conta de teste do dono). Homônimo segue sendo sinal forte e a pergunta continua certa —
// o que não pode é ela voltar pra sempre depois de respondida.
//
// O cliente NÃO passa uid: ele não tem (a resposta da inscrição só traz o MASCARADO). O
// servidor redescobre o suspeito com a mesma função da detecção e grava dos DOIS lados —
// senão a outra conta faria a pergunta espelhada na próxima inscrição dela.
// Seguro escrever no perfil alheio aqui: o autoMergeOnProfileUpdate só age quando `phone` ou
// `email` mudam, e o enforceUniqueDisplayName só quando `displayName` muda.

// "NÃO SOU EU" no conflito de NOME: a pessoa escolhe um nome livre, e o app precisa (a) dizer
// se o que ela digitou está livre e (b) sugerir alternativas. Antes o servidor escolhia
// sozinho ("Nome 2") e a pessoa nem ficava sabendo — ver enforceUniqueDisplayName.
// Só devolve disponibilidade e sugestões: nenhum dado da outra conta sai daqui.
exports.checkDisplayNameAvailability = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const db = admin.firestore();

    const pedido = String((request.data && request.data.nome) || "").trim();
    const me = await db.collection("users").doc(callerUid).get();
    const meuNome = String(((me.exists && me.data()) || {}).displayName || "").trim();
    const minhaCidade = String(((me.exists && me.data()) || {}).city || "").trim();
    const base = pedido || meuNome;
    if (!base) return { livre: false, sugestoes: [] };

    const livre = async (n) => !(await _nameUnique.findDisplayNameConflict(db, n, callerUid));

    // Sugestões: primeiro a cidade (identifica de verdade), depois numéricas.
    const candidatos = [];
    if (minhaCidade) candidatos.push(base + " (" + minhaCidade + ")");
    for (let k = 2; k <= 6; k++) candidatos.push(_nameVariant.buildVariant(base, k));

    const sugestoes = [];
    for (const c of candidatos) {
      if (sugestoes.length >= 3) break;
      try { if (await livre(c)) sugestoes.push(c); } catch (e) { /* fail-open */ }
    }
    let ok = false;
    try { ok = pedido ? await livre(pedido) : false; } catch (e) { ok = false; }
    return { livre: ok, sugestoes };
  }
);

exports.dismissDuplicateSuspicion = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const tournamentId = String((request.data && request.data.tournamentId) || "");
    if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId é obrigatório");

    const db = admin.firestore();
    const snap = await db.collection("tournaments").doc(tournamentId).get();
    if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");

    const d = await _detectarDuplicataNoTorneio(db, callerUid, snap.data());
    if (!d) return { ok: true, nada: true };

    // ⚠️ O "NÃO SOU EU" GUARDA A FORÇA DO SINAL QUE FOI DISPENSADO (v1.8.3).
    // Regra do dono: _"anotar a resposta pra não ficar perguntando de novo sem dado novo.
    // se coloca o mesmo celular e autentica, daí funde mesmo tendo sido perguntado antes e
    // a pessoa deu que não. as pessoas às vezes não leem na pressa e fecham respondendo
    // não."_ Guardando só o uid, um toque apressado matava a suspeita PRA SEMPRE — inclusive
    // contra evidência muito mais forte que aparecesse depois. Com a força anotada, a
    // pergunta só volta quando surge algo estritamente mais forte (ver detectarMesmaPessoa).
    // `dupDismissed` (array de uid) CONTINUA sendo gravado: é o que o app publicado nas
    // lojas lê, e ele não tem auto-update. O array novo é ADITIVO.
    const FV = admin.firestore.FieldValue;
    const _forca = _dupPerson.forcaDoSinal(d.motivo, d.semelhanca);
    const _reg = (uid) => ({ uid: uid, forca: _forca, motivo: d.motivo,
                             semelhanca: d.semelhanca || null, at: new Date().toISOString() });
    await Promise.all([
      db.collection("users").doc(callerUid).set(
        { dupDismissed: FV.arrayUnion(d.uid), dupDismissedInfo: FV.arrayUnion(_reg(d.uid)) }, { merge: true }),
      db.collection("users").doc(d.uid).set(
        { dupDismissed: FV.arrayUnion(callerUid), dupDismissedInfo: FV.arrayUnion(_reg(callerUid)) }, { merge: true }),
    ]);
    console.log(`[dismissDuplicateSuspicion] ${callerUid} <-> ${d.uid} (${d.motivo}/${d.semelhanca || '-'}, força ${_forca}) — não são a mesma pessoa`);
    return { ok: true, dispensado: true };
  }
);

// ─── "NÃO SOU EU" NO CADASTRO (v1.8.3) ──────────────────────────────────────────
// A dismissDuplicateSuspicion exige tournamentId (ela redescobre o par dentro do torneio).
// No cadastro não há torneio: o par é redescoberto na BASE, pelo mesmo detector que gravou
// o sinal. O cliente NUNCA passa o uid do outro — ele nem o recebe.
exports.dismissDuplicateAccount = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const db = admin.firestore();
    const snap = await db.collection("users").doc(callerUid).get();
    if (!snap.exists) throw new HttpsError("not-found", "perfil não existe");

    const d = await _detectarDuplicataNaBase(db, callerUid, snap.data());
    const FV = admin.firestore.FieldValue;
    if (!d) {
      await db.collection("users").doc(callerUid).set({ dupSuspect: FV.delete() }, { merge: true });
      return { ok: true, nada: true };
    }
    // Anota COM a força do sinal: dado novo mais forte reabre a pergunta depois
    // ([[project_dismiss_reopens_on_stronger_signal]]).
    const forca = _dupPerson.forcaDoSinal(d.motivo, d.semelhanca);
    const reg = (uid) => ({ uid: uid, forca: forca, motivo: d.motivo,
                            semelhanca: d.semelhanca || null, at: new Date().toISOString() });
    await Promise.all([
      db.collection("users").doc(callerUid).set({
        dupDismissed: FV.arrayUnion(d.uid), dupDismissedInfo: FV.arrayUnion(reg(d.uid)),
        dupSuspect: FV.delete(),
      }, { merge: true }),
      db.collection("users").doc(d.uid).set({
        dupDismissed: FV.arrayUnion(callerUid), dupDismissedInfo: FV.arrayUnion(reg(callerUid)),
      }, { merge: true }),
    ]);
    console.log(`[dismissDuplicateAccount] ${callerUid} <-> ${d.uid} (${d.motivo}, força ${forca})`);
    return { ok: true, dispensado: true };
  }
);

/* ═══════════════════════════════════════════════════════════════════════════════
 * A PORTA ÚNICA DE ESCRITA FINA NO TORNEIO  (2.0.122)
 * Ordem do dono: _"tudo em CF apenas disparado pelo cliente"_.
 *
 * ⛔ POR QUE ELA PRECISA EXISTIR: o teto de 1 MB só cai movendo dado pra fora do
 * documento, e o cliente NÃO tem permissão de escrever subcoleção — nunca teve, por
 * decisão da 1.7.98 (quem espelha é a CF). Enquanto um campo for escrito pelo cliente, ele
 * não pode sair do documento: sairia e as escrituras cairiam no vazio, que foi exatamente
 * o buraco que a 2.0.120 fechou na inscrição.
 *
 * ⛔ E POR QUE ELA NÃO ABRE TRANSAÇÃO NO TORNEIO: marcar UMA presença já reescreveu o
 * torneio inteiro dentro de uma transação, e sob contenção elas se atropelam — medido:
 * update por CAMPO 25/25, transação do doc inteiro com falhas. A marca aparecia na tela e
 * o snapshot seguinte a removia. Aqui cada operação toca UM registro:
 *   • campo ainda no documento  → update por FieldPath (`checkedIn.<uid>`), sem
 *     read-modify-write, exatamente como o cliente fazia;
 *   • campo já em subcoleção    → escreve UM documento. Sem contenção nenhuma.
 * A leitura do torneio é um `get` simples, só pra autorizar — não participa da escrita.
 *
 * A tabela de quem-pode-o-quê mora em functions/partes-permissao.js: campo novo é LINHA
 * nova, não um `if` a mais aqui dentro. É allowlist — o que não está lá é negado.
 * [[project_dividir_exige_todo_escritor_ciente]] [[project_presenca_explicit_only]]
 * ═══════════════════════════════════════════════════════════════════════════════ */
exports.aplicarNoTorneio = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const ops = (request.data && Array.isArray(request.data.ops)) ? request.data.ops : [];
    if (!tournamentId) throw new HttpsError("invalid-argument", "sem tournamentId");
    if (!ops.length) return { aplicadas: 0, negadas: [] };
    if (ops.length > 200) throw new HttpsError("invalid-argument", "no máximo 200 operações por chamada");

    const docRef = db.collection("tournaments").doc(tournamentId);
    const snap = await docRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = snap.data();
    const fora = Array.isArray(t._semPesados) ? t._semPesados : [];

    /* ⛔ AUTORIZA TUDO ANTES DE ESCREVER QUALQUER COISA. Autorizar no meio do laço deixaria
     * metade aplicada quando a segunda metade é negada — e "metade aplicada" é um estado
     * que ninguém pediu e que a tela não sabe representar. */
    const negadas = [];
    ops.forEach((op, i) => {
      const r = _partesPerm.autoriza(t, callerUid, op);
      if (!r.ok) negadas.push({ i, parte: (op && op.parte) || null, motivo: r.motivo });
    });
    if (negadas.length) {
      console.warn("[aplicarNoTorneio]", tournamentId, callerUid, "negadas:", JSON.stringify(negadas));
      throw new HttpsError("permission-denied", negadas[0].motivo);
    }

    const FieldPath = admin.firestore.FieldPath;
    const FieldValue = admin.firestore.FieldValue;
    const lote = db.batch();
    /* ⛔ UM lote não pode tocar o MESMO documento duas vezes. Por isso os campos que ainda
     * moram no doc são acumulados e viram UMA chamada de update com todos os pares
     * caminho/valor — nunca um update por operação. */
    const paresDoDoc = [];
    let n = 0;
    ops.forEach((op) => {
      const parte = String(op.parte);
      const chave = String(op.chave);
      const apagar = (op.valor === null || op.valor === undefined);
      if (fora.indexOf(parte) !== -1) {
        // já mora fora: UM documento na subcoleção da parte. Zero contenção.
        const ref = docRef.collection(_tSplitFn.colecaoDaParte(parte)).doc(chave);
        if (apagar) lote.delete(ref);
        else lote.set(ref, { _idx: chave, _k: chave, item: op.valor });
      } else {
        // ainda no documento: update por FieldPath (`checkedIn.<uid>`) — o mesmo que o
        // cliente fazia, sem read-modify-write, pra não reintroduzir a contenção medida.
        paresDoDoc.push(new FieldPath(parte, chave), apagar ? FieldValue.delete() : op.valor);
      }
      n++;
    });
    paresDoDoc.push(new FieldPath('updatedAt'), new Date().toISOString());
    lote.update.apply(lote, [docRef].concat(paresDoDoc));
    await lote.commit();
    return { aplicadas: n, negadas: [] };
  }
);


exports.deenrollParticipant = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const userUid = String((request.data && request.data.userUid) || "");
    if (!tournamentId || !userUid) {
      throw new HttpsError("invalid-argument", "tournamentId e userUid são obrigatórios");
    }

    const db = admin.firestore();
    const docRef = db.collection("tournaments").doc(tournamentId);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
      // Torneio DIVIDIDO: o elenco mora na subcoleção. Hidrata ANTES de decidir —
      // sem isto as regras rodam contra `participants: []`. Ver functions/split-parts.js.
      const t = await _splitParts.hidratar(tx, docRef, snap.data());
      // Permissão: cada um sai de si mesmo; o organizador/co-host tira qualquer um.
      const adminEmails = Array.isArray(t.adminEmails) ? t.adminEmails.map((e) => String(e).toLowerCase()) : [];
      const isOrg = _isTournamentOrgCaller(t, callerUid);
      if (userUid !== callerUid && !isOrg) {
        throw new HttpsError("permission-denied", "só a própria pessoa ou o organizador podem desinscrever");
      }
      const r = _enrollCore.computeDeenroll(t, userUid);
      if (r.updateData) _splitParts.gravar(tx, docRef, t, r.updateData);
      return r;
    });

    // Sandbox: a MESMA CF replica a desinscrição no SB via o MESMO core (best-effort).
    await _replicateRosterToSandbox(db, tournamentId, function (sbData) {
      return _enrollCore.computeDeenroll(sbData, userUid);
    });

    if (out.outcome === "notFound") return { notFound: true, participants: out.participants };
    return { notFound: false, participants: out.participants };
  }
);

// Formar/desfazer DUPLA manual — MESMO padrão do enroll (item #2, roster→CF). A formação
// manual gravava via saveTournament direto (NÃO concorrência-safe, NÃO replicava pro SB → o
// Sandbox divergia do original ao formar duplas). Lógica pura em ./pair-core.js. Ver
// [[project_draw_client_to_cf_migration]] / [[project_sandbox_tournament]].
// Deploy:  firebase deploy --only functions:formPair,functions:splitPair
const _pairCore = require("./pair-core");

/* ⛔ SÓ UID — a porta ÚNICA de "quem é organizador" nas CFs principais.
 * Ordem do dono (26/ago): _"nada por nome ou email, sempre por uid a menos que seja
 * digitado por organizador e nao tenha uid. organizador sempre por uid."_
 *
 * Saíram daqui três caminhos por e-mail (`creatorEmail`, `organizerEmail`, `adminEmails`).
 * Todos davam poder de ORGANIZADOR a quem apresentasse uma string igual — e e-mail não
 * identifica ninguém: muda, se repete, e quem perde o acesso ao e-mail não perde a conta.
 * ⭐ MEDIDO ANTES DE TIRAR (scripts/conferir-admin-por-uid.js): 39 e-mails de admin na base
 * inteira, **39 cobertos por uid**, **0** torneios sem `creatorUid`. Não salvavam ninguém.
 * As `firestore.rules` já eram uid puro desde jul/2026 — as CFs é que ficaram para trás,
 * e aqui é pior: CF roda com admin SDK e não passa por regra nenhuma.
 * ⚠️ Admin legítimo que só exista por e-mail se conserta dando UID a ele (`adminUids`),
 * NUNCA reabrindo a porta.
 * ⚠️ `callerEmail` continua no argumento de propósito: 6 dos 8 chamadores passavam e-mail
 * e mudar a assinatura junto esconderia se algum deles ainda depende disso. */
function _isTournamentOrgCaller(t, callerUid) {
  if (!t || !callerUid) return false;
  if (t.creatorUid && t.creatorUid === callerUid) return true;
  if (Array.isArray(t.adminUids) && t.adminUids.indexOf(callerUid) !== -1) return true;
  const ch = Array.isArray(t.coHosts) ? t.coHosts : [];
  return ch.some((c) => c && c.uid === callerUid && (c.status === 'active' || c.status === 'accepted'));
}

exports.formPair = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const d = request.data || {};
    const opts = { uid1: d.uid1 || "", name1: d.name1 || "", uid2: d.uid2 || "", name2: d.name2 || "", changeRule: !!d.changeRule };
    if (!tournamentId || (!opts.uid1 && !opts.name1) || (!opts.uid2 && !opts.name2)) {
      throw new HttpsError("invalid-argument", "tournamentId e os dois membros são obrigatórios");
    }

    const db = admin.firestore();
    const docRef = db.collection("tournaments").doc(tournamentId);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
      // Torneio DIVIDIDO: o elenco mora na subcoleção. Hidrata ANTES de decidir —
      // sem isto as regras rodam contra `participants: []`. Ver functions/split-parts.js.
      const t = await _splitParts.hidratar(tx, docRef, snap.data());
      // Permissão: o organizador/co-host forma qualquer dupla; senão, o próprio (aceite de
      // convite) só pode formar dupla que INCLUA o seu uid.
      const isOrg = _isTournamentOrgCaller(t, callerUid, callerEmail);
      const involvesCaller = (opts.uid1 && opts.uid1 === callerUid) || (opts.uid2 && opts.uid2 === callerUid);
      if (!isOrg && !involvesCaller) {
        throw new HttpsError("permission-denied", "só o organizador ou um dos dois da dupla podem formá-la");
      }
      const r = _pairCore.computeFormPair(t, opts);
      if (r.updateData) _splitParts.gravar(tx, docRef, t, r.updateData);
      return r;
    });

    // Sandbox: a MESMA CF replica a formação no SB via o MESMO core (best-effort).
    await _replicateRosterToSandbox(db, tournamentId, function (sbData) {
      return _pairCore.computeFormPair(sbData, opts);
    });

    if (out.outcome === "alreadyPaired") {
      return { notFound: false, alreadyPaired: true, who: out.who || "", participants: out.participants };
    }
    if (out.outcome === "notFound") return { notFound: true, participants: out.participants };
    return { notFound: false, participants: out.participants, newName: out.newName };
  }
);

exports.splitPair = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    const callerEmail = ((request.auth && request.auth.token && request.auth.token.email) || "").toLowerCase();
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const tournamentId = String((request.data && request.data.tournamentId) || "");
    const d = request.data || {};
    const opts = { id1: d.id1, id2: d.id2 };
    if (!tournamentId || (opts.id1 == null || String(opts.id1) === "")) {
      throw new HttpsError("invalid-argument", "tournamentId e id1 são obrigatórios");
    }

    const db = admin.firestore();
    const docRef = db.collection("tournaments").doc(tournamentId);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
      // Torneio DIVIDIDO: o elenco mora na subcoleção. Hidrata ANTES de decidir —
      // sem isto as regras rodam contra `participants: []`. Ver functions/split-parts.js.
      const t = await _splitParts.hidratar(tx, docRef, snap.data());
      const r = _pairCore.computeSplitPair(t, opts);
      // Permissão: organizador/co-host desfaz qualquer dupla; senão, um MEMBRO da dupla.
      const isOrg = _isTournamentOrgCaller(t, callerUid, callerEmail);
      const isMember = r.outcome === "split" && (r.p1Uid === callerUid || r.p2Uid === callerUid);
      if (!isOrg && !isMember) {
        throw new HttpsError("permission-denied", "só o organizador ou um membro da dupla podem desfazê-la");
      }
      if (r.updateData) _splitParts.gravar(tx, docRef, t, r.updateData);
      return r;
    });

    // Sandbox: a MESMA CF replica o desfazer no SB via o MESMO core (best-effort).
    await _replicateRosterToSandbox(db, tournamentId, function (sbData) {
      return _pairCore.computeSplitPair(sbData, opts);
    });

    if (out.outcome === "notFound") return { notFound: true, participants: out.participants };
    return { notFound: false, participants: out.participants };
  }
);

// ── Convite de CO-ORGANIZAÇÃO / TRANSFERÊNCIA → CF ────────────────────────────
// Aceitar convite estava 100% QUEBRADO no cliente (permission-denied determinístico):
// o aceite promove o co-host a 'active', o que MUDA adminUids, e a regra
// isCoHostAcceptanceDiff só permitia hasOnly(['coHosts','adminEmails']) — mas quem aceita
// AINDA NÃO é admin, então nenhuma cláusula cobria. Sentry SCOREPLACE-WEB-6R.
// A transferência, além disso, não conferia se quem aceitava era o DESTINATÁRIO.
// Aqui roda no Admin SDK: a regra deixa de ser o gate, esta função é.
// IDENTIDADE = UID SEMPRE (nunca e-mail/nome/telefone). Lógica pura em ./cohost-core.js.
// Deploy:  firebase deploy --only functions:respondHostInvite
const _coHostCore = require("./cohost-core");

exports.respondHostInvite = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");

    const d = request.data || {};
    const tournamentId = String(d.tournamentId || "");
    const inviteType = String(d.inviteType || "");
    const action = String(d.action || "");
    if (!tournamentId) throw new HttpsError("invalid-argument", "tournamentId é obrigatório");
    if (inviteType !== "cohost" && inviteType !== "transfer") {
      throw new HttpsError("invalid-argument", "inviteType deve ser cohost ou transfer");
    }
    if (action !== "accept" && action !== "reject") {
      throw new HttpsError("invalid-argument", "action deve ser accept ou reject");
    }

    // Perfil do caller (para preencher os campos DERIVADOS de exibição na transferência —
    // a identidade continua sendo só o uid).
    let callerEmail = ((request.auth.token && request.auth.token.email) || "").toLowerCase();
    let callerName = (request.auth.token && request.auth.token.name) || "";
    const db = admin.firestore();
    try {
      const u = await db.collection("users").doc(callerUid).get();
      if (u.exists) {
        const ud = u.data() || {};
        callerEmail = String(ud.email || callerEmail || "").toLowerCase();
        callerName = ud.displayName || callerName || "";
      }
    } catch (_e) { /* perfil é só display; nunca derruba a resposta ao convite */ }

    const docRef = db.collection("tournaments").doc(tournamentId);
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
      // Torneio DIVIDIDO: o elenco mora na subcoleção. Hidrata ANTES de decidir —
      // sem isto as regras rodam contra `participants: []`. Ver functions/split-parts.js.
      const t = await _splitParts.hidratar(tx, docRef, snap.data());
      const r = _coHostCore.computeRespondHostInvite(t, callerUid, inviteType, action);
      if (r.outcome !== "applied" || !r.updateData) return r;

      const upd = Object.assign({}, r.updateData);
      // Transferência aceita: quem assume vira o organizador também nos campos de exibição.
      if (inviteType === "transfer" && action === "accept") {
        upd.organizerEmail = callerEmail || "";
        upd.organizerName = callerName || "";
        upd.creatorEmail = callerEmail || "";
        // adminEmails recomputado com o e-mail novo do organizador (campo derivado).
        upd.adminEmails = _coHostCore.computeAdminEmails(
          Object.assign({}, t, upd, { coHosts: upd.coHosts })
        );
      }
      upd.updatedAt = new Date().toISOString();
      _splitParts.gravar(tx, docRef, t, upd);
      return r;
    });

    if (out.outcome !== "applied") return { notFound: true };
    return {
      notFound: false, applied: true,
      inviteType, action,
      tournamentName: out.tournamentName || "",
      orgUid: out.orgUid || "",
      fromUid: out.fromUid || ""
    };
  }
);

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
    const isOrg = _isTournamentOrgCaller(t, callerUid);
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
// e-mail digest).
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

    // Sandbox/killswitch: torneio com notificações mudas não dispara comunicado.
    if (t && (t.isSandbox === true || t.notificationsMuted === true)) {
      return { ok: true, muted: true, sent: 0 };
    }

    // Autorização: só organizador / co-organizador.
    const adminEmails = Array.isArray(t.adminEmails) ? t.adminEmails.map((e) => String(e).toLowerCase()) : [];
    const coHostUids = Array.isArray(t.coHosts)
      ? t.coHosts.filter((c) => c && c.status === "active").map((c) => String(c.uid || "")) : [];
    const isOrg = _isTournamentOrgCaller(t, callerUid);
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
    let platformWritten = 0;
    const skipped = [];
    // v2.4.63: manifesto por destinatário pro painel de controle de comunicados.
    // Cada item: { uid, name, notifDocId, platform, email }.
    // "platform/email" = canal foi DISPARADO pra essa pessoa. A leitura (abriu) é
    // computada on-demand em getCommunicationStats (lê a notif), então o manifesto
    // é imutável — só registra o que foi enviado e por onde.
    // v1.2.9: o canal WhatsApp saiu — ver project_whatsapp_meta_2fa_block.
    const recipientDetails = [];

    // Resolve a PESSOA VIVA do inscrito → { uid, profile }, ou null.
    //
    // Passa pela porta nos DOIS caminhos, e o do uid não é zelo à toa: o inscrito guarda o
    // uid do dia da inscrição, e se a conta dele foi fundida depois esse uid virou LÁPIDE —
    // o doc ainda existe (`exists` é true), então o código antigo achava que tinha achado a
    // pessoa e mandava o comunicado pra uma caixa que ninguém abre. Custo zero: a porta lê o
    // mesmo `users/{uid}` que a linha seguinte já lia, e devolve o perfil junto.
    async function _resolvePessoa(r) {
      if (r.uid) return await _userVivo.userVivo(db, String(r.uid));
      if (!r.email) return null;
      // limit(8) porque o e-mail casa a lápide E o sobrevivente; a porta colapsa os dois.
      const snap = await db.collection("users").where("email", "==", r.email).limit(8).get();
      return await _userVivo.userVivo(db, snap);
    }

    // Concorrência limitada (chunks de 20) — rápido mesmo com centenas.
    const CHUNK = 20;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const slice = recipients.slice(i, i + CHUNK);
      await Promise.all(slice.map(async (r) => {
        try {
          const _pessoa = await _resolvePessoa(r);
          // Sem uid nem e-mail não havia por onde procurar; com um deles e sem resultado, o
          // doc sumiu ou a corrente de lápide está quebrada — nos dois casos não há conta
          // viva a quem entregar, e mandar pro uid morto seria pior que registrar o pulo.
          if (!_pessoa) {
            skipped.push({ uid: r.uid || "", email: r.email, reason: (r.uid || r.email) ? "no-user" : "no-uid" });
            return;
          }
          const uid = _pessoa.uid;
          const profile = _pessoa.data || {};
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
          // Canal externo: e-mail (digest).
          // v2.4.86: guarda o endereço de e-mail no manifesto pra o painel
          // poder casar com bounces (delivery.state==='ERROR' na coleção `mail`)
          // e rebaixar o ✓✓ presumido só quando há negativa real de entrega.
          if (profile.notifyEmail !== false && profile.email) { emails.push(profile.email); detail.email = true; detail.emailAddr = String(profile.email).toLowerCase(); }
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

    // v1.2.9: a fila de WhatsApp saiu (número banido, portfólio Meta morto — ver
    // project_whatsapp_meta_2fa_block). O comunicado do organizador vai por
    // notificação in-app + e-mail. Sem canal, enfileirar só acumulava doc com
    // status:failed e mentia no painel ("enviado por WhatsApp").

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
        counts: {
          platformSent: recipientDetails.filter((d) => d.platform).length,
          emailSent: emails.length,
        },
        recipients: recipientDetails,
      });

    console.log("[sendOrgCommunication] torneio", tournamentId, "| comm", commRef.id,
      "| plataforma:", platformWritten, "| emails:", emails.length,
      "| pulados:", skipped.length);
    return {
      ok: true, commId: commRef.id,
      platform: platformWritten, emails: emails.length, phones: 0, skipped: skipped.length,
    };
  }
);

// ─── Estatísticas de um comunicado (painel de controle do organizador) ──────
// v2.4.63: computa on-demand a partir do manifesto imutável em
// tournaments/{tId}/communications/{commId}:
//   • plataforma: lê a notificação de cada destinatário → read? = "abriu".
//   • email: só "enviado" (entrega/abertura por e-mail não é rastreada nesta v1).
// v1.2.9: a perna de WhatsApp saiu. Comunicados ANTIGOS (pré-1.2.9) ainda têm
// whatsappQueueId/counts.whatsappSent no manifesto — o painel os lê como 0, que é
// a verdade: sem canal, nada foi entregue.
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
    const isOrg = _isTournamentOrgCaller(t, callerUid);
    if (!isOrg) throw new HttpsError("permission-denied", "só o organizador pode ver os comunicados");

    const cSnap = await db.collection("tournaments").doc(tournamentId)
      .collection("communications").doc(commId).get();
    if (!cSnap.exists) throw new HttpsError("not-found", "comunicado não existe");
    const comm = cSnap.data();
    const recips = Array.isArray(comm.recipients) ? comm.recipients : [];

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
    let platformOpened = 0;
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
    const isOrg = _isTournamentOrgCaller(t, callerUid);
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
        },
      });
    });
    return { ok: true, communications: list };
  }
);

// v2.6.x: API key de SERVIDOR (restrita à Identity Toolkit API, SEM restrição de
// referer/IP) usada pra verificar senha server-side via accounts:signInWithPassword.
// A web key tem restrição de referer e dá 403 quando chamada do servidor. Criar:
//   gcloud services api-keys create --display-name=scoreplace-server-signin \
//     --api-target=service=identitytoolkit.googleapis.com
// e setar: firebase functions:secrets:set SIGNIN_API_KEY
const SIGNIN_API_KEY = defineSecret("SIGNIN_API_KEY");


// Sanitiza telefone pra E.164 sem '+'. Aceita "+55 11 99999-8888",
// "55 11 99999-8888", "11 99999-8888", "(11) 99999-8888". Sempre normaliza
// pra "5511999998888". Usado pelo login/verificação por celular (SMS).
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


// ─── Autenticação por celular no gate de verificação (v2.4.24) ───────────────
// Alternativa pro usuário cujo e-mail de confirmação não chega (ex.: UOL filtra
// e-mail transacional). Em vez de depender do link no e-mail, a pessoa confirma
// a conta provando que controla um telefone, via SMS:
//   • SMS  → Firebase linkWithPhoneNumber (código do Firebase, digitado no app).
//            O cliente faz o confirm() e depois chama verifyPhoneGate({afterPhoneLink:true}).
// v1.2.9: o canal WhatsApp (código próprio + botão ?gv=) saiu — ver
// project_whatsapp_meta_2fa_block. Sobrou o SMS.
// O caminho marca emailVerified=true (server-side, só Admin pode) e salva
// o telefone no perfil. O telefone é a prova de identidade — não há e-mail no loop.

// Aplica a verificação: marca o e-mail como confirmado no Auth e grava o
// telefone (E.164 com '+') no perfil.
async function _applyGateVerification(uid, phoneE164) {
  await admin.auth().updateUser(uid, { emailVerified: true });
  const update = { emailVerified: true, updatedAt: new Date().toISOString() };
  if (phoneE164) { update.phone = phoneE164; update.phoneCountry = "55"; }
  await admin.firestore().collection("users").doc(uid).set(update, { merge: true });
}


// Verifica o vínculo do telefone: { afterPhoneLink:true } → o SMS do Firebase já
// foi confirmado no cliente (linkWithPhoneNumber.confirm). Só confirmamos que o
// provider phone está vinculado e marcamos o e-mail.
// v1.2.9: o modo { code } (código que ia pelo WhatsApp) saiu com o canal.
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

    if (!data.afterPhoneLink) return { ok: false, reason: "no-phone-link" };
    const u = await admin.auth().getUser(uid);
    const hasPhone = !!u.phoneNumber ||
      (u.providerData || []).some((p) => p && p.providerId === "phone");
    if (!hasPhone) return { ok: false, reason: "phone-not-linked" };
    await _applyGateVerification(uid, u.phoneNumber || null);
    await db.collection("gateVerifications").doc(uid).delete().catch(() => {});
    console.log("[verifyPhoneGate] SMS OK, verified uid:", uid);
    return { ok: true };
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
// conta. Canal: SMS → Firebase signInWithPhoneNumber no cliente (prova via
// idToken). v1.2.9: o canal WhatsApp saiu — ver project_whatsapp_meta_2fa_block.
// Verificado, marca emailVerified=true e devolve um custom token da conta do
// e-mail pra logar e gravar a nova senha (updatePassword).

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
      const p = snap.data() || {};
      // ⛔ v1.9.97 — CELULAR REGISTRADO PELO ORGANIZADOR NÃO RECUPERA CONTA.
      // Aqui o telefone é CREDENCIAL: quem prova posse dele define uma senha nova. Um
      // número que a própria pessoa nunca confirmou por SMS pode ser de terceiro (erro
      // de digitação do organizador) — e aí o SMS de recuperação cairia no celular de
      // um estranho, que só precisaria saber o e-mail pra tomar a conta.
      // O organizador registra CONTATO; identidade continua sendo prova de posse.
      if (_contactPhone.isIdentityPhone(p)) return p.phone;
    }
  } catch (e) { /* ignore */ }
  return (userRecord && userRecord.phoneNumber) || null;
}

// v1.2.9: o canal WhatsApp saiu (número banido, portfólio Meta morto — ver
// project_whatsapp_meta_2fa_block). Esta função NÃO envia mais nada: ela valida
// que o celular digitado é mesmo o da conta e grava o PENDENTE. Quem entrega o
// código é o SMS do Firebase, disparado no cliente (signInWithPhoneNumber), e a
// prova volta como idToken pra verifyPasswordResetPhone. O pendente continua
// obrigatório — sem ele o verify devolve "no-pending" e o reset por SMS morre.
exports.sendPasswordResetPhone = onCall(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 30,
    cors: APP_ORIGINS,
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

    const phoneE164 = "+" + phoneDigits;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    const db = admin.firestore();
    try {
      await db.collection("passwordResetPhone").doc(userRecord.uid).set({
        uid: userRecord.uid, email, phone: phoneE164, attempts: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(), expiresAt,
      });
    } catch (err) {
      console.error("[sendPasswordResetPhone] store failed:", err.code || err.message);
      return { ok: false, reason: "store-error" };
    }

    console.log("[sendPasswordResetPhone] pendente gravado pra", phoneDigits, "uid:", userRecord.uid, "— entrega via SMS no cliente");
    return { ok: true };
  }
);

// Marca a verificação como aprovada e devolve um custom token da conta do
// e-mail. v1.2.9: o param `token` (doc em passwordResetTokens, consumido pelo
// botão ?pr= do WhatsApp) saiu junto com o canal WhatsApp — sobrou o caminho do
// SMS, que não usa token intermediário.
async function _approvePasswordResetPhone(uid, phoneE164) {
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
  return customToken;
}

// Verifica a prova do SMS do Firebase: { email, idToken } — idToken da sessão de
// telefone criada por signInWithPhoneNumber no cliente. Confere se o phone_number
// do token bate com o pendente gravado por sendPasswordResetPhone.
// v1.2.9: o caminho { email, code } (código de 6 dígitos que ia pelo WhatsApp)
// saiu — sem canal WhatsApp, ninguém nunca recebia esse código.
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

    if (!data.idToken) return { ok: false, reason: "no-idtoken" };
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
    const ct = await _approvePasswordResetPhone(uid, v.phone || null);
    console.log("[verifyPasswordResetPhone] SMS ok, uid:", uid);
    return { ok: true, customToken: ct, email };
  }
);

// ⚠️ NOME ENGANOSO (legado): apesar do "Phone", esta função é o backend do link
// `?pr=TOKEN` que vai POR E-MAIL. Ela nasceu na v2.4.97 pro botão do WhatsApp, mas
// a v2.6.x fez o e-mail de "Esqueci minha senha" usar o MESMO wrapper — o `?pr=` é
// o link canônico do reset por e-mail (wrapper em vez do oobCode cru do Firebase,
// que os scanners anti-phishing consumiam antes do clique → "link expirado").
// Emissores VIVOS do token: sendPasswordReset (e-mail) e dispatchAccountRecovery
// (e-mail). NÃO remover junto com o WhatsApp: derruba o reset de senha por e-mail.
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
    const ct = await _approvePasswordResetPhone(t.uid, t.phone || null);
    // v1.2.9: _approvePasswordResetPhone não apaga mais o token (o param saiu com o
    // canal WhatsApp) — quem consome apaga. Uso único preservado.
    await ref.delete().catch(() => {});
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
      // ⚠️ limit(8) + porta, não limit(1) + docs[0]: a lápide guarda o MESMO e-mail do
      // sobrevivente, e sem ordenação o Firestore pode entregar justamente a morta. O que
      // acontecia então NÃO era mandar login pra conta errada — o Auth da absorvida foi
      // apagado na fusão, então o `getUser` de quem chama aqui falhava e a resposta virava
      // "conta não encontrada" pra uma pessoa que EXISTE. Um erro vira o outro, e o de
      // agora é pior de diagnosticar.
      const snap = await db.collection("users").where(t.f, t.op, t.v).limit(8).get();
      const uid = await _userVivo.uidVivo(db, snap);
      if (uid) return uid;   // sem conta viva nesta tentativa → tenta a próxima
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
      // Mesma razão do _uidByProfileEmail: o telefone é o campo que MAIS repete entre lápide
      // e sobrevivente (o caso da base — M. Delia Fernandez — são dois docs com o mesmo
      // +5511996019191). Ver a nota lá.
      const snap = await db.collection("users").where(t.f, t.op, t.v).limit(8).get();
      const uid = await _userVivo.uidVivo(db, snap);
      if (uid) return uid;   // sem conta viva nesta tentativa → tenta a próxima
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

    // v1.6.x: NOME ÚNICO ENTRE UIDS, agora no SERVIDOR (name-unique-core.js).
    // A regra só existia no cliente (isDisplayNameTaken) e esta CF gravava direto —
    // foi assim que nasceu a segunda "Gabriela Ferreira" (02/ago/2026), inscrita 2x
    // no mesmo torneio. Homônimo em cadastro por celular é quase sempre a MESMA
    // pessoa: REJEITA apontando a conta existente (mascarada) — nunca auto-sufixa.
    if (displayName) {
      const conflict = await _nameUnique.findDisplayNameConflict(admin.firestore(), displayName, uid);
      if (conflict) {
        console.log("[registerPhonePassword] displayName em conflito com uid:", conflict.uid);
        throw new HttpsError("already-exists", _nameUnique.buildConflictMessage(conflict));
      }
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
    // displayName_lower JUNTO do displayName (contrato do saveUserProfile do cliente) —
    // sem ele a conta fica invisível pra própria checagem de unicidade.
    if (displayName) _nameUnique.denormalizeDisplayName(prof, displayName);
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

// Recuperação automática (senha errada/ausente): dispara o e-mail de redefinição,
// com cooldown de 10 min/conta. v1.2.9: a perna de WhatsApp saiu (canal morto).
exports.dispatchAccountRecovery = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 45,
    cors: APP_ORIGINS },
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
      // v1.2.10: `phone` SEMPRE null — esta função não tem canal de celular (a perna
      // era 100% WhatsApp e saiu na v1.2.9; ver comentário na perna de e-mail abaixo).
      // O caminho normal já devolve phone:null via `out`; só o throttled continuava
      // mandando o número mascarado, e o cliente renderiza isso como "enviamos por
      // SMS (••) •••••-••11". Ou seja: quem tocasse 2x em 10 min — justo quem não
      // recebeu o e-mail — ficava esperando um SMS que nunca foi enviado.
      return { ok: true, throttled: true,
        channels: { email: realEmail ? _maskEmail(realEmail) : null, phone: null } };
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

    // v1.2.9: a perna do CELULAR saiu junto com o WhatsApp (número banido, portfólio
    // Meta morto — ver project_whatsapp_meta_2fa_block). Ela era 100% WhatsApp: só
    // marcava out.phone se o envio desse certo, e este fluxo não tem perna de SMS,
    // então sem o canal ela gravava um pendente que ninguém consumia e não entregava
    // nada. A recuperação segue pelo e-mail. Quem só tem celular usa "Esqueci minha
    // senha" → sendPasswordResetPhone (pendente) + SMS do Firebase no cliente.

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

    // v1.2.9 — DEFESA EM PROFUNDIDADE contra o sequestro de conta (provado no emulador em
    // 15/jul/2026). Esta função dá um CUSTOM TOKEN do uid apontado por `mergedInto`, ou
    // seja, trata um campo do perfil como PROVA. As rules agora impedem o cliente de
    // escrevê-lo (tests/rules-privileged-fields.test.js), mas confiar SÓ nelas é frágil:
    // uma regressão numa rule volta a abrir a conta de todo mundo, silenciosamente.
    // `mergedAt` só existe via serverTimestamp() do Admin SDK nos writes de merge — um
    // tombstone forjado (ou legado) não tem Timestamp aqui, e sem prova não há token.
    const _mergedAt = snap.data().mergedAt;
    if (!_mergedAt || typeof _mergedAt.toDate !== "function") {
      console.warn("[resolveMergedLogin] mergedInto SEM mergedAt(Timestamp) em " + uid +
        " → tombstone não foi escrito pelo servidor. Token NEGADO.");
      return { merged: false };
    }
    // Segue a cadeia (caso o sobrevivente também tenha sido mesclado depois) pela PORTA.
    // ⚠️ O laço à mão que morava aqui tinha um buraco provado: ele parava no 5º salto e
    // seguia usando `target` — que numa corrente mais longa AINDA É LÁPIDE. Como
    // createCustomToken não confere se o uid existe, o desfecho era emitir credencial de uma
    // conta morta. Ciclo (A→B→A) dava no mesmo: girava até o guard e caía com lápide na mão.
    // A porta recusa os dois casos, e recusar é o certo — sem conta viva não há a quem logar.
    // `snap` entra direto (a porta aceita DocumentSnapshot), então não há releitura.
    const _alvo = await _userVivo.uidVivo(db, snap);
    if (!_alvo || _alvo === uid) return { merged: false };
    const target = _alvo;
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


// v1.2.9 — LOGIN COM A CREDENCIAL DA CONTA ABSORVIDA.
//
// Quando duas contas do MESMO tipo são fundidas (duas Google, p.ex.), a credencial do
// absorvido não migra: o Firebase não põe dois provedores do mesmo tipo numa conta, e a conta
// dele foi apagada. A pessoa clica "Entrar com Google", escolhe aquele e-mail, o Google
// autentica e o Firebase **cria uma conta nova e vazia** — uma duplicata. O resolveMergedLogin
// não cobre: ele exige logar na conta que tem o tombstone, e essa não existe mais.
//
// Aqui o merge deixou `loginRedirects/{email|phone}` → dono. Esta função troca a conta vazia
// recém-criada pela conta certa, via custom token. Pedido do dono (jul/2026): "o mecanismo que
// resolve o login já vê que a conta se relaciona com a outra e faz o login pela outra sem o
// usuário ter que se preocupar se entra com uma ou com outra".
//
// SEGURANÇA — de onde vem cada coisa importa:
//   • o identificador vem do TOKEN (request.auth.token), verificado pelo provedor — nunca
//     do corpo da chamada, que o cliente controla;
//   • o dono vem de `loginRedirects`, que só o Admin SDK escreve (rules: deny-all). Usar
//     `linkedEmails`/`email` do perfil seria um sequestro pronto: o cliente escreve esses
//     campos e poderia reivindicar o e-mail de outro. Ver
//     [[project_privileged_fields_never_client_writable]];
//   • só age em conta SEM perfil — quem já tem perfil é dono de si e segue o fluxo normal.
exports.resolveLoginRedirect = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login obrigatório");
    const db = admin.firestore();
    const tok = (request.auth && request.auth.token) || {};

    // 1) Conta com perfil é dona de si — nunca redireciona.
    const own = await db.collection("users").doc(uid).get();
    if (own.exists && !own.data().mergedInto) return { redirected: false, reason: "has_profile" };

    // 2) Chaves candidatas, SÓ do token verificado.
    const keys = [];
    if (tok.email && tok.email_verified === true) keys.push(String(tok.email).toLowerCase());
    if (tok.phone_number) keys.push(String(tok.phone_number));
    if (!keys.length) return { redirected: false, reason: "no_verified_identifier" };

    // 3) Acha o dono na fonte confiável.
    let target = null;
    for (const k of keys) {
      const snap = await db.collection("loginRedirects").doc(k).get();
      if (snap.exists && snap.data().ownerUid) { target = snap.data().ownerUid; break; }
    }
    if (!target || target === uid) return { redirected: false, reason: "no_redirect" };

    // 4) O dono também pode ter sido mesclado depois — segue a cadeia pela PORTA (mesma
    // regra do resolveMergedLogin; o laço à mão que morava aqui parava no 5º salto e podia
    // sair com uma lápide na mão. Aqui o getUser do passo 5 mascarava o defeito, mas
    // recusar por "conta viva não encontrada" é mais honesto que por "Auth sumiu").
    target = await _userVivo.uidVivo(db, String(target));
    if (!target) return { redirected: false, reason: "owner_gone" };
    if (target === uid) return { redirected: false, reason: "self" };

    // 5) A conta de destino tem que estar viva no Auth.
    try { await admin.auth().getUser(target); }
    catch (e) { return { redirected: false, reason: "owner_auth_gone" }; }

    let customToken;
    try {
      customToken = await admin.auth().createCustomToken(target, { source: "login_redirect" });
    } catch (err) {
      console.error("[resolveLoginRedirect] createCustomToken falhou:", err.code || err.message);
      throw new HttpsError("internal", "não foi possível redirecionar o login");
    }

    // 6) Limpa a conta vazia recém-criada pelo provedor. Só depois do token na mão, e só
    //    porque ela não tem perfil (nada a perder). Se falhar, o redirect segue — a conta
    //    órfã fica pro cleanupAbandonedAuth.
    try { await admin.auth().deleteUser(uid); }
    catch (e) { console.warn("[resolveLoginRedirect] deleteUser(órfã) falhou:", e.code || e.message); }

    console.log(`[resolveLoginRedirect] ${uid} (conta vazia) → ${target} via ${keys.join("|")}`);
    return { redirected: true, survivorUid: target, customToken };
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
              /* ⛔ SÓ UID (cânone do dono, 26/ago). Isto contava vitória comparando o
               * campeão por NOME ou por E-MAIL — dois xarás dividiam troféu, e quem
               * trocasse o nome perdia o dele. `winnerUid`/`winnerUids` já são carimbados
               * no jogo desde a 2.0.1 ("o vencedor deixa de ser um NOME").
               * ⚠️ Medido: ZERO torneios têm `t.winner` hoje, então este ramo já não
               * disparava pra ninguém — trocar não tira troféu de ninguém. */
              const _wUids = Array.isArray(t.winnerUids) ? t.winnerUids
                : (t.winnerUid ? [t.winnerUid] : []);
              if (_wUids.indexOf(uid) !== -1) {
                stats.tournamentWins++;
              }
            }
            // Organizer with 10+ participants
            /* ⛔ SÓ UID. ⚠️ E aqui `t.organizerUid` NÃO EXISTE em torneio nenhum
             * (medido: 0 de 39) — ou seja o único caminho que funcionava de verdade era o
             * e-mail, e tirar sem trocar zeraria a conquista pra todo mundo.
             * O campo que existe é `creatorUid` (39 de 39) + `adminUids`. */
            if (t.creatorUid === uid ||
                (Array.isArray(t.adminUids) && t.adminUids.indexOf(uid) !== -1)) {
              const count = (t.participants && t.participants.length) || 0;
              if (count >= 10) stats.tournamentsWithTenPlus++;
            }
          });
        })
        .catch(() => {})
    ] : []),

    // Tournaments created
      /* ⛔ CONSULTA POR UID (cânone do dono, 26/ago). `organizerEmail` como chave de busca
       * tem dois defeitos: (a) acha torneio de quem TEVE aquele e-mail um dia, e (b) não
       * acha nada de quem entrou por telefone (sem e-mail). `creatorUid` existe em 39 de
       * 39 torneios da base — medido. `organizerUid` fica na lista por precaução mas NÃO
       * existe em torneio nenhum (0 de 39). */
    ...(uid ? [
      db.collection("tournaments")
        .where("creatorUid", "==", uid)
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

// ─── EXCLUSÃO DE CONTA — CÂNONE NO SERVIDOR (v1.2.8) ─────────────────────────
// Antes isto rodava no CLIENTE (auth.js `_executeDeleteAccount`, ~13 escritas do celular
// da pessoa). Três problemas, todos reais:
//   1. VERSÃO: cada usuário rodava a lógica do app que tinha em cache — o filtro lá era
//      solo-only (p.uid/p.email) e não via membro de DUPLA, então a conta sumia e a
//      inscrição ficava órfã (caso Michelle). Com iOS/Android nas lojas, uma versão velha
//      pode viver meses no aparelho. Aqui, a regra é uma só pra todo mundo, sempre.
//   2. PERMISSÃO: o cliente precisa que as RULES autorizem mexer em torneio de terceiro.
//      checkedIn/absent/vips/votos NÃO estão em isEnrollmentOnlyDiff → o Firestore negava,
//      o catch engolia, e a conta era apagada deixando lixo. Admin SDK ignora rules.
//   3. ATOMICIDADE: 13 escritas do celular; rede caindo no meio = conta apagada com
//      inscrições vivas — o órfão que caçamos o dia inteiro.
//
// REGRA DO DONO (jul/2026): "onde estiver o uid, merja ou exclui. TUDO" + "mantém
// resultados com conta excluída".
//
// O QUE APAGA vs O QUE MANTÉM:
//   • users/{uid} → vira TOMBSTONE MÍNIMO { deleted: true, deletedAt }. Sem nome, e-mail,
//     telefone, foto, aniversário, amigos. O uid sobra como âncora ANÔNIMA: string opaca
//     que não liga a pessoa nenhuma (é o que a página pública chama de "registros que não
//     identificam você"). O tombstone é o que deixa a UI dizer "Conta excluída" em vez de
//     "Jogador sem perfil" (que é o rótulo de uid órfão por DEFEITO, não por escolha).
//   • torneio SEM sorteio → a inscrição sai inteira (ninguém depende dela).
//   • torneio COM jogos → a entrada FICA, reduzida a { uid, deleted }. Sem isto o placar e
//     a classificação DOS ADVERSÁRIOS mudariam retroativamente. É a decisão do dono.
//     Os nomes gravados nos slots (m.p1/team1[]) são limpos — nome é dado pessoal.
//   • friends[] de OUTRAS pessoas → o uid sai (senão elas ficam com amigo fantasma).
//   • presences, notificações, torneios que ela organizou → apagados.
//
// Iniciais ("E. M.") foram descartadas de propósito: num torneio pequeno, iniciais + data +
// adversários re-identificam a pessoa — é pseudonimização, e a LGPD trata isso como dado
// pessoal. A página pública promete anonimizar, então "Conta excluída" é o que cumpre.
exports.deleteAccount = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 540, cors: APP_ORIGINS },
  async (request) => {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw new HttpsError("unauthenticated", "login obrigatório");
    const db = admin.firestore();
    const out = { uid, tournamentsLeft: 0, tournamentsAnonymized: 0, tournamentsDeleted: 0,
      friendsCleaned: 0, presencesDeleted: 0, notificationsDeleted: 0, casualLeft: 0 };

    /* ⛔ 9ª auditoria (ponto 2): FASE E LOCK ANTES DA PRIMEIRA ESCRITA.
     * A ordem anterior era: conferir torneios → APAGAR os organizados → REESCREVER os que
     * participa → só então conferir a fase e adquirir `deleting`. Ou seja, "em manutenção o
     * delete nem começa" era falso: ele já tinha destruído torneios. E um merge concorrente
     * só disputava o uid DEPOIS disso.
     * Agora: fase → lock → revalidar sob o lock → guard SÓ-LEITURA → e só então escrever.
     * Se o guard recusar, o lock é liberado e NADA foi escrito. */
    await _amizadeFase.exigirLiberado(db, HttpsError, "deleteAccount");

    /* ⛔ 11ª auditoria (ponto 1): A RETOMADA VEM ANTES DO LOCK.
     * Se uma tentativa anterior gravou o tombstone e o `deleteUser` falhou, o lifecycle
     * ficou TERMINAL (`deleted`) — e `adquirir` recusa terminal, por desenho. Ou seja: com
     * a retomada dentro do lock, ela nunca era alcançada e a pessoa ficava presa com
     * profile morto e login vivo.
     * Aqui não há o que coordenar: os dados já foram destruídos e a autoridade de amizade
     * já foi limpa na tentativa anterior. Falta UM passo, no Auth. Nada de torneios,
     * amizades ou presenças é repetido. */
    {
      const _pre = await db.collection("users").doc(uid).get();
      const _pd = _pre.exists ? (_pre.data() || {}) : null;
      if (_pd && (_pd.deleted === true || _pd.deletedAt)) {
        let _authVivo = false;
        try { await admin.auth().getUser(uid); _authVivo = true; } catch (e) {}
        if (!_authVivo) throw new HttpsError("failed-precondition", "esta conta já foi excluída");
        console.warn("[deleteAccount] " + uid + ": tombstone existe e o Auth sobreviveu — retomando SÓ o passo do Auth");
        try { await admin.auth().deleteUser(uid); }
        catch (e) {
          /* ⛔ NÃO limpa nem altera o lifecycle: ele já é `deleted` e continua correto.
           * Mexer aqui só poderia piorar (ressuscitar um terminal). */
          throw new HttpsError("internal", "conta não pôde ser removida do login: " + (e.code || e.message));
        }
        return Object.assign({ ok: true, retomado: true }, out);
      }
    }

    let _posseDel;
    try {
      _posseDel = await _amizadeLock.adquirir(db, [uid], "deleting");
    } catch (e) {
      if (e && e.migracao) throw new HttpsError("unavailable", e.message);
      if (e && e.lifecycle) throw new HttpsError("aborted", e.message);
      throw e;
    }

    let email = "";
    try {
      /* ⭐ REVALIDA SOB O LOCK (ponto 5): o perfil é relido AGORA, com a conta já travada.
       * Entre a autenticação e a aquisição cabe uma fusão inteira — apagar uma conta que
       * acabou de virar lápide destruiria dados do sobrevivente. */
      const _meuDoc = await db.collection("users").doc(uid).get();
      if (_meuDoc.exists) {
        const _m = _meuDoc.data() || {};
        if (_m.mergedInto) {
          throw new HttpsError("failed-precondition",
            "sua conta foi unificada com outra — entre de novo e exclua a conta atual");
        }
        if (_m.deleted === true || _m.deletedAt) {
          // (a retomada é tratada ANTES do lock — ver o bloco no topo da função)
          throw new HttpsError("failed-precondition", "esta conta já foi excluída");
        }
      }
      try { const au = await admin.auth().getUser(uid); email = (au.email || "").toLowerCase(); } catch (e) {}

    // 0) PORTA — jogo pendente BLOQUEIA a exclusão (ordem do dono, ago/2026).
    // Sem isto, a pessoa apaga a conta estando SORTEADA e leva o grupo dos outros
    // junto: foi o caso Denise Mamesso (R1 Grupo A do Confra, 3 jogos marcados,
    // zero placar) — o cascade arrancou o uid de dentro da chave, deixou o nome,
    // os outros 3 ficaram sem adversária e o organizador não foi avisado de nada.
    // O direito de apagar continua garantido; o que muda é a ORDEM: sair do
    // torneio primeiro (o que dispara o W.O. e avisa o organizador), depois
    // apagar. Roda ANTES de qualquer escrita — recusar no meio deixaria a conta
    // pela metade, que é pior que não começar.
    // Duas razões INDEPENDENTES: organizar (o torneio ficaria sem dono e sumiria
    // pros inscritos) e ter jogo pendente (o grupo ficaria sem adversário). Quem só
    // organiza não tem jogo — por isso são medidas em separado, senão a mensagem
    // mandaria dar W.O. num jogo inexistente.
    {
      const vistos = new Map();
      const add = (d) => vistos.set(d.id, Object.assign({ id: d.id }, d.data()));
      // organizados: as MESMAS 3 consultas que o passo (1) usa pra apagar
      for (const q of [
        db.collection("tournaments").where("creatorUid", "==", uid),
        db.collection("tournaments").where("organizerUid", "==", uid),
        // ⛔ a consulta por `organizerEmail` saiu (cânone do dono): achava torneio de quem
        // TEVE aquele e-mail e não achava nada de quem entrou por telefone.
        db.collection("tournaments").where("memberUids", "array-contains", uid),
      ]) {
        try { (await q.get()).docs.forEach(add); } catch (e) {}
      }
      const todos = Array.from(vistos.values());
      const organizando = _delGuard.torneiosQueOrganiza(todos, uid, email);
      const comJogo = _delGuard.torneiosQueBloqueiam(todos.filter((t) => _delGuard.temJogoPendente(t, uid)), uid);
      if (organizando.length || comJogo.length) {
        console.log("[deleteAccount] BLOQUEADO " + uid + " → organiza=" + JSON.stringify(organizando) + " jogos=" + JSON.stringify(comJogo));
        throw new HttpsError("failed-precondition", _delGuard.mensagemBloqueio(comJogo, organizando),
          { tournaments: comJogo, organizing: organizando });
      }
    }

    // 1) Torneios que ela ORGANIZA → apagados (o dono sai, o torneio vai junto).
    const organizados = new Map();
    for (const q of [
      db.collection("tournaments").where("creatorUid", "==", uid),
      db.collection("tournaments").where("organizerUid", "==", uid),
      // ⛔ idem: `organizerEmail` saiu daqui. uid é a identidade.
    ]) {
      try { (await q.get()).docs.forEach((d) => organizados.set(d.id, d.ref)); } catch (e) {}
    }
    for (const [, ref] of organizados) { await ref.delete().catch(() => {}); out.tournamentsDeleted++; }

    // 2) Torneios em que ela PARTICIPA — o cânone acha o uid onde ele estiver.
    const snap = await db.collection("tournaments").get();
    for (const doc of snap.docs) {
      if (organizados.has(doc.id)) continue;
      const t = doc.data();
      if (!_uidSweep.findUidPaths(t, uid).length) continue;

      const jogou = _tournamentHasPlayedMatches(t, uid);
      let next = t;

      if (jogou) {
        // MANTÉM o resultado: a entrada vira { uid, deleted } e os NOMES saem dos slots.
        next = _anonymizeEntries(next, uid);
        next = _stripNamesInMatches(next, uid);
        out.tournamentsAnonymized++;
      } else {
        // Não jogou: sai inteira. Slot de dupla leva a entrada junto (dupla não joga só).
        const parts = (t.participants || []).filter((p) => !p || typeof p !== "object" ||
          !_uidSweep.findUidPaths(p, uid).length);
        next = Object.assign({}, t, { participants: parts });
        out.tournamentsLeft++;
      }
      // Sobrou uid em mapa/array (check-in, voto, waitlist…)? O cânone limpa o resto.
      next = _purgeUidEverywhere(next, uid, jogou);
      next.memberUids = (next.memberUids || []).filter((u) => u !== uid);
      next.updatedAt = new Date().toISOString();
      await doc.ref.set(next).catch((e) => console.error("[deleteAccount] torneio " + doc.id, e.message));
    }

    // 3a) A AUTORIDADE da amizade (v2.1.48): relações + as DUAS direções da projeção.
    // ⛔ Antes daqui só se limpava o CACHE (`friends[]` dos outros, logo abaixo). Isso
    // deixaria `friendships/{pairId}` e `friendAccess/{outro}/accepted/{uid}` de pé —
    // projeção órfã de conta apagada continua CONCEDENDO leitura. Autoridade sem dono
    // é o pior resíduo possível.
    /* ⛔ 6ª auditoria (ponto 2): AQUI NÃO SE ENGOLE ERRO.
     * Antes era try/catch com log, e a exclusão SEGUIA — gravava a lápide e apagava o Auth
     * mesmo se a limpeza da amizade tivesse falhado. Conta viva com exclusão incompleta é
     * recuperável: a pessoa tenta de novo. Conta MORTA com `friendAccess` órfão é uma
     * autorização de leitura sem dono, e não há mais quem a limpe pelo fluxo normal.
     * Então a falha sobe e a exclusão PARA antes de tornar a conta morta. */
    /* ⛔ 10ª auditoria (ponto 1): AQUI HAVIA UMA SEGUNDA AQUISIÇÃO DO MESMO LOCK.
     * A fase e o `deleting` já são adquiridos no TOPO desta função, antes da primeira
     * escrita. Este bloco (resto da correção anterior, que eu achei ter substituído)
     * adquiria de novo — e a segunda aquisição via o próprio lock da primeira e falhava.
     * Resultado: o CAMINHO FELIZ do delete travava contra si mesmo, depois de já ter
     * apagado torneios. Os testes não pegaram porque só exercitavam caminhos de RECUSA.
     * `_excluirAmizade` roda sob a posse que já existe. */
    const amz = await _excluirAmizade(db, uid);
    out.friendshipsDeleted = amz.relacoesApagadas;
    out.friendAccessDeleted = amz.acessosApagados;

    /* 3) ⛔ v2.1.48 (4ª auditoria, ponto 4C) — O SEGUNDO WRITER SAIU DAQUI.
     * Havia uma limpeza manual: query `friends array-contains uid` + arrayRemove nos docs
     * de terceiros. Duas autoridades escrevendo o mesmo cache é a duplicidade que produz
     * recorrência — e esta ficava com uma visão parcial (só `friends`, nunca `sent`/
     * `received`/`sentAt`). Quem limpa é o `_excluirAmizade` acima, que projeta os quatro
     * campos do cânone e ainda DESCOBRE quem carrega o uid mesmo depois de a relação já
     * ter sido apagada (retry após falha parcial). */

    // 4) Presenças/check-ins.
    try { out.presencesDeleted = await _batchDeleteQuery(db.collection("presences").where("uid", "==", uid)); }
    catch (e) { console.error("[deleteAccount] presences:", e.message); }

    // 5) Partidas casuais — sai dos participantes; a sala fica pros outros.
    try {
      const cs = await db.collection("casualMatches").where("playerUids", "array-contains", uid).get();
      for (const d of cs.docs) {
        const swept = _purgeUidEverywhere(d.data(), uid, false);
        await d.ref.set(swept).catch(() => {});
        out.casualLeft++;
      }
    } catch (e) { console.error("[deleteAccount] casual:", e.message); }

    // 6) Notificações + perfil → TOMBSTONE mínimo (zero dado pessoal).
    try {
      const nt = await db.collection("users").doc(uid).collection("notifications").get();
      let b = db.batch(), n = 0;
      for (const d of nt.docs) { b.delete(d.ref); out.notificationsDeleted++; if (++n >= 400) { await b.commit(); b = db.batch(); n = 0; } }
      if (n) await b.commit();
    } catch (e) {}
    /* ⚠️ `_FV` (subpath `firebase-admin/firestore`) e não `admin.firestore.FieldValue`:
     * dentro do runtime do emulador de Functions o namespace vem sem `.FieldValue`, e esta
     * linha derrubava o caminho feliz do delete com 500 — achado pelo teste de happy path.
     * O subpath é o caminho documentado e funciona nos dois runtimes. */
    await db.collection("users").doc(uid).set({
      deleted: true,
      deletedAt: _FV.serverTimestamp(),
    });   // set SEM merge: sobrescreve o doc inteiro — todo dado pessoal some aqui

    // 7) Auth por último: se algo acima falhar, a pessoa ainda consegue re-tentar logada.
    try { await admin.auth().deleteUser(uid); }
    catch (e) { console.error("[deleteAccount] deleteUser:", e.code || e.message); throw new HttpsError("internal", "conta não pôde ser removida do login: " + (e.code || e.message)); }

    /* ⛔ 9ª auditoria (ponto 3): TERMINAL, não `active`. A conta acabou de virar lápide de
     * exclusão — devolvê-la pra `active` deixaria uma operação que fez a validação antes
     * chegar depois e escrever sobre um uid morto. `deleted` não expira por lease. */
    await _amizadeLock.finalizar(db, _posseDel, { [uid]: "deleted" }).catch((e) =>
      console.error("[deleteAccount] finalização do lifecycle falhou:", e && e.message));

    console.log("[deleteAccount] " + JSON.stringify(out));
    return Object.assign({ ok: true }, out);
    } catch (e) {
      /* ⛔ 10ª auditoria (ponto 3): o desfecho vem do FATO GRAVADO, não de "deu erro".
       * Se o tombstone já foi persistido e o `deleteUser` falhou depois, devolver o
       * lifecycle pra `active` criaria o limbo: profile morto, Auth vivo, lifecycle vivo.
       * `finalizarPeloFato` lê `users/{uid}` e conclui — `deleted`/`merged` quando é o
       * caso, `active` só se a conta estiver mesmo viva (guard de jogo pendente, por
       * exemplo, que é só leitura e não escreveu nada). */
      await _amizadeLock.finalizarPeloFato(db, _posseDel).catch(() => {});
      throw e;
    }
  }
);

// A pessoa tem jogo COM RESULTADO neste torneio? (BYE/folga não conta — não é jogo dela)
function _tournamentHasPlayedMatches(t, uid) {
  const temResultado = (m) => m && !m.isSitOut && !m.isBye &&
    (m.winner || m.winnerUid || (Array.isArray(m.sets) && m.sets.length) ||
     typeof m.scoreP1 === "number" || typeof m.scoreP2 === "number");
  const daPessoa = (m) => _uidSweep.findUidPaths(m, uid).length > 0;
  const todos = [];
  (t.matches || []).forEach((m) => todos.push(m));
  (t.rounds || []).forEach((r) => { (r.matches || []).forEach((m) => todos.push(m));
    (r.monarchGroups || []).forEach((g) => (g.matches || []).forEach((m) => todos.push(m))); });
  (t.groups || []).forEach((g) => (g.matches || []).forEach((m) => todos.push(m)));
  (t.rodadas || []).forEach((r) => (r.matches || []).forEach((m) => todos.push(m)));
  if (t.thirdPlaceMatch) todos.push(t.thirdPlaceMatch);
  return todos.some((m) => temResultado(m) && daPessoa(m));
}

// Entrada de inscrito → { uid, deleted } (mantém o slot, mata o dado pessoal).
function _anonymizeEntries(t, uid) {
  if (!Array.isArray(t.participants)) return t;
  const parts = t.participants.map((p) => {
    if (!p || typeof p !== "object" || !_uidSweep.findUidPaths(p, uid).length) return p;
    const q = {};
    // preserva SÓ o que a chave/classificação precisa: uid e a posição na dupla
    ["uid", "p1Uid", "p2Uid", "enrollSeq", "p1Seq", "p2Seq", "category", "categories"].forEach((k) => {
      if (p[k] !== undefined) q[k] = p[k];
    });
    if (Array.isArray(p.participants)) {
      q.participants = p.participants.map((s) => (s && s.uid === uid) ? { uid: uid, deleted: true } : s);
    }
    if (p.uid === uid || p.p1Uid === uid || p.p2Uid === uid) q.deleted = true;
    return q;
  });
  return Object.assign({}, t, { participants: parts });
}

// Nome gravado no slot do jogo é dado pessoal — sai. O uid fica (âncora anônima) e a UI
// resolve pro rótulo "Conta excluída" via tombstone.
function _stripNamesInMatches(t, uid) {
  const ROTULO = "Conta excluída";
  const fix = (m) => {
    if (!m || typeof m !== "object") return m;
    let q = m, hit = false;
    const set = (k, v) => { if (!hit) { q = Object.assign({}, m); hit = true; } q[k] = v; };
    if (m.p1Uid === uid && m.p1) set("p1", ROTULO);
    if (m.p2Uid === uid && m.p2) set("p2", ROTULO);
    ["team1", "team2"].forEach((nk) => {
      const uk = nk + "Uids";
      if (!Array.isArray(m[nk]) || !Array.isArray(m[uk])) return;
      const i = m[uk].indexOf(uid);
      if (i === -1 || !m[nk][i]) return;
      const arr = m[nk].slice(); arr[i] = ROTULO; set(nk, arr);
    });
    if (m.winnerUid === uid && m.winner) set("winner", ROTULO);
    return q;
  };
  const next = Object.assign({}, t);
  if (Array.isArray(next.matches)) next.matches = next.matches.map(fix);
  ["rounds", "groups", "rodadas"].forEach((k) => {
    if (!Array.isArray(next[k])) return;
    next[k] = next[k].map((it) => {
      if (!it || typeof it !== "object") return it;
      const o = Object.assign({}, it);
      if (Array.isArray(o.matches)) o.matches = o.matches.map(fix);
      if (Array.isArray(o.monarchGroups)) o.monarchGroups = o.monarchGroups.map((g) =>
        (g && Array.isArray(g.matches)) ? Object.assign({}, g, { matches: g.matches.map(fix) }) : g);
      return o;
    });
  });
  if (next.thirdPlaceMatch) next.thirdPlaceMatch = fix(next.thirdPlaceMatch);
  return next;
}

// Tira o uid de mapas/arrays. Se `manterSlots`, preserva os slots de identidade dos JOGOS
// (senão o placar dos adversários quebra) — some só do estado por-pessoa.
function _purgeUidEverywhere(node, uid, manterSlots) {
  const SLOTS_DE_JOGO = new Set(["p1Uid", "p2Uid", "winnerUid", "team1Uids", "team2Uids",
    "winnerUids", "playersUids", "uid", "p1Seq", "p2Seq", "enrollSeq"]);
  function walk(v, key) {
    if (v === null || typeof v !== "object") return v;
    if (!_uidSweep.isPlainContainer(v)) return v;
    if (Array.isArray(v)) {
      if (manterSlots && SLOTS_DE_JOGO.has(key)) return v;   // team1Uids etc: intacto
      return v.filter((x) => x !== uid).map((x) => walk(x, key));
    }
    // v1.7.78 — ARRAYS PAREADOS PRIMEIRO. `team1Uids`/`playersUids` andam colados
    // com `team1`/`players` pelo ÍNDICE. Filtrar só o lado dos uids (o que o walk
    // genérico abaixo faz) DESALINHA os dois e o nome vira fantasma — foi o que
    // aconteceu com a Denise Mamesso (08/ago/2026): uid removido, nome mantido,
    // 4 nomes / 3 uids. Ela era a última e por sorte ninguém mais quebrou; na
    // primeira posição, cada nome passaria a apontar pro uid do vizinho.
    // Aqui os dois lados caem juntos, no mesmo índice. Regra pura e testada em
    // uid-sweep.paresParaRemover/removerPares.
    const pareados = manterSlots ? {} : _uidSweep.removerPares(v, uid);
    const out = {};
    for (const k of Object.keys(v)) {
      if (k === uid) continue;                                // chave de mapa por-pessoa
      if (Object.prototype.hasOwnProperty.call(pareados, k)) { out[k] = pareados[k]; continue; }
      if (manterSlots && SLOTS_DE_JOGO.has(k) && v[k] === uid) { out[k] = v[k]; continue; }
      if (!manterSlots && SLOTS_DE_JOGO.has(k) && v[k] === uid) continue;
      out[k] = walk(v[k], k);
    }
    return out;
  }
  return walk(node, "");
}

/* ═══════════════════════════════════════════════════════════════════════════════
 * E-MAIL SECUNDÁRIO — CAPABILITIES ESPECÍFICAS  (L1.1, 2.1.65)
 *
 * ⛔ POR QUE NÃO UMA FUNCTION GENÉRICA de e-mail. Uma CF que aceitasse `to`, `subject` e
 * `html` do cliente moveria a regra de lugar sem mudar quem decide: qualquer autenticado
 * seguiria escolhendo destinatário e conteúdo, só que com o carimbo do servidor por cima —
 * o que é PIOR, porque passa a parecer confiável. Aqui existem duas portas estreitas, cada
 * uma com um trabalho só, e o corpo do e-mail é fixo no servidor.
 *
 * ⚠️ O QUE ESTE FLUXO DE FATO CONCEDE: `linkedEmails` é PROVA DE POSSE. `index.js:5968`
 * aceita `via: "email-vinculado"` como prova numa fusão de contas, e `_uidByProfileEmail`
 * (index.js:4283) resolve LOGIN por ele. Vincular um e-mail mexe em quem entra na conta —
 * por isso o token é CSPRNG, o banco guarda só o hash, e a vinculação usa o `ownerUid`
 * gravado no PEDIDO, nunca o uid de quem clica no link.
 * ═══════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════════
 * CONVITE AVULSO DE TORNEIO POR E-MAIL — capability específica  (L1.3a, 2.1.69)
 *
 * ⛔ O QUE ISTO SUBSTITUI. `js/views/tournaments-sharing.js` chamava
 * `FirestoreDB.queueEmail(email, subject, html)`: endereço de INPUT LIVRE validado por
 * `indexOf('@')`, assunto e corpo montados no CLIENTE, e `/mail` aberto a qualquer
 * autenticado nas rules. A UI que expõe o campo é montada em `tournaments.js` dentro de
 * `if (tournamentId)` e ANTES de `if (isOrg)` — sem gate de organizador. Somando: qualquer
 * pessoa logada mandava e-mail arbitrário, do remetente do produto, pra qualquer endereço.
 *
 * ⭐ Agora o cliente manda `tournamentId` e UM e-mail. O servidor resolve torneio, permissão,
 * URL, remetente, assunto e HTML. ⛔ Nada de `to`/`subject`/`html` vindo de fora.
 *
 * ⚠️ ESTA capability aceita um endereço do cliente, ao contrário do e-mail secundário, e é
 * deliberado: o convidado NÃO TEM CONTA, então não há uid pra resolver — o endereço é o dado
 * do convite. O que a torna segura é o conjunto: autorização de organizador, cota diária,
 * cooldown por destinatário e corpo fixo no servidor.
 * ═══════════════════════════════════════════════════════════════════════════════ */
exports.sendTournamentInvite = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const tid = String((request.data && request.data.tournamentId) || "").trim();
    if (!tid) throw new HttpsError("invalid-argument", "sem tournamentId");

    const email = _tInvCore.normalizaEmail((request.data && request.data.email) || "");
    if (!_tInvCore.emailValido(email)) return { ok: false, motivo: "email-invalido" };

    const db = admin.firestore();
    const snap = await db.collection("tournaments").doc(tid).get();
    if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = snap.data() || {};

    /* ⭐ A RÉGUA É A CANÔNICA, não uma cópia. `_partesPerm.ehOrganizador` é a mesma que
     * `aplicarNoTorneio` usa — criador, adminUids ou co-host ativo/aceito. Escrever um
     * segundo critério aqui seria pôr a autorização em dois lugares, que é como as duas
     * versões divergem em silêncio. [[project_cohost_same_power_as_organizer]] */
    if (!_partesPerm.ehOrganizador(t, callerUid)) {
      throw new HttpsError("permission-denied", "só o organizador ou co-organizador pode convidar por e-mail");
    }

    /* nome de quem convida: do PERFIL, não do que o cliente mandar */
    let inviterName = "";
    try {
      const u = await db.collection("users").doc(callerUid).get();
      inviterName = (u.exists && (u.data() || {}).displayName) || "";
    } catch (e) { /* nome é enfeite; a falta dele não impede o convite */ }

    const agora = Date.now();
    const r = await _tInvReserva.reservarConvite({
      db: db, core: _tInvCore, uid: callerUid, tournamentId: tid, email: email, agora: agora,
      dadosDoEmail: {
        tournamentName: t.name || "Torneio",
        inviterName: inviterName,
        dateText: _tInvCore.textoDaData(t),
        venue: t.venueName || t.venue || ""
      }
    });
    if (!r.ok) return { ok: false, motivo: r.motivo, usadosHoje: r.usadosHoje };
    console.log("[sendTournamentInvite] " + tid + " por " + callerUid + " · " + r.usadosHoje + "/" + _tInvCore.LIMITE_DIARIO + " hoje");
    return { ok: true, usadosHoje: r.usadosHoje, restamHoje: _tInvCore.LIMITE_DIARIO - r.usadosHoje };
  }
);

/* ══ L1.1 · CONVITE DE DUPLA E DE CO-ORGANIZAÇÃO SAEM DO CLIENTE ═══════════════
 *
 * ⛔ ATÉ A 2.1.74 os dois e-mails eram montados no NAVEGADOR — assunto, HTML, deep-links e
 * lista de destinatários — e gravados direto em `/mail`, que `firestore.rules` abre a
 * qualquer autenticado. Não era "convite", era um relay: quem chamasse escolhia pra quem,
 * com que assunto e com que corpo, saindo do remetente do produto.
 *
 * ⭐ AGORA o cliente manda só IDENTIFICADORES. E a autorização não é um campo do payload:
 * é o CONVITE PERSISTIDO no documento do torneio. Sem o registro, recusa.
 *
 * ⚠️ AS DUAS RECUSAM SEM CONTAR O QUE NÃO EXISTE: quando não há convite, a resposta é a
 * mesma para "não existe" e "não é seu" — a porta não vira oráculo de quem convidou quem.
 */

/** Manda o e-mail do convite de DUPLA que JÁ está gravado em `pairRequests`. */
exports.sendPairInviteEmail = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const tid = String((request.data && request.data.tournamentId) || "").trim();
    const inviteeUid = String((request.data && request.data.inviteeUid) || "").trim();
    if (!tid || !inviteeUid) throw new HttpsError("invalid-argument", "sem tournamentId/inviteeUid");

    const db = admin.firestore();
    const snap = await db.collection("tournaments").doc(tid).get();
    if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = snap.data() || {};

    /* ⭐ A AUTORIZAÇÃO É O REGISTRO. Só existe e-mail se houver um convite gravado de QUEM
     * CHAMA para ESTE convidado. Adulterar `inviteeUid` não encontra registro nenhum. */
    const req = _invEmail.achaConvitePar(t, callerUid, inviteeUid);
    if (!req) return { ok: false, motivo: "convite-inexistente" };

    /* ⛔ O DESTINATÁRIO VEM DO PERFIL, NO SERVIDOR — nunca do payload. E respeita o
     * opt-out `notifyEmail`, com a MESMA régua que o cliente usava. */
    let perfil = {};
    try {
      const u = await db.collection("users").doc(inviteeUid).get();
      if (u.exists) perfil = u.data() || {};
    } catch (e) { /* sem perfil: sem e-mail, e o convite in-app já existe */ }
    const destinatarios = _invEmail.destinatariosDoPerfil(perfil);
    if (!destinatarios.length) return { ok: false, motivo: "sem-destinatario" };

    let inviterName = "";
    try {
      const me = await db.collection("users").doc(callerUid).get();
      if (me.exists) inviterName = String((me.data() || {}).displayName || "");
    } catch (e) { /* nome é ornamento; a falta dele não impede o convite */ }

    /* ⭐ ID DETERMINÍSTICO PELO CONVITE, não pelo instante: reentrega cai no MESMO
     * documento (`create` recusa) e não duplica; recusar e convidar de novo gera um
     * registro com `createdAt` novo, logo chave nova, logo e-mail novo. */
    const mailId = _invEmail.mailDocIdDoPar(_invEmail.chaveDoConvitePar(tid, req));
    const doc = _invEmail.montaEmailPar({
      tournamentId: tid, tournamentName: t.name || "", requestId: req.id,
      inviterName: inviterName, destinatarios: destinatarios, agora: Date.now(),
    });
    try {
      await db.collection("mail").doc(mailId).create(doc);
    } catch (e) {
      if (e && (e.code === 6 || String(e.message || "").indexOf("ALREADY_EXISTS") !== -1)) {
        return { ok: true, jaEnfileirado: true };
      }
      throw e;
    }
    return { ok: true, destinatarios: destinatarios.length };
  }
);

/** Manda o e-mail do convite de CO-ORGANIZAÇÃO que JÁ está gravado em `coHosts`. */
exports.sendCoHostInviteEmail = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const tid = String((request.data && request.data.tournamentId) || "").trim();
    const targetUid = String((request.data && request.data.targetUid) || "").trim();
    if (!tid || !targetUid) throw new HttpsError("invalid-argument", "sem tournamentId/targetUid");

    const db = admin.firestore();
    const snap = await db.collection("tournaments").doc(tid).get();
    if (!snap.exists) throw new HttpsError("not-found", "torneio não existe");
    const t = snap.data() || {};

    /* ⭐ DUAS CONDIÇÕES, e a régua de quem convida é a CANÔNICA (`ehOrganizador`, a mesma
     * de `aplicarNoTorneio` e de `sendTournamentInvite`) — escrever um segundo critério é
     * como as duas versões divergem em silêncio. */
    if (!_partesPerm.ehOrganizador(t, callerUid)) {
      throw new HttpsError("permission-denied", "só o organizador ou co-organizador pode convidar");
    }
    const entry = _invEmail.achaCoHostPendente(t, targetUid);
    if (!entry) return { ok: false, motivo: "convite-inexistente" };

    let perfil = {};
    try {
      const u = await db.collection("users").doc(targetUid).get();
      if (u.exists) perfil = u.data() || {};
    } catch (e) { /* idem sendPairInviteEmail */ }
    const destinatarios = _invEmail.destinatariosDoPerfil(perfil);
    if (!destinatarios.length) return { ok: false, motivo: "sem-destinatario" };

    let inviterName = "";
    try {
      const me = await db.collection("users").doc(callerUid).get();
      if (me.exists) inviterName = String((me.data() || {}).displayName || "");
    } catch (e) { /* ornamento */ }

    /* A chave sai do `invitedAt` da ENTRADA: recusar e convidar de novo cria uma entrada
     * nova, com carimbo novo — e-mail novo. Reentrega da mesma: mesmo id, sem duplicar. */
    const mailId = _invEmail.mailDocIdDoCoHost(_invEmail.chaveDoConviteCoHost(tid, entry));
    const doc = _invEmail.montaEmailCoHost({
      tournamentId: tid, tournamentName: t.name || "",
      inviterName: inviterName, destinatarios: destinatarios, agora: Date.now(),
    });
    try {
      await db.collection("mail").doc(mailId).create(doc);
    } catch (e) {
      if (e && (e.code === 6 || String(e.message || "").indexOf("ALREADY_EXISTS") !== -1)) {
        return { ok: true, jaEnfileirado: true };
      }
      throw e;
    }
    return { ok: true, destinatarios: destinatarios.length };
  }
);

exports.requestSecondaryEmail = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const emailBruto = (request.data && request.data.email) || "";
    const db = admin.firestore();
    const agora = Date.now();

    const perfilSnap = await db.collection("users").doc(callerUid).get();
    const perfil = perfilSnap.exists ? (perfilSnap.data() || {}) : {};

    /* ⛔ A DECISÃO DE PEDIDO (formato, principal, já-vinculado) fica AQUI, fora da transação:
     * ela depende do perfil e não participa da corrida. O COOLDOWN saiu daqui de propósito —
     * ele é a trava da concorrência e só vale se for lido e gravado dentro da transação. */
    const d = _secEmail.decidePedido({
      email: emailBruto, perfil: perfil, agora: agora, ultimoEnvioMs: 0,
      emailDoToken: (request.auth.token && request.auth.token.email) || ""
    });
    /* ⚠️ Estes motivos falam do PEDIDO de quem chama (formato, o próprio principal, a própria
     * lista) — nenhum deles conta nada sobre OUTRAS contas. É a linha que a invariante 6
     * protege: nada aqui pode virar oráculo de "este e-mail existe no sistema". */
    if (!d.ok) return { ok: false, motivo: d.motivo };

    /* ⭐ RESERVA ATÔMICA (L1.1.1). Antes isto era ler-throttle → decidir → criar verificação →
     * gravar throttle → `.add()` no outbox, tudo solto: duas chamadas simultâneas do MESMO uid
     * pro MESMO e-mail liam o throttle vazio, ambas passavam, e saíam DOIS e-mails com DOIS
     * links válidos. Agora as três escritas e a leitura do throttle vivem numa transação só —
     * a concorrente é abortada pelo Firestore, re-executa, lê o throttle recém-gravado e cai
     * no cooldown. O documento do outbox tem id derivado da reserva, então a re-execução
     * interna reescreve o mesmo doc em vez de criar outro. */
    const r = await _secReserva.reservarEnvio({
      db: db, core: _secEmail, uid: callerUid, email: d.email, agora: agora
    });
    if (!r.ok) return { ok: false, motivo: r.motivo };

    console.log("[requestSecondaryEmail] uid=" + callerUid + " pedido enfileirado");
    return { ok: true };
  }
);

/* ⛔ A CONFIRMAÇÃO NÃO EXIGE SESSÃO, e é decisão, não esquecimento. O link chega na CAIXA do
 * e-mail candidato e pode ser aberto em qualquer navegador — exigir login aqui quebraria o
 * caso comum (o fluxo antigo também não exigia). A posse do token É a prova, e o destino da
 * vinculação vem do registro (`ownerUid`), então estar logado em outra conta não muda nada:
 * o e-mail vai para a conta que PEDIU. */
exports.confirmSecondaryEmail = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const token = String((request.data && request.data.token) || "");
    if (!token) return { ok: false, motivo: "invalido" };
    const db = admin.firestore();
    const ref = db.collection("emailVerifications").doc(_secEmail.hashToken(token));

    /* ⭐ TRANSAÇÃO: marcar usado e vincular têm que acontecer JUNTOS. Separados, dois cliques
     * simultâneos no mesmo link vinculariam duas vezes, e um erro no meio deixaria o token
     * queimado sem ter vinculado nada. */
    const out = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const dec = _secEmail.decideConfirmacao(snap.exists ? (snap.data() || {}) : null, Date.now());
      if (!dec.ok) return dec;

      const uref = db.collection("users").doc(dec.ownerUid);
      const usnap = await tx.get(uref);
      if (!usnap.exists) return { ok: false, motivo: "invalido" };
      const atual = usnap.data() || {};
      const linked = Array.isArray(atual.linkedEmails) ? atual.linkedEmails.slice() : [];
      const jaTem = linked.map(_secEmail.normalizaEmail).indexOf(dec.email) !== -1;
      if (!jaTem) linked.push(dec.email);

      tx.update(ref, { used: true, verified: true, usedAt: new Date().toISOString() });
      if (!jaTem) tx.update(uref, { linkedEmails: linked });
      return { ok: true, email: dec.email, ownerUid: dec.ownerUid, jaTem: jaTem };
    });

    if (out.ok) console.log("[confirmSecondaryEmail] vinculado a uid=" + out.ownerUid);
    /* ⚠️ Devolve o e-mail só no sucesso — e quem chega aqui com sucesso é quem tem o token,
     * ou seja, quem controla aquela caixa. Nos demais casos, só o motivo. */
    return out.ok ? { ok: true, email: out.email } : { ok: false, motivo: out.motivo };
  }
);

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
      // limit(8): o e-mail casa lápide + sobrevivente; a porta escolhe a viva e colapsa.
      const s = await db.collection("users").where("email", "==", email).limit(8).get();
      targetUid = await _userVivo.uidVivo(db, s);
    } else {
      // O uid veio do AUTH e mesmo assim passa pela porta: a fusão apaga o Auth do absorvido
      // em best-effort (`deleteUser` dentro de try/catch, index.js:774) — quando essa deleção
      // falha, o e-mail continua resolvendo no Auth pra um uid que no Firestore já é LÁPIDE.
      targetUid = (await _userVivo.uidVivo(db, String(targetUid))) || targetUid;
    }
    if (!targetUid) return { ok: false, reason: "no-account" };   // não existe → caller só vincula o e-mail (verifyBeforeUpdateEmail no cliente)
    // ⚠️ A comparação com o caller vem DEPOIS de resolver, de propósito — o oposto do que os
    // outros caminhos de fusão fazem. Excluir o próprio uid ANTES economizaria uma leitura,
    // mas apagaria a distinção que importa aqui: uma lápide de e-mail cujo sobrevivente sou
    // EU resolve pra mim, e isso é "same-account" (mensagem acionável), não "no-account".
    if (targetUid === callerUid) return { ok: false, reason: "same-account" };

    await _sendMergeProofEmail(db, callerUid, targetUid, email);
    console.log("[requestEmailMerge] token p/", email, "req=", callerUid, "target=", targetUid);
    return { ok: true, sent: true };
  }
);

// PROVA DE POSSE por e-mail: gera o token de fusão e manda o link pra caixa da OUTRA conta.
// Extraído de requestEmailMerge pra ser reusado pelo fluxo de homônimo (requestNameMergeProof)
// — ponto único, senão as duas portas divergiriam no que gravam em mergeTokens.
// Quem recebe o link é quem tem posse da caixa; é ISSO que autoriza a fusão. Nome nunca autoriza.
async function _sendMergeProofEmail(db, requesterUid, targetUid, email) {
  const crypto = require("crypto");
  const token = crypto.randomBytes(24).toString("base64url");
  await db.collection("mergeTokens").doc(token).set({
    requesterUid: requesterUid, targetUid: targetUid, email: email,
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
  return token;
}

// ─── Homônimo: avisar e oferecer a união COM PROVA DE POSSE ───────────────────
// Regra do dono: dois uids de pessoas diferentes não podem ter o mesmo nome. Mas homônimo
// NÃO É AUTORIZAÇÃO — na base os 3 casos eram duplicata da mesma pessoa, e ainda assim
// fundir por coincidência de nome fundiria dois "João Silva" de verdade, apagando um do
// Auth. Erro assimétrico: conta duplicada é incômodo, pessoa fundida é irreversível.
// Por isso: o nome só DETECTA; quem AUTORIZA é a posse do e-mail/celular da outra conta.
//
// O alvo é resolvido pelo SERVIDOR (o cliente não passa uid nem e-mail) e só existe quando
// há colisão real — assim ninguém usa a porta pra disparar mensagem a quem quiser.
exports.checkNameConflict = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const db = admin.firestore();
    const me = await db.collection("users").doc(callerUid).get();
    if (!me.exists) return { hasConflict: false };
    const nome = String((me.data() || {}).displayName || "").trim();
    if (!nome) return { hasConflict: false };

    const c = await _nameUnique.findDisplayNameConflict(db, nome, callerUid);
    if (!c) return { hasConflict: false };

    // Só o MASCARADO sai daqui — o valor cheio e o uid nunca chegam ao cliente.
    return {
      hasConflict: true,
      name: nome,
      maskedEmail: _nameUnique.maskEmail(c.email) || null,
      maskedPhone: _nameUnique.maskPhone(c.phone) || null,
    };
  }
);

// Dispara a PROVA para a outra conta. `channel`: 'email' (pronto) — 'phone' ainda não.
// Rate limit por caller: a mensagem vai pra caixa de outra pessoa quando o homônimo é
// coincidência, então o botão não pode virar gerador de spam.
exports.requestNameMergeProof = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const channel = String((request.data && request.data.channel) || "email").trim();
    const db = admin.firestore();

    const me = await db.collection("users").doc(callerUid).get();
    if (!me.exists) throw new HttpsError("failed-precondition", "perfil não encontrado");
    const nome = String((me.data() || {}).displayName || "").trim();
    const c = nome ? await _nameUnique.findDisplayNameConflict(db, nome, callerUid) : null;
    if (!c) return { ok: false, reason: "no-conflict" };

    // Rate limit: 3 envios por hora por caller.
    const rlRef = db.collection("mergeProofLimits").doc(callerUid);
    const rl = await rlRef.get();
    const agora = Date.now();
    const janela = (rl.exists && rl.data().windowStart && rl.data().windowStart.toMillis)
      ? rl.data().windowStart.toMillis() : 0;
    const n = (rl.exists && janela && (agora - janela) < 3600000) ? (rl.data().count || 0) : 0;
    if (n >= 3) throw new HttpsError("resource-exhausted", "Muitas tentativas. Tente de novo daqui a pouco.");

    if (channel !== "email") throw new HttpsError("invalid-argument", "canal não suportado ainda");
    if (!c.email) return { ok: false, reason: "no-email" };

    await _sendMergeProofEmail(db, callerUid, c.uid, c.email);
    await rlRef.set({
      count: n + 1,
      windowStart: (n === 0) ? admin.firestore.FieldValue.serverTimestamp() : (rl.data() || {}).windowStart,
    }, { merge: true });

    console.log(`[requestNameMergeProof] prova por ${channel} enviada: req=${callerUid} target=${c.uid}`);
    return { ok: true, sent: true, masked: _nameUnique.maskEmail(c.email) };
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
/* ⛔ 7ª auditoria (ponto 2): `mergePhoneAccount` é uma fusão INDEPENDENTE e estava fora do
 * protocolo de lock — só `_executeMerge` estava coberto, e este caminho não passa por ele.
 * A operação inteira (perfil, amizade, lápide, credenciais) agora roda sob a MESMA
 * aquisição de OLD + KEEP, liberada só pelo `operationId` dela.
 * ⚠️ `dryRun` NÃO adquire lock de escrita: ensaio não pode trancar a conta de ninguém. */
/* ⛔ 11ª auditoria (ponto 4): A PROVA DE POSSE VIRA FUNÇÃO, pra ser conferida ANTES de
 * adquirir o lock e DE NOVO depois dele. Antes, o lock era adquirido primeiro e a prova
 * conferida depois — então uma chamada SEM prova nenhuma já escrevia em `userLifecycle`,
 * marcando `merging` em duas contas alheias e podendo travá-las até o lease vencer.
 * A regra em si não mudou: token de posse do `oldUid`, ou identificador provado no próprio
 * token do caller que o `oldUid` possui. */
async function _provaDePosseDeOld(request, callerUid, oldUid, oldData) {
  const proof = request.data && request.data.proofIdToken;
  if (proof) {
    try {
      const dec = await admin.auth().verifyIdToken(String(proof));
      if (dec && dec.uid === oldUid) return { proven: true, via: "proofIdToken", oldAuth: null };
    } catch (e) { /* inválido */ }
  }
  let oldAuth = null;
  try { oldAuth = await admin.auth().getUser(oldUid); } catch (e) { /* sem Auth record */ }

  const email = String((request.auth.token && request.auth.token.email) || "").toLowerCase();
  const fone = request.auth.token && request.auth.token.phone_number;
  const d = oldData || {};
  if (email) {
    if (oldAuth && oldAuth.email && oldAuth.email.toLowerCase() === email) return { proven: true, via: "email-auth", oldAuth };
    if (d.email && String(d.email).toLowerCase() === email) return { proven: true, via: "email-perfil", oldAuth };
    if (Array.isArray(d.linkedEmails) && d.linkedEmails.map((e) => String(e).toLowerCase()).indexOf(email) !== -1) {
      return { proven: true, via: "email-vinculado", oldAuth };
    }
  }
  if (fone) {
    if (oldAuth && oldAuth.phoneNumber && _phoneDigitsMatch(fone, oldAuth.phoneNumber)) return { proven: true, via: "phone-auth", oldAuth };
    const op = await _registeredPhoneFor(oldUid, oldAuth);
    if (op && _phoneDigitsMatch(fone, op)) return { proven: true, via: "phone-perfil", oldAuth };
  }
  return { proven: false, via: null, oldAuth };
}

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

    // ponto 4: em manutenção, nem o ensaio nem a fusão passam
    await _amizadeFase.exigirLiberado(admin.firestore(), HttpsError, "mergePhoneAccount");

    /* ⛔ 11ª auditoria (ponto 4): PROVA ANTES DO LOCK. Sem isto, uma chamada sem prova
     * nenhuma já marcava `merging` em duas contas — inclusive alheias — e as travava até o
     * lease vencer. Leitura é de graça; escrever em `userLifecycle` não é. */
    {
      const _preOld = await admin.firestore().collection("users").doc(oldUid).get();
      const _pv = await _provaDePosseDeOld(request, callerUid, oldUid,
        _preOld.exists ? (_preOld.data() || {}) : {});
      if (!_pv.proven) {
        console.warn("[mergePhoneAccount] RECUSADO sem prova de posse — nada foi escrito:", callerUid, "→", oldUid);
        throw new HttpsError("permission-denied", "sem prova de posse da conta a mesclar");
      }
    }

    let _posseFone = null;
    let _fusaoFoneOk = false;
    if (!dryRun) {
      try {
        _posseFone = await _amizadeLock.adquirir(admin.firestore(), [oldUid, callerUid], "merging");
      } catch (e) {
        if (e && e.migracao) throw new HttpsError("unavailable", e.message);
        if (e && e.lifecycle) throw new HttpsError("aborted", e.message);
        throw e;
      }
      /* ponto 5: revalida DEPOIS do lock — entre a chamada e a aquisição cabe outra fusão */
      const _dbRev = admin.firestore();
      const [_ro, _rc] = await Promise.all([
        _dbRev.collection("users").doc(oldUid).get(),
        _dbRev.collection("users").doc(callerUid).get(),
      ]);
      if (_ro.exists && (_ro.data() || {}).mergedInto) {
        throw new HttpsError("aborted", "a conta antiga já foi unificada por outra operação");
      }
      if (_rc.exists && (_rc.data() || {}).mergedInto) {
        throw new HttpsError("failed-precondition", "sua conta foi unificada — entre de novo para continuar");
      }
      if ((_ro.exists && (_ro.data() || {}).deleted === true) || (_rc.exists && (_rc.data() || {}).deleted === true)) {
        throw new HttpsError("failed-precondition", "uma das contas foi excluída");
      }
    }
    try {
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
        /* ⛔ 11ª auditoria (ponto 4): FALHA AQUI NÃO VIRA SUCESSO.
         * Antes, os dois passos eram `try/catch` que só logavam — e a função devolvia
         * `{ ok: true, claimedPhone }` mesmo quando o número NÃO tinha sido transferido.
         * O cliente marcava o telefone como reivindicado, e ele continuava no fantasma.
         * ⚠️ Os dois passos são do Auth, não do Firestore: não há transação. A ordem
         * importa — libera o número primeiro (senão o `updateUser` bate em
         * `phone-number-already-exists`), e se a segunda parte falhar a exceção sobe. */
        try { await admin.auth().deleteUser(oldUid); }
        catch (e) {
          console.error("[mergePhoneAccount] ghost: deleteUser falhou:", (e && (e.code || e.message)) || e);
          throw new HttpsError("internal", "não foi possível liberar o número da conta antiga: " + ((e && (e.code || e.message)) || e));
        }
        try { await admin.auth().updateUser(callerUid, { phoneNumber: ghPhone }); }
        catch (e) {
          console.error("[mergePhoneAccount] ghost: set phone on caller falhou:", (e && (e.code || e.message)) || e);
          throw new HttpsError("internal", "o número foi liberado mas não pôde ser vinculado à sua conta: " + ((e && (e.code || e.message)) || e));
        }
        await db.collection("users").doc(callerUid).set(
          {
            phone: ghPhone, phoneCountry: "55", updatedAt: new Date().toISOString(),
            // v1.9.97: o número acabou de ser PROVADO por SMS. Se antes havia um
            // registrado pelo organizador, a procedência morre aqui — senão a conta
            // ficaria com telefone verificado e carimbo de "posto por terceiro", e os
            // guards de identidade continuariam recusando o que já foi provado.
            // ⚠️ `_FV` (subpath) e não `admin.firestore.FieldValue`: no runtime do emulador
            // de Functions o namespace vem sem `.FieldValue` e derrubava o ramo ghost com
            // 500 — o mesmo tropeço já corrigido no deleteAccount.
            phoneSource: _FV.delete(),
            phoneSetBy: _FV.delete(),
            phoneSetAt: _FV.delete(),
            // notifyWhatsApp é derivado de ter celular (cânone v1.9.68) — sem isto,
            // um false residual de antes do número deixaria o canal 💬 caído.
            notifyWhatsApp: true,
          }, { merge: true }
        ).catch(() => {});
      }
      /* ⚠️ O ghost NÃO é fusão: nada foi absorvido, só um número mudou de dono.
       * Ele roda SOB o lock (o `finally` da função vai chamar `finalizarPeloFato`), e é
       * justamente por isso que o ponto 3 importa: `oldUid` não tem perfil, então
       * `estadoFinalPeloFato` devolve DESCONHECIDO e o lifecycle dele NÃO vira `deleted`.
       * Inventar terminal aqui marcaria como morta uma identidade que pode estar viva —
       * e terminal não se desfaz. Sem perfil, sem conclusão. */
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
    /* ponto 4: REVALIDA a prova agora, já sob o lock — entre a conferência de cima e a
     * aquisição, o identificador que provava a posse pode ter mudado de dono. */
    const _pvLock = await _provaDePosseDeOld(request, callerUid, oldUid, oldData);
    const _oldAuth = _pvLock.oldAuth;
    if (!_pvLock.proven) throw new HttpsError("permission-denied", "sem prova de posse da conta a mesclar");

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
    // ⛔ 2.1.24 — UNIR OS TRÊS E RECONCILIAR. Antes eram três uniões INDEPENDENTES: quem já
    // era amigo por um lado e tinha convite pendente pelo outro terminava nos dois arrays.
    /* ⛔ 3ª auditoria (pontos 1 e 2): AQUI HAVIA UM SEGUNDO MOTOR DE MERGE DE AMIZADE.
     * Ele unia `friends`/`friendRequestsSent`/`friendRequestsReceived` dos dois docs com
     * `unionArr` e reconciliava a invariante — sem nunca tocar em `friendships` nem em
     * `friendAccess`. Resultado: o cânone ficava pra trás e o cache virava a única
     * "verdade", justamente o arranjo que a 2.1.48 veio desfazer. E união preserva o uid
     * MORTO, que é o que não pode sobrar.
     * ⭐ Agora os quatro campos NÃO entram em `surv`: quem os escreve é
     * `_amizadeNoMerge` → `_reconstruirCacheAmizade`, chamado logo depois da gravação do
     * sobrevivente, a partir das relações canônicas já resolvidas.
     * (A invariante "amigo não é convite" vive agora em `projetarCache`, aplicada na
     * SAÍDA — ver tests/amigo-nao-e-convite-pendente.test.js.) */

    // v1.7.61 — a regra de "o e-mail da conta absorvida vira vínculo" MORAVA AQUI, inline, e
    // só aqui: o caminho comum de fusão (_executeMerge) não tinha equivalente, e por isso a
    // Fabiana saiu de uma fusão sem `linkedEmails`. Agora é UMA função pura, usada pelos dois.
    surv.linkedEmails = unionArr(newData.linkedEmails, oldData.linkedEmails);
    const _linkPhone = _profileMerge.computeLinkedIdentifiers(
      { email: newEmail, linkedEmails: surv.linkedEmails }, oldEmailRaw, null);
    if (_linkPhone.linkedEmails) surv.linkedEmails = _linkPhone.linkedEmails;
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
    // v1.9.97: celular VERIFICADO vence celular REGISTRADO PELO ORGANIZADOR. Sem esta
    // condição, quem tinha o contato posto pelo organizador e depois confirmava o
    // próprio número por SMS ficava com o número do organizador — o campo já estava
    // "preenchido" e a herança nem tentava. Prova de posse não pode perder pra registro.
    const _survSemIdentidade = !_contactPhone.isIdentityPhone(newData);
    if (_survSemIdentidade && _oldPhone) {
      surv.phone = _oldPhone;
      surv.phoneCountry = oldData.phoneCountry || "55";
      // notifyWhatsApp é derivado de ter celular (cânone v1.9.68): o sobrevivente
      // acabou de ganhar um número — um false residual não pode derrubar o canal 💬.
      surv.notifyWhatsApp = true;
      // o número passou a ser o VERIFICADO — a procedência de organizador morre aqui
      if (newData.phoneSource === 'organizer') {
        surv.phoneSource = admin.firestore.FieldValue.delete();
        surv.phoneSetBy = admin.firestore.FieldValue.delete();
        surv.phoneSetAt = admin.firestore.FieldValue.delete();
      }
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

    /* ── 5. AMIZADE: a porta ÚNICA ────────────────────────────────────────────
     * ⛔ 3ª auditoria (ponto 1): aqui havia a TERCEIRA implementação independente de
     * migração de amizade — um full scan de `users` repontando `friends`/requests de
     * terceiros campo a campo, sem nunca tocar em `friendships`/`friendAccess`.
     * Três motores decidindo a mesma coisa é exatamente a duplicidade de autoridade que
     * produz recorrência. Agora `_executeMerge`, as duas ramificações de
     * `_mergeAccountsKeepOlder` e este caminho chamam a MESMA rotina, que:
     *   · rekeya `friendships/{pairId}` (a chave é o par — o sweep genérico corromperia);
     *   · resolve colisão quando old e keep têm relação com a mesma terceira pessoa;
     *   · recria `friendAccess` nas duas direções e apaga a do uid morto;
     *   · reconstrói o cache dos DOIS e de todo terceiro afetado A PARTIR DO CÂNONE.
     * ⚠️ `dryRun` continua respeitado: nada é escrito no ensaio. */
    if (!dryRun) {
      const _amz = await _amizadeNoMerge(db, oldUid, callerUid);
      report.friendRefsRepointed = (_amz.relacoesReescritas || 0) + (_amz.relacoesApagadas || 0);
      report.friendCachesRebuilt = (_amz.afetados || []).length;
    }

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
      // loginRedirects: logar depois com a credencial da conta antiga cai no caller (item 9).
      await _recordLoginRedirects(db, callerUid, _oldAuth && _oldAuth.email, _oldAuth && _oldAuth.phoneNumber);
    }

    if (!dryRun) _fusaoFoneOk = true;     // a lápide foi gravada acima: lifecycle terminal
    console.log(`[mergePhoneAccount] ${dryRun ? "DRY-RUN " : ""}DONE ` + JSON.stringify(report));
    // Compat: mantém os campos antigos (tournaments/casualMatches) no retorno.
    return Object.assign({ ok: true, merged: true }, report, { casualMatches: report.casualMatches });
    } finally {
      /* ⛔ 9ª auditoria (ponto 3): no sucesso o `oldUid` vira TERMINAL (`merged`) — ele
       * acabou de receber a lápide. Voltar a `active` deixaria uma operação com validação
       * velha escrever sobre uid morto. No fracasso os dois voltam a `active`, pra a
       * pessoa poder tentar de novo. Ownership-aware nos dois casos. */
      /* ponto 3: idem — e cobre também o "ghost" (Auth sem doc): se o oldUid deixou de
       * existir como identidade, `finalizarPeloFato` conclui `deleted`, nunca `active`. */
      if (_posseFone) {
        await _amizadeLock.finalizarPeloFato(admin.firestore(), _posseFone).catch((e) =>
          console.error("[mergePhoneAccount] finalização do lifecycle falhou:", e && e.message));
      }
    }
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
    // user-vivo:isento — esta É a varredura de lápides; seguir a corrente aqui apagaria
    // justamente o que ela precisa enxergar (o par morto→vivo a repontar).
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

// ─── accountSummaryEmail (Firestore trigger, v1.8.40) ──────────────────────
// Pedido do dono (13/ago/2026): _"o sistema mandar automaticamente um email dizendo
// como a pessoa escolheu logar"_ + _"sempre que mudar algo consolida e envia
// novamente um email de confirmação"_. É o registro PESQUISÁVEL contra o "esqueci
// como entrei e criei outra conta": a pessoa busca "scoreplace" na caixa e encontra
// a foto atual da conta (nome, e-mail, celular, formas de entrar).
//
// DISPARO POR ASSINATURA, não por escrita: users/{uid} muda o tempo todo (tema,
// preferências, stats) — só os campos de IDENTIDADE (accountDocSig: nome, e-mail,
// celular) contam. A assinatura enviada fica gravada em `accountEmailSig`; escrita
// com a mesma assinatura (inclusive a NOSSA, do próprio marcador) é ignorada —
// é isso que impede o loop e o spam. O conteúdo/assinatura vivem em
// functions/account-email-core.js (PURO — o mesmo construtor do backfill
// scripts/send-account-summary-emails.js e dos testes).
//
// Os provedores saem do Firebase AUTH (Admin SDK) — não do doc, que no instante do
// nascimento pode ainda não ter authProvider. Vínculo de provedor NOVO não passa
// por aqui (não muda o doc): o cliente avisa na hora (_notifyLoginMethodAdded).
// replyTo = contato@barthlabs.com ([[feedback_contact_email_always_barthlabs]]).
//
// ⚠️ LIMITE CONHECIDO (documentado, não esquecido): e-mail @privaterelay.appleid.com
// (Apple "Ocultar meu e-mail") só é ENCAMINHADO pela Apple quando o REMETENTE está
// registrado no Private Email Relay Service (Apple Developer) com SPF/DKIM num
// domínio nosso. Enquanto o SMTP da extensão for o Gmail, essas contas provavelmente
// NÃO recebem. Registrar domínio/remetente é ação do dono; enviamos mesmo assim.
const _accountEmail = require("./account-email-core.js");
exports.accountSummaryEmail = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    try {
      const after = event.data && event.data.after;
      if (!after || !after.exists) return;                 // deleção — nada a mandar
      const p = after.data() || {};
      if (p.mergedInto) return;                            // conta absorvida
      const uid = event.params.uid;

      const sig = _accountEmail.accountDocSig(p);
      if (p.accountEmailSig === sig) return;               // identidade não mudou (ou é o nosso próprio marcador)
      const isNew = !(event.data.before && event.data.before.exists);

      let providers = [];
      let authEmail = "";
      try {
        const ur = await admin.auth().getUser(uid);
        authEmail = ur.email || "";
        providers = (ur.providerData || []).map((x) => x && x.providerId).filter(Boolean);
      } catch (e) {
        return; // sem conta no Auth (doc órfão/backfill) → não há a quem escrever
      }
      const email = (authEmail && !_isSyntheticAuthEmail(authEmail)) ? authEmail
        : ((p.email && !_isSyntheticAuthEmail(p.email)) ? String(p.email) : "");

      // Conta sem e-mail real (só-celular): grava a assinatura e para — senão toda
      // escrita do doc re-tentaria pra sempre.
      if (!email) { await after.ref.set({ accountEmailSig: sig }, { merge: true }); return; }

      const mail = _accountEmail.buildAccountEmail({
        name: p.displayName || "",
        email: email,
        phone: p.phone || "",
        providers: providers,
        authProviderFallback: p.authProvider || "",
        isNew: isNew,
      });
      // ORDEM: enfileira PRIMEIRO, assinatura DEPOIS — se o enfileiramento falhar, a
      // assinatura não é gravada e a próxima escrita re-tenta (perder o e-mail em
      // silêncio seria pior que, raramente, mandar duas vezes).
      /* ⚠️ `_FV` (subpath `firebase-admin/firestore`) e NÃO `admin.firestore.FieldValue`:
       * no runtime do emulador de Functions esse namespace vem sem `.FieldValue`, e a linha
       * derrubava o gatilho INTEIRO no catch de best-effort — o e-mail de boas-vindas /
       * confirmação nunca era enfileirado, `accountEmailSig` nunca era gravado (a ordem é
       * enfileirar primeiro), e o log repetia "[accountSummaryEmail] falhou (best-effort):
       * Cannot read properties of undefined (reading 'serverTimestamp')" com a suíte verde.
       * Mesmo caminho já adotado em `deleteAccount` e em `accountDeletionEmail`. */
      // Id determinístico por conta + assinatura: duas escritas concorrentes do mesmo
      // perfil podem disparar o gatilho antes de `accountEmailSig` ser persistido. `add()`
      // criava dois e-mails; `create()` permite que somente a primeira execução enfileire.
      const crypto = require("crypto");
      const mailId = "acctsum_" + crypto.createHash("sha256")
        .update(uid + "\n" + sig).digest("hex");
      const mailRef = admin.firestore().collection("mail").doc(mailId);
      try {
        await mailRef.create({
        to: [email],
        replyTo: "contato@barthlabs.com",
        message: { subject: mail.subject, html: mail.html, text: mail.text },
        createdAt: _FV.serverTimestamp(),
        });
      } catch (e) {
        // Outra execução concorrente já enfileirou exatamente esta versão da identidade.
        // Só esse conflito é idempotência; qualquer outra falha precisa manter a assinatura
        // ausente para que uma escrita futura tente novamente.
        if (!(e && (e.code === 6 || e.code === "already-exists" || e.code === "ALREADY_EXISTS"))) throw e;
      }
      await after.ref.set({ accountEmailSig: sig }, { merge: true });
      console.log("[accountSummaryEmail]", isNew ? "nascimento" : "mudança", "→", email);
    } catch (e) {
      console.error("[accountSummaryEmail] falhou (best-effort):", e && e.message);
    }
  }
);

// ─── accountDeletionEmail (Firestore trigger) ──────────────────────────────
// Ordem do dono (13/ago/2026): _"sempre que qualquer conta for excluída no app
// (por qualquer motivo — solicitação do usuário, admin, etc.), o sistema deve
// automaticamente enviar e-mail de confirmação"_ → titular + rstbarth@gmail.com,
// CC contato@barthlabs.com.
//
// POR QUE AQUI, e não dentro do deleteAccount: a mesma lição do syncMatchRosters —
// o gatilho vê TODA escrita, de QUALQUER origem (a CF deleteAccount, um script de
// admin, o console do Firebase, uma limpeza agendada). Pendurar o e-mail só na CF
// deixaria de fora justamente as exclusões feitas "por fora", que são as que mais
// precisam de registro. O Auth de 2ª geração não tem gatilho onDelete — o doc do
// Firestore é o ponto de observação disponível.
//
// ⚠️ A IDENTIDADE SAI DO `before`. A exclusão canônica grava o tombstone com `set`
// SEM merge: no mesmo instante o doc perde nome e e-mail. Quem lê o `after` fica
// sem destinatário. O evento traz os dois lados — é o `before` que sabe quem era.
//
// ⚠️ FUSÃO NÃO É EXCLUSÃO. O merge grava `mergedInto`, e o cleanupAbandonedAuth
// APAGA esse doc 7 dias depois; sem o descarte, quem apenas uniu contas receberia
// "sua conta foi excluída" com a conta sobrevivente viva. A regra mora no core e
// está travada por teste.
//
// O relatório do dono termina com uma VARREDURA DE SOBRAS (consultas indexadas,
// nunca full scan): relatório que só afirma "apagado" não prova nada — o que prova
// é a conferência feita depois. Ela também pega o caso clássico do Firestore em que
// alguém apaga users/{uid} pelo console e as SUBCOLEÇÕES continuam vivas.
const _delEmail = require("./account-deletion-email-core.js");

const _espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function _sweepDeletionLeftovers(db, uid, kind) {
  const sobras = [];
  const conta = async (label, q) => {
    try { const s = await q.get(); if (!s.empty) sobras.push(label + " (" + s.size + ")"); } catch (e) {}
  };

  // ⚠️ ESPERA DELIBERADA, e ela é o que faz o aviso valer alguma coisa. A CF
  // deleteAccount grava o tombstone no passo 6 e só apaga o Auth no passo 7 —
  // este gatilho dispara no passo 6 e GANHARIA a corrida, acusando "Auth ainda
  // existe" em TODA exclusão legítima. Aviso que sempre aparece é aviso que
  // ninguém lê. Os demais passos (torneios, amizades, presenças, casuais) já
  // terminaram antes do tombstone, então só o Auth precisa desta folga.
  await _espera(5000);

  // Auth: se o login sobreviveu à exclusão do perfil, a pessoa ainda "existe".
  // Segunda chance antes de acusar — a primeira pode ser só lentidão do Admin SDK.
  let authVivo = false;
  try { await admin.auth().getUser(uid); authVivo = true; } catch (e) {}
  if (authVivo) {
    await _espera(5000);
    try { await admin.auth().getUser(uid); } catch (e) { authVivo = false; }
  }
  if (authVivo) sobras.push("Firebase Auth — conta de login ainda existe");

  /* ⛔ 6ª auditoria (ponto 2): a autoridade NOVA também entra na conta de sobras. Antes só
   * `users.friends[]` era conferido — e é justamente `friendships`/`friendAccess` que
   * concede leitura. Órfão ali é autorização sem dono. */
  await conta("friendships.uidA (relação com uid morto)", db.collection("friendships").where("uidA", "==", uid));
  await conta("friendships.uidB (relação com uid morto)", db.collection("friendships").where("uidB", "==", uid));
  try {
    const meus = await db.collection("friendAccess").doc(uid).collection("accepted").get();
    if (!meus.empty) sobras.push("friendAccess/" + uid + "/accepted (" + meus.size + ")");
  } catch (e) {}
  try {
    // projeção REVERSA: alguém ainda concede acesso PARA o uid morto
    const rev = await db.collectionGroup("accepted").where("friendUid", "==", uid).get();
    if (!rev.empty) sobras.push("friendAccess reverso apontando pro uid (" + rev.size + ")");
  } catch (e) { console.warn("[sweepLeftovers] friendAccess reverso:", e && e.message); }

  await conta("tournaments.memberUids", db.collection("tournaments").where("memberUids", "array-contains", uid));
  await conta("tournaments.creatorUid", db.collection("tournaments").where("creatorUid", "==", uid));
  await conta("tournaments.organizerUid", db.collection("tournaments").where("organizerUid", "==", uid));
  await conta("presences.uid", db.collection("presences").where("uid", "==", uid));
  await conta("casualMatches.playerUids", db.collection("casualMatches").where("playerUids", "array-contains", uid));
  // user-vivo:isento — busca reversa por uid (contagem de vínculos de terceiros).
  await conta("users.friends[] de terceiros", db.collection("users").where("friends", "array-contains", uid));
  await conta("results.playerUids", db.collectionGroup("results").where("playerUids", "array-contains", uid));
  try { const d = await db.collection("letzplayScans").doc(uid).get(); if (d.exists) sobras.push("letzplayScans/" + uid); } catch (e) {}

  // Subcoleções de users/{uid}: o Firestore NÃO as apaga junto com o doc pai.
  try {
    const cols = await db.collection("users").doc(uid).listCollections();
    for (const c of cols) {
      const s = await c.limit(1).get();
      if (!s.empty) sobras.push("users/" + uid + "/" + c.id + " — subcoleção órfã");
    }
  } catch (e) {}

  // Tombstone é o estado ESPERADO da exclusão canônica — não é sobra.
  if (kind === "hard") {
    try { const d = await db.collection("users").doc(uid).get(); if (d.exists) sobras.push("users/" + uid + " — doc recriado"); } catch (e) {}
  }
  return sobras;
}

exports.accountDeletionEmail = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 300 },
  async (event) => {
    try {
      const uid = event.params.uid;
      const bs = event.data && event.data.before;
      const as = event.data && event.data.after;
      const before = (bs && bs.exists) ? (bs.data() || {}) : null;
      const after = (as && as.exists) ? (as.data() || {}) : null;

      const d = _delEmail.decideDeletionNotice(before, after);
      if (!d.notify) return;                       // escrita comum, fusão, repetição
      console.log("[accountDeletionEmail] " + uid + " → " + d.kind + " (" + d.reason + ")");

      const db = admin.firestore();
      const nome = String(before.displayName || "");
      const docEmail = (before.email && !_isSyntheticAuthEmail(before.email)) ? String(before.email) : "";

      // Auth pode já ter sido apagado (a CF apaga por último) — best-effort.
      let providers = [], createdAt = null, lastSignIn = null, authEmail = "";
      try {
        const ur = await admin.auth().getUser(uid);
        authEmail = (ur.email && !_isSyntheticAuthEmail(ur.email)) ? ur.email : "";
        providers = (ur.providerData || []).map((x) => x && x.providerId).filter(Boolean);
        createdAt = ur.metadata && ur.metadata.creationTime;
        lastSignIn = ur.metadata && ur.metadata.lastSignInTime;
      } catch (e) { /* já removido do Auth — o esperado */ }
      if (!providers.length && before.authProvider) providers = [before.authProvider];
      const destinatario = docEmail || authEmail;

      // O que existia — lido do `before`, que é o último retrato real do perfil.
      const campos = Object.keys(before).filter((k) => k !== "deleted" && k !== "deletedAt");
      const items = ["Perfil (users/" + uid + ") — " + campos.length + " campo(s)"];
      if (nome) items.push("Nome e e-mail de login");
      if (before.photoURL) items.push("Foto de perfil");
      if (before.phone) items.push("Celular cadastrado");
      if (Array.isArray(before.friends) && before.friends.length) items.push(before.friends.length + " amizade(s)");
      if (Array.isArray(before._trophyIds) && before._trophyIds.length) items.push(before._trophyIds.length + " troféu(s)");
      items.push(d.kind === "hard" ? "Documento removido por completo"
                                   : "Documento reduzido a marcador anônimo (sem dado pessoal)");

      const leftovers = await _sweepDeletionLeftovers(db, uid, d.kind);
      const info = {
        uid, name: nome, email: destinatario, phone: before.phone || "",
        providers, createdAt, lastSignIn, deletedAt: new Date(),
        items, leftovers, swept: true, origin: "exclusão de conta (" + d.reason + ")",
      };

      // ids determinísticos + create(): reentrega do gatilho não vira e-mail dobrado.
      const idMail = _delEmail.mailDocId(uid);
      const põe = async (docId, doc) => {
        try { await db.collection("mail").doc(docId).create(doc); return true; }
        catch (e) {
          if (e && (e.code === 6 || String(e.message || "").indexOf("ALREADY_EXISTS") !== -1)) {
            console.log("[accountDeletionEmail] " + docId + " já enfileirado — ignorado"); return false;
          }
          throw e;
        }
      };

      // O DETALHE OPERACIONAL VIVE NO LOG, não numa caixa de e-mail. Com o
      // relatório interno removido (regra: "nenhum outro destinatário"), é aqui
      // que ficam uid, provedores, datas e os caminhos de sobra. Sobra é ERRO de
      // propósito: some no meio de log comum, e é justamente o que exige ação.
      console.log("[accountDeletionEmail] " + JSON.stringify({
        uid, nome, providers, criada: createdAt, ultimoAcesso: lastSignIn,
        itens: items, sobras: leftovers.length,
      }));
      if (leftovers.length) {
        console.error("[accountDeletionEmail] SOBRARAM referências de " + uid +
          " — limpeza manual: " + leftovers.join(" | "));
      }

      // UM e-mail por exclusão, sempre — quem recebe é decisão do core, pra
      // "nenhum outro destinatário" ser verificável num lugar só:
      //   com e-mail → confirmação pra pessoa (CC caixa da empresa);
      //   só celular → relatório pra caixa da empresa (o titular não é avisado,
      //                porque avisá-lo exigiria SMS, que o sistema não envia).
      // Os dois nunca saem juntos: o relatório SUBSTITUI a confirmação.
      const alvos = _delEmail.mailTargets(destinatario);
      const ehRelatorio = !alvos.user;
      const alvo = alvos.user || alvos.report;
      const m = ehRelatorio ? _delEmail.buildReportEmail(info) : _delEmail.buildUserEmail(info);
      /* ⚠️ `_FV` (subpath `firebase-admin/firestore`) e NÃO `admin.firestore.FieldValue`:
       * no runtime do emulador de Functions esse namespace vem sem `.FieldValue`, e a linha
       * derrubava o gatilho INTEIRO no catch de best-effort — o e-mail de exclusão nunca era
       * enfileirado e o log dizia "[accountDeletionEmail] falhou: Cannot read properties of
       * undefined (reading 'serverTimestamp')", com a suíte verde porque nada conferia a
       * fila `mail`. Mesmo caminho já adotado no tombstone de `deleteAccount`. */
      await põe(idMail, Object.assign({}, alvo, {
        message: { subject: m.subject, html: m.html, text: m.text },
        createdAt: _FV.serverTimestamp(),
      }));
      console.log("[accountDeletionEmail] enfileirado (" + (ehRelatorio ? "relatório — conta sem e-mail" : "confirmação ao titular") +
        ") → " + alvo.to.join(",") + " (cc " + (alvo.cc.join(",") || "—") + ") | sobras=" + leftovers.length);
    } catch (e) {
      // best-effort: a conta já foi apagada; falhar aqui não pode reverter nada.
      console.error("[accountDeletionEmail] falhou:", e && e.message);
    }
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
      // user-vivo:isento (vale pro bloco abaixo) — este é o PRÓPRIO caminho de fusão: ele
      // precisa dos docs CRUS pra decidir quem funde com quem. Descarta lápide e o próprio
      // uid na linha seguinte (`d.id !== uid && !d.data().mergedInto`), que é a semântica da
      // porta aplicada na fonte — seguir a corrente aqui fundiria uma conta já fundida.
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

        // ⚠️ v1.8.3 — FUNDIR EXIGE CREDENCIAL AUTENTICADA. SEMPRE.
        // Regra do dono (11/ago/2026), ao ver que este trigger fundia sem isso:
        // _"tem que autenticar email ou celular. sempre autenticado. nada disso de ser
        // frouxo."_ E ele tem razão: até aqui bastava o campo `phone`/`email` do PERFIL
        // bater — texto DIGITADO. Um dígito errado cai no número de outra pessoa, e a
        // fusão APAGA uma conta do Auth, sem volta. Ou seja: dava pra apagar a conta de um
        // terceiro digitando o telefone dele no próprio perfil.
        // A prova é o AUTH: `phoneNumber` só existe depois de SMS conferido, e o e-mail
        // precisa de `emailVerified`. Os DOIS lados têm que provar — um só não diz nada
        // sobre o outro. Sem prova, NÃO funde (e não pergunta aqui: quem pergunta é o
        // fluxo de duplicata, que sabe mascarar o contato).
        // v2.0.5: a regra saiu daqui pra `_mayAutoMerge` → merge-rules. Estava escrita
        // SÓ neste caminho, e a varredura diária (a outra porta) fundiu duas pessoas
        // diferentes por não ter a cópia. Uma regra, dois chamadores.
        const _prova = await _mayAutoMerge(currentDoc, freshOther);
        if (!_prova.allowed) {
          console.log(`[autoMergeOnProfileUpdate] RECUSADO ${uid} × ${other.id}: ` +
            `"${field}" bate no PERFIL mas não há credencial AUTENTICADA nos dois lados — ` +
            `fundir por texto digitado apagaria conta de terceiro.`);
          continue;
        }

        const { keepDoc, dropDoc } = await _determineMergeWinner(currentDoc, freshOther);
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
// uid do slot no momento do envio (functions-autodraw).

// ─── enforceUniqueDisplayName (Firestore trigger) ─────────────────────────
// NOME ÚNICO ENTRE UIDS, garantido no SERVIDOR.
//
// A regra já existia em 4 pontos — mas 3 deles são do CLIENTE (auto-variante no primeiro
// login, gate do perfil, isDisplayNameTaken) e são fail-open de propósito. O único ponto
// server-side era a registerPhonePassword, que cobre só cadastro por celular+senha:
// **login com Google/Apple não passava por checagem nenhuma no servidor**.
//
// MEDIDO em 04/ago/2026 (184 contas): o auto-variante entrou em 24/jun e mesmo assim
// nasceram contas homônimas em 11/jul, 14/jul, 17/jul e 30/jul. Não era falta de
// displayName_lower (todas têm), nem permissão (as rules liberam a consulta), nem nome
// vazio do provedor — era a lei morar num lugar que pode simplesmente não rodar.
// Cânone roda no servidor ([[project_canon_runs_on_server]]).
//
// POLÍTICA: aqui NÃO se bloqueia — adota-se variante. Bloquear é o comportamento do
// cadastro por celular (onde homônimo é quase sempre a mesma pessoa) e do gate do perfil
// (ação explícita). Na ENTRADA vale "deixa entrar e edita depois" (v1.1.3).
//
// ANTI-LOOP: só age quando o displayName MUDOU nesta escrita. Depois de renomear, a
// própria escrita reacorda o trigger — mas aí o nome novo não colide e ele volta na hora.
// ─── DUPLICATA NO CADASTRO — a mesma pergunta, fora de torneio (v1.8.3) ──────────
// Regra do dono (11/ago/2026): _"essa verificação deve acontecer quando a pessoa se
// cadastra"_. Até aqui a detecção só rodava na INSCRIÇÃO EM TORNEIO — quem criava a
// segunda conta e não se inscrevia em nada nunca era perguntado, e a duplicata só aparecia
// mais tarde (no Confra levou 8 dias, e só porque a fila formou grupo).
//
// ⚠️ NÃO reusa `findDisplayNameConflict`: aquela é o caminho que BLOQUEIA o cadastro
// (`already-exists`, "escolha outro nome"). Ampliá-la pra nomes PARECIDOS faria o app
// RECUSAR "Rodrigo Terra Barth" por existir "Rodrigo Barth" — o oposto do pedido. Aqui só
// se PERGUNTA. Perguntar e bloquear são caminhos separados de propósito.
//
// Rigor BASE (não o de torneio): o universo é a base inteira, onde quem se parece com você
// provavelmente não tem nada a ver. Ver compararNomes.
async function _detectarDuplicataNaBase(db, uid, meu) {
  try {
    if (!meu || meu.mergedInto) return null;
    const nome = String(meu.displayName || "").trim();
    // user-vivo:isento (vale pro bloco de `consultas` abaixo) — isto LISTA candidatos pra um
    // julgamento de duplicata, não resolve UMA pessoa pra agir sobre ela. Passar pela porta
    // seria errado aqui, por dois motivos: a lápide precisa ser DESCARTADA e não seguida (uma
    // conta já fundida não é uma duplicata a resolver), e colapsar lápide+sobrevivente
    // esconderia justamente o par que o julgamento existe pra enxergar. O descarte é
    // explícito logo abaixo (`if (x.mergedInto) return;`), junto com o do próprio caller.
    const telCanon = _dupPerson.normalizarTelefone(meu.phone);
    const consultas = [];
    if (nome && !_nameUnique.isUnfriendlyName(nome.toLowerCase())) {
      const chaves = _dupPerson.chavesDeBusca(nome).slice(0, 10);
      const sobren = _dupPerson.chaveSobrenome(nome);
      if (chaves.length) {
        consultas.push(db.collection("users").where("displayName_keys", "array-contains-any", chaves).limit(20).get());
      }
      if (sobren) consultas.push(db.collection("users").where("displayName_lastkey", "==", sobren).limit(40).get());
      if (_dupPerson.temInicialAbreviada(nome)) {
        const pk = _dupPerson.chavePrimeiroNome(nome);
        if (pk) consultas.push(db.collection("users").where("displayName_firstkey", "==", pk).limit(40).get());
      }
      // v1.8.38 — NOME DE UM TOKEN SÓ ("Betânia", "Luciana"): nenhuma das consultas acima
      // alcança quem tem esse token no MEIO do nome ("maria BETANIA roberto faria").
      // `_keys` é o nome inteiro concatenado e `_firstkey`/`_lastkey` são as pontas. Foi
      // esse buraco que deixou a mesma pessoa em dois grupos do Confra. Só disparamos
      // quando o nome tem 1 token — fora daí seria trazer meia base à toa.
      if (_dupPerson.tokensNome(nome).length === 1) {
        const tk = _dupPerson.tokensNome(nome)[0];
        if (tk) consultas.push(db.collection("users").where("displayName_tokens", "array-contains", tk).limit(30).get());
      }
    }
    if (telCanon) consultas.push(db.collection("users").where("phone", "==", meu.phone).limit(8).get());
    const _mailMeu = _dupPerson.normalizarEmail(meu.email);
    if (_mailMeu) consultas.push(db.collection("users").where("email", "==", meu.email).limit(8).get());
    if (!consultas.length) return null;

    const snaps = await Promise.all(consultas.map((p) => p.catch(() => null)));
    const vistos = {};
    const pessoas = [];
    for (const snap of snaps) {
      if (!snap) continue;
      snap.forEach((d) => {
        if (d.id === uid || vistos[d.id]) return;
        const x = d.data() || {};
        if (x.mergedInto) return;
        vistos[d.id] = true;
        pessoas.push({ uid: d.id, nome: x.displayName || "", telefone: x.phone || "",
          email: x.email || "", linkedEmails: x.linkedEmails || [],
          letzplayHandle: x.letzplayHandle || "" });
      });
    }
    if (!pessoas.length) return null;

    // v1.8.38 — raridade do token: MESMO helper que o caminho da inscrição usa.
    const freqTokens = await _freqDosTokensSoltos(db, _dupPerson, nome, pessoas);

    const r = _dupPerson.detectarMesmaPessoa({
      uid: uid, nome: nome, telefone: meu.phone || "", email: meu.email || "",
      linkedEmails: meu.linkedEmails || [], letzplayHandle: meu.letzplayHandle || "",
      dispensados: [].concat(
        Array.isArray(meu.dupDismissedInfo) ? meu.dupDismissedInfo : [],
        Array.isArray(meu.dupDismissed) ? meu.dupDismissed : []),
    }, pessoas, { freqTokens: freqTokens });
    if (!r.suspeito) return null;

    // CREDENCIAL AUTENTICADA nem pergunta: funde. Mesma regra da inscrição — a prova é o
    // AUTH (SMS conferido / emailVerified), nunca o campo do perfil.
    if (r.suspeito.motivo === "celular" || r.suspeito.motivo === "email") {
      try {
        const [a1, a2] = await Promise.all([
          admin.auth().getUser(uid).catch(() => null),
          admin.auth().getUser(r.suspeito.uid).catch(() => null),
        ]);
        const t1 = a1 && a1.phoneNumber, t2 = a2 && a2.phoneNumber;
        const e1 = a1 && a1.emailVerified && _dupPerson.normalizarEmail(a1.email);
        const e2 = a2 && a2.emailVerified && _dupPerson.normalizarEmail(a2.email);
        if ((t1 && t2 && _dupPerson.normalizarTelefone(t1) === _dupPerson.normalizarTelefone(t2)) ||
            (e1 && e2 && e1 === e2)) {
          console.log(`[dup-cadastro] credencial AUTENTICADA igual (${uid} × ${r.suspeito.uid}) — fundindo`);
          await _mergeAccountsKeepOlder(db, uid, r.suspeito.uid);
          return null;
        }
      } catch (e) { console.error("[dup-cadastro] fusão falhou (segue pra pergunta):", e && e.message); }
    }

    const alvo = pessoas.filter((p) => p.uid === r.suspeito.uid)[0] || {};
    const emailReal = (alvo.email && !_nameUnique.isSyntheticEmail(alvo.email)) ? alvo.email : "";
    return {
      uid: r.suspeito.uid, motivo: r.suspeito.motivo, semelhanca: r.suspeito.semelhanca || null,
      nome: alvo.nome || "",
      maskedEmail: _nameUnique.maskEmail(emailReal) || null,
      maskedPhone: _nameUnique.maskPhone(alvo.telefone) || null,
    };
  } catch (e) {
    console.error("[dup-cadastro] fail-open:", e && e.message);
    return null;   // nunca barra nada
  }
}

exports.enforceUniqueDisplayName = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const after = event.data.after;
    if (!after.exists) return;
    const a = after.data() || {};
    const b = event.data.before.exists ? (event.data.before.data() || {}) : {};

    if (a.mergedInto) return;                       // tombstone de fusão — fora da disputa
    const nome = String(a.displayName || "").trim();
    if (!nome) return;

    const db = admin.firestore();
    const uid = event.params.uid;

    // ── v1.8.3 · AS CHAVES DE BUSCA SÃO MANTIDAS PELO SERVIDOR ──────────────────
    // `displayName_keys`/`displayName_lastkey` são o índice da detecção de duplicata
    // (ver _detectarDuplicataNoTorneio). Elas NÃO são calculadas no cliente de propósito:
    // duplicar a regra de normalização em dois lugares foi exatamente o que produziu o
    // incidente — havia uma normalização forte pra comparar e uma fraca pra buscar, e a
    // fraca decidia. Aqui o cliente só DISPARA (grava o nome) e o servidor mantém o
    // derivado, do mesmo jeito que o espelho do roster (v1.7.98). Vale pra TODA escrita,
    // de QUALQUER cliente — inclusive o app NATIVO publicado, que não tem auto-update.
    //
    // De brinde, é o BACKFILL: perfil legado ganha as chaves na primeira vez que for
    // tocado, sem migração à parte.
    //
    // ⚠️ ANTI-LOOP: este write re-dispara o trigger. Só grava quando o que está no doc
    // DIVERGE do esperado — na segunda passada bate e não escreve. Roda ANTES do
    // "nome não mudou → return" justamente pra alcançar o legado.
    try {
      const kEsperado = _dupPerson.chavesDeBusca(nome);
      const sEsperado = _dupPerson.chaveSobrenome(nome);
      const fEsperado = _dupPerson.chavePrimeiroNome(nome);
      // v1.8.38: `displayName_tokens` — os tokens SOLTOS do nome ("maria","betania",
      // "roberto","faria"). As outras três chaves não alcançam token do MEIO: `_keys` é o
      // nome inteiro concatenado, `_firstkey`/`_lastkey` são as pontas. Foi por isso que
      // "Betânia" nunca encontrou "maria betania roberto faria" — a MESMA pessoa em dois
      // grupos do Confra (12/ago). Este índice serve as duas pontas do sinal novo:
      // ACHAR o candidato (array-contains) e MEDIR a raridade do token (count).
      const tEsperado = _dupPerson.tokensNome(nome);
      const kAtual = Array.isArray(a.displayName_keys) ? a.displayName_keys : null;
      const tAtual = Array.isArray(a.displayName_tokens) ? a.displayName_tokens : null;
      const divergiu = !kAtual || !tAtual ||
        kAtual.length !== kEsperado.length ||
        kEsperado.some((x, i) => kAtual[i] !== x) ||
        tAtual.length !== tEsperado.length ||
        tEsperado.some((x, i) => tAtual[i] !== x) ||
        String(a.displayName_lastkey || "") !== sEsperado ||
        String(a.displayName_firstkey || "") !== fEsperado;
      if (divergiu) {
        await db.collection("users").doc(uid).set(
          { displayName_keys: kEsperado, displayName_lastkey: sEsperado,
            displayName_firstkey: fEsperado, displayName_tokens: tEsperado }, { merge: true });
        console.log(`[enforceUniqueDisplayName] uid=${uid}: chaves de busca atualizadas ` +
          `(${JSON.stringify(kEsperado)} / ${sEsperado})`);
      }
    } catch (e) {
      console.error("[enforceUniqueDisplayName] chaves de busca falharam (best-effort):", e && e.message);
    }

    // ─── DUPLICATA NO CADASTRO (v1.8.3) ────────────────────────────────────────
    // Regra do dono: _"essa verificação deve acontecer quando a pessoa se cadastra"_.
    // Roda quando o NOME, o CELULAR ou o E-MAIL mudam — que é quando aparece dado novo
    // capaz de revelar a segunda conta. Grava `dupSuspect` (só o contato MASCARADO), que
    // o cliente lê e transforma em pergunta. Se a credencial estiver AUTENTICADA nos dois
    // lados, `_detectarDuplicataNaBase` já funde e não sobra nada pra perguntar.
    // ⚠️ Separado de `nameConflict` DE PROPÓSITO: aquele é UNICIDADE (nome idêntico → a
    // saída é trocar de nome); este é DUPLICATA (nome parecido → a saída é unir ou dizer
    // "não sou eu"). "Rodrigo Terra Barth" não precisa trocar de nome por existir
    // "Rodrigo Barth" — precisa ser perguntado.
    try {
      const _mudouIdent = nome !== String(b.displayName || "").trim() ||
        String(a.phone || "") !== String(b.phone || "") ||
        String(a.email || "") !== String(b.email || "");
      if (_mudouIdent) {
        const _dup = await _detectarDuplicataNaBase(db, uid, a);
        if (_dup) {
          await db.collection("users").doc(uid).set({
            dupSuspect: {
              nome: _dup.nome, motivo: _dup.motivo, semelhanca: _dup.semelhanca,
              maskedEmail: _dup.maskedEmail, maskedPhone: _dup.maskedPhone,
              at: new Date().toISOString(),
            },
          }, { merge: true });
          console.log(`[enforceUniqueDisplayName] uid=${uid}: possível segunda conta ` +
            `(${_dup.motivo}/${_dup.semelhanca || "-"}) → dupSuspect gravado`);
        } else if (a.dupSuspect) {
          // Resolvido (fundiu, dispensou, ou a outra sumiu) → o sinal não pode ficar pendurado.
          await db.collection("users").doc(uid).set(
            { dupSuspect: admin.firestore.FieldValue.delete() }, { merge: true });
        }
      }
    } catch (e) {
      console.error("[enforceUniqueDisplayName] duplicata no cadastro (best-effort):", e && e.message);
    }

    if (nome === String(b.displayName || "").trim()) return; // nome não mudou → nada a fazer
    if (_nameUnique.isUnfriendlyName(nome)) return; // placeholder não disputa unicidade
    const conflito = await _nameUnique.findDisplayNameConflict(db, nome, uid);

    if (!conflito) {
      // Conflito resolvido (a pessoa trocou de nome, ou a outra conta sumiu/fundiu):
      // limpa o sinal, senão a pergunta ficaria pendurada pra sempre.
      if (a.nameConflict) {
        await db.collection("users").doc(uid).set(
          { nameConflict: admin.firestore.FieldValue.delete() }, { merge: true });
        console.log(`[enforceUniqueDisplayName] uid=${uid}: conflito de "${nome}" resolvido — sinal limpo`);
      }
      return;
    }

    // Quem já estava com o nome não é incomodado pelas costas.
    if (!_nameVariant.shouldIRename(a, conflito, uid)) {
      console.log(`[enforceUniqueDisplayName] "${nome}" colide com ${conflito.uid}, mas quem responde é o outro lado (uid=${uid} é o estabelecido)`);
      return;
    }

    // ⚠️ v1.7.37 — NÃO RENOMEIA MAIS EM SILÊNCIO. Regra do dono (05/ago/2026):
    // _"o certo, invés de criar 'Gabriela Ferreira 2', é indicar o nome que já existe,
    // indicando com ****email/celular e perguntar se é a mesma pessoa. Autentica se for e
    // mescla. Se não for, que a pessoa indique um nome válido e livre."_
    //
    // A variante automática resolvia a UNICIDADE e escondia a PERGUNTA — e, pior, cegava a
    // própria detecção de duplicata: com "Gabriela Ferreira 2" no banco, a comparação por
    // nome idêntico nunca mais casaria. Aqui só se SINALIZA; quem decide é a pessoa.
    // Só o MASCARADO é gravado: `nameConflict` é lido pelo cliente, e uid/contato cheio da
    // outra conta nunca podem chegar lá ([[project_privileged_fields_never_client_writable]]).
    const emailReal = (conflito.email && !_nameUnique.isSyntheticEmail(conflito.email)) ? conflito.email : "";
    await db.collection("users").doc(uid).set({
      nameConflict: {
        nome: nome,
        maskedEmail: _nameUnique.maskEmail(emailReal) || null,
        maskedPhone: _nameUnique.maskPhone(conflito.phone) || null,
        at: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    console.log(`[enforceUniqueDisplayName] uid=${uid}: "${nome}" colide com ${conflito.uid} → SINALIZADO (sem renomear)`);
  }
);

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

// ─── PROPAGAÇÃO DE NOME ───────────────────────────────────────────────────────
// Ordem do dono (ago/2026): "quando a pessoa troca o nome de perfil, isso tem que
// ser atualizado em todo o banco de dados".
// MEDIDO na base: 495 slots guardam (uid + rótulo) e 14 estavam desatualizados —
// Fabi2401@→Dani Bataglia, Marina Turri→Marina Cegal, Mariana C→Mariana Ciocci,
// RODRIGO UNGER PIRES DA SILVA→Rodrigo Unger, Adriana→Adriana Rosa.
//
// ⚠️ ISTO NÃO É A REDE — é a limpeza. A rede é o uid: desde a 1.7.79 a chave
// NASCE do uid e o rótulo não sustenta mais nada na tela. A propagação nunca é
// completa nem instantânea (doc offline, torneio antigo, escrita que falha no
// meio), então nada pode voltar a DEPENDER dela.
//
// A regra do que reescrever mora em rename-propagate-core (PURO, 20 asserções):
// só por uid, nunca por nome — e array desalinhado é recusado por inteiro em vez
// de adivinhado (foi assim que a saída da Denise quase renomeou o vizinho).
exports.propagateDisplayName = onDocumentWritten(
  { document: "users/{uid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 300 },
  async (event) => {
    const after = event.data.after;
    if (!after || !after.exists) return;
    const a = after.data() || {};
    const b = event.data.before && event.data.before.exists ? (event.data.before.data() || {}) : {};
    if (a.deleted || a.mergedInto) return;                 // tombstone não propaga nada
    const novo = String(a.displayName || "").trim();
    const velho = String(b.displayName || "").trim();
    // SÓ quando o nome MUDOU de verdade — senão toda escrita de perfil (presença,
    // troféu, preferência) varreria os torneios à toa. Também é o anti-loop.
    if (!novo || novo === velho) return;

    const uid = event.params.uid;
    const db = admin.firestore();
    let docs = [];
    try { docs = (await db.collection("tournaments").where("memberUids", "array-contains", uid).get()).docs; }
    catch (e) { console.error("[propagateDisplayName] query:", e.message); return; }

    let tocados = 0, slots = 0;
    for (const d of docs) {
      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(d.ref);            // relê DENTRO da transação
          if (!snap.exists) return;
          // ⛔ Torneio DIVIDIDO: o elenco e os jogos moram em subcoleções, e no documento
          // os campos ficam `[]`. Sem hidratar, `planRename` não acharia UM slot sequer e
          // o rótulo velho ficaria pra sempre — falha silenciosa, `r.total` = 0.
          // Hidrata ANTES de qualquer escrita (a transação lê tudo primeiro).
          const t = await _splitParts.hidratar(tx, d.ref, snap.data());
          const r = _renameProp.planRename(t, uid, novo);
          if (!r.total) return;
          // escrita SELETIVA: só os campos de topo que o plano tocou — nunca o doc
          // inteiro (outra aba pode ter lançado placar no meio).
          const patch = {};
          _renameProp.camposTocados(r.mudancas).forEach((c) => { patch[c] = t[c]; });
          _splitParts.gravar(tx, d.ref, t, patch);
          tocados++; slots += r.total;
          if (r.avisos && r.avisos.length) {
            console.warn("[propagateDisplayName] arrays desalinhados em " + d.id + ": " + JSON.stringify(r.avisos));
          }
        });
      } catch (e) { console.error("[propagateDisplayName] " + d.id + ":", e.message); }
    }
    if (tocados) console.log(`[propagateDisplayName] ${uid} → "${novo}": ${slots} rótulo(s) em ${tocados} torneio(s)`);
  }
);

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

// Lê um torneio pela fonte que o próprio marcador declara. Esta função existe para os
// dois caminhos server-side de `results`: o gatilho incremental e o backfill. Deixar
// cada um listar partes por conta própria recriaria a falha que esta leva corrige.
async function _montarTorneioCanonico(tournamentRef, config) {
  return _tSplitFn.montarDoBanco(config, async (colecao) => {
    const snap = await tournamentRef.collection(colecao).get();
    return snap.docs.map((d) => d.data());
  });
}

// ─── syncSplitMatchResult — Fase 2: fonte `matches` → projeção `results` ──────
// `syncMatchRosters` observa o documento do torneio e serve os torneios inteiros.
// Depois da Fase 2, o placar pode mudar em `tournaments/{tid}/matches/{matchId}`
// sem que o doc pai contenha qualquer jogo. Este é o gatilho complementar, não uma
// segunda fonte: ele remonta o torneio atual pelo mesmo `montarDoBanco` do app/CF e
// espelha exclusivamente o jogo que mudou. O cliente continua sem dual-write.
exports.syncSplitMatchResult = onDocumentWritten(
  { document: "tournaments/{tid}/matches/{matchId}", region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const tid = event.params.tid;
    const matchId = event.params.matchId;
    const db = admin.firestore();
    const tournamentRef = db.collection("tournaments").doc(tid);
    const configSnap = await tournamentRef.get();
    if (!configSnap.exists) return;
    const config = configSnap.data() || {};
    const fora = Array.isArray(config._semPesados) ? config._semPesados : [];
    if (fora.indexOf('matches') === -1) return; // o espelho legado segue pelo gatilho do doc

    let t;
    try {
      t = await _montarTorneioCanonico(tournamentRef, config);
    } catch (e) {
      // Fail-closed: um torneio incompleto jamais pode produzir `results` inventado.
      console.error(`[syncSplitMatchResult] ${tid}/${matchId}: não montou fonte canônica:`, e && e.message);
      return;
    }

    const resultRef = tournamentRef.collection("results").doc(String(matchId));
    const anteriorSnap = await resultRef.get();
    const plano = _splitResultMirror.planoDoEspelho(
      t, matchId, anteriorSnap.exists ? anteriorSnap.data() : null, tid, new Date().toISOString()
    );
    if (plano.acao === 'skip') return;
    if (plano.acao === 'delete') {
      if (anteriorSnap.exists) await resultRef.delete();
      return;
    }
    await resultRef.set(plano.doc); // sem merge: campos removidos da fonte também somem
    console.log(`[syncSplitMatchResult] ${tid}/${matchId}: espelho atualizado`);
  }
);

exports.syncMatchRosters = onDocumentWritten(
  { document: "tournaments/{tid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 60 },
  async (event) => {
    const tid = event.params.tid;
    const after  = event.data.after.exists  ? (event.data.after.data()  || {}) : null;
    const before = event.data.before.exists ? (event.data.before.data() || {}) : null;
    if (!after) return; // torneio deletado — nada a sincronizar

    // ── v1.7.36 · VIGIA ESTRUTURAL (modo OBSERVAÇÃO) ───────────────────────
    // Os guards de perda por save atrasado moram no CLIENTE QUE GRAVA e só valem pra
    // quem os carrega. O app NATIVO não tem auto-update, então existe uma janela com
    // gente em 1.6.3/1.7.9 gravando no mesmo torneio. Aqui o servidor vê TODO MUNDO.
    // O gatilho do Firestore não carrega a identidade de quem escreveu — quem separa
    // autoridade de acidente é o `rosterRev`, contador de documento FORA da allowlist
    // do participante (firestore.rules usa `hasOnly([...])`, lista fechada).
    // NÃO REVERTE NADA nesta fase: primeiro medir quantos casos reais aparecem e de
    // que clientes. Reverter escalação errado no meio de um torneio ao vivo é pior do
    // que o defeito. Roda antes do early-return de baixo pra observar toda escrita.
    try {
      const _rw = _rosterWatch.detectarTrocaDeEscalacao(before, after);
      if (_rw.suspeitos.length) {
        console.error("[vigia-escalacao] " + tid + " · " + _rw.suspeitos.length +
          " jogo(s) tiveram os JOGADORES trocados sem o contador subir (" +
          "rosterRev " + _rw.revAntes + "→" + _rw.revDepois + "; " + _rw.motivo + "): " +
          JSON.stringify(_rw.suspeitos.slice(0, 5)));
      }
    } catch (_rwErr) { /* o vigia NUNCA derruba o gatilho */ }

    // ── v1.7.99 · ESPELHO DO ROSTER — AGORA AQUI, E SÓ AQUI ────────────────
    // `tournaments/{id}/participants/{uid}` é a REDE contra perda de inscrito (Gersom,
    // 1.7.29). Ele vivia no CLIENTE e MEDIDO em 10/ago: **não existe regra pra essa
    // subcoleção**, então toda escrita de cliente voltava `permission-denied` — a rede
    // nunca existiu de fato. Cânone do dono: tudo roda na CF, o cliente só dispara.
    //
    // Aqui é o lugar CERTO, e não só o permitido: este gatilho vê TODA escrita, de
    // QUALQUER cliente — inclusive o app NATIVO antigo, que não tem auto-update e nunca
    // vai chamar CF nenhuma. Ele cobre o que a `enrollParticipant` não cobre: os
    // MOVIMENTOS (W.O., promoção da fila, saída) e a inscrição que cai no fallback do
    // cliente quando a CF falha.
    //
    // Roda ANTES do early-return de baixo (que só olha mudança de JOGO): mudança de
    // roster frequentemente não mexe em jogo nenhum, e sair antes cegaria a rede
    // justamente nos eventos que ela existe pra registrar.
    // Best-effort e isolado: falhar aqui não pode derrubar o gatilho nem o save que já
    // aconteceu — o array no doc do torneio segue sendo a fonte da verdade.
    try {
      const _plano = _rosterMirror.planRosterMirror(before, after);
      if (_plano.total) {
        // ⚠️ handle PRÓPRIO, não o `db` da função: ele é `const` declarado MAIS ABAIXO,
        // e `const` fica em zona morta temporal até a linha dele — usá-lo aqui estoura
        // com "Cannot access 'db' before initialization". Foi exatamente o que o log da
        // 1ª tentativa acusou; o `catch` conteve, mas o espelho não escrevia nada.
        const _db = admin.firestore();
        const _col = _db.collection("tournaments").doc(tid).collection("participants");
        await Promise.all(_plano.writes.map((w) =>
          _col.doc(w.uid).set(w.doc, { merge: true })
            .catch((e) => console.error("[espelho-roster] " + tid + "/" + w.uid + ": " + (e && e.message)))));
        console.log("[espelho-roster] " + tid + " · " + _plano.total + " doc(s) atualizados");
      }
    } catch (_rmErr) {
      console.error("[espelho-roster] " + tid + " falhou:", _rmErr && _rmErr.message);
    }

    /* ── O W.O. CHEGA NAS SUBCOLEÇÕES (2.1.63) ──────────────────────────────
     * `mutateTournament` — a porta do W.O. — roda o mutator sobre o documento CRU. Num
     * torneio DIVIDIDO isso é o documento MAGRO: elenco vazio e nenhum jogo. Então o W.O.
     * entra no `woLog` e na classificação e NÃO entra nem no elenco nem no jogo. Medido no
     * Confra: a Nathalya seguiu escalada nos 3 jogos do grupo depois do W.O. dela, e três
     * substitutos (Fábio Ruggiero, Tiago Lima, Erika Benedet) sumiram do elenco.
     * E o cliente NÃO pode ser o conserto: as regras negam escrita dele em
     * `inscritos`/`matches`. Cânone: tudo roda na CF, o cliente só dispara.
     *
     * ⭐ AQUI, e não numa chamável: este gatilho vê TODA escrita, de QUALQUER cliente —
     * inclusive o app NATIVO, que não tem auto-update e nunca vai chamar CF nenhuma.
     * Mesma razão pela qual o espelho do roster mora logo acima.
     *
     * ⭐ E SÓ SOBRE O DELTA do `woLog`: reconciliar o histórico inteiro reabriria decisão
     * antiga. No ensaio do reparo manual isso apareceu na hora — três ausentes de W.O.
     * pré-divisão estavam ativos DE PROPÓSITO, um deles reativado à mão pelo organizador.
     *
     * Best-effort e isolado, como os vizinhos: falhar aqui não derruba o gatilho nem
     * desfaz o save que já aconteceu. [[project_wo_nao_escreve_nas_subcolecoes]] */
    try {
      if (_woReconcile.precisaReconciliar(after) &&
          _woReconcile.novasEntradasDeWo(before, after).length) {
        const _db2 = admin.firestore();
        const _ref2 = _db2.collection("tournaments").doc(tid);
        const _colIns = _ref2.collection(_tSplitFn.colecaoDaParte("participants"));
        const _colJog = _ref2.collection(_tSplitFn.colecaoDaParte("matches"));
        const [_sIns, _sJog] = await Promise.all([_colIns.get(), _colJog.get()]);
        const _ins = _sIns.docs.map((d) => Object.assign({ _id: d.id }, d.data()));
        const _jog = _sJog.docs.map((d) => Object.assign({ _id: d.id }, d.data()));
        const plano = _woReconcile.planejar(before, after, _ins, _jog);
        if (!plano.nada) {
          const lote = _db2.batch();
          plano.novosInscritos.forEach((n) => lote.set(_colIns.doc(n._id), { _k: n._k, _idx: n._idx, item: n.item }, { merge: true }));
          plano.desativar.forEach((d) => lote.set(_colIns.doc(d._id), { _k: d._k, _idx: d._idx, item: d.item }, { merge: true }));
          plano.patchesDeJogo.forEach((p) => {
            const corpo = { _loc: p._loc, _chave: p._chave, jogo: p.jogo };
            if (p.playerUids) corpo.playerUids = p.playerUids;
            lote.set(_colJog.doc(p._id), corpo, { merge: true });
          });
          /* ⛔ O MARCADOR TEM QUE ACOMPANHAR. `_nPartes.participants` é o que faz o app
           * decidir se busca o elenco; deixá-lo para trás depois de acrescentar gente
           * recria a divergência que este gatilho existe pra fechar. */
          if (plano.novosInscritos.length) {
            const _nP = Object.assign({}, after._nPartes || {}, { participants: _ins.length + plano.novosInscritos.length });
            const _mem = Array.from(new Set((after.memberUids || []).concat(plano.novosInscritos.map((n) => n.item.uid))));
            lote.update(_ref2, { _nPartes: _nP, memberUids: _mem });
          }
          await lote.commit();
          console.log("[wo-reconcilia] " + tid + " · " + plano.eventos + " evento(s) · +" +
            plano.novosInscritos.length + " inscrito(s) · " + plano.desativar.length + " desativado(s) · " +
            plano.patchesDeJogo.length + " jogo(s)" +
            (plano.recusados.length ? " · " + plano.recusados.length + " recusado(s) por placar já lançado" : ""));
        }
      }
    } catch (_woErr) {
      console.error("[wo-reconcilia] " + tid + " falhou:", _woErr && _woErr.message);
    }

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
        // v1.8.79: ANTES aqui havia `if (!snap.exists) continue` — "não semeado, é a
        // migração que cuida". MEDIDO em produção (16/ago) e isso não se sustentava:
        // Confra tinha 4 docs pra dezenas de jogos, e dois torneios de eliminatórias
        // tinham ZERO. A causa é que o seed vive no CLIENTE (`seedMatchResultDocs`, em
        // `_commitInitialDraw`) e o SORTEIO AUTOMÁTICO roda no SERVIDOR — que nunca o
        // chama. Ou seja: quem dependesse do subdoc existir tinha cobertura aleatória.
        // Agora o doc é CRIADO aqui quando falta. Este gatilho é o lugar certo: ele vê
        // TODA escrita no torneio, de QUALQUER cliente (inclusive o nativo antigo) e de
        // qualquer caminho de sorteio, e roda como ADMIN — que é justamente quem a regra
        // deixa criar (`allow create: só admin`). Nenhuma regra precisou mudar.
        // Só entram jogos cuja assinatura MUDOU, então isto não varre o torneio inteiro
        // a cada escrita: cria sob demanda, no jogo que mexeu.
        const existia = snap.exists;
        if (existia && subdocSignature(snap.data()) === sig) continue; // espelho já bate → idempotente
        // `anterior` carrega adiante o que o espelho não sabe recalcular (replay).
        await ref.set(buildMirrorDoc(after, m, tid, nowIso, existia ? snap.data() : null));
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
      const bruto = tdoc.data() || {};
      let t;
      try {
        // `backfill` também é reparo dos torneios já divididos: o documento pai é
        // magro por desenho; usar `collectMatches(bruto)` os ignorava em silêncio.
        t = await _montarTorneioCanonico(tdoc.ref, bruto);
      } catch (e) {
        errors.push({ tid: tdoc.id, err: 'não montou fonte canônica: ' + String(e && e.message) });
        continue;
      }
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
            // `replay` não é derivável de matches; carregar o anterior evita que o
            // reparo correto do placar apague o ponto-a-ponto da partida.
            await resultsCol.doc(id).set(buildMirrorDoc(t, m, tdoc.id, null, existingData[id]));
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

// ─── FOTO DO LOCAL: o Google é chamado UMA VEZ, o app lê do NOSSO servidor (v1.7.53) ───
// INCIDENTE (06/ago/2026): o orçamento de R$100/mês bateu 90% em 5 dias e o relatório de
// faturamento mostrou que R$91,00 dos R$92,09 eram UM SKU só — "Places API Place Details
// Photos". Medido no Monitoring: 89.927 GetPhotoMedia + 65.733 GetPlace em 30 dias, para
// **2 placeIds distintos na base inteira**. Ou seja: o app re-comprava as MESMAS DUAS fotos
// dezenas de milhares de vezes, porque o cache do cliente (_venueFreshPhoto, TTL 6h) era
// invalidado pelo onerror sempre que o token da URI do Places expirava — e a URI expira
// bem antes das 6h. É a SEGUNDA vez que a Places drena o orçamento (a 1ª foi a busca, na
// v4.5.65); a memória daquele incidente já registrava a saída: "o caminho é proxy/snapshot
// da foto (que também cortaria custo)".
//
// Agora: esta CF baixa a foto pelo placeId e guarda o JPEG em base64 em venuePhotos/{placeId}.
// O cliente lê SÓ esse doc — nunca mais fala com o Google para desenhar foto. Efeito colateral
// bom: conserta a foto no iOS NATIVO, que nunca carregou porque a origem capacitor:// jamais
// casa com a restrição de referrer da chave de browser (project_venue_photo_referrer).
//
// ⚠️ A escrita é EXCLUSIVA do Admin SDK (firestore.rules nega escrita do cliente): se o
// cliente pudesse escrever, um bug de render voltaria a virar tempestade de chamadas pagas.
// ⚠️ TTL de 7 dias (decisão do dono, 06/ago): renova a foto 1×/semana por local. Com os 2
// locais da base isso dá ~8 chamadas/MÊS contra as 65 mil de antes — o custo é ruído e a
// foto nunca fica velha. O TTL também evita tratar o conteúdo do Places como cópia
// permanente nossa. Quem paga a renovação é o 1º acesso depois de vencida, nunca o render.
const PLACES_SERVER_KEY = defineSecret("PLACES_SERVER_KEY");
const _VP_TTL_MS = 7 * 24 * 3600 * 1000;
// Tamanhos tentados em ordem: o maior render é o hero do Modo TV (1200×600). O doc do
// Firestore tem teto de 1 MiB e base64 infla ~33%, então caímos de largura até caber com
// folga — foto menor é melhor que doc rejeitado.
const _VP_WIDTHS = [1200, 900, 700];
const _VP_MAX_BYTES = 650 * 1024;

async function _fetchPlacePhotoDataUrl(placeId, key) {
  const det = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?fields=photos&key=${key}`
  );
  if (!det.ok) throw new Error(`places details HTTP ${det.status}`);
  const dj = await det.json();
  const photo = (dj.photos || [])[0];
  if (!photo || !photo.name) return null;           // local sem foto — não é erro
  for (const w of _VP_WIDTHS) {
    const med = await fetch(
      `https://places.googleapis.com/v1/${photo.name}/media` +
      `?maxWidthPx=${w}&maxHeightPx=${Math.round(w / 2)}&skipHttpRedirect=true&key=${key}`
    );
    if (!med.ok) throw new Error(`places media HTTP ${med.status}`);
    const mj = await med.json();
    if (!mj.photoUri) throw new Error("sem photoUri");
    // O download do photoUri é servido pelo googleusercontent e NÃO é cobrado de novo.
    const img = await fetch(mj.photoUri);
    if (!img.ok) throw new Error(`download HTTP ${img.status}`);
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length <= _VP_MAX_BYTES) {
      return {
        dataUrl: "data:image/jpeg;base64," + buf.toString("base64"),
        bytes: buf.length,
        width: w,
        photoName: photo.name,
        // Atribuição do Places — quem tirou a foto. Guardada junto pra a tela poder creditar.
        attributions: Array.isArray(photo.authorAttributions)
          ? photo.authorAttributions.map((a) => String(a.displayName || "")).filter(Boolean)
          : [],
      };
    }
  }
  return null;                                       // não coube em nenhuma largura
}

exports.cacheVenuePhoto = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 60, cors: APP_ORIGINS, secrets: [PLACES_SERVER_KEY] },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");
    const placeId = String((request.data && request.data.placeId) || "").trim();
    // placeId do Google é opaco mas tem alfabeto conhecido — barra lixo antes de gastar chamada.
    if (!placeId || !/^[A-Za-z0-9_-]{6,255}$/.test(placeId)) {
      throw new HttpsError("invalid-argument", "placeId inválido");
    }

    const db = admin.firestore();
    const ref = db.collection("venuePhotos").doc(placeId);
    const snap = await ref.get();
    const cur = snap.exists ? snap.data() : null;
    const at = cur && cur.at ? Number(cur.at) : 0;
    if (cur && (cur.dataUrl || cur.semFoto) && (Date.now() - at) < _VP_TTL_MS) {
      return { ok: true, cached: true, semFoto: !!cur.semFoto };
    }

    let foto = null;
    try {
      foto = await _fetchPlacePhotoDataUrl(placeId, PLACES_SERVER_KEY.value());
    } catch (e) {
      console.error(`[cacheVenuePhoto] ${placeId} falhou: ${e && e.message}`);
      // Falha de rede/cota NÃO pode virar re-tentativa infinita do cliente: se já existe
      // versão antiga, ela continua valendo (melhor foto velha que tempestade de chamadas).
      if (cur && cur.dataUrl) return { ok: true, cached: true, stale: true };
      throw new HttpsError("unavailable", "não foi possível obter a foto agora");
    }

    if (!foto) {
      // Marca "este local não tem foto" para o cliente parar de pedir — o TTL faz reavaliar
      // daqui a 30 dias, caso o local ganhe foto depois.
      await ref.set({ semFoto: true, at: Date.now(), placeId }, { merge: true });
      return { ok: true, semFoto: true };
    }

    await ref.set({
      placeId,
      dataUrl: foto.dataUrl,
      bytes: foto.bytes,
      width: foto.width,
      photoName: foto.photoName,
      attributions: foto.attributions,
      semFoto: false,
      at: Date.now(),
    }, { merge: true });
    console.log(`[cacheVenuePhoto] ${placeId} gravado: ${foto.bytes} bytes @${foto.width}px`);
    return { ok: true, gravado: true, bytes: foto.bytes };
  }
);

// ─── purgeTournamentCopies (12/ago/2026 · CF-only) ────────────────────────────────────────────
// APAGAR UM TORNEIO APAGA AS CÓPIAS DELE NAS PESSOAS.
// Ordem do dono (12/ago/2026): _"um dia posso resolver apagá-lo e daí ele deve sumir de
// todos os dados dos que participaram."_
//
// MEDIDO ANTES DE ESCREVER: `FirestoreDB.deleteTournament` (js/firebase-db.js) limpa
// `results`, `letzplayScans`, `discoveryFeed/{tid}` e o doc do torneio — e NÃO limpa
// `users/{uid}/matchHistory`, que é a CÓPIA DESNORMALIZADA gravada por participante no
// lançamento do placar. O efeito era o oposto do pedido, e assimétrico: some da ficha dos
// OUTROS (que leem `collectionGroup('results')`, apagado) e FICA na ficha da PRÓPRIA
// pessoa (que lê o próprio matchHistory, intocado).
//
// POR QUE CF: `firestore.rules` só deixa o dono escrever no próprio matchHistory — o
// organizador que aperta Apagar não alcança os outros 121 inscritos. A regra está certa;
// quem limpa tem que ser o Admin SDK. E, como é gatilho, vale pra QUALQUER cliente,
// inclusive o app NATIVO publicado, que não tem auto-update.
//
// DE BRINDE, o segundo órfão: `tournaments/{tid}/participants` (o espelho do roster) também
// ficava pendurado — e não dava pra resolver no cliente, porque não existe regra pra essa
// subcoleção e o Firestore nega por omissão (achado da 1.7.97). Mesma classe dos 151
// `results` órfãos da 1.6.78.
//
// Deploy: scripts/deploy-functions.sh main   (NUNCA `firebase deploy --only functions` puro)
const _purge = require("./tournament-purge-core");
exports.purgeTournamentCopies = onDocumentDeleted(
  { document: "tournaments/{tid}", region: "us-central1", memory: "256MiB", timeoutSeconds: 540 },
  async (event) => {
    const tid = event.params.tid;
    // Handle PRÓPRIO: o `const db` do módulo é declarado abaixo e `const` fica em zona
    // morta temporal — foi exatamente assim que o espelho do roster nasceu mudo (1.7.99).
    const _db = admin.firestore();
    const t = (event.data && typeof event.data.data === "function" ? event.data.data() : null) || null;
    const conta = {};

    // Apaga um punhado de refs em lotes de 400 (o teto do batch é 500).
    const apagarRefs = async (refs, rotulo) => {
      let n = 0;
      for (const lote of _purge.emLotes(refs, 400)) {
        const batch = _db.batch();
        lote.forEach((r) => batch.delete(r));
        try { await batch.commit(); n += lote.length; }
        catch (e) { console.error(`[purgeTournamentCopies] ${rotulo} falhou em ${tid}:`, e && e.message); }
      }
      if (n) conta[rotulo] = (conta[rotulo] || 0) + n;
      return n;
    };

    // ── (1) CÓPIAS NAS PESSOAS ────────────────────────────────────────────────
    // matchHistory tem id DETERMINÍSTICO (`t_<tid>_<matchId>`), então a rota por
    // REFERÊNCIA funciona sem consulta e sem índice. A VARREDURA vem por cima porque
    // alcança quem a referência não vê — o caso real é quem levou W.O. e foi
    // SUBSTITUÍDO: sumiu do elenco e dos slots, mas o registro do jogo que jogou ficou
    // com ele. `notifications` não tem id derivável e depende só da varredura.
    const planoA = _purge.planPurgePorReferencia(tid, t);
    for (const sub of _purge.USER_SUBCOLLECTIONS_BY_TOURNAMENT) {
      const achados = [];
      try {
        const snap = await _db.collectionGroup(sub).where("tournamentId", "==", tid).get();
        snap.forEach((d) => {
          const dono = d.ref.parent.parent;                   // users/{uid}/<sub>/{id}
          if (dono && dono.id) achados.push({ uid: dono.id, recordId: d.id });
        });
      } catch (e) {
        console.error(`[purgeTournamentCopies] varredura de ${sub} falhou em ${tid}:`, e && e.message);
      }
      // A referência direta só vale pra matchHistory — é a única com id determinístico.
      const base = (sub === "matchHistory") ? planoA : { refs: [] };
      const plano = _purge.unirPlanos(base, achados);
      await apagarRefs(
        plano.refs.map((r) => _db.collection("users").doc(r.uid).collection(sub).doc(r.recordId)),
        sub
      );
    }

    // ── (2) COLEÇÕES DE TOPO que apontam pro torneio (planos de presença) ────
    for (const col of _purge.TOPLEVEL_COLLECTIONS_BY_TOURNAMENT) {
      try {
        const snap = await _db.collection(col).where("tournamentId", "==", tid).get();
        await apagarRefs(snap.docs.map((d) => d.ref), col);
      } catch (e) {
        console.error(`[purgeTournamentCopies] ${col} falhou em ${tid}:`, e && e.message);
      }
    }

    // ── (3) FILA DE E-MAIL — não tem tournamentId, só a URL ─────────────────
    // Coleção transitória e pequena (o flush a drena): varrer inteira sai mais barato
    // que manter índice. Sem isto, e-mail de um torneio apagado ainda sairia com link morto.
    try {
      const snap = await _db.collection("notif_email_queue").get();
      const ids = _purge.filaDoTorneio(tid, snap.docs.map((d) => ({ id: d.id, tournamentUrl: (d.data() || {}).tournamentUrl })));
      await apagarRefs(ids.map((id) => _db.collection("notif_email_queue").doc(id)), "notif_email_queue");
    } catch (e) {
      console.error(`[purgeTournamentCopies] fila de e-mail falhou em ${tid}:`, e && e.message);
    }

    // ── (4) SUBCOLEÇÕES DO TORNEIO — ENUMERADAS, nunca listadas à mão ───────
    // O Firestore não apaga subcoleção junto com o pai, e o cliente só alcança as que
    // têm regra. A lista à mão dele já deixou passar DUAS (`participants` e
    // `communications`), ambas descobertas medindo o banco. Enumerar mata a classe:
    // subcoleção nova nasce coberta. Funciona com o doc PAI já apagado — a subcoleção
    // existe de forma independente dele.
    try {
      const subs = await _db.collection("tournaments").doc(tid).listCollections();
      for (const col of subs) {
        for (let volta = 0; volta < 50; volta++) {            // teto de segurança (20 mil docs)
          const snap = await col.limit(400).get();
          if (snap.empty) break;
          const batch = _db.batch();
          snap.forEach((d) => batch.delete(d.ref));
          await batch.commit();
          conta["sub:" + col.id] = (conta["sub:" + col.id] || 0) + snap.size;
          if (snap.size < 400) break;
        }
      }
    } catch (e) {
      console.error(`[purgeTournamentCopies] subcoleções falharam em ${tid}:`, e && e.message);
    }

    // ── (5) o doc de índice do feed ─────────────────────────────────────────
    try { await _db.collection("discoveryFeed").doc(tid).delete(); } catch (e) {}

    const resumo = Object.keys(conta).map((k) => `${k}=${conta[k]}`).join(" · ") || "nada a apagar";
    console.log(`[purgeTournamentCopies] ${tid} → ${resumo}`);
  }
);

// ─── setParticipantContactPhone (v1.9.97) ─────────────────────────────────────
// CAMADA 3 da campanha de celular: o ORGANIZADOR registra o contato de um inscrito
// que o SMS não alcança.
//
// ⭐ POR QUE ISTO EXISTE, e por que NÃO é "afrouxar a verificação":
// Caso Leila Arida (20/ago/2026) — pediu o código, o Identity Toolkit devolveu 200
// (SMS entregue à operadora) e nada chegou no aparelho. Sem saída, ela ficava fora da
// campanha pra sempre. A alternativa óbvia (deixar salvar sem verificar) foi derrubada
// pelo dono com dois argumentos certos: _"e se a pessoa colocar o numero de outro?
// sequestra o numero do outro para contatos. e se errar a digitação, ninguem recebe
// nada e acha que esta tudo bem"_.
//
// O que muda aqui é a PROCEDÊNCIA. Não é um número anônimo auto-declarado: é um número
// que um organizador — que já falou com a pessoa — registrou, com o uid dele gravado no
// dado e com a pessoa NOTIFICADA de que aconteceu.
//
// AS TRAVAS (a ordem é a do que dói errar):
//   1. só organizador/co-organizador DESTE torneio (mesmo poder, cânone do projeto);
//   2. só pra quem está no elenco DESTE torneio — senão organizar um torneio viraria
//      licença pra escrever telefone no perfil de qualquer um da base;
//   3. NUNCA por cima de celular VERIFICADO — quem provou posse manda no próprio número;
//   4. nunca no PRÓPRIO perfil (burlaria a verificação pra si mesmo);
//   5. grava `phoneSource:'organizer'`, e todo caminho que usa telefone como IDENTIDADE
//      (recuperação de senha, dedup, fusão) ignora esse número — ver isIdentityPhone.
//
// Deploy: scripts/deploy-functions.sh (NUNCA firebase deploy na mão —
// [[project_autodraw_deploy_footgun]])
exports.setParticipantContactPhone = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");

    const data = request.data || {};
    const tournamentId = String(data.tournamentId || "").trim();
    const targetUid = String(data.uid || "").trim();
    if (!tournamentId || !targetUid) {
      throw new HttpsError("invalid-argument", "tournamentId e uid são obrigatórios");
    }

    const db = admin.firestore();
    const tSnap = await db.collection("tournaments").doc(tournamentId).get();
    const t = tSnap.exists ? (tSnap.data() || {}) : null;

    // O perfil do ALVO é lido antes da decisão: é ele que diz se já existe um número
    // verificado (que não pode ser sobrescrito).
    const alvoSnap = await db.collection("users").doc(targetUid).get();
    const alvo = alvoSnap.exists ? (alvoSnap.data() || {}) : null;
    if (!alvo) throw new HttpsError("not-found", "Perfil não encontrado");
    // Lápide não é pessoa: escrever telefone numa conta fundida é escrever no vazio.
    if (alvo.mergedInto) throw new HttpsError("failed-precondition", "Essa conta foi unida a outra.");

    const r = _contactPhone.computeSetContactPhone({
      tournament: t, callerUid, targetUid,
      phone: data.phone, country: data.country || "55",
      targetProfile: alvo, nowIso: new Date().toISOString(),
    });
    if (!r.ok) {
      const humano = _contactPhone.RECUSA_HUMANA[r.reason] || "Não foi possível registrar.";
      // 'sem-mudanca' não é erro do chamador — é o botão apertado duas vezes.
      if (r.reason === "sem-mudanca") return { ok: true, jaEra: true, phone: data.phone || "" };
      const code = (r.reason === "nao-e-organizador") ? "permission-denied"
        : (r.reason === "torneio-inexistente") ? "not-found" : "failed-precondition";
      throw new HttpsError(code, humano);
    }

    await db.collection("users").doc(targetUid).set(r.update, { merge: true });

    // A pessoa PRECISA saber. Sem este aviso, isto vira "mexeram no meu cadastro".
    // O opt-out do sininho é respeitado; o registro no perfil, não — ele é o fato.
    try {
      if (alvo.notifyPlatform !== false) {
        const orgSnap = await db.collection("users").doc(callerUid).get();
        const orgNome = (orgSnap.exists && orgSnap.data() && orgSnap.data().displayName) || "O organizador";
        const aviso = _contactPhone.buildContactPhoneNotice({
          organizerName: orgNome, tournamentName: t.name || "", phone: r.phone,
          nowIso: r.update.phoneSetAt,
        });
        // id determinístico por torneio+número: corrigir o mesmo número duas vezes não
        // enche a caixa da pessoa de avisos iguais.
        const notifId = ("contact_phone__" + tournamentId + "__" + String(r.phone).replace(/\D/g, ""))
          .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
        await db.collection("users").doc(targetUid).collection("notifications").doc(notifId).set(
          Object.assign({ tournamentId, tournamentName: t.name || "" }, aviso), { merge: true }
        );
      }
    } catch (e) {
      // Aviso é consequência, não condição: o registro já valeu. Mas fica no log —
      // silêncio aqui é o mesmo silêncio que criou o problema da Leila.
      console.error("[setParticipantContactPhone] aviso falhou:", e && e.message);
    }

    console.log("[setParticipantContactPhone]", tournamentId, callerUid, "→", targetUid,
      "(anterior:", r.anterior || "vazio", ")");
    return { ok: true, phone: r.phone, anterior: r.anterior };
  }
);

// ─── setParticipantLetzplay (2.0.50) ──────────────────────────────────────────
// Ordem do dono (24/ago/2026): _"no botao do contato que o organizador pode colocar o
// celular da pessoa, vamos permitir que ele coloque tambem o letzplay da pessoa. o
// letzplay é publico e todos podem consultar."_
//
// MESMA arquitetura de procedência do setParticipantContactPhone: só org/co-org DESTE
// torneio, só alvo do elenco, nunca por cima do @ que a PRÓPRIA pessoa indicou
// (`letzplaySource` ausente/'self'), nunca no próprio perfil, e a pessoa é NOTIFICADA.
// Grava `letzplaySource:'organizer'` + `letzplaySetBy` — a procedência fica no dado.
//
// Deploy: scripts/deploy-functions.sh (NUNCA firebase deploy na mão)
exports.setParticipantLetzplay = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "Login obrigatório");

    const data = request.data || {};
    const tournamentId = String(data.tournamentId || "").trim();
    const targetUid = String(data.uid || "").trim();
    if (!tournamentId || !targetUid) {
      throw new HttpsError("invalid-argument", "tournamentId e uid são obrigatórios");
    }

    const db = admin.firestore();
    const tSnap = await db.collection("tournaments").doc(tournamentId).get();
    const t = tSnap.exists ? (tSnap.data() || {}) : null;

    const alvoSnap = await db.collection("users").doc(targetUid).get();
    const alvo = alvoSnap.exists ? (alvoSnap.data() || {}) : null;
    if (!alvo) throw new HttpsError("not-found", "Perfil não encontrado");
    if (alvo.mergedInto) throw new HttpsError("failed-precondition", "Essa conta foi unida a outra.");

    const r = _contactPhone.computeSetContactLetzplay({
      tournament: t, callerUid, targetUid,
      handle: data.handle,
      targetProfile: alvo, nowIso: new Date().toISOString(),
    });
    if (!r.ok) {
      const humano = _contactPhone.RECUSA_HUMANA[r.reason] || "Não foi possível registrar.";
      if (r.reason === "sem-mudanca") return { ok: true, jaEra: true, handle: data.handle || "" };
      const code = (r.reason === "nao-e-organizador") ? "permission-denied"
        : (r.reason === "torneio-inexistente") ? "not-found" : "failed-precondition";
      throw new HttpsError(code, humano);
    }

    await db.collection("users").doc(targetUid).set(r.update, { merge: true });

    // A pessoa PRECISA saber — mesma regra do celular: registro com procedência é
    // diferente de "mexeram no meu cadastro" exatamente porque ela fica sabendo.
    try {
      if (alvo.notifyPlatform !== false) {
        const orgSnap = await db.collection("users").doc(callerUid).get();
        const orgNome = (orgSnap.exists && orgSnap.data() && orgSnap.data().displayName) || "O organizador";
        const aviso = _contactPhone.buildContactLetzplayNotice({
          organizerName: orgNome, tournamentName: t.name || "", handle: r.handle,
          nowIso: r.update.letzplaySetAt,
        });
        const notifId = ("contact_letzplay__" + tournamentId + "__" + r.handle)
          .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 200);
        await db.collection("users").doc(targetUid).collection("notifications").doc(notifId).set(
          Object.assign({ tournamentId, tournamentName: t.name || "" }, aviso), { merge: true }
        );
      }
    } catch (e) {
      console.error("[setParticipantLetzplay] aviso falhou:", e && e.message);
    }

    console.log("[setParticipantLetzplay]", tournamentId, callerUid, "→", targetUid,
      "@" + r.handle, "(anterior:", r.anterior || "vazio", ")");
    return { ok: true, handle: r.handle, anterior: r.anterior };
  }
);

/* ═══ AMIZADE: a implementação vive em `amizade-service.js` ════════════════════
 * ⛔ 6ª auditoria (ponto 1): enquanto `_amizadeAplicar` morava AQUI, ela escrevia os quatro
 * caches sociais direto (via aliases `AU`/`AR`), e o gate `check-amizade-client-writes.js`
 * afirmava que só `amizade-lifecycle` e o backfill escreviam. O gate passava porque a
 * regex não via os aliases — fronteira mentirosa, gate verde contradizendo o código.
 * A escrita é legítima (mesma transação que muda relação + projeção + cache); o que estava
 * errado era o LUGAR. Agora o index.js fica só com os adapters das callables.
 */
const _amizadeAplicar = (acao, caller, alvo) => _amizadeSvc.aplicar(acao, caller, alvo);
const _amizadeNotificar = (db, para, de, tipo, texto) => _amizadeSvc.notificar(db, para, de, tipo, texto);

const _AMIZADE_OPTS = { region: "us-central1", memory: "256MiB", timeoutSeconds: 60, cors: APP_ORIGINS };

exports.sendFriendRequest = onCall(_AMIZADE_OPTS, async (request) => {
  const caller = request.auth && request.auth.uid;
  const r = await _amizadeAplicar("enviar", caller, String((request.data || {}).toUid || ""));
  // ⚠️ notifica o uid RESOLVIDO (`r.alvoUid`), não o que veio no corpo: se o cliente mandou
  // uma lápide, o aviso tem que chegar em quem está vivo.
  const db = admin.firestore();
  if (r.evento === "auto-aceito") {
    await _amizadeNotificar(db, r.alvoUid, caller, "friend_accepted", " aceitou seu convite e agora é seu amigo(a)!");
  } else {
    await _amizadeNotificar(db, r.alvoUid, caller, "friend_request", " quer ser seu amigo(a)!");
  }
  console.log("[amizade] enviar", caller, "→", r.alvoUid, "=", r.evento);
  return { ok: true, evento: r.evento };
});

exports.acceptFriendRequest = onCall(_AMIZADE_OPTS, async (request) => {
  const caller = request.auth && request.auth.uid;
  const r = await _amizadeAplicar("aceitar", caller, String((request.data || {}).friendUid || ""));
  await _amizadeNotificar(admin.firestore(), r.alvoUid, caller, "friend_accepted",
    " aceitou seu convite e agora é seu amigo(a)!");
  console.log("[amizade] aceitar", caller, "←", r.alvoUid);
  return { ok: true, evento: r.evento };
});

exports.rejectFriendRequest = onCall(_AMIZADE_OPTS, async (request) => {
  const caller = request.auth && request.auth.uid;
  const r = await _amizadeAplicar("recusar", caller, String((request.data || {}).friendUid || ""));
  return { ok: true, evento: r.evento };
});

exports.cancelFriendRequest = onCall(_AMIZADE_OPTS, async (request) => {
  const caller = request.auth && request.auth.uid;
  const r = await _amizadeAplicar("cancelar", caller, String((request.data || {}).toUid || ""));
  return { ok: true, evento: r.evento };
});

/* ⭐ A LISTA DE RECONFIRMAÇÃO (5ª auditoria, ponto 3).
 * O corte tira 271 amizades da tela — corretamente, porque `legacy_unverified` não é prova.
 * Mas produto maduro não apaga a rede social da pessoa e manda esperar uma leva futura: o
 * caminho de volta faz parte da própria migração.
 * ⛔ POR QUE UMA CALLABLE E NÃO UMA QUERY DO CLIENTE: enumerar `friendships` do lado do
 * cliente exigiria uma query por `uidA`/`uidB` — e Rules autorizam a query, não o resultado.
 * Aqui o `uidA/uidB` vem do `request.auth.uid` e NUNCA do corpo, então não há como
 * enumerar relação de terceiro. Devolve só o outro uid + o mínimo público pra desenhar a
 * linha (nome e foto), nunca o documento do outro.
 * ⚠️ Não é uma segunda autoridade: quem reconfirma é o `sendFriendRequest` de sempre. */
exports.listLegacyFriendships = onCall(_AMIZADE_OPTS, async (request) => {
  const caller = request.auth && request.auth.uid;
  if (!caller) throw new HttpsError("unauthenticated", "login necessário");
  const db = admin.firestore();

  const [a, b] = await Promise.all([
    db.collection("friendships").where("uidA", "==", caller).where("status", "==", "legacy_unverified").get(),
    db.collection("friendships").where("uidB", "==", caller).where("status", "==", "legacy_unverified").get(),
  ]);
  const outros = new Map();
  [a, b].forEach((s) => s.forEach((d) => {
    const x = d.data() || {};
    const outro = x.uidA === caller ? x.uidB : x.uidA;
    if (!outro || outro === caller) return;
    outros.set(outro, { origem: x.legacyOrigem || "", desde: x.createdAt || null });
  }));
  if (!outros.size) return { ok: true, relacoes: [] };

  // perfis em lote — só os campos que a linha precisa
  const uids = [...outros.keys()];
  const docs = await db.getAll(...uids.map((u) => db.collection("users").doc(u)));
  const relacoes = [];
  docs.forEach((d) => {
    if (!d.exists) return;                       // conta apagada: some da lista
    const x = d.data() || {};
    if (x.mergedInto) return;                    // lápide: o par certo é o do sobrevivente
    const meta = outros.get(d.id) || {};
    relacoes.push({
      uid: d.id,
      displayName: x.displayName || "",
      photoURL: x.photoURL || "",
      origem: meta.origem,
      desde: meta.desde,
    });
  });
  relacoes.sort((p, q) => String(p.displayName).localeCompare(String(q.displayName), "pt-BR"));
  console.log("[amizade] listLegacy", caller, "→", relacoes.length);
  return { ok: true, relacoes: relacoes };
});

exports.removeFriend = onCall(_AMIZADE_OPTS, async (request) => {
  const caller = request.auth && request.auth.uid;
  const r = await _amizadeAplicar("remover", caller, String((request.data || {}).friendUid || ""));
  return { ok: true, evento: r.evento };
});

/* ═══ createSandbox — A CÓPIA FIEL, FEITA NO SERVIDOR (FIX.SANDBOX.P2, 2.1.87) ══════════
 *
 * INVARIANTE DO DONO (01/set/2026): _"O sandbox é uma réplica fiel do original. Qualquer
 * diferença de estado além de id técnico, isSandbox/sandboxOf/sandboxOwnerUid e estado
 * técnico de criação, notificações suprimidas e estatísticas históricas pessoais
 * suprimidas é defeito bloqueante."_ · _"Não é permitido simplificar, limpar, reconstruir,
 * normalizar, reduzir, mover ou substituir participants, inscritos, memberUids, coHosts,
 * adminUids, jogos, resultados, fases, rankings, classificações congeladas, W.O., espera,
 * suplentes, histórico, progresso, barras, chaves; nem a forma persistida."_
 *
 * ⛔ POR QUE ISTO TEM QUE SER SERVIDOR — e não podia ser cliente:
 *   · o cliente NÃO PODE escrever as subcoleções (`firestore.rules`: `allow write: if
 *     false` em inscritos/matches/opponentHistory/...). Um sandbox DIVIDIDO criado pelo
 *     cliente prometia `_nPartes` que ninguém preenchia — foi o "14 inscritos e 0 jogos";
 *   · e o objeto que o cliente tem em mãos é o documento MAGRO (as partes chegam depois),
 *     então clonar dali JÁ NASCE incompleto.
 *   ⇒ aqui roda o Admin SDK: lê o original inteiro, PROVA, e escreve as partes.
 *
 * ⭐ A ÚNICA exceção de forma persistida, autorizada pelo dono:
 *      tournaments/{id}/results/{matchId} → sandboxes/{id}/resultsSandbox/{matchId}
 *   Motivo: a regra de COLLECTION GROUP `/{path=**}/results/{matchId}` não pode ser
 *   escopada por coleção-pai (limitação da plataforma, não escolha). Como a cópia é FIEL,
 *   ela preserva `playerUids` reais — mantendo o nome, o participante real passaria por
 *   aquela regra e leria os resultados do sandbox. Muda SÓ o nome do caminho: ids, campos,
 *   placares e contagens vão byte a byte.
 *
 * ⚠️ `creating` → `ready`: o documento nasce com `sbState:'creating'` e só vira `'ready'`
 * DEPOIS da prova canônica. O cliente só lista/abre o que está `ready`, então falha no meio
 * não deixa sandbox utilizável.
 */
const SB_IDENTIDADES_DE_TESTE = [
  "rstbarth@gmail.com", "B17n7JCXYOfqahlcLZ0fKxGGyUu1",
  "rstbarth@hotmail.com",
  "nelsonterrabarth@gmail.com", "9r1I1brrTecENuQKXYWpAqTmBbQ2",
];
/* ⛔ A LISTA VIVE NO SERVIDOR. No cliente ela é `window.SP_TEST_IDENTITIES` e qualquer um
 * a reescreve no console; aqui ela é autoridade. Mesmo conteúdo, dono diferente. */
function _sbEhIdentidadeDeTeste(uid, email) {
  const u = String(uid || "").toLowerCase();
  const e = String(email || "").toLowerCase();
  return SB_IDENTIDADES_DE_TESTE.some((x) => {
    const k = String(x).toLowerCase();
    return k && (k === u || k === e);
  });
}

/* JSON canônico (chaves ordenadas) — a régua da prova de igualdade. */
function _sbCanon(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return "[" + v.map(_sbCanon).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + _sbCanon(v[k])).join(",") + "}";
}

/* Campos que PODEM diferir. Tudo que não está aqui tem que sair idêntico. */
const SB_ENVELOPE = [
  "id", "name", "isSandbox", "sandboxOf", "sandboxOwnerUid", "sandboxId", "sbState",
  "sandboxSyncedAt", "notificationsMuted", "isPublic",
  "creatorUid", "organizerEmail", "organizerName", "createdAt", "updatedAt",
  "remindersSent", "finishNotifiedAt", "nextDrawAt", "lastAutoDrawAt",
];

exports.createSandbox = onCall(
  { region: "us-central1", memory: "512MiB", timeoutSeconds: 300, cors: APP_ORIGINS },
  async (request) => {
    const callerUid = request.auth && request.auth.uid;
    if (!callerUid) throw new HttpsError("unauthenticated", "login necessário");
    const db = admin.firestore();

    // ── ① AUTORIZAÇÃO ESTRITA, no servidor ──────────────────────────────────
    const perfil = await db.collection("users").doc(callerUid).get().catch(() => null);
    const email = (perfil && perfil.exists && (perfil.data() || {}).email) || "";
    if (!_sbEhIdentidadeDeTeste(callerUid, email)) {
      throw new HttpsError("permission-denied", "sandbox é só para a identidade de teste");
    }

    // ⛔ O CLIENTE MANDA UM ID E MAIS NADA. Nenhum payload de torneio é aceito — é o que
    // impede "cópia fiel" de virar "o que o cliente disser que é a cópia".
    const origId = String(((request.data || {}).originalTournamentId) || "");
    if (!origId) throw new HttpsError("invalid-argument", "originalTournamentId é obrigatório");

    // ── ② IDEMPOTÊNCIA: já existe um sandbox PRONTO deste original para este dono? ──
    const jaTem = await db.collection("sandboxes")
      .where("sandboxOwnerUid", "==", callerUid)
      .where("sandboxOf", "==", origId)
      .where("sbState", "==", "ready").limit(1).get();
    if (!jaTem.empty) return { ok: true, id: jaTem.docs[0].id, reaproveitado: true };

    // ── ③ LÊ O ORIGINAL CANÔNICO E COMPLETO ─────────────────────────────────
    const origRef = db.collection("tournaments").doc(origId);
    const origSnap = await origRef.get();
    if (!origSnap.exists) throw new HttpsError("not-found", "torneio original não existe");
    const cfg = origSnap.data() || {};
    if (cfg.isSandbox === true) throw new HttpsError("failed-precondition", "não se cria sandbox de sandbox");

    // TODAS as subcoleções que o original de fato tem — enumeradas, não adivinhadas.
    const subRefs = await origRef.listCollections();
    const partes = {};
    for (const c of subRefs) {
      const snap = await c.get();
      partes[c.id] = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    }

    // ── ④ VALIDA AS CONTAGENS PROMETIDAS, ANTES DE ESCREVER ─────────────────
    const S = require("./vendor/tournament-split-core.js");   // cópia gerada (copy-vendor)
    const fora = Array.isArray(cfg._semPesados) ? cfg._semPesados : [];
    const faltas = [];
    const colecaoDaParte = (nome) => (typeof S.colecaoDaParte === "function" ? S.colecaoDaParte(nome) : nome);
    for (const nome of fora) {
      const col = colecaoDaParte(nome);
      const veio = (partes[col] || []).length;
      const prometido = (cfg._nPartes || {})[nome];
      if (prometido != null && veio !== prometido) faltas.push(nome + ": " + veio + " de " + prometido);
    }
    if (cfg._nJogos != null) {
      const nj = (partes.matches || []).length;
      if (nj !== cfg._nJogos) faltas.push("_nJogos: " + nj + " de " + cfg._nJogos);
    }
    if (faltas.length) {
      throw new HttpsError("failed-precondition", "original incompleto — " + faltas.join(", "));
    }

    // ── ⑤ ESCREVE: `creating` (invisível) + parent + TODAS as subcoleções ───
    const sbId = "sb_" + origId + "_" + Date.now();
    const sbRef = db.collection("sandboxes").doc(sbId);
    const envelope = {
      id: sbId,
      name: "(SB) " + String(cfg.name || "Torneio"),
      isSandbox: true, sandboxOf: String(origId), sandboxOwnerUid: callerUid,
      sbState: "creating",                       // ⛔ invisível até a prova
      notificationsMuted: true,                  // notificações suprimidas
      isPublic: false,
      creatorUid: callerUid,
      organizerEmail: email || "",
      organizerName: (perfil && perfil.exists && (perfil.data() || {}).displayName) || "",
      createdAt: new Date().toISOString(),
      sandboxSyncedAt: Date.now(),
    };
    // ⭐ o documento sai do original INTEIRO e só o envelope é sobreposto. memberUids,
    // coHosts, adminUids, participants, phases, rounds, _semPesados, _nPartes, _nJogos —
    // tudo passa como está. É isso que "mesma forma persistida" quer dizer.
    const sbDoc = Object.assign({}, cfg, envelope);
    delete sbDoc.sandboxId;
    await sbRef.set(sbDoc);

    let escritos = 0;
    for (const col of Object.keys(partes)) {
      const destino = (col === "results") ? "resultsSandbox" : col;   // a única exceção
      let lote = db.batch(); let n = 0;
      for (const d of partes[col]) {
        lote.set(sbRef.collection(destino).doc(d.id), d.data);        // id e campos byte a byte
        n++; escritos++;
        if (n >= 400) { await lote.commit(); lote = db.batch(); n = 0; }
      }
      if (n > 0) await lote.commit();
    }

    // ── ⑥ PROVA CANÔNICA, relendo o que foi gravado ─────────────────────────
    const difs = [];
    const relido = (await sbRef.get()).data() || {};
    const chaves = new Set(Object.keys(cfg).concat(Object.keys(relido)));
    for (const k of chaves) {
      if (SB_ENVELOPE.indexOf(k) !== -1) continue;
      if (_sbCanon(cfg[k]) !== _sbCanon(relido[k])) difs.push("campo:" + k);
    }
    for (const col of Object.keys(partes)) {
      const destino = (col === "results") ? "resultsSandbox" : col;
      const snap = await sbRef.collection(destino).get();
      if (snap.size !== partes[col].length) {
        difs.push(destino + ": " + snap.size + " de " + partes[col].length);
        continue;
      }
      const porId = {}; snap.docs.forEach((d) => { porId[d.id] = d.data(); });
      for (const d of partes[col]) {
        if (_sbCanon(porId[d.id]) !== _sbCanon(d.data)) { difs.push(destino + "/" + d.id); break; }
      }
    }
    if (difs.length) {
      // ⛔ NÃO deixa sandbox parcial utilizável: some com o que foi escrito e falha.
      await db.recursiveDelete(sbRef).catch(() => {});
      throw new HttpsError("internal", "cópia divergente — " + difs.slice(0, 6).join(", "));
    }

    // ── ⑦ só agora fica visível ─────────────────────────────────────────────
    await sbRef.update({ sbState: "ready" });
    /* ⭐ `envelope` VAI NA RESPOSTA de propósito: é a lista viva do que pode diferir, e é
     * contra ELA que o controle da suíte cobra as duas exceções da 2.1.86 (membership
     * trocada, `_semPesados` removido). Teste que carrega a própria cópia da lista fica
     * verde no dia em que alguém afrouxa a de verdade. */
    return { ok: true, id: sbId, docsCopiados: escritos, subcolecoes: Object.keys(partes).length,
      envelope: SB_ENVELOPE.slice() };
  }
);
