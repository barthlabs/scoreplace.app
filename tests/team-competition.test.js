/* TABELA POR TIMES — node tests/team-competition.test.js
 *
 * Duplas jogam por categoria; o time que elas representam agrega os pontos. O teste
 * executa o domínio carregado pela web e pelo sorteio, incluindo o toggle que impede
 * confronto interno e a escala configurável pelo organizador.
 */
'use strict';
const { window: W } = require('./headless.js');
const C = W.ScoreplaceTeamCompetition;
let pass = 0, fail = 0;
function ok(condition, message) { if (condition) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }
function row(rows, id) { return rows.find(function (r) { return r.id === id; }); }

const config = { enabled: true, teamCount: 8, formation: 'draw', internalMatches: 'avoid', scoring: { win: 2, draw: 1, loss: -1 } };
const pairA1 = { competitionTeamId: 'a' }, pairA2 = { competitionTeamId: 'a' }, pairB = { competitionTeamId: 'b' };

ok(C.allowsMatch(pairA1, pairA2, config) === false, 'toggle desligado: duplas do mesmo time não se enfrentam');
ok(C.allowsMatch(pairA1, pairB, config) === true, 'times diferentes continuam podendo se enfrentar');
ok(C.allowsMatch(pairA1, pairA2, Object.assign({}, config, { internalMatches: 'allow' })) === true,
  'toggle ligado: duplas do mesmo time podem se enfrentar');

const named = C.normalize({ enabled: true, teamCount: 3, teamNames: ['Laranja', 'laranja', ''] });
ok(named.teamNames.length === 3 && named.teamNames[0] === 'Laranja' && named.teamNames[1] === 'laranja 2' && named.teamNames[2] === 'Time 3',
  'nomes dos times acompanham a quantidade configurada e não deixam rótulos ambíguos');

const teams = [{ id: 'a', name: 'Time Azul' }, { id: 'b', name: 'Time Branco' }, { id: 'c', name: 'Time Cinza' }];
const rows = C.standings(teams, [
  // Categoria A: Azul vence Branco. Categoria 40+: empate Azul × Cinza.
  { p1: 'A1 / A2', p2: 'B1 / B2', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', winner: 'A1 / A2' },
  { p1: 'A3 / A4', p2: 'C1 / C2', team1Obj: { competitionTeamId: 'a' }, team2Obj: { competitionTeamId: 'c' }, winner: 'draw', draw: true },
  // Folga, pendência e confronto interno nunca somam ponto para a tabela de times.
  { p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', winner: 'A', isBye: true },
  { p1CompetitionTeamId: 'b', p2CompetitionTeamId: 'c' },
  { p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'a', winner: 'A' },
], config);

ok(rows.length === 3, 'os times sem jogo também aparecem na tabela');
ok(row(rows, 'a').points === 3 && row(rows, 'a').wins === 1 && row(rows, 'a').draws === 1,
  'Azul soma vitória e empate de categorias diferentes pela escala do organizador');
ok(row(rows, 'b').points === -1 && row(rows, 'b').losses === 1 && row(rows, 'b').played === 1,
  'Branco recebe a pontuação configurada para derrota');
ok(row(rows, 'c').points === 1 && row(rows, 'c').draws === 1,
  'Cinza recebe o ponto configurado de empate');
ok(rows[0].id === 'a' && rows[1].id === 'c' && rows[2].id === 'b', 'a tabela ordena pela soma dos pontos');

const saldo = C.standings(teams, [
  // O time Branco perde, mas seu saldo de games pode superar outro time: a métrica
  // é o placar acumulado, não uma conversão disfarçada de vitórias em pontos.
  { p1: 'A', p2: 'B', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', winner: 'p1', scoreP1: 6, scoreP2: 1 },
  { p1: 'B', p2: 'C', p1CompetitionTeamId: 'b', p2CompetitionTeamId: 'c', winner: 'p1', sets: [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 6, gamesP2: 2 }] }
], Object.assign({}, config, { ranking: 'games_diff' }));
ok(row(saldo, 'a').gamesDiff === 5 && row(saldo, 'b').gamesWon === 13 && row(saldo, 'b').gamesLost === 12,
  'saldo acumula games do placar simples e de todos os sets');
ok(saldo[0].id === 'a' && saldo[1].id === 'b' && saldo[2].id === 'c',
  'modo saldo ordena por games feitos menos games sofridos');

const partial = C.standings(teams, [
  { p1: 'A', p2: 'B', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', winner: 'fora-do-jogo', scoreP1: 6, scoreP2: 0 }
], Object.assign({}, config, { ranking: 'games_diff' }));
ok(row(partial, 'a').played === 0 && row(partial, 'a').gamesDiff === 0 && row(partial, 'b').gamesDiff === 0,
  'vencedor incompatível não altera pontos nem saldo enquanto o resultado está parcial');

console.log(fail ? '❌ team-competition: ' + fail + ' falharam, ' + pass + ' ok' : '✅ team-competition: ' + pass + ' ok');
process.exit(fail ? 1 : 0);
