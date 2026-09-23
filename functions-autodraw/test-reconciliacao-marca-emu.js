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
  /* ⛔ INVERTIDO EM 23/set/2026. Este cenário EXIGIA a categoria no perfil global — ou seja, exigia
   * o defeito. Decisão do dono: o que o organizador define vale DENTRO do torneio. */
  const antesDoT1 = await perfil(inscrito);
  let r = await chamar('applyEnrollmentAssignments', tokenOrg, {
    tournamentId: tId, sport: 'Beach Tennis',
    edits: [{ uid: inscrito, category: 'A' }],
  });
  ok(r.status === 200, 'porta respondeu 200 (' + r.status + ' ' + JSON.stringify(r.body).slice(0, 220) + ')');
  const p = await perfil(inscrito);
  eq(p.skillBySport, antesDoT1.skillBySport, '⛔ a categoria NÃO foi para o perfil global');
  eq(p.skillBySportSource, antesDoT1.skillBySportSource, '⛔ e a marca de procedência ficou intacta');
  ok(p.skillSetBy === undefined, '⛔ nem o carimbo de quem digitou a categoria');
  const t1 = (await db.collection('tournaments').doc(tId).get()).data() || {};
  const alvoNoTorneio = (t1.participants || []).find((x) => x && x.uid === inscrito) || {};
  ok(alvoNoTorneio.category === 'A', '⭐ e a categoria VALE no torneio, que é onde ela mora');

  console.log('\n── SÓ CATEGORIA: o perfil global não é tocado ──');
  /* ⛔ DUAS CHAMADAS SEPARADAS, e a ordem importa: uma chamada COMBINADA (categoria + gênero)
   * esconderia o defeito, porque o gênero legitimamente mexe em `profileSetAt`. Aqui a atribuição
   * é SÓ de categoria, e o documento INTEIRO do perfil tem de ficar igual. */
  const outro = 'ad-marca-inscrito-2';
  await db.collection('users').doc(outro).set({
    displayName: 'Inscrito 2', uid: outro,
    skillBySport: { 'Beach Tennis': 'B', 'Tênis': '3ª' },
    skillBySportSource: { 'Beach Tennis': 'letzplay' },
    gender: 'feminino',
  });
  const tDiv = 'ad-marca-t-dividido';
  /* ⚠️ TORNEIO DIVIDIDO: o elenco mora na subcoleção e o campo do documento é `[]`. É o caso em que
   * o servidor já recusou inscrito de verdade por ler o doc cru. */
  await db.collection('tournaments').doc(tDiv).set({
    id: tDiv, name: 'Dividido', creatorUid: org, sport: 'Beach Tennis',
    combinedCategories: ['A', 'B'], _semPesados: ['participants'], participants: [],
  });
  /* ⛔ O DOCUMENTO DA PARTE NÃO É O INSCRITO: ele é `{ _idx, item }` — `_idx` diz ONDE e `item`
   * é QUEM. Semear os campos no topo faz o remontador devolver elenco vazio, e o teste ficaria
   * verde pelo motivo errado (a porta "não achou ninguém" em vez de "não escreveu o perfil"). */
  await db.collection('tournaments').doc(tDiv).collection('inscritos').doc(outro)
    .set({ _idx: 0, item: { uid: outro, displayName: 'Inscrito 2', category: 'B', categories: ['B'] } });

  const retratoDoPerfil = async (uid) => {
    const u = (await db.collection('users').doc(uid).get()).data() || {};
    return JSON.stringify({ skillBySport: u.skillBySport || null, skillBySportSource: u.skillBySportSource || null,
      gender: u.gender || null, genderSetBy: u.genderSetBy || null, skillSetBy: u.skillSetBy || null,
      profileSetAt: String(u.profileSetAt || '') });
  };
  const antes = (await db.collection('users').doc(outro).get()).data() || {};
  r = await chamar('applyEnrollmentAssignments', tokenOrg, {
    tournamentId: tDiv, sport: 'Beach Tennis', edits: [{ uid: outro, category: 'A' }],
  });
  ok(r.status === 200, 'atribuição só de categoria respondeu 200 (' + r.status + ' '
    + JSON.stringify(r.body).slice(0, 180) + ')');
  const depois = (await db.collection('users').doc(outro).get()).data() || {};
  eq(depois.skillBySport, antes.skillBySport, '⛔ `skillBySport` do perfil INTACTO');
  eq(depois.skillBySportSource, antes.skillBySportSource, '⛔ a marca de procedência INTACTA');
  ok(depois.skillSetBy === antes.skillSetBy, '⛔ nenhum carimbo de quem atribuiu categoria');
  ok(String(depois.profileSetAt || '') === String(antes.profileSetAt || ''),
    '⛔⛔ `profileSetAt` NÃO mudou: atribuir categoria não é "mexeram no seu cadastro"');
  ok(JSON.stringify(Object.keys(depois).sort()) === JSON.stringify(Object.keys(antes).sort()),
    '⛔ o documento do perfil não ganhou nem perdeu campo');

  console.log('\n── SÓ GÊNERO: também não encosta no perfil (23/set) ──');
  /* ⛔ INVERTIDO. Este caso exigia que o gênero FOSSE ao perfil global. Saiu: ser organizador não
   * prova consentimento — inscrever terceiro é fluxo suportado, então qualquer conta reescrevia o
   * cadastro da vítima. Medido antes de tirar: 181 slots com uid na base, ZERO divergências entre o
   * gênero do inscrito e o do perfil. A decisão dele vive no INSCRITO, marcada. */
  const antesDoGenero = await retratoDoPerfil(outro);
  r = await chamar('applyEnrollmentAssignments', tokenOrg, {
    tournamentId: tDiv, sport: 'Beach Tennis', edits: [{ uid: outro, gender: 'masculino' }],
  });
  ok(r.status === 200, 'atribuição só de gênero respondeu 200 (' + r.status + ')');
  ok((await retratoDoPerfil(outro)) === antesDoGenero,
    '⛔⛔ o perfil do alvo ficou BYTE A BYTE igual — nem gênero, nem carimbo, nem data');
  const tDepois = (await db.collection('tournaments').doc(tDiv).get()).data() || {};
  /* ⚠️ A CHAVE do documento da parte é decidida pelo motor (`chaveDoInscrito`), não é o uid — por
   * isso se varre a subcoleção em vez de adivinhar o id. */
  const subDepois = await db.collection('tournaments').doc(tDiv).collection('inscritos').get();
  let alvoNoElenco = null;
  subDepois.docs.forEach((d) => { const it = (d.data() || {}).item || {}; if (it.uid === outro) alvoNoElenco = it; });
  if (!alvoNoElenco) alvoNoElenco = (tDepois.participants || []).find((x) => x && x.uid === outro) || {};
  ok(alvoNoElenco.gender === 'masculino', '⭐ e a decisão vale NO TORNEIO');
  ok(alvoNoElenco.genderSource === 'organizador', '⭐ marcada com a procedência, que é o que a faz valer');

  console.log('\n── MEMBRO DE DUPLA: a decisão sai da porta já MARCADA ──');
  /* ⛔ POR QUE ESTE CASO. A porta gravava `p1Gender`/`p2Gender` SEM a procedência — e o sanitizador
   * novo exige o par. A decisão do organizador sobre um membro evaporaria no próximo save, em
   * silêncio. Aqui ela sai da porta de verdade, não injetada à mão no teste. */
  const tDupla = 'ad-marca-t-dupla';
  await db.collection('tournaments').doc(tDupla).set({
    id: tDupla, name: 'Dupla', creatorUid: org, sport: 'Beach Tennis', combinedCategories: ['A'],
    participants: [{ p1Uid: inscrito, p1Name: 'Um', p2Uid: outro, p2Name: 'Dois', name: 'Um / Dois' }],
  });
  r = await chamar('applyEnrollmentAssignments', tokenOrg, {
    tournamentId: tDupla, sport: 'Beach Tennis',
    edits: [{ uid: inscrito, pairMember: 'p1', gender: 'feminino' }],
  });
  ok(r.status === 200, 'atribuição por membro respondeu 200 (' + r.status + ')');
  const tD = (await db.collection('tournaments').doc(tDupla).get()).data() || {};
  const dupla = (tD.participants || [])[0] || {};
  ok(dupla.p1Gender === 'feminino', 'o gênero do membro 1 foi gravado');
  ok(dupla.p1GenderSource === 'organizador', '⭐⭐ e COM a marca — sem ela o save seguinte apagaria');
  ok(dupla.p2Gender === undefined && dupla.p2GenderSource === undefined, 'o outro membro não foi tocado');

  r = await chamar('applyEnrollmentAssignments', tokenOrg, {
    tournamentId: tDupla, sport: 'Beach Tennis',
    edits: [{ uid: inscrito, pairMember: 'p1', gender: '' }],
  });
  ok(r.status === 200, 'limpar o gênero do membro respondeu 200');
  const tD2 = (await db.collection('tournaments').doc(tDupla).get()).data() || {};
  const dupla2 = (tD2.participants || [])[0] || {};
  ok(dupla2.p1Gender === undefined && dupla2.p1GenderSource === undefined,
    '⛔ e apagar é SIMÉTRICO: valor e marca saem juntos (marca órfã viraria "decidiu" sem decisão)');

  r = await chamar('applyEnrollmentAssignments', tokenOrg, {
    tournamentId: tDupla, sport: 'Beach Tennis',
    edits: [{ uid: inscrito, pairMember: 'p1', gender: 'misto' }],
  });
  const tD3 = (await db.collection('tournaments').doc(tDupla).get()).data() || {};
  const dupla3 = (tD3.participants || [])[0] || {};
  ok(dupla3.p1Gender !== 'misto', '⛔ `misto` NÃO entra como gênero de pessoa (é categoria)');

  console.log('\n── sem token a porta não abre ──');
  r = await chamar('applyEnrollmentAssignments', null, {
    tournamentId: tId, sport: 'Beach Tennis', edits: [{ uid: inscrito, category: 'B' }],
  });
  ok(r.status !== 200, 'chamada sem ID token é recusada (' + r.status + ')');
  eq((await perfil(inscrito)).skillBySport, antesDoT1.skillBySport,
    'e o perfil segue como estava desde o começo');

  if (fail) { console.error('\n❌ reconciliação da marca (autodraw): ' + pass + ' ok, ' + fail + ' falharam'); process.exit(1); }
  console.log('\n✅ reconciliação da marca (autodraw): ' + pass + ' ok');
})().catch((e) => { console.error('❌ erro no teste:', (e && e.stack) || e); process.exit(1); });
