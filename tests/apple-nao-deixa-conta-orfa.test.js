/* CONTA NO AUTH SEM PERFIL NO FIRESTORE — e o e-mail gravado no lugar do nome.
 * node tests/apple-nao-deixa-conta-orfa.test.js
 *
 * MEDIDO em produção (22/ago/2026): 236 contas no Firebase Auth × 248 docs em `users/`
 * → 2 contas SEM perfil, ambas Apple com e-mail oculto (@privaterelay), ambas com
 * `lastSignInTime == creationTime` — entraram uma vez e nunca voltaram. Sem doc de
 * perfil a pessoa NÃO EXISTE pro app: não aparece na busca, não entra em lista de
 * espera, não se inscreve, e o organizador vê "Jogador sem perfil (XXXX)".
 *
 * E o caso IRMÃO, mesma raiz: uma conta Apple GANHOU doc, mas com
 * `displayName: "brupoti@gmail.com"` — o e-mail no lugar do nome — enquanto o Firebase
 * Auth tinha "Bruna Verga Sá". Ela aparece assim na lista de espera do organizador, que
 * não a reconhece. Duas coisas quebraram juntas: a Apple nativa grava o nome com
 * `updateProfile()` DEPOIS do `signInWithCredential` e o `onAuthStateChanged` corre na
 * frente (o instantâneo que gravou o perfil não tinha nome); e, sem nome, o código caía
 * no e-mail — que num login social a pessoa nunca pediu pra publicar.
 *
 * ESTE TESTE DIRIGE A FUNÇÃO REAL (`simulateLoginSuccess` extraída do js/views/auth.js,
 * não uma réplica) contra um Firestore/Auth de mentira, e injeta as falhas UMA A UMA.
 * Antes do conserto, QUATRO delas produziam exatamente a órfã observada — e NENHUMA
 * mandava nada pro Sentry: uma falha invisível por construção.
 *
 * ⚠️ O QUE ESTE TESTE NÃO PROMETE: quando o Firestore RECUSA a escrita, o cliente não
 * tem o que fazer — a conta fica órfã e o teste cobra que isso pelo menos seja RELATADO.
 * Quem cura esse caso é a varredura do servidor (functions/orphan-profile-*.js,
 * functions/test-orphan-profile-core.js).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── extrai o CÓDIGO REAL: os helpers + a função inteira ──────────────────────
const h0 = SRC.indexOf('window._authRace = function');
const h1 = SRC.indexOf('\n// ─── Account linking helper');
const i0 = SRC.indexOf('async function simulateLoginSuccess(user) {');
ok(h0 !== -1, 'não achei os helpers (_authRace) no auth.js');
ok(i0 !== -1, 'não achei simulateLoginSuccess no auth.js');
const CODIGO = SRC.slice(h0, h1) + '\n' + SRC.slice(i0, SRC.indexOf('\n}\n', i0) + 3);

function montar(op) {
  op = op || {};
  const log = [], docs = Object.assign({}, op.docs || {});
  const ref = (c, id) => ({
    get: async () => {
      if (op.getPendura) return new Promise(() => {});
      if (op.getRejeita) throw new Error('UnknownError: Database deleted by request of the user');
      const v = docs[c + '/' + id]; return { id, exists: !!v, data: () => v };
    },
    set: async (d) => { docs[c + '/' + id] = Object.assign({}, docs[c + '/' + id], d); },
    update: async (d) => { if (!docs[c + '/' + id]) throw new Error('not-found'); Object.assign(docs[c + '/' + id], d); },
    delete: async () => { delete docs[c + '/' + id]; },
  });
  const q = { where() { return this; }, limit() { return this; }, orderBy() { return this; }, get: async () => ({ docs: [], forEach() {} }) };
  const db = { collection: (c) => Object.assign({ doc: (d) => ref(c, d) }, q) };
  const win = {
    SCOREPLACE_VERSION: 'teste', _log() {}, _warn() {}, _error() {},
    _captureException: (e, ctx) => log.push({ tipo: 'sentry', msg: String(e && e.message), ctx }),
    AppStore: {
      currentUser: null,
      loadUserProfile: async (u) => { if (op.loadPendura) return new Promise(() => {}); return docs['users/' + u] || null; },
      stopRealtimeListener() {}, startRealtimeListener() {}, startNotificationsListener() {},
      startProfileListener() {}, loadPublicDiscovery: async () => {},
    },
    FirestoreDB: {
      db,
      saveUserProfile: async (uid, d) => {
        if (op.saveRejeita) throw new Error('Missing or insufficient permissions.');
        const t = Object.assign({}, d);
        if (t.displayName) t.displayName_lower = String(t.displayName).toLowerCase();
        await ref('users', uid).set(t);
      },
    },
    _isSyntheticEmail: (e) => /@phone\.scoreplace\.app$/i.test(String(e || '')),
    _realEmailOrEmpty: (e) => (e && !/@phone\.scoreplace\.app$/i.test(e)) ? e : '',
    _isUnfriendlyName: (n) => !n || ['usuário', 'usuario', 'user', 'visitante'].indexOf(String(n).trim().toLowerCase()) !== -1,
    _updateTopbarForUser() {}, _rememberLoginMethod() {}, _userVivo: async () => ({ docs: [] }),
    _identify() {}, _trackLogin: () => log.push({ tipo: 'login' }), _trackSignup: () => log.push({ tipo: 'signup' }),
    _isPro: () => false, _needsTermsAcceptance: () => false, _showTermsAcceptanceModal: async () => true,
    _CURRENT_TERMS_VERSION: '1', location: { hash: '#dashboard', search: '' }, _closeHamburger() {},
    _profileAvatarUrl: () => '', _normalizeDisplayName: (s) => s, _safeHtml: (s) => s,
    _spImportEntry: () => '', _marcarFamiliaridade() {},
    _applePendingName: op.applePendingName || null,
  };
  win.window = win;
  const sb = {
    window: win, console, Date, Object, Array, JSON, Promise, String, Number, Math, Boolean, RegExp,
    Error, isNaN, parseInt, decodeURIComponent, encodeURIComponent,
    // Prazos comprimidos: o teste mede a ESTRUTURA (existe prazo?), não a duração.
    setTimeout: (f, ms) => setTimeout(f, Math.min(ms || 0, 40)), clearTimeout,
    document: { getElementById: () => null, querySelector: () => null, addEventListener() {}, removeEventListener() {} },
    navigator: { language: 'pt-BR' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    initRouter() {}, handleLogout() {}, _t: (k) => k, showNotification() {},
    firebase: {
      auth: () => ({ currentUser: op.fbUser || null }),
      functions: () => ({ httpsCallable: () => async () => {
        if (op.cfPendura) return new Promise(() => {});
        if (op.cfRejeita) throw new Error('internal');
        return { data: { redirected: false, reason: 'no_redirect' } };
      } }),
      firestore: { FieldValue: { arrayUnion: (...a) => ({ _u: a }), arrayRemove: (...a) => ({ _r: a }) } },
    },
  };
  sb.globalThis = sb;
  return { sb, win, log, docs };
}

const AUTH_APPLE = (nome, email) => ({
  uid: 'U_APPLE', email: email, displayName: nome, emailVerified: true,
  providerData: [{ providerId: 'apple.com' }],
  metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() },
});

async function entrar(op, user) {
  const S = montar(op);
  vm.createContext(S.sb);
  vm.runInContext(CODIGO + '\nglobalThis.__entrar = simulateLoginSuccess;', S.sb, { filename: 'auth-real.js' });
  let travou = true;
  await Promise.race([
    S.sb.__entrar(user).then(() => { travou = false; }, () => { travou = false; }),
    new Promise((r) => setTimeout(r, 1500)),
  ]);
  return { perfil: S.docs['users/' + user.uid] || null, travou, log: S.log };
}

(async () => {
  const RELAY = '7hsc6fn77d@privaterelay.appleid.com';
  const userRelay = { uid: 'U_APPLE', email: RELAY, displayName: '', photoURL: '' };

  // ── 1. As quatro falhas que produziam a órfã ────────────────────────────────
  // Cada uma é uma ida à rede no caminho do login. Antes do conserto: sem prazo,
  // e a ÚNICA escrita que criava o doc era fire-and-forget com .catch() mudo.
  const falhas = [
    ['tudo saudável', {}],
    ['resolveLoginRedirect pendurada', { cfPendura: true }],
    ['resolveLoginRedirect rejeita', { cfRejeita: true }],
    ['Firestore .get() pendurado (IndexedDB apagado)', { getPendura: true }],
    ['Firestore .get() rejeita', { getRejeita: true }],
    ['loadUserProfile pendurado', { loadPendura: true }],
  ];
  for (const [nome, op] of falhas) {
    const r = await entrar(Object.assign({ fbUser: AUTH_APPLE(null, RELAY) }, op), userRelay);
    ok(!!r.perfil, 'conta Apple NOVA ganha perfil mesmo com: ' + nome);
    ok(!r.travou, '  → e o login TERMINA (nada de spinner eterno): ' + nome);
  }

  // ── 2. O caso que o cliente NÃO consegue resolver — mas tem que RELATAR ─────
  const rec = await entrar({ fbUser: AUTH_APPLE(null, RELAY), saveRejeita: true }, userRelay);
  ok(!rec.perfil, 'Firestore recusando a escrita: o perfil realmente não nasce (limite do cliente)');
  ok(rec.log.filter((l) => l.tipo === 'sentry').length > 0,
     '🔔 mas AGORA isso vai pro Sentry — era exatamente a falha invisível que criou as 2 órfãs');

  // ── 3. E-MAIL NÃO É NOME num login social ──────────────────────────────────
  const semNome = await entrar({ fbUser: AUTH_APPLE(null, RELAY) }, userRelay);
  ok(semNome.perfil && semNome.perfil.displayName !== RELAY,
     '🔒 e-mail oculto da Apple NUNCA vira displayName (era isso na lista do organizador)');
  ok(semNome.perfil && !semNome.perfil.displayName,
     '  → sem nome do provedor, o app não inventa nem publica o e-mail: fica vazio e ele PERGUNTA');

  const gmail = 'brupoti@gmail.com';
  const semNomeGmail = await entrar({ fbUser: AUTH_APPLE(null, gmail) },
                                    { uid: 'U_APPLE', email: gmail, displayName: '', photoURL: '' });
  ok(semNomeGmail.perfil && semNomeGmail.perfil.displayName !== gmail,
     '🔒 nem um e-mail de verdade vira nome num login social (caso "brupoti@gmail.com")');

  // ── 4. O nome da Apple sobrevive à corrida do updateProfile ─────────────────
  // A Apple nativa entrega o nome ANTES de autenticar; o updateProfile só landa
  // depois. Quem gravar no meio via `displayName: null` — foi assim que o e-mail
  // acabou no lugar de "Bruna Verga Sá".
  const corrida = await entrar(
    { fbUser: AUTH_APPLE(null, gmail), applePendingName: 'Bruna Verga Sá' },
    { uid: 'U_APPLE', email: gmail, displayName: '', photoURL: '' });
  ok(corrida.perfil && corrida.perfil.displayName === 'Bruna Verga Sá',
     'o nome que a Apple mandou no 1º consentimento CHEGA no perfil, mesmo perdendo a corrida');

  // ── 5. Perfil já gravado com o e-mail no nome se CURA quando o nome aparece ─
  const cura = await entrar({
    fbUser: AUTH_APPLE('Bruna Verga Sá', gmail),
    docs: { 'users/U_APPLE': { email: gmail, displayName: gmail, displayName_lower: gmail, createdAt: '2026-08-01T00:00:00.000Z' } },
  }, { uid: 'U_APPLE', email: gmail, displayName: 'Bruna Verga Sá', photoURL: '' });
  ok(cura.perfil && cura.perfil.displayName === 'Bruna Verga Sá',
     'perfil que JÁ tinha o e-mail como nome se conserta sozinho quando o provedor devolve o nome (sem migração)');

  // ── 6. Magic link / e-mail+senha NÃO foram tocados ─────────────────────────
  // Ali o endereço É o identificador que a pessoa digitou e reconhece.
  const magico = await entrar({
    fbUser: { uid: 'U_MAIL', email: 'alguem@gmail.com', displayName: null, emailVerified: true,
              providerData: [{ providerId: 'password' }],
              metadata: { creationTime: new Date().toISOString(), lastSignInTime: new Date().toISOString() } },
  }, { uid: 'U_MAIL', email: 'alguem@gmail.com', displayName: '', photoURL: '' });
  ok(magico.perfil && magico.perfil.displayName === 'alguem@gmail.com',
     'conta de e-mail/senha segue usando o e-mail como identificador (nada regrediu ali)');

  // ── 7. Cadastro continua contando como cadastro ────────────────────────────
  // A semente gravada segundos antes não pode fazer o GA4 ler um signup como login.
  const nova = await entrar({ fbUser: AUTH_APPLE(null, RELAY) }, userRelay);
  ok(nova.log.some((l) => l.tipo === 'signup'), 'conta nova ainda dispara SIGNUP no analytics (a semente não a disfarça de veterana)');

  // ── 8. Estrutura: as idas à rede do login têm prazo ────────────────────────
  const corpo = SRC.slice(i0, SRC.indexOf('\n}\n', i0) + 3);
  ok((corpo.match(/_authRace\(/g) || []).length >= 4,
     'as quatro idas à rede do caminho do login passam pelo prazo (_authRace)');
  ok(!/saveUserProfile\(uid, basicData\)\.catch/.test(corpo),
     'a gravação do perfil não é mais fire-and-forget com .catch() mudo');
  ok(/_ensureProfileDoc\(/.test(corpo), 'ela passa pelo _ensureProfileDoc (espera + repete + Sentry)');

  console.log((fail === 0 ? '✅' : '❌') + ' apple-nao-deixa-conta-orfa: ' + pass + ' asserções, ' + fail + ' falha(s)');
  process.exit(fail === 0 ? 0 : 1);
})();
