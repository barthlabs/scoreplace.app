/* O DESEMPATE É O QUE O ORGANIZADOR CONFIGUROU — node tests/desempate-do-organizador-vale.test.js
 *
 * ORDEM DO DONO (14/ago/2026): "os critérios de desempate devem sempre ser aplicados como
 * quer que tenha configurado o organizador. em todo o torneio. em todos os torneios. em
 * qualquer fase. ele pode tirar critérios e essas passam a não valer; pode colocar um
 * critério no lugar de outro; pode mudar a ordem de aplicação e isso tudo deve sempre ser
 * observado. o que configurou o organizador e o que aparece deve ser considerado no motor."
 *
 * MEDIDO ANTES: das quatro funções que respondem "quem está na frente", duas honravam
 * `t.tiebreakers` (Liga/Suíço e Fase de Grupos) e DUAS NÃO — a tabela do Rei/Rainha e a
 * ordem de quem sobe de fase, ambas com cadeia fixa no código. O Confra configura
 * `pontos_avancados → confronto_direto → saldo_pontos → vitorias → buchholz →
 * sonneborn_berger → antiguidade → sorteio` (com `juventude` REMOVIDO) e nada disso era
 * aplicado na fase dele.
 *
 * ⚠️ E UM BUG ANTIGO ACHADO NO CAMINHO: `antiguidade`/`juventude` NUNCA funcionaram, em fase
 * nenhuma. O parser de nascimento só aceitava `dd/mm/aaaa` (`String(bd).split('/')`), e o
 * perfil grava ISO (`_displayDateToIso`, auth.js) — então a data virava null e o critério
 * era neutro. Não era regra desligada: era data que não era lida.
 */
const H = require('./render-harness');
const W = H.sandbox;
const C = require('../js/views/standings-core.js');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function linha(nome, uid, o) {
  return Object.assign({
    name: nome, uid: uid, wins: 1, losses: 1, played: 2,
    setsWon: 1, setsLost: 1, gamesWon: 12, gamesLost: 12,
    tiebreaksWon: 0, tiebreaksLost: 0, pointsFor: 12, pointsAgainst: 12, winRate: 0.5
  }, o || {});
}

console.log('──── 1. TIRAR um critério faz ele deixar de valer ────');
// A tem mais vitórias; B tem melhor saldo de pontos.
var A = linha('A', 'uA', { wins: 3, pointsFor: 10, pointsAgainst: 14 });
var B = linha('B', 'uB', { wins: 1, pointsFor: 20, pointsAgainst: 10 });
ok(C.standingsCompareConfig(A, B, { tiebreakers: ['vitorias', 'saldo_pontos'] }) < 0,
  'com `vitorias` primeiro, A (mais vitórias) vem na frente');
ok(C.standingsCompareConfig(A, B, { tiebreakers: ['saldo_pontos', 'vitorias'] }) > 0,
  'INVERTENDO A ORDEM, B (melhor saldo) passa na frente — a ordem configurada manda');
ok(C.standingsCompareConfig(A, B, { tiebreakers: ['saldo_pontos'] }) > 0,
  'TIRANDO `vitorias` da lista, ela deixa de valer');
ok(C.standingsCompareConfig(A, B, { tiebreakers: ['vitorias'] }) < 0,
  'TIRANDO `saldo_pontos`, ele deixa de valer');

console.log('──── 2. TROCAR um critério por outro ────');
// empatam em tudo menos games e tie-breaks
var X = linha('X', 'uX', { gamesWon: 20, gamesLost: 10, tiebreaksWon: 0 });
var Y = linha('Y', 'uY', { gamesWon: 10, gamesLost: 8, tiebreaksWon: 5 });
ok(C.standingsCompareConfig(X, Y, { tiebreakers: ['saldo_games'] }) < 0, 'por saldo de games, X na frente');
ok(C.standingsCompareConfig(X, Y, { tiebreakers: ['tiebreaks_vencidos'] }) > 0,
  'trocando para tie-breaks vencidos, Y na frente');

console.log('──── 3. CONFRONTO DIRETO sai dos jogos e casa por UID ────');
// C venceu D, mas D tem melhor saldo. Com confronto direto primeiro, C sobe.
var Cc = linha('C', 'uC', { pointsFor: 10, pointsAgainst: 12 });
var Dd = linha('D', 'uD', { pointsFor: 14, pointsAgainst: 10 });
var jogos = [{
  id: 'j1', p1: 'C', p2: 'D', team1: ['C'], team1Uids: ['uC'], team2: ['D'], team2Uids: ['uD'],
  winner: 'C'
}];
var h2h = C.buildH2H(jogos, function (m, lado) {
  return lado === 'p1' ? (m.team1Uids || []) : (m.team2Uids || []);
});
ok(h2h['uC|||uD'] === 1, 'o mapa de confronto é chaveado por UID (veio ' + JSON.stringify(h2h) + ')');
ok(C.standingsCompareConfig(Cc, Dd, { tiebreakers: ['confronto_direto', 'saldo_pontos'], h2h: h2h }) < 0,
  'confronto direto primeiro → C (venceu D) na frente, mesmo com saldo pior');
ok(C.standingsCompareConfig(Cc, Dd, { tiebreakers: ['saldo_pontos', 'confronto_direto'] }) > 0,
  'saldo primeiro → D na frente; a ordem é obedecida');

