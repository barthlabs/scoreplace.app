/* TABELA POR TIMES — node tests/team-competition.test.js
 *
 * Duplas jogam por categoria; o time que elas representam agrega os pontos. O teste
 * executa o domínio carregado pela web e pelo sorteio, incluindo o toggle que impede
 * confronto interno e a escala configurável pelo organizador.
 */
'use strict';
const { window: W } = require('./headless.js');
const fs = require('fs');
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

const empty = C.normalize({ enabled: true });
ok(empty.teamCount === 0 && empty.teamNames.length === 0,
  'competição por times começa vazia até o organizador adicionar cada time');
const named = C.normalize({ enabled: true, teamCount: 3, teamNames: ['Laranja', ''] });
ok(named.teamCount === 2 && named.teamNames[0] === 'Laranja' && named.teamNames[1] === '',
  'a configuração preserva a vaga vazia para a tela exigir nome antes do sorteio');
const legacyNames = C.normalize({ enabled: true, teamCount: 3 });
ok(legacyNames.teamNames.join(',') === 'Time 1,Time 2,Time 3',
  'configuração antiga sem lista de nomes continua legível sem migração destrutiva');
const neonSchedule = C.normalize({ enabled: true, teamNames: ['Venom', 'Blackout', 'Eclipse', 'Volt', 'Phantom', 'Panic', 'Vortex', 'Blast'], schedule: { enabled: true, teamsPerGroup: 8, gamesPerTeam: 4, mode: 'structured' } });
ok(neonSchedule.schedule.enabled && neonSchedule.schedule.teamsPerGroup === 8 && neonSchedule.schedule.gamesPerTeam === 4 && neonSchedule.schedule.mode === 'structured',
  'grade por times preserva 8 times, 4 jogos por time e o modo estruturado');

const teamUi = fs.readFileSync('js/views/format2-ui.js', 'utf8');
ok(teamUi.includes('f2-team-schedule-teams-value') && teamUi.includes('f2-team-schedule-games-value') && teamUi.includes('_f2TeamScheduleRefresh(tc)'),
  'sliders de times atualizam seus números no próprio arraste, sem recriar o range em foco');
const createUi = fs.readFileSync('js/views/create-tournament.js', 'utf8');
ok(!createUi.includes("lines.push(_t('create.gsmPoints'") && !createUi.includes("lines.push(_t('create.gsmNumericPts'"),
  'formato numérico não inventa “pontos para vencer” nem duração a partir de campos técnicos');
ok(createUi.includes('[[regression_phase_estimate_uses_actual_team_schedule]]') && createUi.includes('scheduledMatchesInGroup'),
  'estimativa de capacidade usa a mesma grade parcial por times do motor, sem contar folga');
ok(createUi.includes('[[regression_estimate_reads_team_schedule_without_redundant_enabled_flag]]') &&
  createUi.includes('tc && tc.enabled && tc.schedule ?'),
  'estimativa lê a grade ativa sem depender de um segundo enabled legado que a faria cair na eliminatória');
ok(/window\._f2TeamSchedule[\s\S]{0,1400}window\._recalcDuration/.test(teamUi),
  'cada movimento dos sliders de grade recalcula imediatamente confrontos e duração');
ok(!createUi.includes("counts = [8, 16, 32, 64, 128]") && createUi.includes('Capacidade máxima'),
  'com limite configurado a estimativa mostra apenas a capacidade escolhida, sem escada genérica');

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
