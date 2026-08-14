/* A TABELA E A CHAVE USAM A MESMA ORDEM — node tests/classificacao-uma-regra-so.test.js
 *
 * ORDEM DO DONO (14/ago/2026): "sem rodar coisas diferentes para o que deveria ser uma coisa
 * só: fase classificatória."
 *
 * Havia DUAS respostas para "quem está na frente":
 *   • a TABELA que a pessoa vê (bracket-logic._computeMonarchStandings) — cadeia longa:
 *     wins → saldo de sets → sets → saldo de games → games → tie-breaks → saldo de pontos →
 *     pontos → aproveitamento → jogos;
 *   • a ordem de QUEM SOBE pra eliminatória (phases-engine._globalStandings) — cadeia CURTA:
 *     wins → saldo de sets → saldo de games → saldo de pontos, e empatando ali devolvia 0,
 *     ou seja mantinha a ordem em que os grupos foram varridos.
 *
 * MEDIDO no sandbox do Confra com a R1 completa: 132 classificados, **80 posições** em que
 * as duas ordens discordavam. Naquele placar a 1ª divergência caía na 40ª posição — o corte
 * do Confra não teria mudado —, mas isso é sorte do dado: com outro placar, ou com mais
 * classificados, a divergência sobe pro topo. A tabela dizer uma ordem e a chave usar outra
 * não se defende, e a cura é as duas perguntarem à MESMA função.
 *
 * Este teste trava o acordo. Contra o código anterior, o bloco 2 acusa a divergência.
 */
const H = require('./render-harness');
const W = H.sandbox;
// ⚠️ O phases-engine lê `window._standingsCompare` em runtime. No browser e no vendor da CF
// (`g.window = g`) é o MESMO objeto global que carrega o bracket-logic; aqui, o `require`
// roda fora do vm do harness, então é preciso apontar o `window` do processo pro sandbox —
// senão o teste mede um cenário que não existe em lugar nenhum (e o guard do engine cai no
// fallback, que preserva a ordem em vez de desempatar).
global.window = W;
const E = require('../js/views/phases-engine.js');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

ok(typeof W._standingsCompare === 'function', 'existe o comparador único _standingsCompare');
ok(typeof E.globalStandings === 'function', 'globalStandings exportado (é a ordem de quem sobe)');

// Linhas de classificação desenhadas pra empatar nos critérios CURTOS e separar só nos
// LONGOS — é exatamente onde as duas cadeias divergiam.
function linha(nome, o) {
  return Object.assign({
    name: nome, uid: 'uid_' + nome, wins: 1, losses: 1, played: 2,
    setsWon: 1, setsLost: 1, gamesWon: 10, gamesLost: 10,
    tiebreaksWon: 0, tiebreaksLost: 0, pointsFor: 20, pointsAgainst: 20, winRate: 0.5, points: 3
  }, o || {});
}

console.log('──── 1. o comparador separa nos critérios longos ────');
// mesmos wins/saldos; separa em SETS VENCIDOS (degrau 3, que a cadeia curta não tinha)
var A = linha('A', { setsWon: 3, setsLost: 3 });
var B = linha('B', { setsWon: 1, setsLost: 1 });
ok(W._standingsCompare(A, B, false) < 0, 'mais sets vencidos vem antes (empate em saldo)');
// separa em GAMES VENCIDOS (degrau 5)
var C = linha('C', { gamesWon: 30, gamesLost: 30 });
var D = linha('D', { gamesWon: 10, gamesLost: 10 });
ok(W._standingsCompare(C, D, false) < 0, 'mais games vencidos vem antes (empate em saldo)');
// separa em TIE-BREAKS (degraus 6/7) — a cadeia curta ignorava
var Ee = linha('E', { tiebreaksWon: 2, tiebreaksLost: 0 });
var F = linha('F', { tiebreaksWon: 0, tiebreaksLost: 0 });
ok(W._standingsCompare(Ee, F, false) < 0, 'mais tie-breaks vencidos vem antes');
// e o de menos JOGOS desempata por último (asc)
var G = linha('G', { played: 2 }), Hh = linha('H', { played: 5 });
ok(W._standingsCompare(G, Hh, false) < 0, 'com tudo igual, quem jogou menos vem antes');
// pontuação avançada, quando ligada, manda antes de tudo
var I = linha('I', { points: 1, wins: 5 }), J = linha('J', { points: 9, wins: 0 });
ok(W._standingsCompare(I, J, true) > 0, 'com pontuação avançada ligada, os PONTOS mandam');
ok(W._standingsCompare(I, J, false) < 0, 'sem ela, mandam as vitórias');

