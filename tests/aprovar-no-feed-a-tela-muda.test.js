/* APROVAR PELO FEED DA TELA INICIAL: A TELA TEM QUE MUDAR — E CONTINUAR MUDADA.
 *
 * RELATO DO DONO (24/ago/2026, TestFlight, print do JOGO 92 do Confra):
 *   _"disse que aprovou, mas não mostra e depois não tem mais o que aprovar."_
 *
 * OS TRÊS SINTOMAS SÃO UMA CORRIDA SÓ:
 *   1. `_approveResult` aplica a aprovação OTIMISTA no objeto local e pede
 *      repintura da dashboard (debounce 450ms);
 *   2. nesse meio-tempo um carregamento do servidor SUBSTITUI `AppStore.tournaments`
 *      inteiro (store.js: `this.tournaments = _dropSandboxForNonDev(...)`) — com o
 *      estado de ANTES, porque a gravação ainda não tinha chegado lá. A mutação
 *      otimista MORRE e a repintura pinta o card AINDA PENDENTE;
 *   3. os snapshots seguintes já trazem o aprovado, mas a dashboard só repinta por
 *      assinatura de CONJUNTO (ids) — que não muda ao aprovar um placar. A tela
 *      fica congelada no pendente até navegar; ao navegar, aparece o estado fresco
 *      ("não tem mais o que aprovar").
 *
 * O QUE ESTE TESTE TRAVA (2.0.64):
 *   • a repintura acontece TAMBÉM depois que a gravação CONFIRMA (não só otimista);
 *   • antes de repintar, o dado local é CURADO — se o objeto voltou a ter
 *     `pendingResult` (carregamento velho que chegou depois), a aprovação é
 *     re-aplicada nele, espelhando o que o `commitTournamentTx` faz no servidor;
 *   • falha de gravação também repinta (a tela tem que voltar a dizer PENDENTE —
 *     regra da 1.9.56: o aviso é consequência da gravação, não enfeite do clique).
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket-ui.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── aprovar no feed: a tela muda, e continua mudada ────');

const i = src.indexOf('window._approveResult = function(tId, matchId) {');
ok(i > 0, 'achou o _approveResult');
const fim = src.indexOf('\nwindow._contestResult', i);
const corpo = _R.ateOFim(src, i);

// 1) existe o redesenho pós-gravação, e ele é chamado nos DOIS desfechos
ok(/var _redesenhar = function \(\) \{/.test(corpo),
   'existe um redesenho nomeado (_redesenhar) — não um _rerenderBracket solto');
const iOk = corpo.indexOf('var _avisarOk = function ()');
const iFalha = corpo.indexOf('var _avisarFalha = function (err)');
ok(iOk > 0 && iFalha > 0, 'achou os dois desfechos da gravação');
const corpoOk = corpo.slice(iOk, corpo.indexOf('};', iOk));
const corpoFalha = corpo.slice(iFalha, corpo.indexOf('};', iFalha));
ok(/_redesenhar\(\)/.test(corpoOk),
   'SUCESSO da gravação redesenha a tela (o card sai de PENDENTE sem precisar navegar)');
ok(/_redesenhar\(\)/.test(corpoFalha),
   'FALHA da gravação também redesenha (a tela volta a dizer PENDENTE — 1.9.56)');

// 2) o redesenho CURA o dado local antes de pintar
const iRed = corpo.indexOf('var _redesenhar = function () {');
const corpoRed = corpo.slice(iRed, corpo.indexOf('\n  var _avisarOk', iRed));
ok(/_findTournamentById\(tId\)/.test(corpoRed),
   'o redesenho relê o torneio do store (o array pode ter sido SUBSTITUÍDO no meio)');
ok(/pendingResult[\s\S]{0,120}_applyApprovedResult\(t2, matchId, pr\)/.test(corpoRed),
   'se a proposta VOLTOU (carregamento velho chegou depois), re-aplica a aprovação — ' +
   'espelho local do que o commitTournamentTx faz no doc fresco');
ok(/_rerenderBracket\(tId, matchId\)/.test(corpoRed),
   'e só então repinta (pelo caminho canônico, que na dashboard vira _dashPedirRepintura)');

// 3) ⛔ a ordem importa: curar ANTES de pintar, senão pinta o pendente de novo
const posCura = corpoRed.indexOf('_applyApprovedResult');
const posPinta = corpoRed.indexOf('_rerenderBracket');
ok(posCura > 0 && posPinta > 0 && posCura < posPinta,
   '⛔ a CURA vem ANTES da pintura (pintar primeiro mostraria o pendente que acabou de morrer)');

// 4) o caminho da dashboard segue sendo o do cânone (ação do dedo não passa pelo gate)
const iRer = src.indexOf('function _rerenderBracket(tId, anchorMatchId) {');
const corpoRer = _R.ateOFim(src, iRer);
ok(/_dashPedirRepintura\('acao-no-card'\)/.test(corpoRer),
   'na dashboard a repintura entra como AÇÃO DO DEDO (sem o gate de assinatura de conjunto)');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
