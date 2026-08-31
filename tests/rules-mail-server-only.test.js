/* /mail É SERVER-ONLY — nenhum cliente cria, lê, atualiza, apaga ou lista  (L1.2)
 *   node tests/rules-mail-server-only.test.js      (roda via `npm run test:rules`)
 *
 * ⛔ O QUE ESTAVA ABERTO. `allow write: if request.auth != null` em `/mail` não era
 * "fila de e-mail": era um RELAY. Quem estivesse logado escolhia DESTINATÁRIO, ASSUNTO e
 * HTML, e a extensão firestore-send-email entregava, saindo do remetente do produto.
 * O inventário da L1.P0 mediu a superfície: uma porta cliente (`FirestoreDB.queueEmail`)
 * e três fluxos usando-a.
 *
 * ⭐ A ORDEM IMPORTOU: fechar antes de migrar teria quebrado os três em produção. L1.3a
 * tirou o convite avulso; L1.1 tirou dupla e co-organização e apagou `queueEmail`; L1.1.1
 * consertou a corrida (o e-mail só é pedido depois de o convite PERSISTIR). Esta leva
 * fecha a porta.
 *
 * ⚠️ ISTO NÃO É UMA AFIRMAÇÃO SOBRE O TEXTO DAS RULES. Este arquivo DIRIGE as rules REAIS
 * no emulador, por REST, e exige as duas direções: negado com o `firestore.rules` de hoje
 * E PERMITIDO com a regra antiga. Um teste que passa nos dois não testa a correção.
 * [[feedback_never_claim_proven_without_real_verification]]
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8098;
const PROJECT = 'demo-scoreplace';

/* O driver fala REST com o emulador usando JWT não-assinado (o emulador não valida).
 * `reqAnon` vai SEM Authorization — é o cliente deslogado. */
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
  const h = { 'Content-Type': 'application/json' };
  if (uid) h['Authorization'] = 'Bearer ' + tok(uid);
  const r = await fetch(url(p), { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const S = v => ({ stringValue: v });
const A = ['A@x.com'];
const CORPO = { fields: {
  to: { arrayValue: { values: [S('vitima@x.com')] } },
  message: { mapValue: { fields: { subject: S('Assunto forjado'), html: S('<b>corpo forjado</b>') } } },
  createdAt: S('2026-08-31T00:00:00.000Z')
} };
(async () => {
  const out = {};
  const U = 'uid_qualquer', ORG = 'uid_organizador';

  // ── ESCRITA, autenticado ───────────────────────────────────────────────────
  out.criaAutenticado   = await req('PATCH', 'mail/forjado1', U, CORPO);
  out.criaComIdDeCF     = await req('PATCH', 'mail/tinv_deadbeef', U, CORPO);   // id que a CF usaria
  out.criaComIdDoProprioUid = await req('PATCH', 'mail/' + U, U, CORPO);        // "é meu, então posso"
  // ── ESCRITA, anônimo ───────────────────────────────────────────────────────
  out.criaAnonimo       = await req('PATCH', 'mail/forjado2', null, CORPO);
  // ── PAYLOAD "inocente": só pra mim mesmo, sem HTML ─────────────────────────
  out.criaSoPraMim      = await req('PATCH', 'mail/forjado3', U, { fields: {
    to: { arrayValue: { values: [S(U + '@x.com')] } },
    message: { mapValue: { fields: { subject: S('oi') } } } } });
  // ── DONO DE TORNEIO: cria um torneio e tenta mandar e-mail "do torneio dele" ─
  out.criaTorneio = await req('PATCH', 'tournaments/t_do_org', ORG, { fields: {
    creatorUid: S(ORG), name: S('Meu torneio'), isPublic: { booleanValue: true } } });
  out.orgCriaMail = await req('PATCH', 'mail/forjado_org', ORG, CORPO);
  // ── UPDATE e DELETE ────────────────────────────────────────────────────────
  out.atualizaAutenticado = await req('PATCH', 'mail/forjado1?updateMask.fieldPaths=createdAt', U,
    { fields: { createdAt: S('2030-01-01') } });
  out.apagaAutenticado    = await req('DELETE', 'mail/forjado1', U);
  out.apagaAnonimo        = await req('DELETE', 'mail/forjado1', null);
  // ── LEITURA e LISTAGEM ─────────────────────────────────────────────────────
  out.leAutenticado = await req('GET', 'mail/forjado1', U);
  out.leAnonimo     = await req('GET', 'mail/forjado1', null);
  out.listaAutenticado = await req('GET', 'mail', U);
  out.listaAnonimo     = await req('GET', 'mail', null);

  // ── CONTROLE DE ESCOPO: notif_email_queue NÃO é desta leva e segue aberta ───
  out.notifQueueCria = await req('PATCH', 'notif_email_queue/q1', U, { fields: {
    email: S('a@x.com'), level: S('all'), message: S('oi') } });
  out.notifQueueLe   = await req('GET', 'notif_email_queue/q1', U);

  // ── CONTROLE DE VIDA: as rules estão mesmo ligadas? algo legítimo tem que passar ─
  out.criaProprioPerfil = await req('PATCH', 'users/' + U, U, { fields: { displayName: S('Fulano') } });

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})();
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spmail-'));
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
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

console.log('\n① RULES DE HOJE — /mail recusa TUDO que venha do cliente\n');
const novo = runAgainst(path.join(ROOT, 'firestore.rules'), 'atual');

ok(novo.criaProprioPerfil === 200,
  'controle de vida: as rules estão ligadas e o uso legítimo passa (users/{eu} = ' + novo.criaProprioPerfil + ')');

ok(novo.criaAutenticado === 403, '🔒 CRIAR autenticado: NEGADO (got ' + novo.criaAutenticado + ')');
ok(novo.criaAnonimo === 403, '🔒 CRIAR anônimo: NEGADO (got ' + novo.criaAnonimo + ')');
ok(novo.criaComIdDeCF === 403,
  '🔒 e usar um id que a CF usaria (`tinv_…`) não abre nada (got ' + novo.criaComIdDeCF + ')');
ok(novo.criaComIdDoProprioUid === 403,
  '🔒 nem "o documento tem o meu uid, logo é meu" (got ' + novo.criaComIdDoProprioUid + ')');
ok(novo.criaSoPraMim === 403,
  '🔒 nem um payload inocente, só pra mim mesmo e sem HTML (got ' + novo.criaSoPraMim + ')');
ok(novo.criaTorneio === 200, 'setup: criar o próprio torneio é legítimo e passa (got ' + novo.criaTorneio + ')');
ok(novo.orgCriaMail === 403,
  '🔒 DONO DE TORNEIO também não escreve em /mail — sem exceção por organizador (got ' + novo.orgCriaMail + ')');
ok(novo.atualizaAutenticado === 403, '🔒 ATUALIZAR: NEGADO (got ' + novo.atualizaAutenticado + ')');
ok(novo.apagaAutenticado === 403, '🔒 APAGAR autenticado: NEGADO (got ' + novo.apagaAutenticado + ')');
ok(novo.apagaAnonimo === 403, '🔒 APAGAR anônimo: NEGADO (got ' + novo.apagaAnonimo + ')');
ok(novo.leAutenticado === 403, '🔒 LER autenticado: NEGADO (got ' + novo.leAutenticado + ')');
ok(novo.leAnonimo === 403, '🔒 LER anônimo: NEGADO (got ' + novo.leAnonimo + ')');
ok(novo.listaAutenticado === 403, '🔒 LISTAR autenticado: NEGADO (got ' + novo.listaAutenticado + ')');
ok(novo.listaAnonimo === 403, '🔒 LISTAR anônimo: NEGADO (got ' + novo.listaAnonimo + ')');

console.log('\n①b ESCOPO — notif_email_queue NÃO é desta leva\n');
ok(novo.notifQueueCria === 200,
  '⚠️ `notif_email_queue` segue aceitando create de autenticado — DÍVIDA ABERTA, é L2 (got ' + novo.notifQueueCria + ')');
ok(novo.notifQueueLe === 403,
  '  → e a leitura dela continua fechada, como já era (got ' + novo.notifQueueLe + ')');

/* ── ② CONTROLE: com a regra ANTIGA o ataque PASSA ──────────────────────────────
 * Sem isto o arquivo não prova nada. A regra antiga é reproduzida palavra por palavra:
 * `allow read: if false; allow write: if request.auth != null;` */
console.log('\n② RULES ANTIGAS — o mesmo ataque PASSA (prova que o teste mede a correção)\n');
const ANTIGAS = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    match /tournaments/{tournamentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null;
    }
    match /mail/{mailId} {
      allow read: if false;
      allow write: if request.auth != null;
    }
    match /notif_email_queue/{id} {
      allow read: if false;
      allow create: if request.auth != null;
      allow update, delete: if false;
    }
  }
}
`;
const tmpOld = fs.mkdtempSync(path.join(os.tmpdir(), 'spmail-old-'));
const oldRules = path.join(tmpOld, 'antigas.rules');
fs.writeFileSync(oldRules, ANTIGAS);
const velho = runAgainst(oldRules, 'antigas');

ok(velho.criaAutenticado === 200,
  '⛔ com a regra antiga, QUALQUER autenticado criava e-mail arbitrário (got ' + velho.criaAutenticado + ') — era o relay');
ok(velho.criaSoPraMim === 200, '⛔ idem para qualquer payload (got ' + velho.criaSoPraMim + ')');
ok(velho.orgCriaMail === 200, '⛔ idem para o organizador (got ' + velho.orgCriaMail + ')');
ok(velho.criaAnonimo === 403, '  (anônimo já era negado mesmo na regra antiga — got ' + velho.criaAnonimo + ')');
ok(velho.leAutenticado === 403, '  (leitura já era negada na regra antiga — got ' + velho.leAutenticado + ')');

/* ── ③ NENHUM WRITER RESIDUAL NO CLIENTE ───────────────────────────────────────
 * A regra fecha a porta; esta parte confere que nenhum código de `js/` ainda tenta
 * atravessá-la — senão o fechamento vira um fluxo quebrado em produção. */
console.log('\n③ NENHUM FLUXO CLIENTE TENTA ESCREVER EM /mail\n');
{
  const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const arquivos = [];
  (function anda(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) { if (d.name !== 'node_modules') anda(p); }
      else if (d.name.endsWith('.js')) arquivos.push(p);
    });
  })(path.join(ROOT, 'js'));
  const comMail = arquivos.filter((p) => /collection\(\s*['"]mail['"]\s*\)/.test(semComentarios(fs.readFileSync(p, 'utf8'))));
  ok(comMail.length === 0,
    'varri ' + arquivos.length + ' arquivos de js/: ZERO escrevem em /mail' + (comMail.length ? ' — ' + comMail.join(', ') : ''));
  const comQueue = arquivos.filter((p) => /\bqueueEmail\s*\(/.test(semComentarios(fs.readFileSync(p, 'utf8'))));
  ok(comQueue.length === 0, 'e ZERO chamam `queueEmail(`' + (comQueue.length ? ' — ' + comQueue.join(', ') : ''));
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exit(fail ? 1 : 0);
