/* empate-do-set-e-do-organizador — prorrogar × tie-break, e EM QUE empate.
 *
 * Ordem do dono (21/ago/2026): _"porra pode prorrogar em 5-5 ou 6-6, 7-7... decisao do
 * organizador. ou pode aplicar o tie-break em 5-5 ou 6-6 de novo decisao do organizador"_.
 *
 * DUAS FALHAS REAIS, as duas medidas antes de mexer:
 *  1. O motor ao vivo IGNORAVA a escolha 5-5/6-6: o gatilho do tie-break era `g - 1` cravado
 *     no código. Quem configurava "Tie-break em 6-6" via o tie-break começar em 5-5 — a tela
 *     prometia uma coisa e a quadra jogava outra.
 *  2. "Prorrogar" NÃO EXISTIA no formato do torneio. O motor já lia `scoring.tieRule`
 *     ('extend'|'tiebreak'|'ask') — e NINGUÉM ESCREVIA esse campo. A regra existia e a tela
 *     não entregava, igual ao formato por fase de manhã.
 */
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }
console.log('──── o empate do set é do organizador ────');

const ui = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-ui.js'), 'utf8');
const ct = fs.readFileSync(path.join(__dirname, '..', 'js/views/create-tournament.js'), 'utf8');

// ── 1. O ponto do empate: FONTE ÚNICA, e agora com 7-7 ──────────────────────
(function () {
  const sandbox = { window: {} };
  const fn = new Function('window', ui.slice(ui.indexOf('window._tbLoserGames = function'),
    ui.indexOf('};', ui.indexOf('window._tbLoserGames = function')) + 2) + '\nreturn window._tbLoserGames;');
  const tbLoser = fn(sandbox.window);
  const sp = { gamesPerSet: 6 };
  ok(tbLoser(Object.assign({ tiebreakAt: 'g-1' }, sp)) === 5, '5-5 (set curto) → empate em 5');
  ok(tbLoser(Object.assign({ tiebreakAt: 'g' }, sp)) === 6, '6-6 (padrão) → empate em 6');
  ok(tbLoser(Object.assign({ tiebreakAt: 'g+1' }, sp)) === 7, '7-7 (set longo) → empate em 7 — a opção que não existia');
})();

// ── 2. O MOTOR passou a usar o ponto configurado ────────────────────────────
ok(/tieAtGames:/.test(ui), 'o estado do placar ao vivo carrega o ponto de empate configurado');
ok(/cs\.gamesP1 >= _tieAt/.test(ui), 'o gatilho usa o ponto ESCOLHIDO');
ok(!/state\.tiebreakEnabled && cs\.gamesP1 === g - 1 && cs\.gamesP2 === g - 1/.test(ui),
  'e o gatilho CRAVADO em (g-1)-(g-1) — a 2ª porta, que ignorava a escolha — foi removido');

// ── 3. Torneio ANTIGO não muda de comportamento ─────────────────────────────
ok(/tieRule: sc\.tieRule \|\| \(isCasual \? 'ask' : \(\(sc\.tiebreakEnabled === false\) \? 'extend' : 'tiebreak'\)\)/.test(ui),
  'sem tieRule gravado, deriva do toggle antigo: ligado=tie-break, desligado=prorrogar');

// ── 4. E agora ALGUÉM ESCREVE o tieRule ─────────────────────────────────────
ok(/out\.tieRule = /.test(ct), 'o "Personalizado" grava tieRule (antes o motor lia um campo que ninguém escrevia)');
ok(/window\._gsmSetTieRule = function/.test(ct), 'existe o controle prorrogar × tie-break');
ok(/'tiebreakAt','tieRule'\]/.test(ct), 'os dois viajam junto com o formato entre as fases');
ok(/id="gsm-tieRule"/.test(ct), 'e têm campo próprio no formulário (senão não salva no torneio)');
// ⭐ 2.1 — a tela oferece 5-5 × 6-6 num TOGGLE, não três botões. Decisão do dono (22/ago):
// "na verdade um toggle 5-5/6-6 que ativado faz virar 5-5 por default. isso resolve. e fica
// claro visualmente." O 'g+1' continua LEGÍVEL pelo motor (torneio já gravado assim segue
// jogando 7-7), só deixou de ser oferecido — não é a mesma coisa que deixar de existir.
ok(/window\._tieAtToggleHtml = function/.test(ct), 'o gatilho do empate é um toggle, um desenho só');
ok(/curto \? 'g-1' : 'g'/.test(ct), 'ligado = 5-5 (set curto), desligado = 6-6 (padrão)');
ok(/'g\+1'/.test(ui), 'o motor continua entendendo o 7-7 já gravado (não some do lançamento)');
ok(!/gsm-tbat-seg/.test(ct), '⛔ o segmento antigo não sobrou em lugar nenhum do formulário');

// ── 5. O RESUMO conta as duas saídas, com a conta certa ─────────────────────
ok(/gsmExtendDetail/.test(ct), 'o resumo diz o que acontece quando é PRORROGAR (antes ficava mudo)');
ok(/tbPts - tbMargin \+ 1/.test(ct),
  'e a conta do "segue até abrir N" é pts-margem+1 — em 5-5 o tie-break de 7 AINDA fecha (7-5)');
ok(!/var _tbDraw = tbPts - tbMargin;/.test(ct), 'o off-by-one antigo não voltou');
// A conta, provada contra a regra de vitória do tie-break
(function () {
  const fecha = (a, b, pts, m) => (a >= pts && a - b >= m);
  ok(!fecha(5, 5, 7, 2) && !fecha(6, 5, 7, 2) && fecha(7, 5, 7, 2), '5-5 não é o ponto de prorrogação: 7-5 fecha');
  ok(!fecha(7, 6, 7, 2) && fecha(8, 6, 7, 2), '6-6 é: dali em diante só fecha abrindo 2');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ empate-do-set-e-do-organizador FALHOU'); process.exit(1); }
console.log('✅ empate-do-set-e-do-organizador: OK');
