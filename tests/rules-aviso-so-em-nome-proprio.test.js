/* AVISO SÓ EM NOME PRÓPRIO — quem assina tem de ser quem está logado.
 *
 * ⛔ O QUE ESTAVA ABERTO:
 *     match /notifications/{notifId} { allow create: if request.auth != null; }
 * Qualquer pessoa logada podia escrever aviso na caixa de QUALQUER outra, com o autor que
 * quisesse — passar-se pelo organizador, por outro jogador, ou pelo próprio sistema. Era a
 * porta mais fraca apontada pelo inventário da L2, e ela também contaminava o desenho da
 * migração da fila de e-mail: um gatilho que escutasse a notificação herdaria a fraqueza.
 *
 * ⭐ MEDIDO ANTES DE APERTAR, sobre os 5.792 avisos gravados em produção (279 perfis) —
 * porque regra apertada sem medida corta usuário de verdade:
 *     5.245  autor é uid que EXISTE em users/          → passa
 *        75  uid de conta já apagada                   → passa (compara com o CHAMADOR)
 *       435  `system`                                  → Admin SDK, IGNORA as rules
 *        37  sem o campo (`contact_phone_set`)         → TAMBÉM do servidor
 *         0  e-mail       ·       0  vazio
 * Nenhuma escrita de cliente seria recusada.
 *
 * ⚠️ PISO DAS LOJAS: o bundle embarcado (2.2.84) grava `cu.uid || cu.email || ''`, e a queda
 * para e-mail/vazio NUNCA disparou em 5.792 avisos — usuário autenticado sempre tem uid. A
 * 2.3.0 tirou a queda do código; esta regra fecha a porta.
 *
 * ⚠️ AS DUAS DIREÇÕES. O teste dirige as rules REAIS no emulador e REPETE tudo contra a
 * árvore ANTERIOR, onde a falsificação TEM que passar. Um teste que passasse nos dois não
 * provaria o corte — descreveria o presente.
 * [[feedback_rede_que_cobre_o_rerender_nao_cobre_o_primeiro]]
 *
 * Dados 100% sintéticos. Nada de produção é lido ou escrito.
 *
 * Rodado por: npm run test:rules
 */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8096;                    // 8097/8098/8099 são das outras suítes de rules
const PROJECT = 'demo-scoreplace';
const ARVORE_ANTERIOR = '84a81465';   // último commit ANTES do corte

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
const S = v => ({ stringValue: v });
const A = 'uidA_sintetico';   // quem manda
const B = 'uidB_sintetico';   // quem recebe
const cria = (quem, dono, campos, id) =>
  req('POST', 'users/' + dono + '/notifications?documentId=' + id, quem, { fields: campos });

