/* ⛔ A ESCALADA DE PRIVILÉGIO DA AMIZADE — reproduzida e fechada (v2.1.48, 29/ago/2026).
 *
 * ACHADO na auditoria externa da 2.1.47. Três passos, do console do navegador, com a
 * chave web que já é pública por desenho:
 *
 *   1. a vítima escolhe `statsVisibility = 'friends'`;
 *   2. um ESTRANHO escreve `users/{vítima}.friends = [uidDele]`
 *      — `firestore.rules:639` liberava por `|| isFriendArrayDiff()`, que perguntava
 *        só QUAIS CHAVES mudaram e nunca QUEM estava mudando;
 *   3. `statsVisibleToCaller` (que decidia por `uid in u.get('friends')`) passa a
 *      devolver true → o estranho lê matchHistory, trophies e milestones da vítima.
 *
 * ⛔ MESMA CLASSE do sequestro por `mergedInto` já corrigido nesta base, e a lição estava
 * escrita no próprio firestore.rules: "campo que o servidor TRATA COMO PROVA nunca pode
 * ser escrito por quem ele autoriza". `friends` era prova e era gravável pelo avaliado.
 *
 * ESTE TESTE RODA CONTRA AS DUAS VERSÕES DAS RULES. Se o exploit não PASSAR nas antigas,
 * o teste não está provando nada — estaria verde por acidente.
 *
 * Rodado por: npm run test:rules
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8099;
const PROJECT = 'demo-scoreplace';

const DRIVER = `
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:${PORT}';
const admin = require(${JSON.stringify(path.join(ROOT, 'functions', 'node_modules', 'firebase-admin'))});
const P = '${PROJECT}', H = 'http://127.0.0.1:${PORT}';
if (!admin.apps.length) admin.initializeApp({ projectId: P });
const db = admin.firestore();

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = uid => b64({alg:'none',typ:'JWT'}) + '.' + b64({
  iss:'https://securetoken.google.com/'+P, aud:P, sub:uid, user_id:uid,
  auth_time: Math.floor(Date.now()/1000), iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000)+3600, email:uid+'@x.com', email_verified:true,
  firebase:{ identities:{}, sign_in_provider:'google.com' }
}) + '.';
const url = p => H + '/v1/projects/' + P + '/databases/(default)/documents/' + p;
async function req(method, p, uid, body) {
  const r = await fetch(url(p), { method,
    headers: { 'Authorization': 'Bearer ' + tok(uid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const S = v => ({ stringValue: v });
const ARR = vs => ({ arrayValue: { values: vs.map(S) } });

(async () => {
  const out = {};
  const VITIMA = 'uid_vitima', AMIGO = 'uid_amigo', ESTRANHO = 'uid_estranho';

  // ── SEED via Admin SDK (ignora rules por definição) ────────────────────────
  await db.collection('users').doc(VITIMA).set({
    displayName: 'Vitima', statsVisibility: 'friends', friends: [AMIGO]
  });
  await db.collection('users').doc(AMIGO).set({ displayName: 'Amigo', friends: [VITIMA] });
  await db.collection('users').doc(ESTRANHO).set({ displayName: 'Estranho', friends: [] });
  await db.collection('users').doc(VITIMA).collection('trophies').doc('t1').set({ nome: 'Campeao' });
  await db.collection('users').doc(VITIMA).collection('matchHistory').doc('m1').set({ jogo: 1 });
  await db.collection('users').doc(VITIMA).collection('milestones').doc('x1').set({ n: 1 });
  // A projeção nova: AMIGO é amigo de verdade, ESTRANHO não.
  await db.collection('friendAccess').doc(VITIMA).collection('accepted').doc(AMIGO).set({ since: 'seed' });
  await db.collection('friendAccess').doc(AMIGO).collection('accepted').doc(VITIMA).set({ since: 'seed' });

  // ══ O EXPLOIT: estranho se põe no friends da vítima ═══════════════════════
  out.exploitEscreveFriends = await req('PATCH',
    'users/' + VITIMA + '?updateMask.fieldPaths=friends', ESTRANHO,
    { fields: { friends: ARR([AMIGO, ESTRANHO]) } });

  // Leitura das estatísticas DEPOIS da tentativa
  out.estranhoLeTrophies    = await req('GET', 'users/' + VITIMA + '/trophies/t1', ESTRANHO);
  out.estranhoLeMatchHist   = await req('GET', 'users/' + VITIMA + '/matchHistory/m1', ESTRANHO);
  out.estranhoLeMilestones  = await req('GET', 'users/' + VITIMA + '/milestones/x1', ESTRANHO);

  // controle: quem é 'public' continua legível por qualquer autenticado
  await db.collection('users').doc('uid_publico').set({ displayName: 'Publico', statsVisibility: 'public' });
  await db.collection('users').doc('uid_publico').collection('trophies').doc('t1').set({ nome: 'X' });
  out.estranhoLePublico = await req('GET', 'users/uid_publico/trophies/t1', ESTRANHO);

  // ── AMIZADE LEGÍTIMA continua funcionando ────────────────────────────────
  out.amigoLeTrophies   = await req('GET', 'users/' + VITIMA + '/trophies/t1', AMIGO);
  out.amigoLeMatchHist  = await req('GET', 'users/' + VITIMA + '/matchHistory/m1', AMIGO);
  out.donoLeProprio     = await req('GET', 'users/' + VITIMA + '/trophies/t1', VITIMA);

  // ── O DONO também não escreve mais os próprios arrays (viraram cache) ─────
  out.donoEscreveProprioFriends = await req('PATCH',
    'users/' + VITIMA + '?updateMask.fieldPaths=friends', VITIMA,
    { fields: { friends: ARR([ESTRANHO]) } });

  // ── Perfil comum continua editável pelo dono ─────────────────────────────
  out.donoEditaNome = await req('PATCH',
    'users/' + VITIMA + '?updateMask.fieldPaths=displayName', VITIMA,
    { fields: { displayName: S('Vitima Nova') } });

  // ── As estruturas novas não são graváveis pelo cliente ───────────────────
  out.clienteEscreveFriendship = await req('PATCH', 'friendships/forjado', ESTRANHO,
    { fields: { uidA: S(ESTRANHO), uidB: S(VITIMA), status: S('accepted') } });
  out.clienteEscreveAccess = await req('PATCH',
    'friendAccess/' + VITIMA + '/accepted/' + ESTRANHO, ESTRANHO, { fields: { since: S('forjado') } });

  // ── a colecao legada friendRequests foi FECHADA (4a auditoria, ponto 8) ──
  await db.collection('friendRequests').doc('semente').set({ from: VITIMA, to: ESTRANHO });
  out.leFriendRequestsLegado = await req('GET', 'friendRequests/semente', ESTRANHO);
  out.escreveFriendRequestsLegado = await req('PATCH', 'friendRequests/novo', ESTRANHO,
    { fields: { from: S(ESTRANHO), to: S(VITIMA) } });

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})().catch(e => { console.error('DRIVER ERRO', e); process.exit(1); });
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spamizade-'));
  const cfg = path.join(tmp, 'firebase.json');
  const drv = path.join(tmp, 'driver.js');
  fs.writeFileSync(cfg, JSON.stringify({
    firestore: { rules: rulesFile },
    emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true },
  }));
  fs.writeFileSync(drv, DRIVER);
  const out = execFileSync('firebase', [
    'emulators:exec', '--only', 'firestore', '--config', cfg, '--project', PROJECT,
    'node ' + JSON.stringify(drv),
  ], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }),
  });
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) throw new Error('driver não devolveu resultado (' + label + '):\n' + out.slice(-800));
  return JSON.parse(m[1]);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── 1. RULES ATUAIS: o buraco está FECHADO ───────────────────────────────────
const novo = runAgainst(path.join(ROOT, 'firestore.rules'), 'atual');

ok(novo.exploitEscreveFriends === 403,
  '🔒 EXPLOIT: estranho NÃO escreve friends da vítima (got ' + novo.exploitEscreveFriends + ')');
ok(novo.estranhoLeTrophies === 403,
  '🔒 estranho NÃO lê troféus de quem escolheu "só amigos" (got ' + novo.estranhoLeTrophies + ')');
ok(novo.estranhoLeMatchHist === 403,
  '🔒 estranho NÃO lê matchHistory (got ' + novo.estranhoLeMatchHist + ')');
ok(novo.estranhoLeMilestones === 403,
  '🔒 estranho NÃO lê milestones (got ' + novo.estranhoLeMilestones + ')');

ok(novo.amigoLeTrophies === 200,
  '✅ amizade LEGÍTIMA continua lendo troféus (got ' + novo.amigoLeTrophies + ')');
ok(novo.amigoLeMatchHist === 200,
  '✅ amizade LEGÍTIMA continua lendo matchHistory (got ' + novo.amigoLeMatchHist + ')');
ok(novo.donoLeProprio === 200,
  '✅ o dono lê o próprio (got ' + novo.donoLeProprio + ')');

ok(novo.donoEscreveProprioFriends === 403,
  '🔒 nem o DONO escreve o próprio friends — virou cache do servidor (got ' + novo.donoEscreveProprioFriends + ')');
ok(novo.donoEditaNome === 200,
  '✅ o dono continua editando o próprio perfil (got ' + novo.donoEditaNome + ')');

ok(novo.clienteEscreveFriendship === 403,
  '🔒 cliente NÃO forja friendships/{pairId} (got ' + novo.clienteEscreveFriendship + ')');
ok(novo.clienteEscreveAccess === 403,
  '🔒 cliente NÃO forja friendAccess (got ' + novo.clienteEscreveAccess + ')');

ok(novo.leFriendRequestsLegado === 403,
  '🔒 LEGADO: a coleção `friendRequests` não é mais LEGÍVEL (got ' + novo.leFriendRequestsLegado + ')');
ok(novo.escreveFriendRequestsLegado === 403,
  '🔒 LEGADO: nem gravável — era `allow read, write: if request.auth != null` com TODO(security) aberto (got ' + novo.escreveFriendRequestsLegado + ')');

// ── 1b. ETAPA A (rules intermediárias do cutover) ────────────────────────────
/* ⛔ O CASO QUE ESTE BLOCO EXISTE PRA TRAVAR: o atacante JÁ tinha conseguido se inserir
 * nos dois perfis durante a janela da 2.1.47. Congelar a escrita não desfaz isso.
 * Na Etapa A ele tem que perder as DUAS coisas: escrever E ler. Se a Etapa A continuasse
 * autorizando por `users.friends`, o congelamento eternizaria a autorização forjada. */
