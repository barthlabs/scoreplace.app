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

console.log(fail === 0
  ? '✅ name-conflict-merge-proof: ' + pass + ' ok, 0 falharam'
  : '❌ name-conflict-merge-proof: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
