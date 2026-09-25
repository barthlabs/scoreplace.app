'use strict';
/* ⛔⛔ ERRO TEMPORÁRIO DE E-MAIL NÃO É "A PESSOA NÃO RECEBEU" (24/set/2026).
 *
 * MEDIDO na fila de produção: 128 e-mails parados em erro, 75 pessoas, TODOS com a mesma causa
 * — `421-4.3.0 Temporary System Problem. Try again later.` — e o mais recente de 11/jun/2026.
 * `421` é classe 4xx: transitório. O relatório de comunicado contava todos como "não recebeu",
 * na mesma conta de caixa cheia e endereço inexistente. 75 pessoas marcadas como não alcançadas
 * por um problema momentâneo de quem entrega, num relatório que o organizador usa para decidir.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'functions', 'email-failure-core.js'));

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── erro temporário não é bounce ────');

// ── A. o texto REAL dos 128, colhido da fila ─────────────────────────────────
const REAL = 'Error: Data command failed: 421-4.3.0 Temporary System Problem. Try again later. For more info';
ok(C.classificarFalhaDeEmail(REAL) === 'transitoria',
  '⛔ o texto real dos 128 é TRANSITÓRIO — é o caso que originou a leva');
ok(C.ehBounceDeVerdade(REAL) === false, 'e portanto NÃO conta como "não recebeu"');

// ── B. permanente é permanente ───────────────────────────────────────────────
ok(C.classificarFalhaDeEmail('550 5.1.1 The email account that you tried to reach does not exist') === 'permanente',
  'endereço inexistente é PERMANENTE');
ok(C.classificarFalhaDeEmail('552 5.2.2 over quota') === 'permanente', 'caixa cheia é PERMANENTE');
ok(C.ehBounceDeVerdade('550 5.1.1 no such user') === true, 'e só a permanente é bounce');

// ── C. sem código inequívoco → desconhecida, e desconhecida NÃO acusa ────────
ok(C.classificarFalhaDeEmail('') === 'desconhecida', 'texto vazio é desconhecida');
ok(C.classificarFalhaDeEmail('algo estranho sem codigo') === 'desconhecida', 'texto sem código é desconhecida');
ok(C.ehBounceDeVerdade('algo estranho') === false,
  '⛔ desconhecida NÃO é bounce — na dúvida não se afirma que a pessoa não recebeu');

/* ⛔ REGRESSÃO DO MEU PRÓPRIO CÓDIGO: a primeira versão casava `[45]\d\d` em qualquer lugar do
 * texto, e "entregue em 2026 para 421 pessoas" virava TRANSITÓRIA. Número de três dígitos
 * aparece em texto livre; código SMTP aparece onde o protocolo o põe. */
ok(C.classificarFalhaDeEmail('entregue em 2026 para 421 pessoas') === 'desconhecida',
  '⛔ REGRESSÃO: número solto no meio de uma frase NÃO é código SMTP');
ok(C.classificarFalhaDeEmail('relatorio de 550 envios no total') === 'desconhecida',
  'idem para um 550 solto');
ok(C.classificarFalhaDeEmail('421 Service not available') === 'transitoria',
  'mas código no começo da linha conta');

// ── D. de onde o texto vem no doc da extensão ────────────────────────────────
ok(C.textoDaFalha({ delivery: { error: '550 x' } }) === '550 x', 'lê delivery.error');
ok(C.textoDaFalha({ delivery: { info: '421 y' } }) === '421 y', 'e delivery.info como alternativa');
ok(C.textoDaFalha({}) === '', 'doc sem delivery devolve vazio, não estoura');

// ── E. o RELATÓRIO usa o núcleo, e o comentário que mentia foi corrigido ─────
{
  const src = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
  const i = src.indexOf('const bouncedEmails = new Set();');
  const bloco = src.slice(Math.max(0, src.lastIndexOf('/*', i)), src.indexOf('const hasBounces', i) + 200);
  ok(/_emailFail\.classificarFalhaDeEmail/.test(bloco),
    'o relatório classifica a causa em vez de contar todo erro');
  ok(/kind === "permanente"/.test(bloco), 'e só a permanente entra no conjunto de bounce');
  ok(/emailsComFalhaIncerta/.test(bloco), 'transitória e desconhecida vão para o terceiro conjunto');
  ok(!/negativa = doc na coleção `mail`[\s\S]{0,200}caixa cheia/.test(src),
    '⛔ o comentário que dizia pegar "caixa cheia / inexistente" foi corrigido — ele sustentou o erro por meses');
  ok(/ATRIBUIÇÃO ainda é por ENDEREÇO \+ JANELA/.test(src),
    '⛔ e o defeito anterior de atribuição por janela está NOMEADO, não escondido');
}

// ── F. a TELA mostra três estados ────────────────────────────────────────────
{
  const ui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments-organizer.js'), 'utf8');
  const i = ui.indexOf('function emailCheck(r)');
  const corpo = ui.slice(i, ui.indexOf('\n        }', i));
  ok(/r\.emailIncerto/.test(corpo), 'a tela tem o terceiro estado');
  ok(corpo.indexOf('r.emailIncerto') < corpo.indexOf('r.emailBounced'),
    'e o incerto é testado ANTES do bounce, para não ser engolido por ele');
  ok(/temporária/.test(corpo), 'o título explica que a falha foi temporária, em vez de acusar a pessoa');
  ok(!/e-mail inválido ou c/.test(ui),
    '⛔ e o rótulo antigo, que afirmava "inválido ou caixa cheia" para todo erro, saiu');
}

console.log(fail ? `❌ erro-temporario-nao-e-bounce: ${fail} falha(s), ${pass} ok`
                 : `✅ erro-temporario-nao-e-bounce: ${pass} ok`);
process.exit(fail ? 1 : 0);
