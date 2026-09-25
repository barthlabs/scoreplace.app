/* OS COFRES DA IDENTIDADE — rosto e chaves de entrada: ninguém lê, ninguém escreve, nem o dono
 *   node tests/rules-cofre-do-rosto.test.js      (roda via `npm run test:rules`)
 *
 * ⛔ POR QUE ESTA REGRA NASCE ANTES DO PRIMEIRO VETOR. `faceTemplates/{uid}` vai guardar o vetor
 * extraído do rosto — a chave de pessoa do cadastro, ordem do dono: _"quando a pessoa se cadastrar,
 * tiramos uma foto que vai servir para comparar com a pessoa que está entrando de novo depois"_.
 * Vetor de rosto é dado pessoal SENSÍVEL (LGPD art. 5º, II). A porta de saída precede a de entrada:
 * ligar a coleta primeiro e fechar depois é como se acumula dado que ninguém sabia estar guardando.
 *
 * ⛔ NEM O DONO DO ROSTO LÊ, e isso é asserção aqui. O vetor não tem uso no aparelho — quem compara
 * é o servidor. Devolvê-lo ao cliente criaria cópia de biometria no cache do navegador.
 *
 * ⚠️ ESTE ARQUIVO NÃO AFIRMA NADA SOBRE O TEXTO DAS RULES: ele DIRIGE as rules reais no emulador,
 * por REST. E como negar é o comportamento PADRÃO do Firestore, um teste de uma direção só ficaria
 * verde mesmo se o driver estivesse errando o caminho. Por isso a segunda parte roda o MESMO driver
 * contra uma regra ABERTA de propósito e exige que ali passe. Sem isso o arquivo não prova nada.
 * [[feedback_never_claim_proven_without_real_verification]]
 */
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8097;
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
  const h = { 'Content-Type': 'application/json' };
  if (uid) h['Authorization'] = (uid === 'owner' ? 'Bearer owner' : 'Bearer ' + tok(uid));
  const r = await fetch(url(p), { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const S = v => ({ stringValue: v });
/* Um "vetor" qualquer: o formato não importa para a regra, e é de propósito que o teste não
 * dependa dele — a regra nega o caminho, não o conteúdo. */
const VETOR = { fields: {
  vetor: { arrayValue: { values: [{ doubleValue: 0.11 }, { doubleValue: -0.42 }] } },
  criadoEm: S('2026-09-25T00:00:00.000Z'), fornecedor: S('x'),
} };
(async () => {
  const out = {};
  const EU = 'uid_do_rosto', OUTRO = 'uid_de_terceiro';

  // ⛔ o próprio dono do rosto: as quatro operações
  out.euCrio      = await req('PATCH',  'faceTemplates/' + EU, EU, VETOR);
  out.euLeio      = await req('GET',    'faceTemplates/' + EU, EU);
  out.euAtualizo  = await req('PATCH',  'faceTemplates/' + EU + '?updateMask.fieldPaths=fornecedor', EU, { fields: { fornecedor: S('y') } });
  out.euApago     = await req('DELETE', 'faceTemplates/' + EU, EU);
  // ⛔ terceiro autenticado
  out.outroLe     = await req('GET',    'faceTemplates/' + EU, OUTRO);
  out.outroEscreve= await req('PATCH',  'faceTemplates/' + EU, OUTRO, VETOR);
  // ⛔ anônimo
  out.anonLe      = await req('GET',    'faceTemplates/' + EU, null);
  out.anonEscreve = await req('PATCH',  'faceTemplates/' + EU, null, VETOR);
  // ⛔ e a LISTAGEM, que é como se varre uma base de rostos inteira
  out.euListo     = await req('GET',    'faceTemplates', EU);
  out.anonLista   = await req('GET',    'faceTemplates', null);

  /* ⛔ AS CHAVES DE ENTRADA SEM SENHA, no mesmo cofre e pelas mesmas razões: o CONTADOR é a defesa
   * contra reuso de assinatura (cliente que o reescreve a desfaz), a LISTA de aparelhos de alguém é
   * dado pessoal, e o DESAFIO é de uso único (reabrir um desafio gasto revive assinatura antiga). */
  out.pkCrio      = await req('PATCH',  'passkeys/cred_abc', EU, { fields: { uid: S(EU), counter: { integerValue: '0' } } });
  out.pkLeio      = await req('GET',    'passkeys/cred_abc', EU);
  out.pkListo     = await req('GET',    'passkeys', EU);
  out.pkContador  = await req('PATCH',  'passkeys/cred_abc?updateMask.fieldPaths=counter', EU, { fields: { counter: { integerValue: '0' } } });
  out.desafioCrio = await req('PATCH',  'passkeyChallenges/d1', EU, { fields: { desafio: S('x') } });
  out.desafioLeio = await req('GET',    'passkeyChallenges/d1', EU);
  out.desafioReabro = await req('PATCH','passkeyChallenges/d1?updateMask.fieldPaths=usadoEm', EU, { fields: {} });

  // controle de vida: as rules estão ligadas e o uso legítimo passa
  out.criaProprioPerfil = await req('PATCH', 'users/' + EU, 'owner', { fields: { displayName: S('Fulano') } });

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})();
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sprosto-'));
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
  if (!m) throw new Error('driver não devolveu resultado (' + label + '):\n' + out.slice(-800));
  return JSON.parse(m[1]);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

console.log('\n① RULES DE HOJE — o cofre do rosto recusa TUDO que venha do cliente\n');
const hoje = runAgainst(path.join(ROOT, 'firestore.rules'), 'atual');

ok(hoje.criaProprioPerfil === 200,
  'controle de vida: as rules estão ligadas e o uso legítimo passa (users/{eu} = ' + hoje.criaProprioPerfil + ')');
ok(hoje.euCrio === 403, '🔒 o PRÓPRIO dono do rosto não CRIA o vetor (got ' + hoje.euCrio + ')');
ok(hoje.euLeio === 403, '🔒⭐ nem LÊ o próprio vetor — ele não tem uso no aparelho (got ' + hoje.euLeio + ')');
ok(hoje.euAtualizo === 403, '🔒 nem ATUALIZA (got ' + hoje.euAtualizo + ')');
ok(hoje.euApago === 403, '🔒 nem APAGA pela porta direta — quem apaga é a exclusão de conta (got ' + hoje.euApago + ')');
ok(hoje.outroLe === 403, '🔒 terceiro autenticado não lê (got ' + hoje.outroLe + ')');
ok(hoje.outroEscreve === 403, '🔒 terceiro não escreve — ninguém planta rosto em conta alheia (got ' + hoje.outroEscreve + ')');
ok(hoje.anonLe === 403, '🔒 anônimo não lê (got ' + hoje.anonLe + ')');
ok(hoje.anonEscreve === 403, '🔒 anônimo não escreve (got ' + hoje.anonEscreve + ')');
ok(hoje.euListo === 403, '🔒⭐⭐ e a LISTAGEM é negada — é assim que se varreria a base de rostos inteira (got ' + hoje.euListo + ')');
ok(hoje.anonLista === 403, '🔒 idem anônimo (got ' + hoje.anonLista + ')');

console.log('\n①b AS CHAVES DE ENTRADA SEM SENHA — mesmo cofre\n');
ok(hoje.pkCrio === 403, '🔒 ninguém cria credencial pelo cliente (got ' + hoje.pkCrio + ')');
ok(hoje.pkLeio === 403, '🔒 nem lê (got ' + hoje.pkLeio + ')');
ok(hoje.pkListo === 403, '🔒⭐ nem LISTA — seria um censo de aparelhos e de quem tem conta aqui (got ' + hoje.pkListo + ')');
ok(hoje.pkContador === 403,
  '🔒⭐⭐ e não reescreve o CONTADOR — quem o devolve ao valor anterior faz a mesma assinatura entrar de novo (got ' + hoje.pkContador + ')');
ok(hoje.desafioCrio === 403, '🔒 não cria desafio (got ' + hoje.desafioCrio + ')');
ok(hoje.desafioLeio === 403, '🔒 não lê desafio (got ' + hoje.desafioLeio + ')');
ok(hoje.desafioReabro === 403,
  '🔒⭐⭐ e não REABRE desafio já gasto — seria revalidar assinatura antiga (got ' + hoje.desafioReabro + ')');

/* ── ② FALSIFICAÇÃO: com a regra ABERTA, o mesmo driver PASSA ────────────────────
 * Negar é o padrão do Firestore. Sem esta parte, o arquivo ficaria verde mesmo se o driver
 * estivesse batendo no caminho errado — e eu já tive teste verde por meses com a tela quebrada. */
console.log('\n② FALSIFICAÇÃO — com o cofre ABERTO o mesmo driver passa (prova que ele exercita o caminho)\n');
const ABERTAS = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} { allow read, write: if true; }
    match /faceTemplates/{userId} { allow read, write: if request.auth != null; }
    match /passkeys/{c} { allow read, write: if request.auth != null; }
    match /passkeyChallenges/{d} { allow read, write: if request.auth != null; }
    match /{document=**} { allow read, write: if false; }
  }
}`;
const tmpA = fs.mkdtempSync(path.join(os.tmpdir(), 'sprostoA-'));
const fA = path.join(tmpA, 'abertas.rules');
fs.writeFileSync(fA, ABERTAS);
const aberto = runAgainst(fA, 'abertas');
ok(aberto.euCrio === 200, '② com o cofre aberto, criar PASSA (got ' + aberto.euCrio + ') — o driver exercita o caminho');
ok(aberto.euLeio === 200, '② e ler PASSA (got ' + aberto.euLeio + ')');
ok(aberto.euListo === 200, '② e listar PASSA (got ' + aberto.euListo + ') — é exatamente o que a regra de hoje nega');
ok(aberto.pkContador === 200,
  '② e reescrever o contador PASSA com o cofre aberto (got ' + aberto.pkContador + ') — prova que a recusa de hoje é a regra, não o driver');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