console.log('──── 4. ANTIGUIDADE volta a funcionar (o parser lia só dd/mm/aaaa) ────');
ok(W._tbParseBirth('1980-05-10') != null, 'ISO (aaaa-mm-dd) é lido — era null, e o perfil grava assim');
ok(W._tbParseBirth('10/05/1980') != null, 'dd/mm/aaaa continua sendo lido (dado legado)');
var V = linha('V', 'uV'), N = linha('N', 'uN');
var birth = { uV: W._tbParseBirth('1970-01-01'), uN: W._tbParseBirth('2000-01-01') };
ok(C.standingsCompareConfig(V, N, { tiebreakers: ['antiguidade'], birth: birth }) < 0,
  'antiguidade → o mais VELHO vem antes');
ok(C.standingsCompareConfig(V, N, { tiebreakers: ['juventude'], birth: birth }) > 0,
  'juventude → o mais NOVO vem antes');
ok(C.standingsCompareConfig(V, N, { tiebreakers: ['antiguidade'], birth: {} }) === 0,
  'sem data de nascimento, o critério é NEUTRO — nunca chuta');

console.log('──── 5. o Rei/Rainha (a fase do Confra) aplica a configuração ────');
// 4 pessoas, 2 jogos. E venceu F no confronto direto; F tem mais games.
var grupo = {
  name: 'R1 Grupo A', players: ['E', 'F', 'G', 'Hh'], playersUids: ['uE', 'uF', 'uG', 'uH'],
  matches: [
    { id: 'g1', team1: ['E', 'G'], team1Uids: ['uE', 'uG'], team2: ['F', 'Hh'], team2Uids: ['uF', 'uH'],
      p1: 'E / G', p2: 'F / Hh', scoreP1: 6, scoreP2: 5, winner: 'E / G', sets: [{ gamesP1: 6, gamesP2: 5 }] },
    { id: 'g2', team1: ['F', 'G'], team1Uids: ['uF', 'uG'], team2: ['E', 'Hh'], team2Uids: ['uE', 'uH'],
      p1: 'F / G', p2: 'E / Hh', scoreP1: 6, scoreP2: 0, winner: 'F / G', sets: [{ gamesP1: 6, gamesP2: 0 }] }
  ]
};
var semCfg = W._computeMonarchStandings(grupo, {}).map(function (x) { return x.name; });
var comCfg = W._computeMonarchStandings(grupo,
  { tiebreakers: ['confronto_direto', 'saldo_pontos', 'vitorias', 'sorteio'] }).map(function (x) { return x.name; });
ok(semCfg.length === 4 && comCfg.length === 4, 'a tabela tem as 4 pessoas nos dois casos');
// o teste que importa não é a ordem exata (depende do placar), é a fiação: o motor LÊ a config
var chamou = false;
var origem = W._standingsCompareConfig;
W._standingsCompareConfig = function (a, b, opts) { if (opts && opts.tiebreakers) chamou = true; return origem(a, b, opts); };
W._computeMonarchStandings(grupo, { tiebreakers: ['vitorias', 'sorteio'] });
W._standingsCompareConfig = origem;
ok(chamou, 'o Rei/Rainha CHAMA o comparador configurável quando há t.tiebreakers');
var chamou2 = false;
W._standingsCompareConfig = function (a, b, opts) { chamou2 = true; return origem(a, b, opts); };
W._computeMonarchStandings(grupo, {});                      // sem configuração
W._standingsCompareConfig = origem;
ok(!chamou2, 'sem configuração, cai na cadeia padrão — quem nunca mexeu não vê diferença');

console.log('──── 6. o que a tabela NÃO sustenta é declarado, não inventado ────');
var linhas = W._computeMonarchStandings(grupo, {});
var exp = C.explainTiebreakers(linhas, {
  tiebreakers: ['pontos_avancados', 'confronto_direto', 'saldo_pontos', 'vitorias', 'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'],
  h2h: { a: 1 }, birth: {}
});
ok(exp.semDado.indexOf('buchholz') !== -1, 'buchholz é reportado como SEM DADO na tabela do Rei/Rainha');
ok(exp.semDado.indexOf('sonneborn_berger') !== -1, 'sonneborn-berger idem');
ok(exp.semDado.indexOf('antiguidade') !== -1, 'antiguidade sem nascimento carregado idem');
ok(exp.aplicaveis.indexOf('confronto_direto') !== -1, 'confronto direto é aplicável');
ok(exp.aplicaveis.indexOf('vitorias') !== -1, 'vitórias é aplicável');
ok(C.standingsCompareConfig(linha('P', 'uP'), linha('Q', 'uQ'), { tiebreakers: ['buchholz'] }) === 0,
  'critério sem dado devolve 0 (neutro) — nunca desempata por ruído');

console.log('──── 7. varredura: a regra é UMA e mora no core ────');
const fs = require('fs'), path = require('path');
const bl = fs.readFileSync(path.join(__dirname, '../js/views/bracket-logic.js'), 'utf8');
ok(/_standingsCompareConfig\(/.test(bl), 'bracket-logic consome o comparador configurável');
ok(/_spTsData/.test(bl), 'o nascimento passa pelo parser único de data do app');
ok(/map\[p\.uid\] = media/.test(bl), 'o mapa de nascimento indexa por uid (não só por nome)');

console.log('');
if (fail) { console.log('❌ desempate-do-organizador-vale: ' + pass + ' ok, ' + fail + ' falha(s)'); fails.forEach(function (f) { console.log('   • ' + f); }); process.exit(1); }
console.log('✅ desempate-do-organizador-vale: ' + pass + ' asserções, 0 falha(s)');
