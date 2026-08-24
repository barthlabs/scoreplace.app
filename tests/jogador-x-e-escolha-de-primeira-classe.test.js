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

// 1. o diálogo de CONFIRMAÇÃO oferece os dois caminhos, lado a lado
const iC = LIGA.indexOf('window._ligaWoConfirm = function');
const iCEnd = LIGA.indexOf('window._ligaWoConfirmGuest = function');
ok(iC !== -1 && iCEnd !== -1 && iC < iCEnd, 'faltam _ligaWoConfirm / _ligaWoConfirmGuest');
const confirmBody = LIGA.slice(iC, iCEnd);
ok(confirmBody.indexOf('_ligaApplyWo') !== -1, 'o caminho da FILA continua no confirm');
ok(confirmBody.indexOf('_ligaWoConfirmGuest') !== -1, 'o caminho do JOGADOR X tem que estar no confirm — lado a lado com a fila');
ok(confirmBody.indexOf('entra ') !== -1, 'o botão da fila DIZ quem entra (nome do suplente no rótulo)');

// 2. o atalho delega pro fluxo canônico — nunca uma cópia da lógica
ok(/window\._ligaWoConfirmGuest = function[\s\S]{0,400}_ligaFillGuestPrompt/.test(LIGA),
  'o atalho do X delega pro _ligaFillGuestPrompt (fluxo canônico)');

// 3. no _ligaPickFill o Jogador X vem ANTES do box de destino
const iP = LIGA.indexOf('window._ligaPickFill = function');
const iPEnd = LIGA.indexOf('SUBSTITUIÇÃO DIRETA', iP);
const pickBody = LIGA.slice(iP, iPEnd === -1 ? iP + 20000 : iPEnd);
const iX = pickBody.indexOf('Completar com Jogador X');
const iDest = pickBody.indexOf('_ligaWoDestBox');
ok(iX !== -1 && iDest !== -1 && iX < iDest,
  'no escolher-substituto o Jogador X vem ANTES do box de destino (era a última coisa da tela)');

console.log('\njogador-x-e-escolha-de-primeira-classe: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