(async () => {
  const o = {};
  // ── o que o PRODUTO precisa: A avisa B, assinando como A ──────────────────
  o.legitimo = await cria(A, B, { fromUid: S(A), type: S('result'), message: S('placar') }, 'n_legitimo');

  // ── falsificação: A escreve na caixa de B assinando como OUTRO ────────────
  o.finge_ser_B      = await cria(A, B, { fromUid: S(B), type: S('result'), message: S('falso') }, 'n_finge_b');
  o.finge_ser_system = await cria(A, B, { fromUid: S('system'), type: S('draw'), message: S('falso') }, 'n_finge_sys');
  o.sem_autor        = await cria(A, B, { type: S('result'), message: S('anonimo') }, 'n_sem_autor');
  o.autor_vazio      = await cria(A, B, { fromUid: S(''), type: S('result'), message: S('vazio') }, 'n_vazio');
  o.autor_email      = await cria(A, B, { fromUid: S('a@naoexiste.invalid'), type: S('result') }, 'n_email');
  o.anonimo          = await cria(null, B, { fromUid: S(A), type: S('result') }, 'n_anon');

  // ── na PRÓPRIA caixa, a mesma regra vale ──────────────────────────────────
  o.propria_caixa_ok    = await cria(A, A, { fromUid: S(A), type: S('info') }, 'n_propria_ok');
  o.propria_caixa_finge = await cria(A, A, { fromUid: S(B), type: S('info') }, 'n_propria_finge');

  // ── leitura não mudou: só o dono lê a própria caixa ───────────────────────
  await req('PATCH', 'users/' + B + '/notifications/n_semeado', 'owner', { fields: { fromUid: S(A) } });
  o.le_propria = await req('GET', 'users/' + B + '/notifications/n_semeado', B);
  o.le_alheia  = await req('GET', 'users/' + B + '/notifications/n_semeado', A);

  console.log('__JSON__' + JSON.stringify(o));
  process.exit(0);
})();
`;

function rodarContra(arquivoDeRules, rotulo) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spav-'));
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

console.log('\n──── aviso só em nome próprio ────\n');

/* ── 1. RULES ATUAIS ───────────────────────────────────────────────────────── */
const atual = rodarContra(path.join(ROOT, 'firestore.rules'), 'atual');

ok(atual.legitimo === 200,
  '① o que o produto PRECISA continua: A avisa B assinando como A (got ' + atual.legitimo + ')');
ok(atual.finge_ser_B === 403,
  '② ⭐ A não consegue se passar por B dentro da caixa de B (got ' + atual.finge_ser_B + ')');
ok(atual.finge_ser_system === 403,
  '② ⭐ nem por "system" — era como forjar aviso oficial (got ' + atual.finge_ser_system + ')');
ok(atual.sem_autor === 403,
  '② aviso SEM autor é recusado (got ' + atual.sem_autor + ')');
ok(atual.autor_vazio === 403,
  '② autor vazio é recusado (got ' + atual.autor_vazio + ')');
ok(atual.autor_email === 403,
  '② e-mail no lugar do uid é recusado (got ' + atual.autor_email + ')');
ok(atual.anonimo === 403,
  '② sem conta nenhuma, nada entra (got ' + atual.anonimo + ')');
ok(atual.propria_caixa_ok === 200,
  '③ na própria caixa, assinando como si mesmo, passa (got ' + atual.propria_caixa_ok + ')');
ok(atual.propria_caixa_finge === 403,
  '③ ⛔ e nem na PRÓPRIA caixa dá para assinar como outro (got ' + atual.propria_caixa_finge + ')');
ok(atual.le_propria === 200, '④ leitura não mudou: o dono lê a própria caixa (got ' + atual.le_propria + ')');
ok(atual.le_alheia === 403, '④ e ninguém lê a caixa alheia (got ' + atual.le_alheia + ')');

/* ── 2. ÁRVORE ANTERIOR: a falsificação TEM que passar lá ──────────────────── */
const tmpAntigo = path.join(os.tmpdir(), 'sp-rules-antes-aviso.rules');
fs.writeFileSync(tmpAntigo, execFileSync('git', ['show', ARVORE_ANTERIOR + ':firestore.rules'],
  { cwd: ROOT, encoding: 'utf8' }));
const antes = rodarContra(tmpAntigo, 'anterior');
fs.unlinkSync(tmpAntigo);

console.log('\n  (controle: a árvore ' + ARVORE_ANTERIOR + ', ANTES do corte)');
ok(antes.finge_ser_B === 200,
  '⑤ ⭐ ANTES, passar-se por outro PASSAVA (got ' + antes.finge_ser_B + ') — o corte é real');
ok(antes.finge_ser_system === 200,
  '⑤ ANTES, forjar "system" também passava (got ' + antes.finge_ser_system + ')');
ok(antes.sem_autor === 200,
  '⑤ ANTES, aviso sem autor entrava (got ' + antes.sem_autor + ')');
ok(antes.legitimo === 200,
  '⑤ e o caminho legítimo passava nas duas — o corte não custou nada ao produto');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
if (fail) process.exit(1);
