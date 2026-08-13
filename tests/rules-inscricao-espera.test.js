/* INSCRIÇÃO NA LISTA DE ESPERA NEGADA PELA REGRA — o `nextDrawAt` que o save apaga.
 *
 * INCIDENTE REAL (Confra BT Alta da Clínica 2026, 12/ago/2026, relatado ao vivo): a Mariana
 * abriu o torneio pelo app da APPLE (1.7.76 — nativo não tem auto-update), clicou em
 * inscrever-se, APARECEU EM AZUL na lista de espera ("você") e em seguida sumiu com
 * "Não foi possível entrar na lista de espera · Missing or insufficient permissions".
 * Isso é o `_enrollToStandby` byte a byte: push otimista → save rejeitado → rollback.
 *
 * MEDIDO no doc REAL antes de escrever este teste, rodando o `saveTournament` REAL contra
 * ele: a escrita altera APENAS 3 chaves de topo — `memberUids`, `standbyParticipants`
 * (as duas permitidas) e **`nextDrawAt`**. O doc do Confra NÃO TEM `nextDrawAt`; como o
 * torneio não tem sorteio devido, `saveTournament` manda `FieldValue.delete()` nele — ou
 * seja, APAGA UM CAMPO QUE NÃO EXISTE. `isEnrollmentOnlyDiff()` faz `hasOnly([...])` sem
 * `nextDrawAt`, e a escrita inteira cai.
 *
 * O QUE ESTE TESTE PROVA (e é a pergunta que não dá pra responder por leitura):
 * o Firestore conta um delete de campo AUSENTE como chave afetada em
 * `diff().affectedKeys()`? Se contar, o `hasOnly` reprova e o bug é este.
 *
 * ⚠️ POR QUE O CONSERTO TEM QUE SER NA REGRA, e não no cliente: o app publicado na Apple
 * roda JS EMBARCADO e não se atualiza. Consertar `saveTournament` não chega em quem já
 * está na loja — só a regra (e a CF) valem pra todo cliente, inclusive o antigo.
 *
 * Roda as RULES REAIS no emulador e exige as DUAS direções: negado no arquivo atual,
 * aceito depois do fix. Sem o "passava antes", o teste não prova que a correção corrige.
 *
 * Rodado por: node tests/rules-inscricao-espera.test.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8099;
const PROJECT = 'demo-scoreplace';

const ORG = 'uid_organizador';
const NOVA = 'uid_mariana';   // recém-chegada: NÃO está em memberUids

const DRIVER = `
const P = '${PROJECT}', H = 'http://127.0.0.1:${PORT}';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = uid => b64({alg:'none',typ:'JWT'}) + '.' + b64({
  iss:'https://securetoken.google.com/'+P, aud:P, sub:uid, user_id:uid,
  auth_time: Math.floor(Date.now()/1000), iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000)+3600, email:uid+'@x.com', email_verified:true,
  firebase:{ identities:{}, sign_in_provider:'google.com' }
}) + '.';
const base = H + '/v1/projects/' + P + '/databases/(default)/documents/';
async function req(method, p, uid, body) {
  const r = await fetch(base + p, { method,
    headers: { 'Authorization': 'Bearer ' + tok(uid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const S = v => ({ stringValue: v });
const B = v => ({ booleanValue: v });
const I = v => ({ integerValue: String(v) });
const L = a => ({ arrayValue: { values: a.map(S) } });
// entrada de inscrito: mapa (é assim que participants/standbyParticipants são no doc real)
const P1 = uid => ({ mapValue: { fields: { uid: S(uid), selfEnrolled: B(true) } } });

// PATCH com updateMask = o equivalente REST de set({merge:true}).
// Campo listado no updateMask e AUSENTE de \`fields\` = FieldValue.delete().
const mask = paths => 'updateMask.fieldPaths=' + paths.join('&updateMask.fieldPaths=');

(async () => {
  const out = {};
  const ORG = '${ORG}', NOVA = '${NOVA}';

  // ⚠️ CADA CENÁRIO NO SEU PRÓPRIO DOC. A 1ª versão deste teste reusou um doc só e as
  // escritas rodaram EM SEQUÊNCIA: a primeira (permitida) já punha a NOVA em memberUids,
  // e a partir dali ela era PARTICIPANTE — as seguintes passavam por
  // isParticipantBracketDiff(), não por isEnrollmentOnlyDiff(). Dava 200 em tudo e o
  // teste "provava" o contrário do que mede. Estado sequencial contamina teste de regra.
  async function nova(doc) {
    return req('PATCH', 'tournaments/' + doc, ORG, { fields: {
      name: S('Confra BT Alta da Clínica 2026'), creatorUid: S(ORG), isPublic: B(true),
      status: S('active'), format: S('Liga'),
      participants: { arrayValue: { values: [P1(ORG)] } },
      standbyParticipants: { arrayValue: { values: [] } },
      memberUids: L([ORG])   // a NOVA NÃO é membro — é uma recém-chegada
    }});
  }
  const ESPERA = { standbyParticipants: { arrayValue: { values: [P1(NOVA)] } },
                   memberUids: L([ORG, NOVA]) };

  out.setup = await nova('t_controle');

  // ── CONTROLE: a escrita "limpa" (só os campos de inscrição) tem que PASSAR ──
  out.esperaSemNextDrawAt = await req('PATCH',
    'tournaments/t_controle?' + mask(['standbyParticipants', 'memberUids']), NOVA, { fields: ESPERA });

  // ── O INCIDENTE: a MESMA escrita + o delete de nextDrawAt (campo que NÃO existe) ──
  //     É exatamente o que saveTournament manda. Se isto for 403, é a causa do relato.
  await nova('t_delete');
  out.esperaComDeleteDoNada = await req('PATCH',
    'tournaments/t_delete?' + mask(['standbyParticipants', 'memberUids', 'nextDrawAt']), NOVA, { fields: ESPERA });

  // ── variante: nextDrawAt com VALOR (mudança real de campo fora da lista) ──
  await nova('t_valor');
  out.esperaEscrevendoNextDrawAt = await req('PATCH',
    'tournaments/t_valor?' + mask(['standbyParticipants', 'memberUids', 'nextDrawAt']), NOVA, {
      fields: Object.assign({}, ESPERA, { nextDrawAt: I(1786000000000) }) });

  // ── CONTROLE DE SEGURANÇA: a inscrição não pode virar porta pra mexer no torneio ──
  await nova('t_nome');
  out.novaMudaNome = await req('PATCH',
    'tournaments/t_nome?' + mask(['standbyParticipants', 'memberUids', 'name']), NOVA, {
      fields: Object.assign({}, ESPERA, { name: S('sequestrado') }) });
  await nova('t_admin');
  out.novaViraAdmin = await req('PATCH',
    'tournaments/t_admin?' + mask(['standbyParticipants', 'adminUids']), NOVA, {
      fields: { standbyParticipants: { arrayValue: { values: [P1(NOVA)] } }, adminUids: L([NOVA]) } });

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})();
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spenroll-'));
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
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }),
  });
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) throw new Error('driver não devolveu resultado (' + label + '):\n' + out.slice(-1200));
  return JSON.parse(m[1]);
}

// (Aqui existia um `makeFixedRules()` que acrescentava `nextDrawAt` ao hasOnly, pra provar
// que o "fix" corrigia o incidente. Saiu junto com a hipótese: o emulador mostrou que a
// regra atual JÁ deixa essa escrita passar, então não havia fix nenhum a provar — e mexer
// na lista teria afrouxado a regra à toa, em cima de um diagnóstico errado.)

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

console.log('──── rules-inscricao-espera ────');

const atual = runAgainst(path.join(ROOT, 'firestore.rules'), 'atual');
console.log('  regras ATUAIS :', JSON.stringify(atual));

ok(atual.setup === 200, 'setup do torneio deveria passar (organizador) — veio ' + atual.setup);
ok(atual.esperaSemNextDrawAt === 200,
   'CONTROLE: entrar na espera sem tocar nextDrawAt deveria passar — veio ' + atual.esperaSemNextDrawAt);

// ── HIPÓTESE DESCARTADA, e o resultado fica travado aqui pra ninguém repetir ─────────
// Eu apostei que o `nextDrawAt` era a causa: o `saveTournament` manda
// `FieldValue.delete()` nele e o doc do Confra NÃO TEM o campo. O emulador respondeu 200:
// **apagar um campo AUSENTE não entra em `diff().affectedKeys()`** — não há mudança de
// estado, logo não há chave afetada. A regra atual já deixa essa escrita passar.
// Escrever `nextDrawAt` COM VALOR, aí sim, é negado (é mudança de verdade).
ok(atual.esperaComDeleteDoNada === 200,
   'apagar campo AUSENTE não conta como chave afetada — esperava 200, veio ' + atual.esperaComDeleteDoNada);
ok(atual.esperaEscrevendoNextDrawAt === 403,
   'escrever nextDrawAt COM VALOR é negado (a lista do hasOnly vale) — veio ' + atual.esperaEscrevendoNextDrawAt);

// ⚠️ CONSEQUÊNCIA: a causa do incidente da Mariana NÃO é a regra barrar o payload limpo.
// Rodando o `saveTournament` REAL da 1.7.76 contra o doc REAL do Confra e mandando o
// payload resultante (126 campos) contra estas mesmas regras, o resultado é **200**.
// Ou seja: quando o `t` em memória do cliente ESPELHA o banco, a inscrição passa.
// O que sobra como suspeito é o `t` em memória DIVERGIR do banco (cache local enxuto,
// doc mudado por outro escritor entre a leitura e o save) — aí a escrita do doc inteiro
// afeta chaves fora da lista e cai. Enquanto isso não estiver medido, NÃO mexer na regra.

// O controle de segurança é o que este teste passa a guardar de forma permanente:
// inscrever-se não pode virar porta pra mexer no torneio.
ok(atual.novaMudaNome === 403, 'inscrever-se NUNCA pode mudar o nome do torneio — veio ' + atual.novaMudaNome);
ok(atual.novaViraAdmin === 403, 'inscrever-se NUNCA pode escrever adminUids — veio ' + atual.novaViraAdmin);

console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
