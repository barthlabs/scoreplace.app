/* HOMÔNIMO AVISA, POSSE AUTORIZA — o botão de unir contas.
 *
 * A regra do dono é que dois uids não podem ter o mesmo nome, e o homônimo é o melhor
 * detector de duplicata que existe: dos 3 casos medidos na base (Nelson, Silvia, Eduardo),
 * os 3 eram a mesma pessoa, e em nenhum deles e-mail ou telefone batiam.
 *
 * MAS DETECTAR NÃO É AUTORIZAR, e o próprio dono levantou o risco: "e se um desatento tiver
 * um nome comum e aceitar fazer o merge com o nome comum de outra pessoa?". O erro é
 * assimétrico — duas contas duplicadas convivendo é incômodo; fundir duas PESSOAS apaga uma
 * do Auth e não tem volta. Por isso o nome só levanta a hipótese, e quem autoriza é a POSSE
 * do e-mail da outra conta (link que chega lá).
 *
 * Este teste trava as garantias que fazem isso valer:
 *   1. o cliente nunca recebe uid nem contato CHEIO da outra conta (só mascarado);
 *   2. o ALVO é resolvido no servidor — o cliente não passa e-mail/uid, senão viraria porta
 *      pra disparar mensagem a quem quiser;
 *   3. o botão NÃO funde: ele só pede a prova;
 *   4. há rate limit (a mensagem vai pra caixa de outra pessoa quando é coincidência).
 *
 * node tests/name-conflict-merge-proof.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const ROOT = path.join(__dirname, '..');
const cf = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const cli = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
function bloco(src, ini, fim) {
  const a = src.indexOf(ini);
  if (a < 0) throw new Error('marcador inicial nao encontrado: ' + ini);
  if (!fim) return src.slice(a);
  const b = src.indexOf(fim, a);   // procura DEPOIS do inicio (evita pegar a chamada)
  if (b < 0) throw new Error('marcador final nao encontrado: ' + fim);
  return src.slice(a, b);
}

// ── 1. As CFs existem ────────────────────────────────────────────────────────
ok(/exports\.checkNameConflict\s*=\s*onCall/.test(cf), 'CF checkNameConflict existe');
ok(/exports\.requestNameMergeProof\s*=\s*onCall/.test(cf), 'CF requestNameMergeProof existe');

// ── 2. checkNameConflict não vaza PII ────────────────────────────────────────
const bCheck = bloco(cf, 'exports.checkNameConflict', 'exports.requestNameMergeProof');
ok(/maskEmail\(/.test(bCheck) && /maskPhone\(/.test(bCheck),
  'checkNameConflict devolve contato MASCARADO');
ok(!/return\s*\{[^}]*\buid\s*:/.test(bCheck),
  'checkNameConflict NUNCA devolve o uid da outra conta');
ok(!/c\.email\s*[,}]/.test(bCheck.replace(/maskEmail\(c\.email\)/g, '')),
  'checkNameConflict NUNCA devolve o e-mail cheio');
ok(/unauthenticated/.test(bCheck), 'checkNameConflict exige login');

// ── 3. O ALVO é resolvido no SERVIDOR ────────────────────────────────────────
const bReq = bloco(cf, 'exports.requestNameMergeProof', 'exports.mergePhoneAccount');
ok(/findDisplayNameConflict\(/.test(bReq),
  'requestNameMergeProof descobre o alvo pelo NOME, no servidor');
ok(!/request\.data[^)]*\b(email|targetUid|uid)\b/.test(bReq),
  'requestNameMergeProof NÃO aceita e-mail/uid vindos do cliente (senão vira porta de spam)');
ok(/no-conflict/.test(bReq),
  'sem colisão real, não envia nada');
ok(/resource-exhausted/.test(bReq) && /mergeProofLimits/.test(bReq),
  'tem rate limit por caller');

// ── 4. Ponto único de envio da prova ─────────────────────────────────────────
ok(/async function _sendMergeProofEmail\(/.test(cf), 'existe helper único de envio da prova');
ok(/_sendMergeProofEmail\(db, callerUid, c\.uid, c\.email\)/.test(bReq),
  'o fluxo de homônimo reusa o MESMO helper do requestEmailMerge');
const bEmailMerge = bloco(cf, 'exports.requestEmailMerge', 'async function _sendMergeProofEmail');
ok(/_sendMergeProofEmail\(/.test(bEmailMerge),
  'requestEmailMerge também passou a usar o helper (sem duas gravações divergentes de mergeTokens)');
ok(/mergeTokens/.test(cf) && /expiresAt/.test(cf), 'a prova é um token com validade');

// ── 5. O botão NÃO funde — só pede a prova ───────────────────────────────────
const bCli = bloco(cli, 'window._profileRequestNameMerge = function', 'var _PROV_META');
ok(/requestNameMergeProof/.test(bCli), 'o botão chama requestNameMergeProof');
ok(!/confirmEmailMerge|mergePhoneAccount|_mergeAccounts/.test(bCli),
  'o botão NUNCA chama merge direto — quem funde é o clique no link que chega na outra conta');
ok(/_profileHydrateNameConflict/.test(cli), 'existe o hidratador do aviso');
ok(/if \(typeof window\._profileHydrateNameConflict === 'function'\) window\._profileHydrateNameConflict\(\);/.test(cli),
  'o aviso é hidratado quando o perfil abre');

// ── 6. O aviso é discreto e não acusa ninguém ────────────────────────────────
const bHid = bloco(cli, 'window._profileHydrateNameConflict = function', 'window._profileRequestNameMerge = function');
ok(/hasConflict/.test(bHid), 'o cliente só pinta quando o SERVIDOR confirma a colisão');
ok(/maskedEmail|maskedPhone/.test(bHid), 'mostra o contato mascarado que o servidor mandou');
ok(/outra pessoa com o mesmo nome/.test(bHid),
  'o texto admite que pode ser outra pessoa (não afirma que é duplicata)');
ok(/_safeHtml\(/.test(bHid), 'o contato passa por _safeHtml antes de ir pro DOM');
ok(/fail-open/i.test(bHid), 'falha na consulta não quebra o perfil');
ok(/display:none/.test(cli.slice(cli.indexOf('profile-name-conflict') - 200, cli.indexOf('profile-name-conflict') + 200)),
  'o slot nasce escondido — sem colisão, ninguém vê nada');

// ── 7. Canal por CELULAR: reusa a máquina que já funciona ───────────────────
// Não há CF que envie SMS (quem envia é o Firebase, pelo cliente) — então o caminho é o
// MESMO do "celular vinculado": app secundário + reCAPTCHA off-screen + a sessão do
// telefone virando prova (proofIdToken) no mergePhoneAccount, que a valida com
// verifyIdToken e exige uid === oldUid. Reusar é o ponto: um 2º fluxo de SMS seria outra
// superfície pra quebrar (o reCAPTCHA do iOS já custou caro uma vez).
const bPhone = bloco(cli, 'window._profileNameMergeByPhone = function', 'window._profileRequestNameMerge = function');
ok(/profile-nc-phone-wrap/.test(bPhone), 'o botão por celular só REVELA os campos');
ok(!/signInWithPhoneNumber|RecaptchaVerifier|mergePhoneAccount/.test(bPhone),
  'o handler NÃO reimplementa envio de SMS nem chama merge — quem faz é _profileVerifyPhone');
ok(/_profileVerifyPhone\(\{conflict:true\}\)/.test(cli),
  'os campos disparam _profileVerifyPhone no contexto conflict');

const bVerify = bloco(cli, 'window._profileVerifyPhone = function', 'window._profilePhoneMergeFromSecondary');
ok(/var conflict = !!opts\.conflict/.test(bVerify), '_profileVerifyPhone entende o 3º contexto');
ok(/profile-nc-phone/.test(bVerify), 'o contexto conflict aponta pros IDs do aviso');
ok(/conflict && cu\.phone && cu\.phone === e164/.test(bVerify),
  'digitar o PRÓPRIO número é barrado (não prova posse da outra conta)');
// As lições que não podem se perder ao reusar:
ok(/persistence|Persistence\.NONE/i.test(bVerify),
  'sessão secundária não derruba o login atual (persistence NONE)');
ok(/position:fixed[^']*width:1px/.test(bVerify),
  'reCAPTCHA fica off-screen mas EM LAYOUT — display:none invalida o token no iOS');

// A prova chega ao servidor e é VERIFICADA lá.
ok(/proofIdToken/.test(cli), 'o cliente envia o proofIdToken da sessão do telefone');
const bMerge = bloco(cf, 'exports.mergePhoneAccount', 'exports.fixMergedParticipants');
/* ⚠️ v2.1.48: a validação saiu de dentro do `exports.mergePhoneAccount` para a função
 * `_provaDePosseDeOld`, porque ela passou a ser conferida DUAS vezes — antes de adquirir o
 * lock de ciclo de vida (senão uma chamada sem prova já marcava `merging` em duas contas)
 * e de novo depois dele. A REGRA é idêntica: token que prova ser o `oldUid`. */
