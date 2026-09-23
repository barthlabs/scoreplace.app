/* E2E das TRÊS portas do codebase principal que mudam a categoria: a marca
 * `skillBySportSource` nunca sobrevive à mudança. Roda via:
 *   firebase emulators:exec --only functions,firestore,auth --project demo-scoreplace \
 *     "node functions/test-reconciliacao-marca-emu.js"
 *
 * ⛔ O TOKEN É DE VERDADE, e essa é a parte que não se abre mão: a conta é criada no
 * emulador de Auth, o login sai do próprio emulador (`accounts:signInWithPassword`) e o ID
 * token resultante é CONFERIDO por `verifyIdToken`. O uid que entra na chamada é o que saiu
 * dessa conferência — não um uid escrito à mão.
 *
 * ⛔ MEDIDO EM 22/set/2026, e é por isso que a EXECUÇÃO da porta não passa pelo HTTP do
 * emulador de Functions: dentro daquele runtime o `firebase-admin` é um proxy em que
 * `admin.firestore.FieldValue` NÃO EXISTE, e a chamada morre em
 *     TypeError: Cannot read properties of undefined (reading 'serverTimestamp')
 *     at functions/index.js:3238  /  :2622
 * — linhas ANTIGAS, que funcionam em produção. É artefato do emulador, não defeito do
 * produto, e trocar o produto para agradar o emulador seria estragar o que está certo.
 * Mesma medida já registrada em `tests/fusao-e-volta-no-emulador.test.js`.
 * Então: `index.js` é carregado NESTE processo (admin de verdade, `FieldValue` de verdade)
 * contra os emuladores de Firestore e Auth, e `.run()` executa o MESMO código publicado.
 * ⚠️ E a autenticação não fica sem prova: a recusa SEM token é conferida por chamada HTTP
 * REAL ao emulador de Functions, no fim do arquivo.
 *
 * ⛔ O caso da ELEGIBILIDADE é OUTRO: aquela porta só ACRESCENTA modalidade ausente, nunca
 * altera nem remove. Pedir "categoria alterada" nela seria teste impossível. O caso dela é a
 * marca ÓRFÃ: existia marca sem categoria, e completar a categoria limpa a marca.
 */
const path = require("path");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
/* ⛔ O índice PRIMEIRO: é ele que faz o `initializeApp`. Inicializar aqui antes derrubaria
 * com "app already exists". */
const CF = require(path.join(__dirname, "index.js"));
const db = admin.firestore();

const PROJECT = "demo-scoreplace";
const FN = "http://127.0.0.1:" + (process.env.FUNCTIONS_EMULATOR_PORT || "5001") + "/" + PROJECT + "/us-central1/";
const AUTH = "http://" + (process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099")
  + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key";

let fail = 0, pass = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + "  →  " + JSON.stringify(a));

async function criarConta(uid, email) {
  try { await admin.auth().deleteUser(uid); } catch (e) { /* não existia */ }
  await admin.auth().createUser({ uid, email, password: "senha-de-teste-123" });
  const r = await fetch(AUTH, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha-de-teste-123", returnSecureToken: true }),
  });
  const body = await r.json();
  if (!body.idToken) throw new Error("emulador de Auth não emitiu ID token: " + JSON.stringify(body));
  return body.idToken;
}

/* O uid e o e-mail vêm da CONFERÊNCIA do ID token, não de um literal. */
/* Token de uma conta que já existe — a prova de posse do número sai daqui. */
async function criarTokenDe(uid, email) {
  const r = await fetch(AUTH, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "senha-de-teste-123", returnSecureToken: true }),
  });
  const body = await r.json();
  if (!body.idToken) throw new Error("emulador de Auth não emitiu ID token para " + uid + ": " + JSON.stringify(body));
  return body.idToken;
}

async function chamar(nome, token, dados) {
  const decodificado = await admin.auth().verifyIdToken(token);
  try {
    const result = await CF[nome].run({
      data: dados || {},
      auth: { uid: decodificado.uid, token: decodificado },
      rawRequest: { headers: {} }, acceptsStreaming: false,
    });
    return { status: 200, body: { result } };
  } catch (e) {
    return { status: (e && e.httpErrorCode && e.httpErrorCode.status) || 500, body: { error: String((e && e.message) || e) } };
  }
}

