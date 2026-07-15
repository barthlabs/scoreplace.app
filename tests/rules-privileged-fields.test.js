/* SEQUESTRO DE CONTA via `mergedInto` — as rules deixavam a pessoa escrever, no PRÓPRIO
 * perfil, um campo que o SERVIDOR trata como prova.
 *
 * A FALHA (achada e provada no emulador em 15/jul/2026):
 *   allow update: if request.auth.uid == userId     // "owner may touch anything"
 * O comentário original só se preocupava com edição CROSS-user ("Prevents cross-user edits
 * of profile PII") — e de fato bloqueava isso. Mas `mergedInto` é lido pela CF
 * resolveMergedLogin, que devolve um CUSTOM TOKEN do uid apontado. Então:
 *   1. atacante loga na conta dele
 *   2. escreve users/{uid-dele} = { mergedInto: "<uid-da-vítima>" }   ← as rules permitiam
 *   3. chama resolveMergedLogin → recebe custom token da VÍTIMA
 *   4. entra na conta dela
 * Regra geral: um campo que o servidor trata como PROVA nunca pode ser escrito por quem
 * ele autoriza. Bloquear não quebrou nada — nenhum caminho do cliente escreve estes campos
 * (0 writes no js/, só leituras) e o Admin SDK ignora rules.
 *
 * Este teste dirige as RULES REAIS no emulador (firestore.rules, não uma cópia) e exige
 * as duas direções: o ataque FALHA no novo E PASSA no velho (senão não estaria provando
 * nada — um teste que passa nos dois não testa a correção).
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

// ── driver: fala REST com o emulador usando JWT não-assinado (o emulador não valida) ──
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
(async () => {
  const out = {};
  const A = 'uid_atacante', V = 'uid_vitima';
  // setup (o create do próprio perfil é legítimo e tem que passar)
  out.criaProprioPerfil = await req('PATCH', 'users/' + A, A, { fields: { displayName: S('Atacante') } });
  out.criaVitima        = await req('PATCH', 'users/' + V, V, { fields: { displayName: S('Vitima') } });

  // ── O ATAQUE: mergedInto no PRÓPRIO doc → custom token da vítima ──
  out.ataqueMergedInto = await req('PATCH', 'users/' + A + '?updateMask.fieldPaths=mergedInto', A,
    { fields: { mergedInto: S(V) } });
  out.ataqueMergedAt = await req('PATCH', 'users/' + A + '?updateMask.fieldPaths=mergedAt', A,
    { fields: { mergedAt: S('2026-07-15') } });
  // ── Pro de graça ──
  out.ataquePlan = await req('PATCH', 'users/' + A + '?updateMask.fieldPaths=plan', A,
    { fields: { plan: S('pro') } });
  out.ataquePlanExp = await req('PATCH', 'users/' + A + '?updateMask.fieldPaths=planExpiresAt', A,
    { fields: { planExpiresAt: S('2099-01-01') } });

  // ── USO LEGÍTIMO tem que continuar passando (senão o fix quebra o app) ──
  out.editaProprioNome = await req('PATCH', 'users/' + A + '?updateMask.fieldPaths=displayName', A,
    { fields: { displayName: S('Novo Nome') } });
  out.editaProprioTelefone = await req('PATCH', 'users/' + A + '?updateMask.fieldPaths=phone', A,
    { fields: { phone: S('+5511999999999') } });
  out.editaLinkedEmails = await req('PATCH', 'users/' + A + '?updateMask.fieldPaths=linkedEmails', A,
    { fields: { linkedEmails: { arrayValue: { values: [S('outro@x.com')] } } } });

  // ── CONTROLE: cross-user continua bloqueado (prova que as rules estão ativas) ──
  out.crossUser = await req('PATCH', 'users/' + V + '?updateMask.fieldPaths=displayName', A,
    { fields: { displayName: S('hackeado') } });

  // ── CREATE já com mergedInto (o buraco por outro caminho: apagar e recriar) ──
  out.createComMergedInto = await req('PATCH', 'users/uid_novo', 'uid_novo',
    { fields: { displayName: S('Novo'), mergedInto: S(V) } });

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})();
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sprules-'));
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
  if (!m) throw new Error('driver não devolveu resultado (' + label + '):\n' + out.slice(-500));
  return JSON.parse(m[1]);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── 1. RULES ATUAIS: o ataque tem que FALHAR ─────────────────────────────────
const novo = runAgainst(path.join(ROOT, 'firestore.rules'), 'atual');

ok(novo.criaProprioPerfil === 200, 'setup: criar o próprio perfil é permitido (got ' + novo.criaProprioPerfil + ')');
ok(novo.ataqueMergedInto === 403,
  '🔒 SEQUESTRO: escrever mergedInto no próprio perfil é NEGADO (got ' + novo.ataqueMergedInto + ')');
ok(novo.ataqueMergedAt === 403, '🔒 mergedAt negado (got ' + novo.ataqueMergedAt + ')');
ok(novo.ataquePlan === 403, '🔒 plan=pro (Pro de graça) negado (got ' + novo.ataquePlan + ')');
ok(novo.ataquePlanExp === 403, '🔒 planExpiresAt negado (got ' + novo.ataquePlanExp + ')');
ok(novo.createComMergedInto === 403,
  '🔒 CREATE já com mergedInto negado — senão bastava apagar e recriar o perfil (got ' + novo.createComMergedInto + ')');

// uso legítimo intacto — o fix não pode custar funcionalidade
ok(novo.editaProprioNome === 200, 'legítimo: editar o próprio nome ainda funciona (got ' + novo.editaProprioNome + ')');
ok(novo.editaProprioTelefone === 200, 'legítimo: editar o próprio telefone ainda funciona (got ' + novo.editaProprioTelefone + ')');
ok(novo.editaLinkedEmails === 200, 'legítimo: vincular e-mail secundário ainda funciona (got ' + novo.editaLinkedEmails + ')');
ok(novo.crossUser === 403, 'controle: editar o perfil de OUTRO segue negado (got ' + novo.crossUser + ')');

// ── 2. RULES ANTIGAS: o ataque tem que PASSAR ────────────────────────────────
// Sem isto o teste não prova nada: se ele passasse nos dois, não estaria testando o fix.
const antigas = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && request.auth.uid == userId;
      allow delete: if request.auth != null && request.auth.uid == userId;
    }
  }
}`;
const tmpOld = path.join(os.tmpdir(), 'sp-rules-antigas.rules');
fs.writeFileSync(tmpOld, antigas);
const velho = runAgainst(tmpOld, 'antigas');
ok(velho.ataqueMergedInto === 200,
  '⚠️  REGRESSÃO-GUARD: nas rules ANTIGAS o ataque PASSAVA (got ' + velho.ataqueMergedInto + ') — o teste prova o fix');
ok(velho.ataquePlan === 200, '⚠️  nas ANTIGAS o Pro de graça PASSAVA (got ' + velho.ataquePlan + ')');

console.log(fail === 0
  ? '✅ rules-privileged-fields: ' + pass + ' ok, 0 falharam'
  : '❌ rules-privileged-fields: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
