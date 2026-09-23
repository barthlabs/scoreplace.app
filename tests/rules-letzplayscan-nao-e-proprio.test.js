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
const arr = (...xs) => ({ arrayValue: { values: xs } });
(async () => {
  const out = {};
  const ORG = 'uid_org', ATLETA = 'uid_atleta', COHOST = 'uid_cohost', FORA = 'uid_fora';

  /* ── CENÁRIO pelo bypass de ADMIN do emulador (Bearer owner): só monta ───────────
   * t1 = torneio do ORG com o COHOST como co-organizador ATIVO por uid.
   * s1 = SANDBOX cujo dono é o ORG — e ali quem manda é sandboxOwnerUid, porque
   * creatorUid/adminUids de um sandbox são CÓPIA do original e não valem. */
  await req('PATCH', 'tournaments/t1', 'owner', { fields: {
    name: S('Confra'), creatorUid: S(ORG), adminUids: arr(S(COHOST)),
    /* O ELENCO de t1 inclui todos os alvos LEGITIMOS deste teste. Nao e enfeite: desde
     * 23/set a regra exige que o alvo do scan esteja no elenco do torneio nomeado, e um
     * fixture com elenco curto reprovaria os casos legitimos — foi o que aconteceu ao
     * escrever isto, e o teste estava certo. */
    memberUids: arr(S(ORG), S(ATLETA), S('uid_terceiro'), S('uid_assin'), S('uid_v1'),
      S('uid_v2'), S('uid_v3'), S('uid_v4'), S('uid_legado'), S('uid_full')),
    _nascidoEm: { timestampValue: new Date().toISOString() },
  } });
  /* t2 = torneio do FORA. O ATLETA NAO esta no elenco dele. E o caso que o revisor
   * cobrou: ser organizador de um torneio PROPRIO nao pode dar direito de escrever o
   * scan de quem nao esta nele. */
  await req('PATCH', 'tournaments/t2', 'owner', { fields: {
    name: S('Torneio do estranho'), creatorUid: S(FORA), adminUids: arr(),
    memberUids: arr(S(FORA)),
    _nascidoEm: { timestampValue: new Date().toISOString() },
  } });
  await req('PATCH', 'sandboxes/s1', 'owner', { fields: {
    name: S('SB'), isSandbox: { booleanValue: true }, sandboxOwnerUid: S(ORG),
    memberUids: arr(S(ORG), S('uid_v4')),
    creatorUid: S('uid_de_outro'), adminUids: arr(),
  } });

  // ── O ABUSO: escrever o PRÓPRIO scan ──
  out.criaProprio  = await req('PATCH', 'letzplayScans/' + ATLETA, ATLETA, PAYLOAD);
  await req('PATCH', 'letzplayScans/' + ATLETA, 'owner', PAYLOAD);   // admin monta o cenário
  out.atualizaProprio = await req('PATCH', 'letzplayScans/' + ATLETA + '?updateMask.fieldPaths=handle',
    ATLETA, { fields: { handle: S('@forjado') } });

  // ── O USO LEGÍTIMO: o organizador varrendo OUTRA pessoa ──
  out.criaDeOutro = await req('PATCH', 'letzplayScans/uid_terceiro', ORG, PAYLOAD);
  out.atualizaDeOutro = await req('PATCH', 'letzplayScans/uid_terceiro?updateMask.fieldPaths=handle',
    ORG, { fields: { handle: S('@novo') } });

  /* ── ASSINATURA: quem grava assina com o PRÓPRIO uid ──────────────────────────
   * scannedBy era texto livre: o forjador plantava assinando com o uid de um terceiro. */
  out.assinaturaDivergente = await req('PATCH', 'letzplayScans/uid_assin', ORG, { fields:
    Object.assign({}, PAYLOAD.fields, { scannedBy: S(FORA) }) });

  /* ── VÍNCULO: tem de ser organizador do torneio que o scan NOMEIA ───────────────── */
  out.foraNoTorneioDoOrg = await req('PATCH', 'letzplayScans/uid_v1', FORA, PAYLOAD);
  out.torneioInexistente = await req('PATCH', 'letzplayScans/uid_v2', ORG, { fields:
    Object.assign({}, PAYLOAD.fields, { tournamentId: S('nao_existe') }) });
  out.cohostGrava = await req('PATCH', 'letzplayScans/uid_v3', COHOST, { fields:
    Object.assign({}, PAYLOAD.fields, { scannedBy: S(COHOST) }) });
  out.sandboxGrava = await req('PATCH', 'letzplayScans/uid_v4', ORG, { fields:
    Object.assign({}, PAYLOAD.fields, { tournamentId: S('s1'), tournamentName: S('SB') }) });

  /* ── ELENCO: o alvo tem de estar no torneio que o scan nomeia ────────────────────
   * B e organizador do PROPRIO torneio t2 e assina com o proprio uid: assinatura e
   * vinculo OK. So falta o alvo estar no elenco — e e isso que colapsa o ataque. */
  out.donoDeOutroTorneio = await req('PATCH', 'letzplayScans/' + ATLETA, FORA, { fields:
    Object.assign({}, PAYLOAD.fields, { scannedBy: S(FORA), tournamentId: S('t2'), tournamentName: S('Torneio do estranho') }) });
  /* e o mesmo ataque com o historico COMPLETO, que e o que pesa no veredito */
  out.donoDeOutroTorneioFull = await req('PATCH', 'letzplayScans/uid_full', FORA, { fields:
    Object.assign({}, PAYLOAD.fields, { scannedBy: S(FORA), tournamentId: S('t2'),
      fullImport: { mapValue: { fields: { games: { arrayValue: { values: [] } } } } } }) });
  /* O SANDBOX nao e porta de fuga: dono do sandbox, alvo FORA do elenco dele */
  out.sandboxForaDoElenco = await req('PATCH', 'letzplayScans/uid_sb_fora', ORG, { fields:
    Object.assign({}, PAYLOAD.fields, { tournamentId: S('s1'), tournamentName: S('SB') }) });

  /* CONTROLE do elenco: o MESMO uid, agora pelo organizador do torneio onde ele ESTA */
  out.orgDoTorneioCerto = await req('PATCH', 'letzplayScans/' + ATLETA, ORG, PAYLOAD);

  /* ── UPDATE: a regra protege os DOIS verbos, então o irmão também é medido ──────── */
  out.foraAtualiza = await req('PATCH', 'letzplayScans/uid_terceiro?updateMask.fieldPaths=handle',
    FORA, { fields: { handle: S('@forjado') } });

  /* ── DOCUMENTO LEGADO: existe scan gravado SEM vínculo. Atualizar sem trazer o
   * vínculo é recusado; trazendo o payload inteiro, passa. O que a regra vê num merge é
   * o documento RESULTANTE. */
  await req('PATCH', 'letzplayScans/uid_legado', 'owner', { fields: {
    handle: S('@velho'), scannedAt: S('2026-01-01T00:00:00.000Z'), scannedBy: S(ORG),
  } });
  out.legadoSemVinculo = await req('PATCH', 'letzplayScans/uid_legado?updateMask.fieldPaths=handle',
    ORG, { fields: { handle: S('@novo') } });
  out.legadoComVinculo = await req('PATCH', 'letzplayScans/uid_legado', ORG, PAYLOAD);

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
ok(novo.assinaturaDivergente !== 200,
  '⭐⭐ ASSINATURA: gravar assinando com o uid de OUTRO é recusado (got ' + novo.assinaturaDivergente + ')');
ok(novo.foraNoTorneioDoOrg !== 200,
  '⭐⭐ VÍNCULO: quem não é organizador do torneio nomeado é recusado (got ' + novo.foraNoTorneioDoOrg + ')');
ok(novo.torneioInexistente !== 200,
  '⭐ VÍNCULO: `tournamentId` que não existe é recusado (got ' + novo.torneioInexistente + ')');
ok(novo.foraAtualiza !== 200,
  '⭐ e o irmão: ATUALIZAR sem ser organizador também é recusado (got ' + novo.foraAtualiza + ')');
ok(novo.cohostGrava === 200,
  '⭐ CO-ORGANIZADOR grava — mesmo poder do organizador, ou eu quebraria o co-org (got ' + novo.cohostGrava + ')');
ok(novo.sandboxGrava === 200,
  '⭐ SANDBOX: o dono grava nomeando o sandbox — é onde o dono testa (got ' + novo.sandboxGrava + ')');
ok(novo.legadoSemVinculo !== 200,
  '⭐ LEGADO: atualizar scan antigo sem trazer o vínculo é recusado (got ' + novo.legadoSemVinculo + ')');
ok(novo.legadoComVinculo === 200,
  '⭐ LEGADO: com o payload completo, passa (got ' + novo.legadoComVinculo + ')');
/* ⛔ MEDIDO E NÃO FECHADO — a trava de ELENCO foi tentada e RETIRADA, e o teste guarda o
 * fato em vez de esconder: organizador do PRÓPRIO torneio AINDA escreve o scan de quem não
 * está nele. Retirada por duas medidas: (1) não confina nada, porque o scan é global por uid
 * e basta inscrever a vítima — a porta de inscrição recompõe o elenco sozinha — para o
 * documento valer na Análise de todos os outros torneios; (2) quebrava a varredura dentro do
 * Sandbox para quem se inscreve depois da cópia. Fecho de verdade = coleta no servidor. */
ok(novo.donoDeOutroTorneio === 200,
  '⚠️ ABERTO: organizador de torneio próprio ainda escreve scan de quem não está nele (got ' + novo.donoDeOutroTorneio + ')');
ok(novo.sandboxForaDoElenco === 200,
  '⚠️ ABERTO: e pelo sandbox também (got ' + novo.sandboxForaDoElenco + ')');
ok(novo.donoDeOutroTorneioFull === 200,
  '⚠️ ABERTO: inclusive com `fullImport`, que é o que pesa no veredito (got ' + novo.donoDeOutroTorneioFull + ')');
ok(novo.orgDoTorneioCerto === 200,
  '⭐ CONTROLE do elenco: o mesmo uid passa pelo organizador do torneio onde ele ESTÁ (got ' + novo.orgDoTorneioCerto + ')');

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
/* ⛔ O A/B DA LEVA DE 23/set: sem isto, um 403 acima provaria só que ALGUMA regra
 * recusou — e a suíte já recusa por outros motivos. */
ok(velho.assinaturaDivergente === 200,
  '⚠️  REGRESSÃO-GUARD: nas ANTIGAS dava pra assinar com o uid de OUTRO (got ' + velho.assinaturaDivergente + ')');
ok(velho.foraNoTorneioDoOrg === 200,
  '⚠️  REGRESSÃO-GUARD: nas ANTIGAS qualquer conta gravava scan de terceiro SEM vínculo (got ' + velho.foraNoTorneioDoOrg + ')');
ok(velho.torneioInexistente === 200,
  '⚠️  REGRESSÃO-GUARD: nas ANTIGAS o torneio nomeado nem precisava existir (got ' + velho.torneioInexistente + ')');

console.log(fail === 0
  ? '\n✅ rules-letzplayscan-nao-e-proprio: ' + pass + ' ok, 0 falharam'
  : '\n❌ rules-letzplayscan-nao-e-proprio: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