console.log('──── 2. a ordem de QUEM SOBE é a MESMA da tabela ────');
// dois grupos; dentro de cada um as linhas empatam nos critérios curtos e só os LONGOS
// separam. Se a transição usasse a cadeia curta, a ordem sairia diferente da tabela.
var g1 = { name: 'G1', linhas: [linha('a1', { setsWon: 1, setsLost: 1 }), linha('a2', { setsWon: 3, setsLost: 3 })] };
var g2 = { name: 'G2', linhas: [linha('b1', { tiebreaksWon: 0 }), linha('b2', { tiebreaksWon: 4 })] };
var grupos = [g1, g2];
var cs = function (g) { return g.linhas.slice().sort(function (a, b) { return W._standingsCompare(a, b, false); }); };

var ordemTransicao = E.globalStandings(grupos, cs).map(function (x) { return x.name; });
var todas = []; grupos.forEach(function (g) { cs(g).forEach(function (x) { todas.push(x); }); });
var ordemTabela = todas.slice().sort(function (a, b) { return W._standingsCompare(a, b, false); })
  .map(function (x) { return x.name; });

ok(ordemTransicao.join(',') === ordemTabela.join(','),
  'as duas ordens coincidem — transição [' + ordemTransicao.join(',') + '] × tabela [' + ordemTabela.join(',') + ']');
// e a ordem é a de MÉRITO, não a de varredura dos grupos
ok(ordemTransicao[0] === 'b2' || ordemTransicao[0] === 'a2',
  'quem lidera é quem tem o melhor critério longo, não quem estava no 1º grupo (veio ' + ordemTransicao[0] + ')');
ok(ordemTransicao.indexOf('a2') < ordemTransicao.indexOf('a1'),
  'dentro do grupo, o de mais sets vencidos sobe antes');
ok(ordemTransicao.indexOf('b2') < ordemTransicao.indexOf('b1'),
  'dentro do grupo, o de mais tie-breaks sobe antes');

console.log('──── 3. varredura: a cadeia não voltou a ser duplicada ────');
const fs = require('fs'), path = require('path');
const bl = fs.readFileSync(path.join(__dirname, '../js/views/bracket-logic.js'), 'utf8');
const pe = fs.readFileSync(path.join(__dirname, '../js/views/phases-engine.js'), 'utf8');
const core = fs.readFileSync(path.join(__dirname, '../js/views/standings-core.js'), 'utf8');
ok(/function standingsCompare\s*\(/.test(core), 'o comparador é definido UMA vez, no standings-core');
ok(/window\._standingsCompare = standingsCompare/.test(core), 'o core publica no window (browser + vendor da CF)');
ok(/module\.exports = \{/.test(core) && /standingsCompare: standingsCompare/.test(core),
  'e exporta pra Node (require) — era o elo que faltava');
ok(!/window\._standingsCompare = function/.test(bl), 'bracket-logic não define mais a cadeia (só consome)');
ok(/_standingsCompare\(a, b, _adv\)/.test(bl), 'a TABELA usa o comparador');
ok(/window\._standingsCompare\b/.test(pe), 'a TRANSIÇÃO usa o mesmo comparador');
// a cadeia curta antiga não pode voltar
const corpoGlobal = (pe.match(/function _globalStandings[\s\S]*?\n  \}/) || [''])[0];
ok(!/d = \(\(\(b\.setsWon/.test(corpoGlobal), 'a cadeia curta própria saiu do _globalStandings');
ok(/cmp\(a, b, false\)/.test(corpoGlobal), '_globalStandings ordena pelo comparador canônico');
// e, sem o comparador, ele NÃO inventa uma segunda regra
ok(/ordem de classificação preservada como veio/.test(corpoGlobal),
  'sem o comparador, preserva a ordem e avisa — nunca desempata por conta própria');

console.log('');
if (fail) { console.log('❌ classificacao-uma-regra-so: ' + pass + ' ok, ' + fail + ' falha(s)'); fails.forEach(function (f) { console.log('   • ' + f); }); process.exit(1); }
console.log('✅ classificacao-uma-regra-so: ' + pass + ' asserções, 0 falha(s)');
