/* JOGADOR X É ESCOLHA DE PRIMEIRA CLASSE NO ATO DO W.O. (2.0.61)
 * node tests/jogador-x-e-escolha-de-primeira-classe.test.js
 *
 * Ordem do dono (24/ago/2026, caso Fábio/E2 — a fila tinha gente que não podia ir):
 *   _"quero que quando o organizador aponte ele possa indicar se atende pela fila ou
 *    por jogador x"_
 * A opção EXISTIA mas enterrada: última coisa da tela de substituto, abaixo do box de
 * destino — e o dono não a achou ("nao temos a opcao de colocar o jogador x").
 *
 * (O chip do Whats pro organizador — o outro pedido do dia — foi entregue por outra
 * sessão na 2.0.57 e é guardado por um-reverter-por-wo-e-whats-do-organizador.test.js.)
 */
const fs = require('fs');
const path = require('path');
const LIGA = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'liga-substitution.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// 1. a confirmação abre o seletor canônico completo — não uma tela-resumo que
//    esconde a fila e obriga o organizador a dar mais um passo.
const iC = LIGA.indexOf('window._ligaWoConfirm = function');
const iCEnd = LIGA.indexOf('window._ligaWoConfirmGuest = function');
ok(iC !== -1 && iCEnd !== -1 && iC < iCEnd, 'faltam _ligaWoConfirm / _ligaWoConfirmGuest');
const confirmBody = LIGA.slice(iC, iCEnd);
ok(/_ligaPickFill\([^\n]+confirmTitle:\s*'Confirmar W\.O\.\?'/.test(confirmBody),
  'o confirmador delega ao seletor canônico, já com o título Confirmar W.O.');

// 2. o atalho delega pro fluxo canônico — nunca uma cópia da lógica
ok(/window\._ligaWoConfirmGuest = function[\s\S]{0,400}_ligaFillGuestPrompt/.test(LIGA),
  'o atalho do X delega pro _ligaFillGuestPrompt (fluxo canônico)');

// 3. no _ligaPickFill a fila selecionável, o Jogador X e a ação única ficam juntos.
const iP = LIGA.indexOf('window._ligaPickFill = function');
const iPEnd = LIGA.indexOf('SUBSTITUIÇÃO DIRETA', iP);
const pickBody = LIGA.slice(iP, iPEnd === -1 ? iP + 20000 : iPEnd);
const iX = pickBody.indexOf('Completar com Jogador X');
const iDest = pickBody.indexOf('_ligaWoDestBox');
ok(iX !== -1 && iDest !== -1 && iX < iDest,
  'no escolher-substituto o Jogador X vem ANTES do box de destino (era a última coisa da tela)');
ok(/data-cand="1"/.test(pickBody) && /liga-fill-action/.test(pickBody),
  'a lista de espera é selecionável e preserva a ação única (1 substitui; vários convidam)');
ok(/hideFooter:\s*true[\s\S]{0,260}headerHtml:\s*_headerCancel \+ _headerAction/.test(pickBody),
  'Cancelar e Confirmar ficam no cabeçalho, sem rodapé ocupando a tela');

console.log('\njogador-x-e-escolha-de-primeira-classe: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
