/* O FECHO DE RODADA VAI PRA CF — EM TODO FORMATO (2.0.98)
 * node tests/fecho-de-rodada-vai-pra-cf.test.js
 *
 * Ordem do dono (25/ago/2026): _"o certo é tudo rodar em CF só sendo disparado pelo client
 * side"_. Sorteio e placar já rodavam; o FECHO DE RODADA só roteava no Suíço multifase.
 *
 * ⛔ POR QUE ISSO IMPORTA ALÉM DO PRINCÍPIO: nos demais formatos, quem salva o último
 * placar da rodada GERA A RODADA SEGUINTE no cliente e a grava — o participante CRESCE
 * `t.rounds` legitimamente. Enquanto isso rodar no cliente, fechar as rules do Firestore
 * QUEBRA o ciclo de rodadas. Rotear é o pré-requisito da trava marcada pra 09/set/2026
 * ([[project_travar_as_rules_em_9_setembro]]).
 *
 * A CF já era genérica (`closeRoundCore` → `_applyRoundCloseToTournament`, a MESMA mutação
 * canônica do cliente): não foi preciso motor novo, só parar de restringir o roteamento.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-logic.js'), 'utf8');
// ⚠️ âncora na CHAMADA, não na condição: existem duas menções a `_callCloseRound` (o
// guarda de indisponibilidade e a chamada), e ancorar na primeira desloca todos os recortes.
const i = src.indexOf('window._callCloseRound({ tournamentId');
ok(i > 0, 'o roteamento pra CF existe');
const cond = src.slice(src.lastIndexOf('if (', i), i + 120);

// ① não restringe mais por formato
ok(!/isMultiPhaseSwiss\s*&&\s*typeof window\._callCloseRound/.test(src),
  'o roteamento NÃO é mais só do Suíço multifase (era o que obrigava a rule aberta)');
ok(/if \(!_forcarLocal\) \{/.test(src),
  'todo formato roteia pra CF; `_forcarLocal` existe SÓ pros testes do motor da transição');

/* ② ⛔ NÃO EXISTE QUEDA PRO CLIENTE — e esta é a exigência mais dura deste teste.
 * Ordem do dono (25/ago/2026): _"nada no client side. imagina diferentes clientes com
 * diferentes versões encerrando as rodadas e gerando a seguinte cada um com um código.
 * de forma alguma. tudo na cf"_.
 * Eu tinha posto um fallback local "pra não travar a quadra". Ele recria EXATAMENTE a
 * divergência que a CF existe pra eliminar: cliente velho gera a rodada com motor velho e
 * o torneio passa a ter duas verdades. NÃO FECHAR é melhor que fechar ERRADO.
 * O que não pode é falhar em silêncio — por isso o aviso é exigido junto. */
const bloco = src.slice(src.indexOf(".catch(function (err) {", i), src.indexOf(".catch(function (err) {", i) + 1400);
ok(!/_doCloseRound\([^)]*true\)/.test(bloco),
  '⛔ a falha da CF NÃO cai no motor local (seria a divergência de versão de volta)');
ok(/showNotification\(/.test(bloco),
  'e a pessoa é AVISADA de que a rodada continua aberta (falhar em silêncio é pior)');
ok(/_lastSaveError/.test(bloco), 'e a falha fica registrada');
ok(/_callCloseRound !== 'function'/.test(src),
  'sem a CF disponível o fecho NEM TENTA rodar no cliente — avisa e para');

// ③ o aviso não pode sumir ao trocar de caminho
ok(/window\._avisoDoFechoDeRodada = function/.test(src),
  'o aviso do fecho tem fonte única, derivada do DESFECHO');
['phaseComplete', 'transition', 'pureSwissFinish', 'nextRound'].forEach(function (b) {
  ok(new RegExp("'" + b + "'").test(src.slice(src.indexOf('_avisoDoFechoDeRodada = function'),
                                              src.indexOf('_avisoDoFechoDeRodada = function') + 2600)),
    'o aviso cobre o desfecho "' + b + '" (rotear sem ele faria a tela mudar em silêncio)');
});
const rota = _R.ateSairDoBloco(src, i);
ok(/_avisoDoFechoDeRodada\(t, d\.branch\)/.test(rota),
  'e o caminho da CF usa o desfecho que o SERVIDOR devolveu');

// ④ a CF de verdade existe e é genérica
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');
ok(/exports\.closeRound = onCall/.test(cf), 'a CF closeRound existe');
const core = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'draw-core.js'), 'utf8');
ok(/_applyRoundCloseToTournament\(t, roundIdx\)/.test(core),
  'e ela usa a MESMA mutação canônica do cliente (não um segundo motor)');

console.log((fail ? '✗' : '✓') + ' fecho-de-rodada-vai-pra-cf: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
