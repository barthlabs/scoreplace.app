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
ok(C.allowsMatch(pairA1, pairA2, Object.assign({}, config, {
  internalMatches: 'allow', schedule: { enabled: true, pairsPerTeamByCategory: { 'Fem Light': 2 } }
})) === false, 'duas duplas da mesma equipe na categoria bloqueiam confronto interno mesmo se configuração antiga disser allow');

const empty = C.normalize({ enabled: true });
ok(empty.teamCount === 0 && empty.teamNames.length === 0,
  'competição por times começa vazia até o organizador adicionar cada time');
const named = C.normalize({ enabled: true, teamCount: 3, teamNames: ['Laranja', ''] });
ok(named.teamCount === 2 && named.teamNames[0] === 'Laranja' && named.teamNames[1] === '',
  'a configuração preserva a vaga vazia para a tela exigir nome antes do sorteio');
const legacyNames = C.normalize({ enabled: true, teamCount: 3 });
ok(legacyNames.teamNames.join(',') === 'Time 1,Time 2,Time 3',
  'configuração antiga sem lista de nomes continua legível sem migração destrutiva');
ok(C.normalize({ enabled: true, schedule: { enabled: true } }).classificationUnit === 'team' &&
  C.normalize({ enabled: true, classificationUnit: 'pair' }).classificationUnit === 'pair',
  'documento antigo abre Por time e a escolha explícita Por dupla é preservada');
const neonSchedule = C.normalize({ enabled: true, teamNames: ['Venom', 'Blackout', 'Eclipse', 'Volt', 'Phantom', 'Panic', 'Vortex', 'Blast'], schedule: { enabled: true, teamsPerGroup: 8, gamesPerTeam: 4, mode: 'structured' } });
ok(neonSchedule.schedule.enabled && neonSchedule.schedule.teamsPerGroup === 8 && neonSchedule.schedule.gamesPerTeam === 4 && neonSchedule.schedule.mode === 'structured',
  'grade por times preserva 8 times, 4 jogos por time e o modo estruturado');
ok(C.normalize({ enabled:true, schedule:{ mode:'structured', modeChosen:true } }).schedule.modeChosen === true &&
  C.normalize({ enabled:true, schedule:{ mode:'free', modeChosen:true } }).schedule.modeChosen === true &&
  /if \(field === 'mode'\) \{ tc\.schedule\.mode = value === 'structured' \? 'structured' : 'free'; tc\.schedule\.modeChosen = true; \}/.test(fs.readFileSync('js/views/format2-ui.js', 'utf8')),
  'clique em Livre ou Estruturado persiste escolha pelo normalizador');
const neonFourPairs = C.normalize({ enabled: true, teamNames: ['Venom', 'Blackout', 'Eclipse', 'Volt', 'Phantom', 'Panic', 'Vortex', 'Blast'], schedule: { enabled: true, teamsPerGroup: 8, gamesPerPair: 3, pairsPerTeamByCategory: { 'Fem Light': 2, 'Fem Power': 1, 'Fem Extreme': 1 }, gamesPerPairByCategory: { 'Fem Light': 3, 'Fem Power': 2, 'Fem Extreme': 1 }, mode: 'structured' } });
ok(neonFourPairs.schedule.gamesPerPair === 3 && neonFourPairs.schedule.gamesPerTeam === 3 &&
  neonFourPairs.schedule.pairsPerTeamByCategory['Fem Light'] === 2 &&
  neonFourPairs.schedule.pairsPerTeamByCategory['Fem Power'] === 1 &&
  neonFourPairs.schedule.gamesPerPairByCategory['Fem Light'] === 3 &&
  neonFourPairs.schedule.gamesPerPairByCategory['Fem Power'] === 2,
  'agenda explícita preserva vagas e jogos independentes por categoria');

const phasePlan = { enabled: true, teamNames: ['Venom', 'Blackout'], schedule: { enabled: true, teamsPerGroup: 2, gamesPerTeam: 1, mode: 'structured', modeConfirmed: true } };
const incompleteTopLevel = { enabled: true, teamNames: ['Venom', 'Blackout'] };
const resolvedPlan = C.configurationForTournament({ teamCompetition: incompleteTopLevel, phases: [{ teamCompetition: phasePlan }] });
ok(resolvedPlan === phasePlan,
  'configuração parcial no topo não esconde o modo, a agenda e a confirmação guardados na fase');
ok(C.configurationForTournament({ teamCompetition: incompleteTopLevel }).enabled === true,
  'sem plano completo, a competição ativa ainda é retornada para bloquear sorteio sem escolha explícita');