const etapaA = runAgainst(path.join(ROOT, 'firestore.rules.etapaA'), 'etapaA');
ok(etapaA.exploitEscreveFriends === 403,
  '🔒 ETAPA A: o atacante não escreve friends (got ' + etapaA.exploitEscreveFriends + ')');
ok(etapaA.estranhoLeTrophies === 403,
  '🔒 ETAPA A: e TAMBÉM não lê troféus — nem com o uid dele já plantado no friends da vítima (got ' + etapaA.estranhoLeTrophies + ')');
ok(etapaA.estranhoLeMatchHist === 403, '🔒 ETAPA A: nem matchHistory');
ok(etapaA.estranhoLeMilestones === 403, '🔒 ETAPA A: nem milestones');
ok(etapaA.amigoLeTrophies === 403,
  '⚠️ ETAPA A: o amigo LEGÍTIMO também perde acesso nesta janela — é o custo consciente de falhar fechado (got ' + etapaA.amigoLeTrophies + ')');
ok(etapaA.donoLeProprio === 200, '✅ ETAPA A: o DONO continua lendo o próprio (got ' + etapaA.donoLeProprio + ')');
ok(etapaA.donoEditaNome === 200, '✅ ETAPA A: e continua editando o próprio perfil');
ok(etapaA.leFriendRequestsLegado === 403, '🔒 ETAPA A: a coleção legada friendRequests já está fechada');
ok(etapaA.estranhoLePublico === 200,
  '✅ ETAPA A: quem escolheu `public` SEGUE público — a etapa fecha `friends`, não tudo (got ' + etapaA.estranhoLePublico + ')');
