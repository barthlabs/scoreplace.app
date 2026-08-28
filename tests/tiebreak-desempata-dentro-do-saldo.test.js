/* O SALDO DE TIE-BREAK É CRITÉRIO SECUNDÁRIO — NUNCA VIRA GAME
 *   node tests/tiebreak-desempata-dentro-do-saldo.test.js
 *
 * ORDEM DO DONO (27/ago/2026), fechando o desenho do critério novo:
 *   _"o saldo de tie-break deve ser usado apenas para desempatar saldos de games empatados.
 *    um critério ali dentro, usado depois do saldo de games. NÃO conta como o game. é
 *    diferente. um critério secundário dentro do saldo."_
 *
 * São DUAS invariantes, e elas se quebram de jeitos diferentes:
 *
 *   1. **Os pontos do tie-break nunca entram no saldo de GAMES.** Um set 7×6 vale 7 e 6
 *      games — os 7-5 pontos do tie-break ficam num campo à parte (`tbPointsWon`/
 *      `tbPointsLost`), nunca somados em `gamesWon`/`gamesLost`. Se um dia alguém "somar
 *      tudo junto", um tie-break apertado passa a valer mais que um 6×0, e o saldo de games
 *      deixa de ser o que o nome diz.
 *
 *   2. **Ele só abre a boca com o saldo de games EMPATADO.** É critério de desempate, não
 *      de mérito: saldo de games diferente decide sozinho, por maior que seja a vantagem do
 *      outro lado no tie-break.
 *
 * Este arquivo trava as duas contra o motor de verdade — a tabela sai de
 * `_computeMonarchStandings`, com um jogo real de 7×6 com tie-break.
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
    tiebreaksWon: 0, tiebreaksLost: 0, tbPointsWon: 0, tbPointsLost: 0,
    pointsFor: 12, pointsAgainst: 12, winRate: 0.5
  }, o || {});
}

console.log('──── o saldo de tie-break desempata DENTRO do saldo de games ────');

console.log('\n1. Saldo de games DIFERENTE: o tie-break não tem voz');
{
  // A tem saldo de games melhor (+4 contra +2). B tem um saldo de tie-break enorme (+7).
  const A = linha('A', 'uA', { gamesWon: 14, gamesLost: 10, tbPointsWon: 0, tbPointsLost: 0 });
  const B = linha('B', 'uB', { gamesWon: 12, gamesLost: 10, tbPointsWon: 7, tbPointsLost: 0 });
  ok(C.standingsCompare(A, B) < 0,
    'cadeia padrão: quem tem melhor saldo de GAMES vence, por maior que seja o tie-break do outro');
  ok(C.standingsCompareConfig(A, B, { tiebreakers: ['saldo_games', 'saldo_pontos_tiebreak'] }) < 0,
    'cadeia configurada: idem — o critério seguinte nem é consultado');
  ok(C.CRITERIOS.saldo_games(A, B) < 0, '  → e é o saldo de games que decidiu (ele não empata aqui)');
}

console.log('\n2. Saldo de games EMPATADO: aí sim o tie-break decide');
{
  // Mesmo saldo (+2), totais de games diferentes de propósito: o critério tem de decidir
  // ANTES de "games vencidos", que é o degrau seguinte da cadeia padrão.
  const P = linha('P', 'uP', { gamesWon: 10, gamesLost: 8, tbPointsWon: 7, tbPointsLost: 1 });
  const Q = linha('Q', 'uQ', { gamesWon: 12, gamesLost: 10, tbPointsWon: 7, tbPointsLost: 5 });
  ok(C.CRITERIOS.saldo_games(P, Q) === 0, 'os dois estão com o mesmo saldo de games (+2)');
  ok(C.standingsCompare(P, Q) < 0, 'P (tie-break 7-1) passa na frente de Q (7-5)');
  ok(C.standingsCompareConfig(P, Q, { tiebreakers: ['saldo_games', 'saldo_pontos_tiebreak'] }) < 0,
    '  → e o mesmo pela cadeia configurada');
}

console.log('\n3. SEM tie-break disputado o critério é NEUTRO (não inventa vantagem)');
{
  const X = linha('X', 'uX'), Y = linha('Y', 'uY');
  ok(C.CRITERIOS.saldo_pontos_tiebreak(X, Y) === 0, 'ninguém jogou tie-break → ninguém sobe nem desce');
}

console.log('\n4. NO MOTOR DE VERDADE: 7×6 com tie-break 7-5 vale 7 GAMES, não 14');
{
  // Um grupo de 2 duplas, um jogo só: 7×6 com o tie-break 7-5 gravado na forma do doc.
  const grupo = {
    name: 'R1 Grupo T',
    players: ['Ana', 'Bia', 'Cida', 'Dora'],
    playersUids: ['uid_ana', 'uid_bia', 'uid_cida', 'uid_dora'],
    matches: [{
      id: 'g1', p1: 'Ana / Bia', p2: 'Cida / Dora',
      team1: ['Ana', 'Bia'], team1Uids: ['uid_ana', 'uid_bia'],
      team2: ['Cida', 'Dora'], team2Uids: ['uid_cida', 'uid_dora'],
      scoreP1: 7, scoreP2: 6, winner: 'Ana / Bia', isMonarch: true,
      sets: [{ gamesP1: 7, gamesP2: 6, tiebreak: { pointsP1: 7, pointsP2: 5 } }]
    }]
  };
  const t = { id: 't1', sport: 'Beach Tennis', scoring: { type: 'sets', gamesPerSet: 6, setsToWin: 1 } };
  W.AppStore.tournaments = [t];
  const tabela = W._computeMonarchStandings(grupo, t) || [];
  const ana = tabela.filter((r) => r.uid === 'uid_ana')[0];
  const cida = tabela.filter((r) => r.uid === 'uid_cida')[0];
  ok(!!ana && !!cida, 'a tabela saiu com as quatro linhas (' + tabela.length + ')');
  if (ana && cida) {
    ok(ana.gamesWon === 7 && ana.gamesLost === 6,
      '⭐ o saldo de GAMES conta 7 e 6 — os pontos do tie-break NÃO entram aqui (veio ' +
        ana.gamesWon + '/' + ana.gamesLost + ')');
    ok(cida.gamesWon === 6 && cida.gamesLost === 7, '  → e do outro lado, 6 e 7');
    ok(ana.tbPointsWon === 7 && ana.tbPointsLost === 5,
      '⭐ os pontos do tie-break moram em campo PRÓPRIO (7-5)');
    ok(cida.tbPointsWon === 5 && cida.tbPointsLost === 7, '  → e o espelho do outro lado (5-7)');
    ok((ana.gamesWon - ana.gamesLost) === 1,
      '  → o saldo de games do 7×6 continua sendo 1, e não 1 + os pontos do tie-break');
  }
}

console.log('');
if (fail) {
  console.log('❌ tiebreak-desempata-dentro-do-saldo: ' + pass + ' ok, ' + fail + ' falha(s)');
  fails.forEach((f) => console.log('   • ' + f));
  process.exit(1);
}
console.log('✅ tiebreak-desempata-dentro-do-saldo: ' + pass + ' asserções, 0 falha(s)');
