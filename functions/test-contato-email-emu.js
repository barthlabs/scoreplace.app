/* ⛔⛔ O E-MAIL DO ORGANIZADOR SÓ SAI PARA QUEM ESTÁ INSCRITO (LGPD, 25/set/2026).
 *
 * Esta é a prova REAL da porta: chama a callable no emulador, com conta de verdade e ID token
 * conferido, contra documento de verdade — inclusive TORNEIO DIVIDIDO, onde o elenco mora em
 * subcoleção e um teste de função pura não alcança.
 *
 * Nasceu porque a suíte pura não bastava: ela prova a régua, não a porta. Se a hidratação do
 * elenco dividido sair de `getTournamentParticipantContact`, a função pura continua verde e o
 * inscrito de um torneio grande perde o contato — foi exatamente isso que o revisor recusou.
 *
 * Roda por:
 *   firebase emulators:exec --only functions,firestore,auth --project demo-scoreplace \
 *     "node functions/test-contato-email-emu.js"
 */
const path = require("path");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
/* ⛔ O índice PRIMEIRO: é ele que faz o `initializeApp`. */
const CF = require(path.join(__dirname, "index.js"));
const db = admin.firestore();

const AUTH = "http://" + (process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099")
  + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key";

let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ " + m); } };

async function criarConta(uid, email, extra) {
  try { await admin.auth().deleteUser(uid); } catch (e) { /* não existia */ }
  await admin.auth().createUser({ uid, email, password: "senha-de-teste-123" });
  await db.collection("users").doc(uid).set(Object.assign({ uid, email }, extra || {}));
  const r = await fetch(AUTH, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha-de-teste-123", returnSecureToken: true }),
  });
  const body = await r.json();
  if (!body.idToken) throw new Error("Auth não emitiu ID token: " + JSON.stringify(body));
  return body.idToken;
}

async function contato(token, tournamentId, uid) {
  const d = await admin.auth().verifyIdToken(token);
  try {
    const result = await CF.getTournamentParticipantContact.run({
      data: { tournamentId, uid },
      auth: { uid: d.uid, token: d },
      rawRequest: { headers: {} }, acceptsStreaming: false,
    });
    return { ok: true, contact: (result && result.contact) || {} };
  } catch (e) {
    return { ok: false, erro: String((e && e.message) || e) };
  }
}

(async function main() {
  console.log("\n── contas ──");
  const ORG = "ct-org", INSC = "ct-inscrito", FORA = "ct-estranho", CO = "ct-coorg";
  const tOrg  = await criarConta(ORG,  "organizador@teste.local", { displayName: "Organizador", phone: "11999990000", phoneCountry: "55" });
  const tIns  = await criarConta(INSC, "inscrito@teste.local",    { displayName: "Inscrito" });
  const tFora = await criarConta(FORA, "estranho@teste.local",    { displayName: "Estranho" });
  const tCo   = await criarConta(CO,   "coorg@teste.local",       { displayName: "Co-organizador", phone: "11988880000" });

  // ── torneio COMUM: elenco no documento ──────────────────────────────────────
  const T1 = "ct-comum";
  await db.collection("tournaments").doc(T1).set({
    id: T1, name: "Comum", creatorUid: ORG, access: "public",
    coHosts: [{ uid: CO, status: "active" }],
    participants: [{ uid: INSC, displayName: "Inscrito" }],
  });

  console.log("\n── torneio comum ──");
  const a = await contato(tIns, T1, ORG);
  ok(a.ok && a.contact.organizerEmail === "organizador@teste.local",
    "INSCRITO recebe o e-mail do organizador");
  ok(a.ok && a.contact.phone === "11999990000", "e recebe o telefone, como sempre");

  const b = await contato(tFora, T1, ORG);
  ok(b.ok && !b.contact.organizerEmail,
    "⛔ ESTRANHO autenticado NÃO recebe e-mail nenhum");
  ok(b.ok && b.contact.phone === "11999990000",
    "mas CONTINUA recebendo telefone — essa régua é anterior à leva e FICA (decisão registrada)");

  const c = await contato(tIns, T1, CO);
  ok(c.ok && c.contact.organizerEmail === "coorg@teste.local",
    "co-organizador ATIVO é alvo válido para quem está inscrito");

  const d = await contato(tOrg, T1, INSC);
  ok(d.ok && !d.contact.organizerEmail,
    "⛔ nem o organizador recebe e-mail de PARTICIPANTE por esta porta");

  // ── torneio DIVIDIDO: elenco na subcoleção `inscritos` ──────────────────────
  // É o caso que a função pura não alcança: sem hidratar, a régua roda com elenco VAZIO
  // e o inscrito é tratado como estranho.
  const T2 = "ct-dividido";
  await db.collection("tournaments").doc(T2).set({
    id: T2, name: "Dividido", creatorUid: ORG, access: "public",
    /* ⛔ `_semPesados` É A LISTA DE CAMPOS QUE MORAM FORA, não um sim/não. Na primeira escrita
     * deste teste eu pus `true`, o hidratador entendeu "nada dividido", o elenco chegou VAZIO e
     * o teste acusou a porta de negar o inscrito. Era a FIXTURE, não a porta — e é o tipo de
     * falso defeito que só não virou relato porque a medição veio antes da conclusão. */
    _semPesados: ["participants"], participants: [],
  });
  await db.collection("tournaments").doc(T2).collection("inscritos").doc("p0").set({
    _idx: 0, item: { uid: INSC, displayName: "Inscrito" },
  });

  console.log("\n── torneio DIVIDIDO (elenco em subcoleção) ──");
  const e = await contato(tIns, T2, ORG);
  ok(e.ok && e.contact.organizerEmail === "organizador@teste.local",
    "⭐ inscrito de torneio DIVIDIDO recebe o e-mail — a porta hidrata o elenco antes de decidir");
  const f = await contato(tFora, T2, ORG);
  ok(f.ok && !f.contact.organizerEmail,
    "⛔ e o estranho continua sem e-mail no torneio dividido");

  console.log("\n" + (fail ? "❌ " : "✅ ") + "contato-email-emu: " + pass + " ok, " + fail + " falha(s)");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