const bProva = bloco(cf, 'async function _provaDePosseDeOld', 'exports.mergePhoneAccount');
ok(/verifyIdToken\(String\(proof\)\)/.test(bProva) && /dec\.uid === oldUid/.test(bProva),
  'a prova é VALIDADA (verifyIdToken + uid === oldUid)');
ok(/_provaDePosseDeOld\(request, callerUid, oldUid/.test(bMerge),
  'e o mergePhoneAccount a usa');
ok(bMerge.indexOf('RECUSADO sem prova de posse') < bMerge.indexOf('adquirir(admin.firestore()'),
  '⛔ ANTES de adquirir o lock — sem prova, zero escrita em userLifecycle');
ok(/sem prova de posse da conta a mesclar/.test(bMerge),
  'sem prova, o servidor recusa');

// DDI vem da MESMA lista do perfil (sem segunda cópia divergindo)
ok(/window\._phoneCountryOptionsHtml = function/.test(cli), 'helper único de opções de DDI');
ok(/_phoneCountryOptionsHtml\(/.test(bHid), 'o campo do aviso usa o helper, não uma lista própria');

console.log(fail === 0
  ? '✅ name-conflict-merge-proof: ' + pass + ' ok, 0 falharam'
  : '❌ name-conflict-merge-proof: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