const teamUi = fs.readFileSync('js/views/format2-ui.js', 'utf8');
ok(teamUi.includes('f2-team-schedule-teams-value') && teamUi.includes('_f2TeamScheduleRefresh(tc)') && teamUi.includes('Rodadas por dupla') && teamUi.includes('_f2TeamScheduleByCategory') && teamUi.includes('gamesPerPairByCategory') && !teamUi.includes('Duplas por time em '),
  'a UI mostra rodadas gerais e personalização opcional sem o input Duplas');
ok(teamUi.includes('oninput="\' + gameHandler + \'"') &&
  teamUi.includes('window._renderPhaseEstimate'),
  'alterar rodadas por categoria atualiza a prévia imediatamente, sem esperar perder o foco');
const createUi = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');
ok(indexHtml.indexOf('js/views/create-tournament.js') < indexHtml.indexOf('js/views/format2-ui.js'),
  'o editor carrega o renderizador da prévia antes dos handlers de agenda');
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

const pairMatches = [
  { p1: 'A-Light', p2: 'B-Light', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', category: 'Light', winner: 'p1', scoreP1: 6, scoreP2: 5 },
  { p1: 'A-Light', p2: 'B-Light', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', category: 'Light', winner: 'p1', scoreP1: 6, scoreP2: 5 },
  { p1: 'A-Power', p2: 'B-Power', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', category: 'Power', winner: 'p2', scoreP1: 0, scoreP2: 6 },
  { p1: 'A-Power', p2: 'B-Power', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', category: 'Power', winner: 'p2', scoreP1: 0, scoreP2: 6 },
  { p1: 'A-Power', p2: 'B-Power', p1CompetitionTeamId: 'a', p2CompetitionTeamId: 'b', category: 'Power', winner: 'p2', scoreP1: 0, scoreP2: 6 },
  { p1: 'A-Light', p2: 'B-Light', category: 'Light', isBye: true, winner: 'p1' },
  { p1: 'A-Power', p2: 'B-Power', category: 'Power' }
];
const fourCfg = { enabled: true, teamNames: ['A','B'], ranking: 'points', scoring: { win: 3, draw: 1, loss: 0 } };
const pairOverall = C.pairStandings([], pairMatches, fourCfg);
const pairLight = C.pairStandings([], pairMatches, fourCfg, 'Light');
const pairPower = C.pairStandings([], pairMatches, fourCfg, 'Power');
ok(pairOverall.length === 4 && row(pairOverall, 'B-Power').points === 9 && row(pairOverall, 'A-Light').points === 6 && pairOverall[0].id === 'B-Power',
  'Geral por dupla soma pontos de jogos reais, sem BYE e pendência');
ok(pairLight.length === 2 && pairLight[0].id === 'A-Light' && pairPower.length === 2 && pairPower[0].id === 'B-Power',
  'Por categoria por dupla filtra jogos antes de classificar');
const teamLight = C.standings(teams, pairMatches.filter(m => m.category === 'Light'), fourCfg);
const teamPower = C.standings(teams, pairMatches.filter(m => m.category === 'Power'), fourCfg);
ok(row(C.standings(teams, pairMatches, fourCfg), 'b').points === 9 && teamLight[0].id === 'a' && teamPower[0].id === 'b',
  'Geral por time agrega categorias e Por categoria por time classifica separadamente');
ok(row(C.pairStandings([], pairMatches, { ...fourCfg, ranking: 'games_diff' }), 'B-Power').gamesDiff === 18,
  'critério Saldo aplica games do mesmo conjunto de jogos');
const homonyms = C.pairStandings([
  { id: 'par-a', name: 'Dupla X', category: 'Light' },
  { id: 'par-b', name: 'Dupla X', category: 'Light' },
  { id: 'par-c', name: 'Dupla sem jogo', category: 'Light' }
], [
  { p1: 'Dupla X', p2: 'Dupla X', team1Obj: { id: 'par-a' }, team2Obj: { id: 'par-b' },
    category: 'Light', winner: 'p1', scoreP1: 6, scoreP2: 3 }
], fourCfg);
ok(homonyms.length === 3 && row(homonyms, 'par-a').points === 3 &&
  row(homonyms, 'par-b').losses === 1 && row(homonyms, 'par-c').played === 0,
  'IDs dos lados distinguem duplas homônimas e elenco sem jogo aparece com zero');

console.log(fail ? '❌ team-competition: ' + fail + ' falharam, ' + pass + ' ok' : '✅ team-competition: ' + pass + ' ok');
process.exit(fail ? 1 : 0);
