/* magicLinks: LEITURA POR TOKEN, NUNCA ENUMERAÇÃO.   (L4.P4, 2.1.78)
 *
 * ⛔ O QUE ESTAVA ABERTO, e não era descuido de digitação — era a palavra errada:
 *     match /magicLinks/{token} { allow read: if true; }
 * Em Rules do Firestore, `read` = `get` + `list`. Numa regra de documento curinga isso
 * libera ENUMERAR a coleção inteira, sem token e sem conta. E cada documento guarda o
 * `firebaseLink` ASSINADO (o oobCode de entrada da pessoa) e o `email`.
 *
 * O comentário antigo justificava a abertura com "o token de 24 chars é o segredo, igual
 * link não-listado do YouTube". O raciocínio vale pro `get` — e a listagem passa por fora
 * dele: quem lista não precisa adivinhar token nenhum.
 *
 * MEDIDO no emulador contra as rules de então (L4.P2, 31/ago/2026):
 *     anônimo  get=200   list=200   runQuery=200
 * Não era leitura de hipótese: era 200.
 *
 * ⭐ E FECHAR NÃO CUSTA NADA AO PRODUTO. O inventário da L4.P3 varreu o disco inteiro
 * (walker, não `grep -r` — que aqui respeita .gitignore e esconde os bundles): a ÚNICA
 * leitura de `magicLinks` em web, Android e iOS é `.doc(token).get()`. Nenhum `where`,
 * `list`, `runQuery` ou `orderBy` em lugar nenhum. A única query da coleção é a da
 * limpeza agendada, com Admin SDK, que ignora as rules.
 * A trava estática que garante isso nos três clientes é scripts/check-magiclinks-get-only.js.
 *
 * ⚠️ ESTE TESTE EXIGE AS DUAS DIREÇÕES. Ele dirige as RULES REAIS no emulador e depois
 * REPETE tudo contra a árvore ANTERIOR (94f7d9cf), onde a enumeração TEM que passar. Um
 * teste que passasse nos dois não estaria provando o corte — estaria só descrevendo o
 * presente. [[feedback_rede_que_cobre_o_rerender_nao_cobre_o_primeiro]]
 *
 * Dados 100% sintéticos: token fictício, link que não leva a lugar nenhum, e-mail em
 * domínio reservado (.invalid). Nada de produção é lido ou escrito.
 *
 * Rodado por: npm run test:rules
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8097;                    // 8098/8099 são das outras suítes de rules
const PROJECT = 'demo-scoreplace';
const ARVORE_ANTERIOR = '94f7d9cf';   // último commit ANTES do corte

const DRIVER = `
const P = '${PROJECT}', H = 'http://127.0.0.1:${PORT}';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = uid => b64({alg:'none',typ:'JWT'}) + '.' + b64({
  iss:'https://securetoken.google.com/'+P, aud:P, sub:uid, user_id:uid,
  auth_time: Math.floor(Date.now()/1000), iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000)+3600, email:uid+'@naoexiste.invalid', email_verified:true,
  firebase:{ identities:{}, sign_in_provider:'google.com' }
}) + '.';
const base = H + '/v1/projects/' + P + '/databases/(default)/documents/';
/* quem === null → ANÔNIMO (sem cabeçalho). 'owner' → bypass de admin do emulador (semeadura). */
function cab(quem) {
  const h = { 'Content-Type': 'application/json' };
  if (quem === 'owner') h['Authorization'] = 'Bearer owner';
  else if (quem) h['Authorization'] = 'Bearer ' + tok(quem);
  return h;
}
async function req(method, p, quem, body) {
  const r = await fetch(base + p, { method, headers: cab(quem),
    body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
async function consulta(quem) {
  const r = await fetch(H + '/v1/projects/' + P + '/databases/(default)/documents:runQuery', {
    method: 'POST', headers: cab(quem),
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'magicLinks' }], limit: 5 } }) });
  return r.status;
}
const S = v => ({ stringValue: v });
const TOKEN = 'token_sintetico_l4p4';
const A = 'uidA_sintetico';
(async () => {
  const o = {};
  // semeadura pelo admin: o cliente não pode criar (e é isso que o teste confere depois)
  o.semeia = await req('PATCH', 'magicLinks/' + TOKEN, 'owner', { fields: {
    firebaseLink: S('https://exemplo.invalid/nao-e-um-link-real'),
    email: S('ml@naoexiste.invalid'),
    kind: S('verify') } });

  // ── o que o produto PRECISA: get por token, inclusive sem conta ──
  o.get_anon = await req('GET', 'magicLinks/' + TOKEN, null);
  o.get_auth = await req('GET', 'magicLinks/' + TOKEN, A);

  // ── o que ninguém precisa: varrer a coleção ──
  o.list_anon  = await req('GET', 'magicLinks?pageSize=5', null);
  o.list_auth  = await req('GET', 'magicLinks?pageSize=5', A);
  o.query_anon = await consulta(null);
  o.query_auth = await consulta(A);

  // ── escrita: negada pros dois, em todos os verbos ──
  o.create_anon = await req('POST', 'magicLinks?documentId=novo_anon', null, { fields: { email: S('x@naoexiste.invalid') } });
  o.create_auth = await req('POST', 'magicLinks?documentId=novo_auth', A,    { fields: { email: S('x@naoexiste.invalid') } });
  o.update_anon = await req('PATCH', 'magicLinks/' + TOKEN + '?updateMask.fieldPaths=email', null, { fields: { email: S('y@naoexiste.invalid') } });
  o.update_auth = await req('PATCH', 'magicLinks/' + TOKEN + '?updateMask.fieldPaths=email', A,    { fields: { email: S('y@naoexiste.invalid') } });
  o.delete_anon = await req('DELETE', 'magicLinks/' + TOKEN, null);
  o.delete_auth = await req('DELETE', 'magicLinks/' + TOKEN, A);

  // ── controle de sanidade: uma coleção server-only continua fechada nos dois ──
  o.controle_loginRedirects_get_anon = await req('GET', 'loginRedirects/chave_sintetica', null);
  o.controle_loginRedirects_get_auth = await req('GET', 'loginRedirects/chave_sintetica', A);

  console.log('__JSON__' + JSON.stringify(o));
  process.exit(0);
})();
`;

function rodarContra(arquivoDeRules, rotulo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spml-'));
  const cfg = path.join(tmp, 'firebase.json');
  const drv = path.join(tmp, 'driver.js');
  fs.writeFileSync(cfg, JSON.stringify({
    firestore: { rules: arquivoDeRules },
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
  if (!m) throw new Error('driver não devolveu resultado (' + rotulo + '):\n' + out.slice(-600));
  return JSON.parse(m[1]);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

console.log('\n──── magicLinks: get por token SIM, enumeração NÃO ────\n');

/* ── 1. RULES ATUAIS ───────────────────────────────────────────────────────── */
const atual = rodarContra(path.join(ROOT, 'firestore.rules'), 'atual');

ok(atual.semeia === 200, 'setup: o admin semeia o documento sintético (got ' + atual.semeia + ')');

ok(atual.get_anon === 200, '⭐ get ANÔNIMO por token conhecido: PERMITIDO — é o fluxo do wrapper (got ' + atual.get_anon + ')');
ok(atual.get_auth === 200, '⭐ get AUTENTICADO por token conhecido: PERMITIDO (got ' + atual.get_auth + ')');

ok(atual.list_anon  === 403, '🔒 list ANÔNIMO: NEGADO (got ' + atual.list_anon + ')');
ok(atual.list_auth  === 403, '🔒 list AUTENTICADO: NEGADO — estar logado não dá direito de varrer (got ' + atual.list_auth + ')');
ok(atual.query_anon === 403, '🔒 runQuery ANÔNIMO: NEGADO (got ' + atual.query_anon + ')');
ok(atual.query_auth === 403, '🔒 runQuery AUTENTICADO: NEGADO (got ' + atual.query_auth + ')');

ok(atual.create_anon === 403, '🔒 create anônimo negado (got ' + atual.create_anon + ')');
ok(atual.create_auth === 403, '🔒 create autenticado negado (got ' + atual.create_auth + ')');
ok(atual.update_anon === 403, '🔒 update anônimo negado (got ' + atual.update_anon + ')');
ok(atual.update_auth === 403, '🔒 update autenticado negado (got ' + atual.update_auth + ')');
ok(atual.delete_anon === 403, '🔒 delete anônimo negado (got ' + atual.delete_anon + ')');
ok(atual.delete_auth === 403, '🔒 delete autenticado negado (got ' + atual.delete_auth + ')');

ok(atual.controle_loginRedirects_get_anon === 403 && atual.controle_loginRedirects_get_auth === 403,
  'controle: loginRedirects segue fechado nos dois — as rules estão mesmo ativas');

/* ── 2. ÁRVORE ANTERIOR: a enumeração TEM que passar lá ────────────────────────
 * Sem este bloco o teste não prova o corte. Ele extrai o `firestore.rules` do commit
 * anterior e repete as MESMAS sondas. */
let rulesAntigas = null;
try {
  rulesAntigas = execFileSync('git', ['show', ARVORE_ANTERIOR + ':firestore.rules'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  console.error('\n✗ CONTROLE NÃO PÔDE RODAR: `git show ' + ARVORE_ANTERIOR + ':firestore.rules` falhou.');
  console.error('  Sem ele o teste não prova nada — ele passaria igual antes e depois do corte.');
  console.error('  ' + (e && (e.message || '')).slice(0, 200));
  process.exit(1);
}
const tmpAntigo = path.join(os.tmpdir(), 'sp-magiclinks-antigas.rules');
fs.writeFileSync(tmpAntigo, rulesAntigas);
const antigo = rodarContra(tmpAntigo, 'árvore ' + ARVORE_ANTERIOR);
fs.unlinkSync(tmpAntigo);

ok(antigo.list_anon === 200,
  '⚠️  REGRESSÃO-GUARD: na árvore ' + ARVORE_ANTERIOR + ' o list ANÔNIMO PASSAVA (got ' + antigo.list_anon + ') — é isto que o corte fechou');
ok(antigo.query_anon === 200,
  '⚠️  e o runQuery ANÔNIMO também PASSAVA (got ' + antigo.query_anon + ')');
ok(antigo.get_anon === 200,
  'e o get anônimo já funcionava lá — o corte NÃO tirou o que o produto usa (got ' + antigo.get_anon + ')');

console.log(fail === 0
  ? '\n✅ rules-magiclinks-sem-enumeracao: ' + pass + ' ok, 0 falharam\n'
  : '\n❌ rules-magiclinks-sem-enumeracao: ' + fail + ' falharam, ' + pass + ' ok\n');
process.exit(fail === 0 ? 0 : 1);
