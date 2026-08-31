/* SANDBOX VAZANDO PRA PRODUÇÃO — a regra de leitura deixava QUALQUER logado ler o torneio
 * de teste do dev.
 *
 * A FALHA (relatada ao vivo em 25/jul/2026: "assistiram a tudo o que fiz no SB; aparecia
 * tudo pra eles quando era pra ser sem notificação e visibilidade pra quem não fosse eu"):
 *   allow read: if (resource.data.isPublic == true) || (request.auth != null);
 * Ou seja: estar logado bastava. O SB era criado clonando o original — inclusive o
 * `memberUids` com o uid de TODAS as pessoas reais — então o listener
 * `tournaments where memberUids array-contains <uid>` ENTREGAVA o doc do SB no device de
 * cada participante, e a invisibilidade passava a depender de cada tela lembrar de filtrar
 * (havia filtro em 2 lugares: getVisibleTournaments e getMyParticipations; dezenas de
 * outros consumidores de AppStore.tournaments não filtravam).
 *
 * O fix tem DUAS camadas e este teste trava a de baixo (a única que não depende do cliente):
 *   1. memberUids do SB = só os uids do dev  → o Firestore nem ENTREGA o doc (persist-core)
 *   2. rules: SB só é legível por quem está no memberUids dele → nem por link/id (aqui)
 *
 * Dirige as RULES REAIS no emulador e exige as DUAS direções: o vazamento é NEGADO no novo
 * E PASSAVA no velho (senão o teste não prova que a correção corrige algo).
 *
 * Rodado por: npm run test:rules:sandbox
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8098;
const PROJECT = 'demo-scoreplace';

const DEV = 'uid_dev';      // dono do sandbox
const REAL = 'uid_pedro';   // participante real, espelhado no roster do SB

const DRIVER = `
const P = '${PROJECT}', H = 'http://127.0.0.1:${PORT}';
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
const B = v => ({ booleanValue: v });
const L = a => ({ arrayValue: { values: a.map(S) } });
(async () => {
  const out = {};
  const DEV = '${DEV}', REAL = '${REAL}';

  // ── setup: o dev cria (a) o SB e (b) um torneio privado normal; (c) um público ──
  // memberUids do SB = SÓ o dev (é o que persist-core passa a gravar).
  out.criaSB = await req('PATCH', 'tournaments/tour_1_sb', DEV, { fields: {
    name: S('(SB) Torneio de Férias'), creatorUid: S(DEV), sandboxOwnerUid: S(DEV),
    isSandbox: B(true), isPublic: B(false), sandboxOf: S('tour_1'),
    memberUids: L([DEV])
  }});
  out.criaPrivadoNormal = await req('PATCH', 'tournaments/tour_2', DEV, { fields: {
    name: S('Torneio privado normal'), creatorUid: S(DEV), isPublic: B(false),
    memberUids: L([DEV, REAL])
  }});
  out.criaPublico = await req('PATCH', 'tournaments/tour_3', DEV, { fields: {
    name: S('Torneio público'), creatorUid: S(DEV), isPublic: B(true),
    memberUids: L([DEV, REAL])
  }});

  // ── O VAZAMENTO: participante real (logado, NÃO no memberUids do SB) lê o SB por id ──
  out.realLeSB = await req('GET', 'tournaments/tour_1_sb', REAL);

  // ── O dev tem que continuar lendo o próprio SB (senão o fix inutiliza a feature) ──
  out.devLeSB = await req('GET', 'tournaments/tour_1_sb', DEV);

  // ── CONTROLE: leitura normal NÃO pode ser afetada pelo fix ──
  out.realLePrivadoNormal = await req('GET', 'tournaments/tour_2', REAL);
  out.realLePublico       = await req('GET', 'tournaments/tour_3', REAL);

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})();
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spsbrules-'));
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
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }),
  });
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) throw new Error('driver não devolveu resultado (' + label + '):\n' + out.slice(-800));
  return JSON.parse(m[1]);
}

// Reconstrói a regra VELHA (uma linha) a partir da atual — prova que o vazamento existia.
function makeOldRules() {
  const cur = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  /* ⚠️ A FLAG `g` É O TESTE. Sem ela, `String.replace` troca só a PRIMEIRA ocorrência —
   * e o bloco é IDÊNTICO em duas coleções desde 25/ago/2026 (4c595e2d, `tournaments_summary`,
   * que vem ANTES no arquivo). O replace passou a reverter o resumo e deixar `tournaments`
   * com a regra NOVA: o "velho" gerado negava a leitura (403) e o controle ficou vermelho
   * sem nada de errado na regra de produção. Nasceu certo em 25/jul (91f9f070), quando havia
   * um bloco só. ⛔ Contar quantas ocorrências existem seria frágil de outro jeito; trocar
   * TODAS é o que a intenção sempre foi.
   * ⭐ E o `esperadas` abaixo trava o alvo: se um dia o bloco sumir de uma das coleções, o
   * teste ACUSA em vez de gerar um "velho" que não é velho coisa nenhuma. */
  const NEW_BLOCK = /allow read: if \(\s*\n\s*\(resource\.data\.get\('isSandbox'[\s\S]*?\n\s*\);/g;
  const achadas = (cur.match(NEW_BLOCK) || []).length;
  if (achadas < 1) {
    throw new Error('não achei o bloco novo de allow read em firestore.rules — ajuste o teste');
  }
  const old = cur.replace(NEW_BLOCK,
    "allow read: if (resource.data.isPublic == true) || (request.auth != null);");
  const sobraram = (old.match(NEW_BLOCK) || []).length;
  if (sobraram !== 0) {
    throw new Error('o "velho" gerado ainda tem ' + sobraram + ' bloco(s) NOVO(s) — o controle não provaria nada');
  }
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spsbold-')), 'old.rules');
  fs.writeFileSync(p, old);
  return p;
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

console.log('──── rules-sandbox-read ────');

// ── 1. RULES ATUAIS: o vazamento tem que FALHAR ──────────────────────────────
const novo = runAgainst(path.join(ROOT, 'firestore.rules'), 'atual');
ok(novo.criaSB === 200, 'setup: dev cria o SB (got ' + novo.criaSB + ')');
ok(novo.criaPrivadoNormal === 200, 'setup: dev cria torneio privado normal (got ' + novo.criaPrivadoNormal + ')');
ok(novo.criaPublico === 200, 'setup: dev cria torneio público (got ' + novo.criaPublico + ')');

ok(novo.realLeSB === 403,
  '🔒 VAZAMENTO: participante real logado NÃO lê o SB nem por id (got ' + novo.realLeSB + ')');
ok(novo.devLeSB === 200,
  'o dev continua lendo o próprio SB (got ' + novo.devLeSB + ')');
ok(novo.realLePrivadoNormal === 200,
  'controle: torneio privado NORMAL segue legível pra logado (got ' + novo.realLePrivadoNormal + ')');
ok(novo.realLePublico === 200,
  'controle: torneio público segue legível (got ' + novo.realLePublico + ')');

// ── 2. RULES VELHAS: o vazamento tem que PASSAR (senão não provamos nada) ────
const velho = runAgainst(makeOldRules(), 'velho');
ok(velho.realLeSB === 200,
  'prova: no VELHO o participante real LIA o SB (got ' + velho.realLeSB + ') — era o vazamento relatado');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ rules-sandbox-read FALHOU'); process.exit(1); }
console.log('✅ rules-sandbox-read: OK');
