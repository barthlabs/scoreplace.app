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
  'NENHUM dos dois tem data → o critério é neutro e a decisão passa adiante');
// ⚠️ REGRA DO DONO (14/ago/2026): "por idade, se um não tiver a idade no perfil, beneficia
// quem tem a idade no perfil contra quem omitiu (por antiguidade e por juventude)". Vale
// nos DOIS sentidos — não é "o mais velho ganha" nem "o mais novo ganha": é QUEM PREENCHEU
// ganha de quem omitiu.
var soV = { uV: birth.uV };            // só V tem data
var soN = { uN: birth.uN };            // só N tem data
ok(C.standingsCompareConfig(V, N, { tiebreakers: ['antiguidade'], birth: soV }) < 0,
  'antiguidade: só V preencheu → V passa na frente');
ok(C.standingsCompareConfig(V, N, { tiebreakers: ['antiguidade'], birth: soN }) > 0,
  'antiguidade: só N preencheu → N passa na frente');
ok(C.standingsCompareConfig(V, N, { tiebreakers: ['juventude'], birth: soV }) < 0,
  'juventude TAMBÉM beneficia quem preencheu (V), mesmo sendo o mais velho');
ok(C.standingsCompareConfig(V, N, { tiebreakers: ['juventude'], birth: soN }) > 0,
  'juventude: só N preencheu → N passa na frente');

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
// ⚠️ ASSERÇÕES INVERTIDAS DE PROPÓSITO (1.8.62): elas exigiam que buchholz e
// sonneborn-berger fossem reportados como SEM DADO no Rei/Rainha — o que era verdade
// enquanto a tabela não os calculava. Agora calcula (mesma fórmula do _groupTeamStandings:
// buchholz soma os pontos de todos os adversários; SB só os dos vencidos), então o correto
// é o oposto: eles são APLICÁVEIS. O invariante que a asserção defendia — "critério sem
// dado é neutro, nunca chute" — segue travado logo abaixo, com um campo que de fato falta.
ok(exp.aplicaveis.indexOf('buchholz') !== -1, 'buchholz agora É aplicável no Rei/Rainha (a tabela passou a calcular)');
ok(exp.aplicaveis.indexOf('sonneborn_berger') !== -1, 'sonneborn-berger idem');
ok(linhas.every(function (l) { return typeof l.buchholz === 'number' && typeof l.sonnebornBerger === 'number'; }),
  'toda linha do Rei/Rainha carrega buchholz e sonneborn-berger');
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

console.log('──── 8. a FASE DE GRUPOS desempata por UID (era o último lugar por nome) ────');
// Ordem do dono: "tudo por uid sempre, inclusive confronto direto". O confronto direto do
// _groupTeamStandings era chaveado por NOME (`a.name+'|||'+b.name`) — o último do app.
(function () {
  var E2 = null;
  try { E2 = require('../js/views/phases-engine.js'); } catch (e) {}
  if (!E2 || typeof E2.groupTeamStandings !== 'function') { ok(false, '(8) groupTeamStandings não exportado'); return; }
  var pe = fs.readFileSync(path.join(__dirname, '../js/views/phases-engine.js'), 'utf8');
  var corpo = (pe.match(/function _groupTeamStandings[\s\S]*?\n  \}/) || [''])[0];
  ok(!/h2h\[a\.name \+ '\|\|\|' \+ b\.name\]/.test(corpo),
    '(8) o confronto direto por NOME saiu do grupo');
  ok(/_standingsCompareConfig|standingsCompareConfig/.test(corpo),
    '(8) o grupo usa o comparador único (não um switch próprio)');
  ok(/_slotUids/.test(corpo), '(8) o confronto direto sai dos uids do slot');
  ok(/uid: null/.test(corpo) || /smap\[nm\]\.uid/.test(corpo),
    '(8) a linha do grupo carrega uid');
  // comportamento: duas pessoas, uma venceu a outra
  var g = {
    players: [{ displayName: 'Um', uid: 'u1' }, { displayName: 'Dois', uid: 'u2' }],
    matches: [{ id: 'x1', p1: 'Um', p2: 'Dois', team1Uids: ['u1'], team2Uids: ['u2'],
      scoreP1: 6, scoreP2: 4, winner: 'Um' }]
  };
  var linhas2 = E2.groupTeamStandings(g, { tiebreakers: ['confronto_direto', 'sorteio'] });
  ok(linhas2.length === 2, '(8) a tabela do grupo tem as 2 pessoas');
  ok(linhas2.every(function (l) { return !!l.uid; }), '(8) as linhas carregam uid');
  ok(linhas2[0].name === 'Um', '(8) quem venceu o confronto direto fica na frente');
})();

