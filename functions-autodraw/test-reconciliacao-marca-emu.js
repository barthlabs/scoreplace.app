/* E2E da porta do AUTODRAW que muda a categoria — `applyEnrollmentAssignments`, que é a que
 * a Análise de Inscrições usa de verdade. Roda DE DENTRO deste diretório:
 *   cd functions-autodraw && firebase emulators:exec --only functions,firestore,auth \
 *     --project demo-scoreplace "node test-reconciliacao-marca-emu.js"
 * (é o `npm run test:emu:autodraw`, encadeado no `npm run test:emu`)
 *
 * ⛔ POR QUE DAQUI, e não pelo `test:emu:fn` da raiz: o `firebase.json` da raiz declara UM
 * único codebase (`default` → `functions/`). O emulador da raiz não serve este código —
 * testar esta porta por lá provaria a tabela, não a porta.
 *
 * ⛔ CHAMADA HTTP COM ID TOKEN DE VERDADE: a conta nasce no emulador de Auth, o login sai do
 * próprio emulador e o token vai no `Authorization`. Quem confere o token é a porta.
 * ⚠️ Aqui o HTTP funciona porque este codebase importa `FieldValue` de
 * `firebase-admin/firestore` (forma modular), que sobrevive ao proxy do emulador de Functions
 * — diferente do codebase principal, onde `admin.firestore.FieldValue` não existe naquele
 * runtime (medido em 22/set/2026 e registrado no teste de lá).
 */
const admin = require('firebase-admin');
const fetch = require('node-fetch');
admin.initializeApp({ projectId: 'demo-scoreplace' });
const db = admin.firestore();

const PROJECT = 'demo-scoreplace';
const FN = 'http://127.0.0.1:' + (process.env.FUNCTIONS_EMULATOR_PORT || '5001') + '/' + PROJECT + '/us-central1/';
const AUTH = 'http://' + (process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099')
  + '/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + '  →  ' + JSON.stringify(a));

async function criarConta(uid, email) {
  try { await admin.auth().deleteUser(uid); } catch (e) { /* não existia */ }
  await admin.auth().createUser({ uid, email, password: 'senha-de-teste-123' });
  const r = await fetch(AUTH, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'senha-de-teste-123', returnSecureToken: true }),
  });
  const body = await r.json();
  if (!body.idToken) throw new Error('emulador de Auth não emitiu ID token: ' + JSON.stringify(body));
  return body.idToken;
}

async function chamar(nome, token, dados) {
  const r = await fetch(FN + nome, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {}),
    body: JSON.stringify({ data: dados || {} }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

const perfil = async (uid) => (await db.collection('users').doc(uid).get()).data() || {};

(async function main() {
  const org = 'ad-marca-org', inscrito = 'ad-marca-inscrito';
  const tokenOrg = await criarConta(org, 'ad-org@teste.local');
  await db.collection('users').doc(org).set({ displayName: 'Organizador', uid: org });
  await db.collection('users').doc(inscrito).set({
    displayName: 'Inscrito', uid: inscrito,
    skillBySport: { 'Beach Tennis': 'B', 'Tênis': '3ª' },
    skillBySportSource: { 'Beach Tennis': 'letzplay', 'Tênis': 'letzplay' },
  });
  const tId = 'ad-marca-t1';
  await db.collection('tournaments').doc(tId).set({
    id: tId, name: 'Torneio da Marca (autodraw)', creatorUid: org, sport: 'Beach Tennis',
    combinedCategories: ['A', 'B'],
    participants: [{ uid: inscrito, displayName: 'Inscrito', category: 'B', categories: ['B'] }],
  });

  console.log('\n── applyEnrollmentAssignments: o organizador troca a categoria na Análise ──');
  let r = await chamar('applyEnrollmentAssignments', tokenOrg, {
    tournamentId: tId, sport: 'Beach Tennis',
    edits: [{ uid: inscrito, category: 'A' }],
  });
  ok(r.status === 200, 'porta respondeu 200 (' + r.status + ' ' + JSON.stringify(r.body).slice(0, 220) + ')');
  const p = await perfil(inscrito);
  eq(p.skillBySport, { 'Beach Tennis': 'A', 'Tênis': '3ª' }, 'a categoria nova foi gravada no PERFIL');
  eq(p.skillBySportSource, { 'Tênis': 'letzplay' },
    'a marca da modalidade MEXIDA saiu; a da intocada ficou');
  ok(p.skillSetBy === org, 'e ficou registrado quem digitou');

  console.log('\n── sem token a porta não abre ──');
  r = await chamar('applyEnrollmentAssignments', null, {
    tournamentId: tId, sport: 'Beach Tennis', edits: [{ uid: inscrito, category: 'B' }],
  });
  ok(r.status !== 200, 'chamada sem ID token é recusada (' + r.status + ')');
  eq((await perfil(inscrito)).skillBySport, { 'Beach Tennis': 'A', 'Tênis': '3ª' },
    'e o perfil não mudou');

  if (fail) { console.error('\n❌ reconciliação da marca (autodraw): ' + pass + ' ok, ' + fail + ' falharam'); process.exit(1); }
  console.log('\n✅ reconciliação da marca (autodraw): ' + pass + ' ok');
})().catch((e) => { console.error('❌ erro no teste:', (e && e.stack) || e); process.exit(1); });
