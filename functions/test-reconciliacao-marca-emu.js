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

  /* ⚰️ O CENÁRIO DE `setParticipantsProfile` SAIU EM 23/set/2026, junto com a porta. Ela gravava
   * categoria no perfil global de qualquer conta sem conferir o torneio; foi apagada do projeto.
   * Quem faz esse trabalho é `applyEnrollmentAssignments` (autodraw), coberta no teste de lá.
   * ⛔ Manter o cenário aqui reprovaria o `test:emu:fn` pedindo a porta de volta. */

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

  console.log("\n── ATAQUE PONTA A PONTA: scan plantado NÃO alcança o perfil ──");
  /* ⛔ ESTE É O CENÁRIO QUE VALE, e ele tem de atravessar as FRONTEIRAS REAIS. Operar o Firestore
   * pelo Admin SDK aqui seria tautologia: o Admin IGNORA Rules, então plantar por ali não provaria
   * que a conta B consegue plantar, e não chamar a porta pelo HTTP não provaria que ela saiu.
   * Então: B planta com o TOKEN DELE, por PATCH na API do Firestore; e a porta é chamada por HTTP. */
  const vitima = "marca-vitima", atacante = "marca-atacante";
  const tokenVitima = await criarConta(vitima, "vitima@teste.local");
  const tokenAtacante = await criarConta(atacante, "atacante@teste.local");
  await db.collection("users").doc(vitima).set({
    displayName: "Vítima", uid: vitima,
    skillBySport: { "Beach Tennis": "D" }, gender: "feminino",
  });
  await db.collection("users").doc(vitima).collection("letzplay").doc("import")
    .set({ games: [{ id: "g1" }], gamesTotal: 1 });

  /* ⛔ RETRATO ANTES DO PLANTIO. Depois seria tarde: se alguma escrita reagisse ao scan, o retrato
   * tardio viraria a nova base e o teste passaria por cima do estrago. */
  const retrato = async () => {
    const u = (await db.collection("users").doc(vitima).get()).data() || {};
    const imp = (await db.collection("users").doc(vitima).collection("letzplay").doc("import").get());
    return JSON.stringify({
      skillBySport: u.skillBySport || null, skillBySportSource: u.skillBySportSource || null,
      gender: u.gender || null, letzplayHandle: u.letzplayHandle || null,
      letzplayImport: u.letzplayImport || null, letzplayAppliedBy: u.letzplayAppliedBy || null,
      import: imp.exists ? imp.data() : null,
    });
  };
  const antesDoAtaque = await retrato();

  const FS = "http://" + (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080")
    + "/v1/projects/" + PROJECT + "/databases/(default)/documents/letzplayScans/" + vitima;
  const plantio = await fetch(FS + "?updateMask.fieldPaths=scan&updateMask.fieldPaths=handle", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenAtacante },
    body: JSON.stringify({ fields: {
      handle: { stringValue: "atleta-forjado" },
      scan: { mapValue: { fields: {
        gender: { stringValue: "masculino" },
        skill: { stringValue: "A" },
        profileSkill: { stringValue: "A" },
      } } },
    } }),
  });
  /* ⛔ EXIGE 200: se o plantio falhar, o cenário não provou abuso nenhum e NÃO pode passar por isso. */
  ok(plantio.status === 200, "a conta B CONSEGUE plantar o scan no nome de A (é o buraco que resta: "
    + plantio.status + ")");

  /* A porta que aplicava o scan não existe mais: a chamada tem de falhar com NOT FOUND — e não
   * "qualquer coisa diferente de 200", que passaria até por erro de rede. */
  const tentativa = await fetch(FN + "applyLetzplayScans", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenVitima },
    body: JSON.stringify({ data: { tournamentId: "marca-t1", uids: [vitima] } }),
  });
  ok(tentativa.status === 404, "⛔ a porta que aplicava o scan NÃO existe mais (esperado 404, veio "
    + tentativa.status + ")");

  ok((await retrato()) === antesDoAtaque,
    "⛔⛔ e o perfil e o histórico da vítima ficaram BYTE A BYTE iguais depois do scan plantado");

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