ok(novo.estranhoLePublico === 200, '✅ e nas rules finais também');

// ── 2. RULES ANTIGAS: o exploit PASSAVA ──────────────────────────────────────
// Sem esta metade o teste não prova a mudança — poderia estar verde por acidente.
const antigas = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      function isFriendArrayDiff() {
        return request.resource.data.diff(resource.data).affectedKeys()
          .hasOnly(['friends', 'friendRequestsSent', 'friendRequestsReceived']);
      }
      function statsVisibleToCaller(uid) {
        let u = get(/databases/$(database)/documents/users/$(uid)).data;
        let vis = u.get('statsVisibility', 'public');
        return vis == 'public' || (vis == 'friends' && request.auth.uid in u.get('friends', []));
      }
      allow read: if request.auth != null;
      allow update: if request.auth != null
        && ((request.auth.uid == userId) || isFriendArrayDiff());
      match /trophies/{t}     { allow read: if request.auth != null && (request.auth.uid == userId || statsVisibleToCaller(userId)); }
      match /matchHistory/{h} { allow read: if request.auth != null && (request.auth.uid == userId || statsVisibleToCaller(userId)); }
      match /milestones/{m}   { allow read: if request.auth != null && (request.auth.uid == userId || statsVisibleToCaller(userId)); }
    }
    match /friendships/{id}   { allow read, write: if request.auth != null; }
    match /friendRequests/{id} { allow read, write: if request.auth != null; }
    match /friendAccess/{u}/accepted/{f} { allow read, write: if request.auth != null; }
  }
}`;
const tmpOld = path.join(os.tmpdir(), 'rules-amizade-antigas-' + process.pid + '.rules');
fs.writeFileSync(tmpOld, antigas);
const velho = runAgainst(tmpOld, 'antigas');

ok(velho.exploitEscreveFriends === 200,
  '⚠️  CONTROLE: nas rules ANTIGAS o estranho ESCREVIA friends (got ' + velho.exploitEscreveFriends + ')');
ok(velho.estranhoLeTrophies === 200,
  '⚠️  CONTROLE: nas rules ANTIGAS ele LIA os troféus depois disso (got ' + velho.estranhoLeTrophies + ')');
fs.unlinkSync(tmpOld);

console.log(pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