const fonteDe = async (uid) => ((await db.collection("users").doc(uid).get()).data() || {}).skillBySportSource;
const catDe = async (uid) => ((await db.collection("users").doc(uid).get()).data() || {}).skillBySport;

(async function main() {
  console.log("\n── updateOwnProfile: a pessoa muda a PRÓPRIA categoria ──");
  const dono = "marca-dono";
  const tokenDono = await criarConta(dono, "dono@teste.local");
  await db.collection("users").doc(dono).set({
    displayName: "Dono da Marca", uid: dono,
    skillBySport: { "Beach Tennis": "B", "Tênis": "3ª" },
    skillBySportSource: { "Beach Tennis": "letzplay", "Tênis": "letzplay" },
  });

  let r = await chamar("updateOwnProfile", tokenDono, {
    profile: { skillBySport: { "Beach Tennis": "A", "Tênis": "3ª" } },
  });
  ok(r.status === 200, "porta respondeu 200 (" + r.status + " " + JSON.stringify(r.body).slice(0, 160) + ")");
  eq(await catDe(dono), { "Beach Tennis": "A", "Tênis": "3ª" }, "a categoria nova está gravada");
  eq(await fonteDe(dono), { "Tênis": "letzplay" },
    "categoria ALTERADA perde a marca; a modalidade intocada CONSERVA");

  r = await chamar("updateOwnProfile", tokenDono, { profile: { skillBySport: { "Tênis": "3ª" } } });
  ok(r.status === 200, "remoção respondeu 200");
  eq(await catDe(dono), { "Tênis": "3ª" }, "Beach Tennis saiu do mapa de categorias");
  eq(await fonteDe(dono), { "Tênis": "letzplay" }, "REMOVER a modalidade apaga só a marca dela");

  console.log("\n── setParticipantsProfile: o ORGANIZADOR digita a categoria de um inscrito ──");
  const org = "marca-org", inscrito = "marca-inscrito";
  const tokenOrg = await criarConta(org, "org@teste.local");
  await db.collection("users").doc(org).set({ displayName: "Organizador", uid: org });
  await db.collection("users").doc(inscrito).set({
    displayName: "Inscrito", uid: inscrito,
    skillBySport: { "Beach Tennis": "B", "Tênis": "3ª" },
    skillBySportSource: { "Beach Tennis": "letzplay", "Tênis": "letzplay" },
  });
  await db.collection("tournaments").doc("marca-t1").set({
    name: "Torneio da Marca", creatorUid: org, sport: "Beach Tennis",
    participants: [{ uid: inscrito, displayName: "Inscrito" }],
  });

  r = await chamar("setParticipantsProfile", tokenOrg, {
    tournamentId: "marca-t1", sport: "Beach Tennis",
    assignments: [{ uid: inscrito, category: "A" }],
  });
  ok(r.status === 200 && r.body && r.body.result && r.body.result.written === 1,
    "organizador gravou 1 perfil (" + JSON.stringify(r.body).slice(0, 160) + ")");
  eq(await catDe(inscrito), { "Beach Tennis": "A", "Tênis": "3ª" }, "categoria digitada pelo organizador gravada");
  eq(await fonteDe(inscrito), { "Tênis": "letzplay" },
    "categoria DIGITADA pelo organizador não fica com selo de apurada");

  console.log("\n── completeOwnEligibilityProfile: marca ÓRFÃ + modalidade ausente ──");
  const eleg = "marca-eleg";
  const tokenEleg = await criarConta(eleg, "eleg@teste.local");
  await db.collection("users").doc(eleg).set({
    displayName: "Elegível", uid: eleg,
    skillBySport: { "Tênis": "3ª" },
    skillBySportSource: { "Beach Tennis": "letzplay", "Tênis": "letzplay" },
  });

  r = await chamar("completeOwnEligibilityProfile", tokenEleg, {
    eligibility: { skillBySport: { "Beach Tennis": "A" } },
  });
  ok(r.status === 200, "elegibilidade respondeu 200 (" + JSON.stringify(r.body).slice(0, 160) + ")");
  eq(await catDe(eleg), { "Tênis": "3ª", "Beach Tennis": "A" }, "a modalidade ausente foi acrescentada");
  eq(await fonteDe(eleg), { "Tênis": "letzplay" },
    "completar a categoria limpa a marca ÓRFÃ dela e preserva a da outra modalidade");

  console.log("\n── mergePhoneAccount: fusão BEM-SUCEDIDA de dois perfis ──");
  /* ⛔ ESTE CENÁRIO MORA AQUI, e não no `tests/amizade/merge-phone-prova.test.js`, que é o
   * arquivo natural dele: lá a chamada roda DENTRO do emulador de Functions, e o caminho
   * bem-sucedido morre em `admin.firestore.FieldValue` (medido; a medida está registrada
   * naquele arquivo). Aqui o índice está carregado num processo normal, com admin de
   * verdade — e é o MESMO código publicado.
   *
   * ⛔ E ele achou defeito MEU: esta porta grava por `set(..., {merge:true})`, cujo merge é
   * PROFUNDO — funde o mapa chave a chave. Gravar só o mapa calculado deixava VIVA a marca
   * que a fusão tinha acabado de apagar. Por isso as chaves que saem vão como `delete()`.
   * As seis modalidades cobrem os seis casos, iguais aos do merge por e-mail. */
  const fone = "+5511955550001";
  const velha = "marca-fusao-velha";
  await criarConta(velha, "velha@teste.local");
  await admin.auth().updateUser(velha, { phoneNumber: fone });
  const novoUid = "marca-fusao-nova";
  const tokenNovo = await criarConta(novoUid, "nova@teste.local");
  await db.collection("users").doc(novoUid).set({
    displayName: "Conta Nova", email: "nova@teste.local", uid: novoUid,
    skillBySport: { "Beach Tennis": "A", "Tênis": "3ª", "Padel": "C", "Futevôlei": "E" },
    skillBySportSource: { "Beach Tennis": "letzplay", "Padel": "letzplay", "Vôlei": "letzplay" },
  });
  await db.collection("users").doc(velha).set({
    displayName: "Conta Velha", email: "velha@teste.local", uid: velha, phone: fone,
    skillBySport: { "Tênis": "4ª", "Squash": "D", "Padel": "C", "Futevôlei": "E" },
    skillBySportSource: { "Tênis": "letzplay", "Squash": "letzplay", "Futevôlei": "letzplay" },
  });
  await db.doc("_meta/amizadeMigration").set({ fase: "live", maintenance: false });

  /* A prova de posse do número é um ID token DA CONTA VELHA, emitido pelo emulador. */
  const provaVelha = await criarTokenDe(velha, "velha@teste.local");
  r = await chamar("mergePhoneAccount", tokenNovo, { oldUid: velha, proofIdToken: provaVelha });
  ok(r.status === 200, "fusão por telefone respondeu 200 (" + JSON.stringify(r.body).slice(0, 200) + ")");
  const fCat = await catDe(novoUid), fFonte = await fonteDe(novoUid);
  eq(Object.keys(fCat || {}).sort(), ["Beach Tennis", "Futevôlei", "Padel", "Squash", "Tênis"],
    "as categorias das duas contas estão no sobrevivente");
  ok(fCat && fCat["Tênis"] === "3ª", "em conflito, a categoria do sobrevivente vence (3ª, não 4ª)");
  eq(fFonte, { "Beach Tennis": "letzplay", "Padel": "letzplay", "Squash": "letzplay" },
    "⭐ marca conservada/viajada/apagada exatamente como manda a regra — e ÓRFÃ (Vôlei) some de verdade");

  console.log("\n── sem token não passa (a porta é autenticada de verdade) ──");
  const semToken = await fetch(FN + "updateOwnProfile", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: { profile: { skillBySport: { "Tênis": "4ª" } } } }),
  });
  ok(semToken.status !== 200, "chamada sem ID token é recusada (" + semToken.status + ")");
  eq(await catDe(dono), { "Tênis": "3ª" }, "e não mexeu em perfil nenhum");

  if (fail) { console.error("\n❌ reconciliação da marca (principal): " + pass + " ok, " + fail + " falharam"); process.exit(1); }
  console.log("\n✅ reconciliação da marca (principal): " + pass + " ok");
})().catch((e) => { console.error("❌ erro no teste:", e && e.stack || e); process.exit(1); });
