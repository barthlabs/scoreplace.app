/* NINGUÉM ESCREVE O PRÓPRIO SCAN DO LETZPLAY — provado nas RULES REAIS, no emulador.
 *
 * O QUE ESTAVA EXPOSTO (medido em 22/set/2026), e todos os passos eram rotineiros:
 *   1. qualquer autenticado gravava `letzplayScans/{qualquer uid}`, INCLUSIVE o próprio;
 *   2. bastava forjar o próprio scan com `profileSkill: 'A'`;
 *   3. inscrever-se num torneio;
 *   4. esperar o organizador apertar o botão que aplica as categorias —
 *      `applyLetzplayScans` confere quem CHAMA e nunca quem ESCREVEU;
 *   5. a categoria inventada entrava no perfil marcada como apurada pelo letzplay.
 *
 * O scan é ATESTADO DE TERCEIRO: o organizador varre o perfil público de quem está
 * inscrito. Ninguém atesta a si mesmo. Quem quer o próprio histórico usa o caminho do
 * atleta, que grava no PERFIL, não aqui.
 *
 * ⚠️ ESTE TESTE NÃO PROVA QUE O ASSUNTO FECHOU. Scan já plantado antes da regra continua
 * na coleção e continua sendo aplicado; qualquer conta B ainda grava para o uid A; e
 * `applyLetzplayScans` ainda aplica para quem nem está no torneio de quem chama. Ver o
 * plano da leva 2a.
 *
 * As duas direções são exigidas: o abuso FALHA nas rules novas e PASSA nas antigas. Um
 * teste que passa nos dois não prova correção nenhuma.
 *
 * Rodado por: npm run test:rules
 */
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8101;
const PROJECT = 'demo-scoreplace';

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
    headers: { 'Authorization': (uid === 'owner' ? 'Bearer owner' : 'Bearer ' + tok(uid)), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const S = v => ({ stringValue: v });
/* O PAYLOAD REAL que a tela do organizador envia — se a regra recusasse ele, o app das
 * lojas quebraria, e o teste tem de pegar isso. */
const PAYLOAD = { fields: {
  handle: S('@fulano'),
  scan: { mapValue: { fields: { profileSkill: S('A'), gender: S('masculino') } } },
  scannedAt: S('2026-09-22T00:00:00.000Z'),
  scannedBy: S('uid_org'),
  scannedByName: S('Organizador'),
  tournamentId: S('t1'),
  tournamentName: S('Confra'),
} };
(async () => {
  const out = {};
  const ORG = 'uid_org', ATLETA = 'uid_atleta';

  // ── O ABUSO: escrever o PRÓPRIO scan ──
  out.criaProprio  = await req('PATCH', 'letzplayScans/' + ATLETA, ATLETA, PAYLOAD);
  await req('PATCH', 'letzplayScans/' + ATLETA, 'owner', PAYLOAD);   // admin monta o cenário
  out.atualizaProprio = await req('PATCH', 'letzplayScans/' + ATLETA + '?updateMask.fieldPaths=handle',
    ATLETA, { fields: { handle: S('@forjado') } });

  // ── O USO LEGÍTIMO: o organizador varrendo OUTRA pessoa ──
  out.criaDeOutro = await req('PATCH', 'letzplayScans/uid_terceiro', ORG, PAYLOAD);
  out.atualizaDeOutro = await req('PATCH', 'letzplayScans/uid_terceiro?updateMask.fieldPaths=handle',
    ORG, { fields: { handle: S('@novo') } });

  // ── Apagar evidência ──
  out.apagaDeOutro  = await req('DELETE', 'letzplayScans/uid_terceiro', ORG);
  out.apagaProprio  = await req('DELETE', 'letzplayScans/' + ATLETA, ATLETA);

  console.log('__JSON__' + JSON.stringify(out));
})();
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'splz-'));
  const cfg = path.join(tmp, 'firebase.json');
  const drv = path.join(tmp, 'driver.js');
  fs.writeFileSync(cfg, JSON.stringify({
    firestore: { rules: rulesFile },
    emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true },
  }));
  fs.writeFileSync(drv, DRIVER);
  const out = rodarNoEmulador([
    'emulators:exec', '--only', 'firestore', '--config', cfg, '--project', PROJECT,
    'node ' + JSON.stringify(drv),
  ], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }),
  });
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) throw new Error('driver não devolveu resultado (' + label + '):\n' + String(out).slice(-500));
  return JSON.parse(m[1]);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

console.log('\n── rules ATUAIS: o próprio scan é recusado, o de terceiro passa ──');
const novo = runAgainst(path.join(ROOT, 'firestore.rules'), 'atuais');
ok(novo.criaProprio !== 200,
  '⭐ CRIAR o PRÓPRIO scan é recusado (got ' + novo.criaProprio + ')');
ok(novo.atualizaProprio !== 200,
  '⭐ ATUALIZAR o PRÓPRIO scan é recusado (got ' + novo.atualizaProprio + ')');
ok(novo.criaDeOutro === 200,
  '⭐ criar o scan de OUTRO uid continua permitido, com o payload REAL (got ' + novo.criaDeOutro + ')');
ok(novo.atualizaDeOutro === 200,
  'e atualizar o de outro também (got ' + novo.atualizaDeOutro + ')');
ok(novo.apagaDeOutro !== 200,
  '⭐ APAGAR scan de terceiro é recusado (got ' + novo.apagaDeOutro + ')');
ok(novo.apagaProprio !== 200,
  '⭐ e apagar o próprio também (got ' + novo.apagaProprio + ')');

console.log('── rules ANTIGAS: o abuso PASSAVA (senão o teste não prova o conserto) ──');
const antigas = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /letzplayScans/{scanUid} {
      allow read: if request.auth != null;
      allow create, update: if request.auth != null
        && request.resource.data.keys().hasOnly(['handle', 'scan', 'scannedAt', 'scannedBy', 'scannedByName', 'tournamentId', 'tournamentName', 'fullImport', 'lzCursorParcial', 'totaisLetzplay']);
      allow delete: if request.auth != null;
    }
  }
}`;
const tmpOld = path.join(os.tmpdir(), 'sp-lz-antigas.rules');
fs.writeFileSync(tmpOld, antigas);
const velho = runAgainst(tmpOld, 'antigas');
ok(velho.criaProprio === 200,
  '⚠️  REGRESSÃO-GUARD: nas ANTIGAS criar o PRÓPRIO scan PASSAVA (got ' + velho.criaProprio + ')');
ok(velho.apagaDeOutro === 200,
  '⚠️  REGRESSÃO-GUARD: nas ANTIGAS qualquer um APAGAVA scan de terceiro (got ' + velho.apagaDeOutro + ')');

console.log(fail === 0
  ? '\n✅ rules-letzplayscan-nao-e-proprio: ' + pass + ' ok, 0 falharam'
  : '\n❌ rules-letzplayscan-nao-e-proprio: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