console.log('──── 9. SORTEIO = ORDEM DA CHAVE (não número aleatório) ────');
// Regra do dono (14/ago/2026): "a questão do sorteio já definimos: deve ser de acordo com a
// ORDEM DA CHAVE… o que aparece em jogos anteriores é considerado como sorteado primeiro,
// apesar de não ser. A aparência aqui é mais importante, para transparência e para evitar
// questionamentos: se o primeiro sorteado vai para o último jogo, ninguém entenderia que
// ele é o primeiro sorteado — está na última posição, então é isso que conta."
(function () {
  var jogos = [
    { id: 'j1', round: 1, gameNumber: 1, team1Uids: ['uZ'], team2Uids: ['uA'] },
    { id: 'j2', round: 1, gameNumber: 2, team1Uids: ['uB'], team2Uids: ['uC'] },
    { id: 'j3', round: 2, gameNumber: 3, team1Uids: ['uD'], team2Uids: ['uE'] }
  ];
  var ord = C.buildOrdemChave(jogos, function (m, lado) { return lado === 'p1' ? m.team1Uids : m.team2Uids; });
  ok(ord.uZ === 0 && ord.uA === 1, '(9) o 1º jogo dá as duas primeiras posições');
  ok(ord.uD > ord.uB, '(9) rodada posterior vem depois');
  var L = function (u) { return { name: u, uid: u, wins: 1, played: 2, pointsFor: 10, pointsAgainst: 10,
    setsWon: 1, setsLost: 1, gamesWon: 10, gamesLost: 10, tiebreaksWon: 0, tiebreaksLost: 0, winRate: 0.5 }; };
  ok(C.standingsCompareConfig(L('uZ'), L('uB'), { tiebreakers: ['sorteio'], ordem: ord }) < 0,
    '(9) quem está no jogo MAIS CEDO fica na frente');
  ok(C.standingsCompareConfig(L('uD'), L('uA'), { tiebreakers: ['sorteio'], ordem: ord }) > 0,
    '(9) quem está no jogo mais tarde fica atrás');
  ok(C.standingsCompareConfig(L('uZ'), L('uForaDaChave'), { tiebreakers: ['sorteio'], ordem: ord }) < 0,
    '(9) quem não aparece na chave vai pro fim');
  // ESTÁVEL: o mesmo dado dá sempre a mesma ordem (era Math.random no comparador)
  var iguais = 0;
  for (var i = 0; i < 100; i++) {
    if (C.standingsCompareConfig(L('uZ'), L('uB'), { tiebreakers: ['sorteio'], ordem: ord }) < 0) iguais++;
  }
  ok(iguais === 100, '(9) 100 execuções, mesmo resultado — a classificação não dança mais entre renders');
  ok(C.standingsCompareConfig(L('uZ'), L('uB'), { tiebreakers: ['sorteio'] }) === 0,
    '(9) SEM o mapa de ordem o critério é neutro — nunca volta a sortear na hora');
  // e o Math.random saiu do comparador de Pontos Corridos
  // varre o arquivo INTEIRO, ignorando linhas de comentário (o próprio comentário que
  // documenta a remoção cita `Math.random`, e um teste que se pega no comentário é ruído)
  var bl2 = fs.readFileSync(path.join(__dirname, '../js/views/bracket-logic.js'), 'utf8');
  var vivas = bl2.split('\n').filter(function (l) {
    var t = l.trim();
    return t.indexOf('//') !== 0 && t.indexOf('*') !== 0 && /Math\.random/.test(l);
  });
  // o que PODE sobrar é embaralhamento de sorteio de verdade (shuffle), nunca comparador
  var emComparador = vivas.filter(function (l) { return /- 0\.5|return Math\.random/.test(l); });
  ok(emComparador.length === 0,
    '(9) nenhum Math.random em COMPARADOR (restaram ' + emComparador.length + ': ' + emComparador.join(' | ').slice(0, 120) + ')');
  ok(vivas.length > 0, '(9) o shuffle de sorteio de verdade continua existindo (não removi o que era legítimo)');
})();

