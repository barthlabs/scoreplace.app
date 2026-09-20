'use strict';
/* ⛔ AS PORTAS DE E-MAIL DE CONTA ERAM ABERTAS E SEM LIMITE NENHUM.
 *
 * MEDIDO em 13/set/2026: `sendVerificationEmail` e `sendPasswordReset` são
 * `onCall` SEM `request.auth` — de propósito, porque quem precisa entrar ainda não entrou — e
 * recebem o endereço de destino do PAYLOAD DO CLIENTE. Nenhuma tinha cooldown, throttle ou
 * contador: qualquer pessoa na internet podia fazer o NOSSO remetente despejar mensagem
 * ilimitada em QUALQUER endereço digitado. Só `sendVerificationCode` tinha freio (45 s).
 *
 * E não era abuso só teórico: na coleção `mail` há **25 pares** de "Confirme seu e-mail" /
 * "Redefinir sua senha" para o MESMO endereço a menos de 3 horas, vários no MESMO SEGUNDO.
 *
 * O limite é por ENDEREÇO DE DESTINO — é a caixa dele que enche — e conta toda tentativa,
 * exista conta ou não, para que a recusa não revele quem tem cadastro.
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const FN = fs.readFileSync(path.join(raiz, 'functions/index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── ① as portas passam pelo limitador ───────────────────────────────────────
['sendVerificationEmail', 'sendPasswordReset'].forEach((porta) => {
  const i = FN.indexOf('exports.' + porta + ' = onCall(');
  assert.ok(i > 0, 'âncora: ' + porta);
  // ⛔ ÂNCORA, não orçamento de caracteres: fatiar por tamanho já escondeu o `return` de uma
  // função inteira num portão anterior. O corpo vai daqui até o PRÓXIMO `exports.`.
  const iFim = FN.indexOf('\nexports.', i + 10);
  assert.ok(iFim > i, 'âncora: o fim de ' + porta);
  const corpo = semComentario(FN.slice(i, iFim));
  const re = new RegExp('_barraSeAbusar\\(admin\\.firestore\\(\\), "' + porta + '", email\\)');
  must(re.test(corpo), '① ' + porta + ' passa pelo limitador, com o nome da própria porta');
  // e passa ANTES de qualquer coisa cara/externa
  const iBarra = corpo.indexOf('_barraSeAbusar');
  const iEnvio = corpo.indexOf('_enqueueMail');
  const iGen = corpo.indexOf('_genVerificationLink');
  const primeiroCaro = [iEnvio, iGen].filter((x) => x > 0).sort((a, b) => a - b)[0];
  must(iBarra > 0 && (primeiroCaro === undefined || iBarra < primeiroCaro),
    '① ⭐ ' + porta + ': o limite vem ANTES de gerar link ou enfileirar e-mail');
});

// ── ② o limitador em si ─────────────────────────────────────────────────────
const iB = FN.indexOf('async function _barraSeAbusar');
assert.ok(iB > 0, 'âncora: o limitador');
const barra = semComentario(FN.slice(iB, FN.indexOf('\n}\n', iB)));
must(/_throttleHit\(db, "accountEmailThrottle"/.test(barra),
  '② reusa `_throttleHit`, que desde a L14.P1 trata DISPUTA como batida');
must(/porta \+ ":" \+ String\(email \|\| ""\)\.toLowerCase\(\)/.test(barra),
  '② ⭐ a chave é PORTA + ENDEREÇO DE DESTINO — quem sofre é a caixa dele');
must(/throw new HttpsError\("resource-exhausted"/.test(barra),
  '② e a recusa é explícita, não um silêncio que parece sucesso');
must(!/users|getUser|exists/.test(barra),
  '② ⛔ não consulta se a conta EXISTE — senão a recusa viraria enumeração');

// ── ③ o contador é do servidor ──────────────────────────────────────────────
must(!/accountEmailThrottle/.test(RULES),
  '③ ⛔ `accountEmailThrottle` não tem regra — negada por padrão, só o Admin SDK alcança');

// ── ④ o teto é um número, não uma opinião espalhada ─────────────────────────
must(/const _TETO_EMAIL_DE_CONTA_POR_MIN = \d+;/.test(FN),
  '④ o teto mora numa constante só');
const teto = parseInt(/const _TETO_EMAIL_DE_CONTA_POR_MIN = (\d+);/.exec(FN)[1], 10);
must(teto >= 2 && teto <= 10,
  '④ e é folgado para quem erra o clique (' + teto + '/min), apertado para quem martela');

console.log('\n✅ porta de e-mail de conta tem limite — ' + ok + ' verificações');