console.log('──── 10. ENTRE OS QUE CAÍRAM NA MESMA FASE, valem os critérios ────');
// Regra do dono: "o desempate pelos critérios se aplica ao definir quem fica na frente
// quando tem os mesmos pontos; entre os que caíram na mesma fase com performance igual etc."
(function () {
  var bl3 = fs.readFileSync(path.join(__dirname, '../js/views/bracket-logic.js'), 'utf8');
  var corpo = (bl3.match(/function _updateProgressiveClassification[\s\S]*?\n}/) || [''])[0];
  ok(/_standingsCompareConfig/.test(corpo),
    '(10) a ordem entre eliminados da mesma fase passa pelo comparador do organizador');
  ok(/_standingsOrdemChave/.test(corpo),
    '(10) e o sorteio ali também é a ordem da chave');
  ok(/localeCompare/.test(corpo),
    '(10) a cadeia histórica (terminando em alfabético) fica como fallback pra quem não configurou');
})();

console.log('──── 11. SALDO DE PONTOS DE TIE-BREAK (pedido do dono, 27/ago/2026) ────');
// _"se o saldo é o critério de pontuação, um critério a ser considerado antes do sorteio
//  seria saldo de tie-break DISPUTADO (que hoje não é considerado), apenas o saldo de games"_
(function () {
  // Os dois empatam em TUDO — inclusive em quantos tie-breaks venceram (1 a 0 para cada um).
  // Só os PONTOS dentro do tie-break separam: P venceu por 7-1, Q venceu por 7-5.
  var P = linha('P', 'uP', { tiebreaksWon: 1, tiebreaksLost: 0, tbPointsWon: 7, tbPointsLost: 1 });
  var Q = linha('Q', 'uQ', { tiebreaksWon: 1, tiebreaksLost: 0, tbPointsWon: 7, tbPointsLost: 5 });
  ok(C.standingsCompareConfig(P, Q, { tiebreakers: ['saldo_games', 'tiebreaks_vencidos'] }) === 0,
    '(11) sem o critério novo, saldo de games e tie-breaks vencidos NÃO separam os dois');
  // E na cadeia padrão ele decide ANTES de games vencidos — é a posição que o dono pediu.
  var P2 = linha('P2', 'uP2', { gamesWon: 10, gamesLost: 8, tbPointsWon: 7, tbPointsLost: 1 });
  var Q2 = linha('Q2', 'uQ2', { gamesWon: 12, gamesLost: 10, tbPointsWon: 7, tbPointsLost: 5 });
  ok(C.standingsCompare(P2, Q2) < 0,
    '(11) saldo de games igual (+2): o tie-break decide ANTES de games vencidos (12 > 10)');
  ok(C.standingsCompareConfig(P, Q, { tiebreakers: ['saldo_pontos_tiebreak'] }) < 0,
    '(11) com saldo de pontos de tie-break, P (7-1) passa na frente de Q (7-5)');
  ok(C.standingsCompare(P, Q) < 0,
    '(11) a cadeia PADRÃO também aplica o critério (P na frente)');

  // Quem PERDEU por menos fica na frente de quem perdeu por mais — é a mesma régua do saldo.
  var R = linha('R', 'uR', { tiebreaksWon: 0, tiebreaksLost: 1, tbPointsWon: 6, tbPointsLost: 8 });
  var S = linha('S', 'uS', { tiebreaksWon: 0, tiebreaksLost: 1, tbPointsWon: 2, tbPointsLost: 7 });
  ok(C.standingsCompareConfig(R, S, { tiebreakers: ['saldo_pontos_tiebreak'] }) < 0,
    '(11) perdendo 6-8 (saldo -2) fica na frente de quem perdeu 2-7 (saldo -5)');

  // SEM TIE-BREAK NO TORNEIO o critério é NEUTRO — nunca chuta.
  var T1 = linha('T1', 'uT1'), T2 = linha('T2', 'uT2');
  ok(C.standingsCompareConfig(T1, T2, { tiebreakers: ['saldo_pontos_tiebreak'] }) === 0,
    '(11) sem tie-break disputado, o critério não decide nada');
  var expl = C.explainTiebreakers([T1], { tiebreakers: ['saldo_pontos_tiebreak'] });
  ok(expl.semDado.indexOf('saldo_pontos_tiebreak') !== -1,
    '(11) e a tabela DIZ que o critério ficou sem dado, em vez de fingir que aplicou');

  // O LEITOR ÚNICO aceita as duas formas gravadas na base.
  var doc = C.tiebreakPointsOfMatch({ sets: [{ gamesP1: 7, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 4 } }] });
  ok(doc.p1 === 7 && doc.p2 === 4, '(11) lê a forma do doc do torneio {pointsP1,pointsP2}');
  var dois = C.tiebreakPointsOfMatch({ sets: [
    { gamesP1: 7, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 4 } },
    { gamesP1: 6, gamesP2: 7, tiebreak: { pointsP1: 5, pointsP2: 7 } }
  ] });
  ok(dois.p1 === 12 && dois.p2 === 11, '(11) soma os tie-breaks de TODOS os sets do jogo');
  var vazio = C.tiebreakPointsOfMatch({ sets: [{ gamesP1: 6, gamesP2: 2 }] });
  ok(vazio.p1 === 0 && vazio.p2 === 0, '(11) set sem tie-break não inventa ponto nenhum');

  // ⚠️ O CRITÉRIO PRECISA ESTAR NA CADEIA PADRÃO — senão ele existe e ninguém o chama.
  var bl4 = fs.readFileSync(path.join(__dirname, '../js/views/bracket-logic.js'), 'utf8');
  // Só as cadeias de torneio POR SETS: onde não há set não há tie-break, e o critério
  // seria peso morto. Elas se reconhecem por já carregarem `saldo_games`.
  var cadeias = (bl4.match(/\['confronto_direto'[^\]]*\]/g) || [])
    .filter(function (c) { return c.indexOf('saldo_games') !== -1; });
  ok(cadeias.length >= 3 && cadeias.every(function (c) { return c.indexOf('saldo_pontos_tiebreak') !== -1; }),
    '(11) toda cadeia padrão por sets inclui o critério (' + cadeias.length + ' cadeias)');
  ok(cadeias.every(function (c) { return c.indexOf('saldo_pontos_tiebreak') < c.indexOf('sorteio'); }),
    '(11) e ele entra ANTES do sorteio, como o dono pediu');
  // Ordem do dono (27/ago/2026): _"o saldo de tie-break conta dentro do saldo de games, como
  // pontos que não eram computados e agora são. depois do saldo de games, considere o saldo
  // de tie-break"_ — LOGO depois, sem nada entre os dois.
  ok(cadeias.every(function (c) {
    var partes = c.replace(/[\[\]']/g, '').split(', ');
    return partes.indexOf('saldo_pontos_tiebreak') === partes.indexOf('saldo_games') + 1;
  }), '(11) e vem LOGO depois do saldo de games, sem critério entre os dois');
})();

console.log('');
if (fail) { console.log('❌ desempate-do-organizador-vale: ' + pass + ' ok, ' + fail + ' falha(s)'); fails.forEach(function (f) { console.log('   • ' + f); }); process.exit(1); }
console.log('✅ desempate-do-organizador-vale: ' + pass + ' asserções, 0 falha(s)');
