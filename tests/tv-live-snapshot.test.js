const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
let nowMs = Date.now();
class TestDate extends Date { static now() { return nowMs; } }
const parentHandlers = {};
const parentIntervals = [];
const parentActiveIntervals = new Set();
const liveButton = { attributes: {}, style: {}, setAttribute(name, value) { this.attributes[name] = value; } };
const window = { _collectAllMatches: t => t.matches, _tourLogoSrc: t => t.logo,
  _personAvatarHtml: (uid, name) => '<img class="tv-player-photo" src="photo-' + encodeURIComponent(uid || name) + '" alt="">',
  addEventListener(name, fn) { parentHandlers[name] = fn; },
  location: { origin: 'https://scoreplace.app' },
  _tournamentUrl: id => `https://scoreplace.app/#tournaments/${id}`,
  _qrCodeUrl: url => `https://qr.example/?data=${encodeURIComponent(url)}` };
const context = vm.createContext({ window, document: { querySelectorAll: selector => selector === '[data-tv-live-button]' ? [liveButton] : [] }, Date:TestDate, Number, String, Array, Set,
  setInterval: fn => { parentIntervals.push(fn); parentActiveIntervals.add(parentIntervals.length); return parentIntervals.length; },
  clearInterval: id => { parentActiveIntervals.delete(id); } });
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/team-competition.js'), 'utf8'), context);
window.ScoreplaceTeamCompetition = context.ScoreplaceTeamCompetition;
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/match-timing.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/next-match.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/match-day.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/tv-layout-core.js'), 'utf8'), context);
const directBracketSource = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
vm.runInContext(directBracketSource.slice(directBracketSource.indexOf('window._directBracketSlotSource = function'),
  directBracketSource.indexOf('// A mesma vaga pendente', directBracketSource.indexOf('window._directBracketSlotSource = function'))), context);
const dashSource = fs.readFileSync(path.join(root, 'js/views/dashboard.js'), 'utf8');
vm.runInContext(dashSource.slice(dashSource.indexOf('window._dashboardNextMatchCompare = function'), dashSource.indexOf('// A tela só solicita o fecho')), context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8'), context);
window._isNeonTournament = tournament => tournament.id === 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';

const teams = ['VORTEX', 'BLAST', 'ECLIPSE', 'VENOM', 'PANIC', 'PHANTOM', 'VOLT', 'BLACKOUT']
  .map((name, i) => ({ id: `t${i}`, name, hue: i * 42 }));
const match = (id, court, a, b, extra = {}) => ({ id, _gameNum: id, court, category: 'Fem Light', scheduledAt: '2026-10-22T18:00:00Z',
  p1: `${a} 1 / Parceira`, p2: `${b} 1 / Parceira`, p1CompetitionTeamId: teams.find(t => t.name === a).id,
  p2CompetitionTeamId: teams.find(t => t.name === b).id, ...extra });
const t = { id: 'neon-test', name: 'NEON NIGHTMARE', logo: 'logo.png', courtNames: [4, 5, 6, 7, 8, 9].map(n => `Quadra ${n}`),
  competitionTeams: teams, teamCompetition: { enabled: true, aggregation: 'overall', classificationUnit: 'team', ranking: 'games_diff' },
  matches: [
    match(1, 'Quadra 4', 'VORTEX', 'BLAST', { courtCalledAt: '2026-10-22T21:00:00Z' }),
    match(2, 'Quadra 5', 'ECLIPSE', 'VENOM', { courtCalledAt: '2026-10-22T21:02:00Z', startedAt: '2026-10-22T21:03:00Z', scoreP1: 4, scoreP2: 3 }),
    match(3, 'Quadra 6', 'PANIC', 'PHANTOM', { scheduledAt: '2026-10-22T21:00:00Z' }),
    match(4, 'Quadra 4', 'VORTEX', 'VENOM', { winner: 'p1', scoreP1: 6, scoreP2: 3, resultAt: '2026-10-22T20:00:00Z' }),
    match(5, 'Quadra 5', 'BLAST', 'PANIC', { winner: 'p2', scoreP1: 2, scoreP2: 6, resultAt: '2026-10-22T20:30:00Z' }),
    match(6, 'Quadra 6', 'VOLT', 'BLACKOUT', { winner: 'p1', sets: [{ gamesP1: 7, gamesP2: 5 }], resultAt: '2026-10-22T20:20:00Z' }),
    match(7, 'Quadra 7', 'PHANTOM', 'VORTEX', { winner: 'p2', scoreP1: 1, scoreP2: 6, resultAt: '2026-10-22T19:00:00Z' })
  ] };
const snapshot = window._tvLiveBuildSnapshot(t, Date.parse('2026-10-22T21:02:10Z'));
const roundLogo = window._tvLiveBuildSnapshot({ ...t, logoShape:'circle', logoRadius:50 },
  Date.parse('2026-10-22T21:02:10Z'));
assert.equal(roundLogo.logoRadius,'50%','a TV recebe o formato circular cadastrado');
assert.match(window._tvLiveBodyHtml(roundLogo), /class="tv-theme tv-logo-circle" style="--tv-logo-radius:50%/,
  'o cabeçalho da TV usa a máscara circular');
assert.equal(window._tvLiveIsComplete({ ...t, _nJogos: 8 }), false, 'NO AR recusa fotografia com um jogo faltando');
assert.equal(window._tvLiveIsComplete({ ...t, _nJogos: 7 }), true, 'NO AR aceita os sete IDs canônicos completos');
const multiPhaseConfig = { enabled:true, aggregation:'per_category', classificationUnit:'pair' };
const plannedLaterPhase = { enabled:true, aggregation:'overall', classificationUnit:'team',
  schedule:{ enabled:true, modeChosen:true, mode:'structured' } };
const unrelatedMultiPhase = window._tvLiveBuildSnapshot({ ...t, id:'other-tournament',
  teamCompetition:multiPhaseConfig, phases:[{ teamCompetition:multiPhaseConfig }, { teamCompetition:plannedLaterPhase }] });
assert.equal(unrelatedMultiPhase.rankings[0].title, 'Fem Light',
  'torneio multifase comum preserva o escopo por categoria já usado na TV');
const futureOnly = window._tvLiveBuildSnapshot({ ...t, id:'future-only', teamCompetition:null,
  phases:[{ teamCompetition:{ enabled:false } }, { teamCompetition:plannedLaterPhase }] });
assert.equal(futureOnly.rankings.length, 0,
  'regra de time de uma fase futura não cria tabela de times na fase atual');
const neonMultiPhase = window._tvLiveBuildSnapshot({ ...t,
  id:'tour_1790628592058_c342a1e8f5068424887f1702a1633a44',
  name:'NEON NIGHTMARE – THE TOURNAMENT',
  teamCompetition:multiPhaseConfig, phases:[{ teamCompetition:multiPhaseConfig }, { teamCompetition:plannedLaterPhase }] });
assert.equal(neonMultiPhase.rankings[0].title, 'Times',
  'Neon usa a configuração planejada e a classificação geral por time');
assert.equal(snapshot.courts.length, 6);
assert.equal(snapshot.courts[0].number, 1);
assert.equal(snapshot.courts[0].scoreA, '0', 'a chamada mostra o mesmo placar inicial da chave');
assert.equal(snapshot.courts[0].timerStart, Date.parse('2026-10-22T21:00:00Z'));
assert.equal(snapshot.courts[0].latest, false, 'borda dourada fica só na transição mais recente');
assert.equal(snapshot.courts[1].timerStart, Date.parse('2026-10-22T21:02:00Z'));
assert.equal(snapshot.courts[1].latest, true, 'jogo chamado por último é destacado antes de outra transição');
assert.equal(snapshot.courts[1].scoreA, '4');
assert.equal(snapshot.courts[2].number, undefined, 'jogo só agendado não ocupa TV');
window._matchWinnerSide = match => match.winner === 'p1' ? 1 : match.winner === 'p2' ? 2 : 0;
const monarchTv = { ...t, id: 'monarch-tv', courtNames: ['Quadra 1'], teamCompetition: { enabled: false }, matches: [
  match(31, 'Quadra 1', 'VORTEX', 'BLAST', { isMonarch:true, monarchGroup:0, round:1, phaseIndex:0,
    groupName:'Grupo A1', startedAt:'2026-10-22T20:10:28Z', resultAt:'2026-10-22T20:15:00Z', winner:'p1', scoreP1:6, scoreP2:3 }),
  match(32, 'Quadra 1', 'VORTEX', 'VENOM', { isMonarch:true, monarchGroup:0, round:1, phaseIndex:0,
    courtCalledAt:'2026-10-22T21:00:00Z', scoreP1:4, scoreP2:2 }),
  match(33, 'Quadra 1', 'BLAST', 'VENOM', { isMonarch:true, monarchGroup:0, round:1, phaseIndex:0 })
] };
const monarchSnapshot = window._tvLiveBuildSnapshot(monarchTv, Date.parse('2026-10-22T21:03:00Z'));
assert.equal(monarchSnapshot.results[0].seriesPosition, '1 de 3');
assert.equal(monarchSnapshot.results[0].groupName, 'Grupo A1');
assert.equal(monarchSnapshot.results[0].duration, '00:04:32');
const estimatedMonarch = window._tvLiveBuildSnapshot({ ...monarchTv,
  matches:monarchTv.matches.map((game, index) => index === 0 ? { ...game, estimatedDurationMs:25 * 60000 } : game)
}, Date.parse('2026-10-22T21:03:00Z'));
assert.equal(estimatedMonarch.results[0].duration, '≈00:25:00',
  'o resultado mostra a duração rateada da série antiga, não os segundos do lançamento tardio');
assert.deepEqual(monarchSnapshot.courts[0].series.map(game => game.status), ['done', 'active', 'waiting'],
  'TV conserva os três jogos do quarteto na quadra');
assert.equal(monarchSnapshot.courts[0].series[0].scoreA, '6', 'resultado concluído aparece na série');
assert.equal(monarchSnapshot.courts[0].series[0].winnerSide, 1, 'o lado vencedor acompanha o resultado concluído');
assert.equal(monarchSnapshot.courts[0].series[1].scoreA, '4', 'placar atual aparece na série');
assert.equal(monarchSnapshot.courts[0].series[2].scoreA, '', 'jogo ainda não iniciado não inventa placar');
assert.deepEqual(monarchSnapshot.courts[0].series.map(game => !!game.latestUpdate), [false,true,false],
  'borda da última atualização fica no jogo chamado, não na quadra inteira');
const monarchHtml = window._tvLiveBodyHtml(monarchSnapshot);
assert.match(monarchHtml, /\d\d:15 · JOGO 31 \(1 de 3\) · Fem Light · Grupo A1 \(00:04:32\)/,
  'resultado da série mostra horário, posição, categoria, grupo e duração na mesma linha');
assert.match(monarchHtml, /tv-series-game tv-series-active tv-series-latest-update/);
assert.doesNotMatch(monarchHtml, /tv-court-series tv-court-latest/);
assert.deepEqual(window._tvLiveBuildSnapshot({ ...monarchTv, matches:monarchTv.matches.map((m, i) =>
  i === 0 ? { ...m, resultAt:'2026-10-22T21:02:00Z' } : m) }, Date.parse('2026-10-22T21:03:00Z'))
  .courts[0].series.map(game => !!game.latestUpdate), [true,false,false],
  'um placar mais recente transfere a borda para a linha do resultado');
assert.match(monarchHtml, /JOGO 31[\s\S]*JOGO 32[\s\S]*JOGO 33/, 'ordem dos jogos fica explícita na TV');
assert.match(monarchHtml, /tv-series-players/, 'nomes das duas duplas aparecem em cada jogo');
assert.match(monarchHtml, /tv-series-win[\s\S]*tv-series-loss/, 'vencedor e perdedor recebem cores diferentes');
assert.doesNotMatch(monarchHtml, /text-overflow:ellipsis/, 'HTML dos nomes da série não usa corte por reticências');
assert.equal(snapshot.nextGame.number, 3, 'jogo agendado e ainda não chamado aparece como próximo');
window._bracketOperationsSelect = () => null;
assert.equal(window._tvLiveBuildSnapshot(t).nextGame.number, 3,
  'TV preserva seleção anterior se a faixa operacional ainda não estiver completa');
window._bracketOperationsSelect = () => ({ next: t.matches[4] });
assert.equal(window._tvLiveBuildSnapshot(t).nextGame.number, 5,
  'TV respeita a seleção compartilhada quando o adiamento está disponível');
delete window._bracketOperationsSelect;
const queue = { ...t, matches: [
  match(30, 'Quadra 4', 'VORTEX', 'BLAST', { scheduledAt:'2026-10-22T18:00:00Z', courtCalledAt:'2026-10-22T18:01:00Z' }),
  match(29, 'Quadra 5', 'ECLIPSE', 'VENOM', { scheduledAt:'2026-10-22T18:00:00Z', winner:'p1' }),
  match(28, 'Quadra 6', 'PANIC', 'PHANTOM', { scheduledAt:'2026-10-22T18:00:00Z', p2:'TBD' }),
  match(20, 'Quadra 7', 'VOLT', 'BLACKOUT', { scheduledAt:'2026-10-23T18:00:00Z' }),
  match(21, 'Quadra 8', 'VORTEX', 'ECLIPSE', { scheduledAt:'2026-10-23T18:00:00Z' })
] };
assert.equal(window._tvLiveBuildSnapshot(queue).nextGame.number, 20,
  'após retomar o segundo dia, exclui jogo chamado, finalizado e adversário indefinido; desempata por número');
const emptyQueue = { ...queue, matches: queue.matches.slice(0, 3) };
assert.equal(window._tvLiveBuildSnapshot(emptyQueue).nextGame, null, 'sem jogo elegível após recarregar não inventa confronto');
const pendingTie = { ...emptyQueue, phaseTieDecisions: { 0: { 'group-0:1:2': {
  status: 'pending', matches: [{ displayGameNumber: '93A', p1: { name: 'Atleta B' }, p2: { name: 'Atleta C' }, winnerKey: null }]
} } } };
assert.equal(window._tvLiveBuildSnapshot(pendingTie).nextGame.a, 'Atleta B',
  'TV anuncia a simples de desempate mesmo sem jogo na tabela da fase');
assert.equal(window._tvLiveBuildSnapshot(pendingTie).nextGame.number, '93A');
assert.match(window._tvLiveBodyHtml(window._tvLiveBuildSnapshot(pendingTie)), /Desempate da classificatória/);
const calledTie = { ...pendingTie, phaseTieDecisions: { 0: { 'group-0:1:2': {
  status: 'pending', matches: [{ id: 'tie-93A', displayGameNumber: '93A',
    p1: { name: 'Atleta B' }, p2: { name: 'Atleta C' }, winnerKey: null,
    court: 'Quadra 8', courtCalledAt: '2026-10-22T21:00:00Z' }]
} } } };
assert.equal(window._tvLiveBuildSnapshot(calledTie, Date.parse('2026-10-22T21:02:10Z'))
  .courts.find(card => card.name === 'Quadra 8').number, '93A',
  'partida extra chamada aparece na quadra da TV');
window._bracketOperationsSelect = () => ({ next:null, queue:[], waitingForTie:true });
const waitingTieSnapshot = window._tvLiveBuildSnapshot(calledTie, Date.parse('2026-10-22T21:02:10Z'));
assert.equal(waitingTieSnapshot.nextGames.length, 0,
  'TV não antecipa Ouro enquanto a simples chamada aguarda resultado');
assert.match(window._tvLiveBodyHtml(waitingTieSnapshot), /Aguardando a definição do desempate/);
delete window._bracketOperationsSelect;
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/court-occupancy.js'), 'utf8'), context);
const samePlayerQueue = { ...queue, matches: [
  match(19, 'Quadra 4', 'VORTEX', 'BLAST', { p1:'Atleta ativa / Parceira A', p2:'Adversaria A / Adversaria B', team1Uids:['same-uid','pair-a'], courtCalledAt:'2026-10-23T18:00:00Z' }),
  match(20, 'Quadra 5', 'VOLT', 'BLACKOUT', { p1:'Atleta ativa / Parceira B', p2:'Adversaria C / Adversaria D', team1Uids:['same-uid','pair-b'], scheduledAt:'2026-10-23T18:10:00Z' }),
  match(21, 'Quadra 6', 'PANIC', 'PHANTOM', { p1:'Livre A / Livre B', p2:'Livre C / Livre D', scheduledAt:'2026-10-23T18:20:00Z' })
] };
assert.equal(window._tvLiveBuildSnapshot(samePlayerQueue).nextGame.number, 21,
  'TV pula próximo jogo quando uma atleta já disputa outra partida');
assert.match(window._tvLiveBodyHtml(window._tvLiveBuildSnapshot(emptyQueue)), /Próximos jogos ainda não definidos/);
const fourFuture = { ...t, matches: [20, 21, 22, 23, 24].map(n => match(n, 'Quadra 4', 'VORTEX', 'BLAST')) };
const fourSnapshot = window._tvLiveBuildSnapshot(fourFuture);
assert.equal(fourSnapshot.nextGames.map(g => g.number).join(','), '20,21,22,23,24', 'TV anuncia toda a fila na ordem para rolagem automática');
assert.match(window._tvLiveBodyHtml(fourSnapshot), /PRÓXIMOS JOGOS[\s\S]*data-tv-autoscroll="upcoming"[\s\S]*JOGO 20[\s\S]*JOGO 23/);
const camisQueue = { ...t, id:'camis-tv-queue', competitionTeams:[], teamCompetition:{ enabled:false },
  matches:[...Array.from({ length:8 }, (_, i) => ({ id:'diamond-' + i, _gameNum:1 + i * 3,
    category:'Fem Diamante', p1:'Diamante ' + i + ' A', p2:'Diamante ' + i + ' B',
    court:'Quadra ' + (i + 1), courtCalledAt:'2026-10-22T18:00:00Z', scheduledAt:'2026-10-22T18:00:00Z' })),
    ...Array.from({ length:4 }, (_, group) => Array.from({ length:3 }, (_, game) => ({
      id:'gold-' + group + '-' + game, _gameNum:25 + group * 3 + game, category:'Fem Ouro',
      isMonarch:true, monarchGroup:group, round:1, phaseIndex:0,
      p1:'Ouro ' + group + ' A', p2:'Ouro ' + group + ' B', scheduledAt:'2026-10-22T19:40:00Z'
    }))).flat()] };
const camisQueueSnapshot = window._tvLiveBuildSnapshot(camisQueue);
assert.equal(camisQueueSnapshot.nextGames.map(g => g.number).join(','), '25,28,31,34',
  'TV mostra quatro grupos Ouro sem anunciar o segundo jogo antes do primeiro');
const publishedDiamond = { ...camisQueue, id:'camis-published-diamond',
  scheduleWindow:{ interleavedPlan:{ schema:1, editorVersion:2, blocks:[] } },
  phaseCategoryMaterialized:{ 'Fem Diamante':{ at:'2026-11-13T12:39:00Z' } },
  matches:[camisQueue.matches[8], ...[73, 74, 75, 76].map(number => ({
    id:'diamond-elimination-' + number, _gameNum:number, scheduledGameNumber:number,
    category:'Fem Diamante', phaseIndex:1, round:1, court:'Quadra 1',
    p1:'Dupla Diamante A ' + number, p2:'Dupla Diamante B ' + number,
    scheduledAt:'2026-11-13T16:00:00.000Z'
  })), ...[2,2,3,3].map((round,index) => ({ id:'diamond-later-'+index,
    category:'Fem Diamante',phaseIndex:1,round,p1:'TBD',p2:'TBD' }))] };
window._bracketOperationsSelect = tournament => ({ next:tournament.matches[0], queue:[tournament.matches[0]], waitingForTie:false });
const publishedSnapshot = window._tvLiveBuildSnapshot(publishedDiamond);
assert.deepEqual(Array.from(publishedSnapshot.nextGames, game => game.number), [25, 73, 74, 75, 76],
  'TV anuncia as quartas Diamante já definidas enquanto a última chamada Ouro segue na frente');
assert.equal(publishedSnapshot.nextGames[0].stage, 'Classificatória');
assert.equal(publishedSnapshot.nextGames[1].stage, 'Quartas de final');
assert.match(window._tvLiveBodyHtml(publishedSnapshot), /JOGO 73 · <span class="tv-upcoming-category">Fem Diamante<\/span> · <span class="tv-upcoming-stage">Quartas de final<\/span>/);
const goldQuarterPreview = { ...publishedDiamond, id:'camis-ouro-quarters',
  phaseCategoryMaterialized:{ 'Fem Ouro':{ at:'2026-11-13T18:30:00Z' } },
  matches:[publishedDiamond.matches[0],
    { id:'ouro-r1', _gameNum:85, category:'Fem Ouro', phaseIndex:1, round:1,
      p1:'Dupla A', p2:'Dupla B', court:'Quadra 8', courtCalledAt:'2026-11-13T18:30:00Z', scheduledAt:'2026-11-13T18:30:00Z', nextMatchId:'ouro-qf-waiting', nextSlot:'p1' },
    { id:'ouro-qf-called', _gameNum:91, category:'Fem Ouro', phaseIndex:1, round:2,
      p1:'Dupla C', p2:'Dupla D', court:'Quadra 4', courtCalledAt:'2026-11-13T19:00:00Z', scheduledAt:'2026-11-13T19:00:00Z', roundName:'Quartas de final', nextMatchId:'ouro-semi-2', nextSlot:'p1' },
    { id:'ouro-qf-waiting', _gameNum:92, category:'Fem Ouro', phaseIndex:1, round:2,
      p1:'TBD', p2:'TBD', court:'Quadra 6', scheduledAt:'2026-11-13T19:00:00Z', nextMatchId:'ouro-semi-2', nextSlot:'p2' },
    { id:'ouro-semi', _gameNum:93, category:'Fem Ouro', phaseIndex:1, round:3,
      p1:'TBD', p2:'TBD', court:'Quadra 1', scheduledAt:'2026-11-13T20:00:00Z', nextMatchId:'ouro-final', nextSlot:'p1', loserNextMatchId:'ouro-third', loserNextSlot:'p1' },
    { id:'ouro-semi-2', _gameNum:94, category:'Fem Ouro', phaseIndex:1, round:3,
      p1:'TBD', p2:'TBD', court:'Quadra 2', scheduledAt:'2026-11-13T20:00:00Z', nextMatchId:'ouro-final', nextSlot:'p2', loserNextMatchId:'ouro-third', loserNextSlot:'p2' },
    { id:'ouro-final', _gameNum:113, category:'Fem Ouro', phaseIndex:1, round:4,
      p1:'TBD', p2:'TBD', court:'Quadra 1', scheduledAt:'2026-11-13T21:00:00Z' },
    { id:'ouro-third', _gameNum:114, category:'Fem Ouro', phaseIndex:1, round:4,
      isThirdPlace:true, p1:'TBD', p2:'TBD', court:'Quadra 2', scheduledAt:'2026-11-13T21:00:00Z' }] };
const goldQuarterSnapshot = window._tvLiveBuildSnapshot(goldQuarterPreview);
assert.deepEqual(Array.from(goldQuarterSnapshot.nextGames, game => game.number), [25, 92, 93, 94, 113, 114],
  'TV anuncia as quartas restantes e as etapas futuras da Ouro com vagas a definir');
assert.equal(goldQuarterSnapshot.nextGames[1].stage, 'Quartas de final');
assert.equal(goldQuarterSnapshot.nextGames[4].stage, 'Final');
assert.equal(goldQuarterSnapshot.nextGames[5].stage, '3º lugar');
assert.equal(goldQuarterSnapshot.nextGames[1].a, 'Vencedor do jogo 85');
assert.equal(goldQuarterSnapshot.nextGames[3].a, 'Vencedor do jogo 91');
assert.equal(goldQuarterSnapshot.nextGames[3].b, 'Vencedor do jogo 92');
assert.equal(goldQuarterSnapshot.nextGames[4].a, 'Vencedor do jogo 93');
assert.equal(goldQuarterSnapshot.nextGames[5].a, 'Perdedor do jogo 93');
assert.match(window._tvLiveBodyHtml(goldQuarterSnapshot), /JOGO 92[\s\S]*Vencedor do jogo 85/);
delete window._bracketOperationsSelect;
const camisQueueHtml = window._tvLiveBodyHtml(camisQueueSnapshot);
assert.doesNotMatch(camisQueueHtml.split('<section class="tv-courts"')[1].split('</section>')[0], /tv-team-tag|>Time</,
  'quadras Camis não exibem faixa de time sem equipe cadastrada');
assert.match(camisQueueHtml, /tv-player-photo[^>]*>Diamante 3 A<\/span>/,
  'atletas da quadra aparecem com foto ou avatar');
assert.doesNotMatch(camisQueueHtml.split('class="tv-upcoming"')[1].split('</section>')[0], /tv-result-team|>Time</,
  'jogos de duplas não inventam um time');
assert.match(camisQueueHtml, /tv-upcoming-category">Fem Ouro/,
  'categoria aparece com a cor própria no cabeçalho do próximo jogo');
assert.match(camisQueueHtml, /tv-upcoming-group[\s\S]*Grupo A2[\s\S]*JOGO 25[\s\S]*JOGO 26[\s\S]*JOGO 27/,
  'três jogos do mesmo grupo aparecem em um único bloco');
assert.equal((camisQueueHtml.match(/class="tv-upcoming-item tv-upcoming-group(?: tv-upcoming-first)?"/g) || []).length, 4,
  'quatro grupos aparecem em quatro boxes, sem repetir um grupo por jogo');
assert.equal((camisQueueHtml.match(/class="tv-upcoming-item tv-upcoming-group tv-upcoming-first"/g) || []).length, 1,
  'somente o próximo grupo recebe a borda dourada');
assert.equal((camisQueueHtml.match(/Grupo A2 ·/g) || []).length, 1,
  'o primeiro grupo aparece apenas uma vez na lista');
const customLayout = window.ScoreplaceTvLayout.defaults();
customLayout.sections.qr.visible = false;
customLayout.card.score = false;
const customSnapshot = window._tvLiveBuildSnapshot({ ...t, tvLayout: customLayout });
assert.match(window._tvLiveBodyHtml(window._tvLiveBuildSnapshot({ ...t,logoShape:'circle',tvLayout:customLayout })),
  /class="tv-theme tv-logo-circle" style="--tv-logo-radius:50%/,
  'o logo circular também alcança a tela personalizada');
const phaseTwoLayout = window.ScoreplaceTvLayout.defaults(); phaseTwoLayout.background = '#123456';
const phaseScreens = vm.runInContext('JSON.parse(' + JSON.stringify(JSON.stringify([
  { phaseIndex: 0, layout: customLayout }, { phaseIndex: 1, layout: phaseTwoLayout }
])) + ')', context);
assert.equal(window._tvLiveBuildSnapshot({ ...t, currentPhaseIndex: 1, tvLayout: customLayout, tvScreens: phaseScreens }).tvLayout.background, '#123456',
  'TV escolhe automaticamente a tela da fase em andamento');
assert.equal(window._tvLiveBuildSnapshot({ ...t, currentPhaseIndex: 2, tvLayout: customLayout, tvScreens: phaseScreens }).tvLayout.background, customLayout.background,
  'fase sem tela própria mantém a tela base');
assert.equal(window._tvLiveBuildSnapshot({ ...t, currentPhaseIndex: 1, tvLayout: customLayout,
  tvScreens: phaseScreens, tvActiveScreen: 0 }).tvLayout.background, customLayout.background,
  'tela principal explicitamente escolhida continua no ar mesmo após mudar de fase');
assert.equal(window._tvLiveBuildSnapshot({ ...t, currentPhaseIndex: 1,
  tvScreens: phaseScreens, tvActiveScreen: 0 }).tvLayout.background, customLayout.background,
  'escolha explícita da principal funciona mesmo em torneio legado sem tvLayout');
assert.equal(window._tvLiveBuildSnapshot({ ...t, currentPhaseIndex: 0, tvLayout: customLayout,
  tvScreens: phaseScreens, tvActiveScreen: 1 }).tvLayout.background, '#123456',
  'organizador troca para outra tela durante a mesma fase');
const customHtml = window._tvLiveBodyHtml(customSnapshot);
assert.match(customHtml, /tv-custom-board/);
const camisLayout = window.ScoreplaceTvLayout.defaults();
Object.assign(camisLayout.sections.header, {x:0,y:0,w:98.5,h:6.5});
Object.assign(camisLayout.sections.courts, {x:0,y:7,w:67,h:89.5});
Object.assign(camisLayout.sections.upcoming, {x:67,y:52,w:23.5,h:44.5});
Object.assign(camisLayout.sections.results, {x:67,y:7,w:31.5,h:44});
Object.assign(camisLayout.sections.qr, {x:90.5,y:64,w:8,h:32.5});
for (const id of Object.keys(camisLayout.sections)) {
  if (!['header','courts','upcoming','results','qr'].includes(id)) camisLayout.sections[id].visible = false;
}
const camisHtml = window._tvLiveBodyHtml(window._tvLiveBuildSnapshot({ ...t,
  id:'tour_1793804848447_94bfe2282535789667cb35f1080024ee', tvLayout:camisLayout }));
assert.match(camisHtml, /tv-custom-board tv-custom-board-camis/);
assert.match(camisHtml, /tv-custom-header" style="left:0%;top:0%;width:100%;/,
  'cabeçalho CAMIS alcança a borda direita');
assert.match(camisHtml, /tv-custom-courts" style="left:0%;top:[^"]+%;width:[^"]+%;height:[^"]+%"/);
assert.match(camisHtml, /tv-qr-tournament-logo-camis[\s\S]*tv-qr-code[\s\S]*tv-qr-brand/,
  'logo, QR e chamada continuam juntos na coluna CAMIS');
assert.match(customHtml, /tv-custom-qr/, 'QR permanece mesmo se um layout antigo o ocultou');
assert.doesNotMatch(customHtml, /class="tv-score"/);
assert.match(customHtml, /tv-custom-rankings/);
assert.deepEqual(Array.from(window._tvLiveBuildSnapshot({ ...t, combinedCategories:['Fem Diamante','Fem Ouro','Fem Prata'] })
  .brackets, section => section.category).slice(0, 3), ['Fem Diamante','Fem Ouro','Fem Prata'],
  'editor oferece chaves das três categorias antes de publicar eliminatórias');
const finals = [
  match(198, 'Quadra 1', 'VORTEX', 'BLAST', { bracket:'gold', round:3, scoreP1:6, scoreP2:2, winner:'p1' }),
  match(199, 'Quadra 2', 'ECLIPSE', 'VENOM', { bracket:'gold', round:3, isThirdPlace:true, scoreP1:4, scoreP2:6, winner:'p2' }),
  match(200, 'Quadra 3', 'PANIC', 'PHANTOM', { bracket:'silver', round:3, scoreP1:3, scoreP2:6, winner:'p2' }),
  match(201, 'Quadra 4', 'VOLT', 'BLACKOUT', { bracket:'silver', round:3, isThirdPlace:true, scoreP1:5, scoreP2:7, winner:'p2' })
];
const finalsLayout = window.ScoreplaceTvLayout.finalsPreset(window.ScoreplaceTvLayout.defaults(), finals);
const finalsSnapshot = window._tvLiveBuildSnapshot({ ...t, matches:finals, tvLayout:finalsLayout,
  classifFinalDaLinha:{ gold:[{ name:'VORTEX 1 / Parceira', pos:1 }], silver:[{ name:'PHANTOM 1 / Parceira', pos:1 }] } });
assert.equal(finalsSnapshot.selectedMatches.live1.number, 198);
assert.equal(finalsSnapshot.selectedMatches.live4.number, 201);
assert.equal(finalsSnapshot.lineStandings.standing1.rows[0].name, 'VORTEX 1 / Parceira');
assert.deepEqual(Array.from(finalsSnapshot.lineStandings.standing1.rows.slice(0, 4), row => row.pos), [1, 2, 3, 4],
  'final e disputa de terceiro lugar atualizam as quatro primeiras posições');
assert.equal(finalsSnapshot.lineStandings.standing2.rows[0].name, 'PHANTOM 1 / Parceira',
  'a classificação prata usa o resultado da sua própria final');
const pendingFinals = finals.map(game => ({ ...game, winner:null, scoreP1:null, scoreP2:null }));
const pendingStandings = window._tvLiveBuildSnapshot({ ...t, matches:pendingFinals, tvLayout:finalsLayout,
  classifFinalDaLinha:{ gold:[{ name:'VORTEX 1 / Parceira', pos:1 }] } });
assert.equal(pendingStandings.lineStandings.standing1.rows.some(row => row.pos <= 4), false,
  'posição salva antiga não antecipa vencedor de final ainda não encerrada');
const finalOnly = finals.map(game => game.isThirdPlace ? { ...game, winner:null, scoreP1:null, scoreP2:null } : game);
const finalOnlyStandings = window._tvLiveBuildSnapshot({ ...t, matches:finalOnly, tvLayout:finalsLayout });
assert.deepEqual(Array.from(finalOnlyStandings.lineStandings.standing1.rows.filter(row => row.pos <= 4), row => row.pos), [1, 2],
  'primeiro e segundo surgem assim que a final é confirmada, sem esperar o terceiro lugar');
const thirdOnly = finals.map(game => !game.isThirdPlace ? { ...game, winner:null, scoreP1:null, scoreP2:null } : game);
const thirdOnlyStandings = window._tvLiveBuildSnapshot({ ...t, matches:thirdOnly, tvLayout:finalsLayout });
assert.deepEqual(Array.from(thirdOnlyStandings.lineStandings.standing2.rows.filter(row => row.pos <= 4), row => row.pos), [3, 4],
  'terceiro e quarto surgem assim que sua disputa é confirmada, mesmo com a final pendente');
const leagueLayout = window.ScoreplaceTvLayout.defaults();
leagueLayout.sections.standing1.visible = true;
leagueLayout.sections.standing1.source = 'gold';
const leagueStandings = window._tvLiveBuildSnapshot({ ...t, matches:finals, tvLayout:leagueLayout,
  classifFinalDaLinha:{ gold:[{ name:'Líder salvo', pos:1 }, { name:'Quinto salvo', pos:5 }] } });
assert.deepEqual(Array.from(leagueStandings.lineStandings.standing1.rows, row => row.name), ['Líder salvo', 'Quinto salvo'],
  'sem cards de final selecionados, a TV preserva a classificação salva e não inventa pódio');
const finalsHtml = window._tvLiveBodyHtml(finalsSnapshot);
assert.match(finalsHtml, /tv-custom-live1[\s\S]*<section class="tv-focus-card tv-focus-gold"><h2 class="tv-focus-phase">OURO · FINAL<\/h2><div class="tv-focus-match"[^>]*>[\s\S]*JOGO 198/);
assert.match(finalsHtml, /tv-custom-live2[\s\S]*<section class="tv-focus-card tv-focus-gold"><h2 class="tv-focus-phase tv-focus-third">OURO · 3º LUGAR<\/h2><div class="tv-focus-match"[^>]*>[\s\S]*JOGO 199/);
assert.match(finalsHtml, /tv-custom-live3[\s\S]*<section class="tv-focus-card tv-focus-silver"><h2 class="tv-focus-phase">PRATA · FINAL<\/h2>/);
assert.match(finalsHtml, /tv-custom-live4[\s\S]*<section class="tv-focus-card tv-focus-silver"><h2 class="tv-focus-phase tv-focus-third">PRATA · 3º LUGAR<\/h2>/);
assert.doesNotMatch(finalsHtml, /Aplicar W\.O\.|Ao Vivo|Criar grupo dos jogos/, 'TV não exibe comandos de operação');
const setFinals = finals.map((game, index) => index === 0 ? { ...game, winner:'p1',
  sets:[{ gamesP1:6, gamesP2:3 }, { gamesP1:6, gamesP2:4 }] } : game);
const setSnapshot = window._tvLiveBuildSnapshot({ ...t, matches:setFinals,
  scoring:{ type:'sets', setsToWin:2 }, tvLayout:finalsLayout });
assert.equal(setSnapshot.selectedMatches.live1.bestOf, 3);
assert.equal(setSnapshot.selectedMatches.live1.setColumns.length, 2);
const setHtml = window._tvLiveBodyHtml(setSnapshot);
assert.match(setHtml, /MELHOR DE 3/);
assert.match(setHtml, /tv-focus-sets-head/);
assert.match(setHtml, /tv-focus-set tv-focus-set-win">6<\/span>/);
assert.match(setHtml, /tv-focus-set tv-focus-set-loss">3<\/span>/);
assert.match(finalsHtml, /tv-custom-standing2[\s\S]*CLASSIFICAÇÃO · PRATA/);
assert.match(finalsHtml, /tv-focus-standing-gold[\s\S]*data-tv-autoscroll="standing1"/);
assert.match(finalsHtml, /tv-focus-standing-silver[\s\S]*data-tv-autoscroll="standing2"/);
assert.ok(finalsHtml.indexOf('tv-custom-standing2') < finalsHtml.indexOf('tv-custom-qr'), 'QR é pintado por cima das tabelas');
const paletteLayout = window.ScoreplaceTvLayout.defaults();
paletteLayout.sections.logo.visible = true;
window._tournamentCoverBackground = tournament => ({ css: tournament.coverColor });
const paletteSnapshot = window._tvLiveBuildSnapshot({ ...t, coverColor: '#a12345',
  coverGradientColor: '#fedcba', titleColor: '#eeddcc', tvLayout: paletteLayout });
const paletteHtml = window._tvLiveBodyHtml(paletteSnapshot);
assert.match(paletteHtml, /background:#a12345/, 'fundo acompanha a cor escolhida no torneio');
assert.match(paletteHtml, /--tv-primary:#a12345;--tv-secondary:#fedcba;--tv-title:#eeddcc/, 'cores do torneio entram na TV');
assert.match(paletteHtml, /tv-custom-logo.*tv-placed-logo/, 'logo pode ser posicionado independentemente');
assert.equal((paletteHtml.match(/src="logo\.png"/g) || []).length, 2,
  'logo independente permanece na caixa própria e aparece acima do QR');
assert.match(paletteHtml, /tv-custom-qr[\s\S]*tv-qr-has-logo[\s\S]*tv-qr-tournament-logo[\s\S]*tv-qr-code/,
  'a marca do torneio precede o QR na caixa da TV');
assert.match(window._tvLiveBodyHtml(snapshot), /tv-qr-tournament-logo[\s\S]*tv-qr-code/,
  'layout padrão também exibe a marca acima do QR');
const overlayLayout = window.ScoreplaceTvLayout.defaults();
overlayLayout.sections.results.x = 60; overlayLayout.sections.results.w = 39;
overlayLayout.sections.qr.x = 90;
const overlayHtml = window._tvLiveBodyHtml(window._tvLiveBuildSnapshot({ ...t, tvLayout: overlayLayout }));
assert.match(overlayHtml, /tv-results-list" style="padding-right:[1-9][0-9]*%"/,
  'resultados reservam uma faixa legível onde o QR se sobrepõe');
paletteLayout.backgroundMode = 'custom'; paletteLayout.background = '#112233';
assert.match(window._tvLiveBodyHtml(window._tvLiveBuildSnapshot({ ...t, coverColor: '#a12345', tvLayout: paletteLayout })),
  /tv-custom-board" style="background:#112233"/, 'fundo manual sobrepõe a paleta somente quando selecionado');
const upcomingHtml = window._tvLiveBodyHtml(snapshot).split('class="tv-upcoming"')[1].split('</section>')[0];
assert.match(upcomingHtml, /JOGO 3 · <span class="tv-upcoming-category">Fem Light<\/span>/);
assert.match(upcomingHtml, /PANIC 1/);
assert.doesNotMatch(upcomingHtml, /tv-result-side-score|tv-score/, 'próximo jogo não tem placar');
assert.equal(snapshot.results.length, 4, 'histórico acumula resultados para rolagem');
assert.equal(snapshot.results.map(r => r.number).join(','), '5,6,4,7', 'resultado novo entra no topo');
assert.equal(snapshot.resultDay, '2026-10-22');
assert.equal(snapshot.results[0].time, '17:30', 'horário de lançamento usa o fuso do torneio');
assert.equal(snapshot.results[0].id, '5', 'o resultado mais recente conserva a identidade para destaque na TV');
assert.match(window._tvLiveBodyHtml(snapshot), /class="tv-result tv-result-latest" data-result-id="5"/, 'último placar recebe borda dourada');
const nextDayResults = { ...t, matches: [
  match(40, 'Quadra 4', 'PANIC', 'PHANTOM', { resultAt:'2026-10-22T22:00:00Z', winner:'p1' }),
  match(41, 'Quadra 5', 'VOLT', 'BLACKOUT', { scheduledAt:'2026-10-23T21:00:00Z', resultAt:'2026-10-23T21:40:00Z', winner:'p2' })
] };
const daySnapshot = window._tvLiveBuildSnapshot(nextDayResults, Date.parse('2026-10-23T22:00:00Z'));
assert.equal(daySnapshot.resultDay, '2026-10-23');
assert.equal(daySnapshot.results.map(r => r.number).join(','), '41', 'TV mostra só placares do dia operacional');
const beforeFirstScore = { ...nextDayResults, matches: nextDayResults.matches.map(m => m.id === 41
  ? { ...m, winner: null, resultAt: null } : m) };
const waitingSnapshot = window._tvLiveBuildSnapshot(beforeFirstScore, Date.parse('2026-10-23T21:05:00Z'));
assert.equal(waitingSnapshot.resultDay, '2026-10-22', 'resultados de ontem permanecem até o primeiro placar de hoje');
assert.equal(waitingSnapshot.results.map(r => r.number).join(','), '40');
const lateOldScore = { ...nextDayResults, matches: [...nextDayResults.matches,
  match(43, 'Quadra 6', 'ECLIPSE', 'VENOM', { requiredDay:'2026-10-22',
    resultAt:'2026-10-23T22:05:00Z', winner:'p1' })] };
assert.equal(window._tvLiveBuildSnapshot(lateOldScore, Date.parse('2026-10-23T22:10:00Z')).results.map(r => r.number).join(','),
  '41', 'placar tardio de ontem não devolve resultados antigos à TV');
const futureScore = { ...nextDayResults, matches: [...nextDayResults.matches,
  match(44, 'Quadra 7', 'BLAST', 'VOLT', { requiredDay:'2026-10-24', resultAt:'2026-10-23T21:50:00Z', winner:'p1' })] };
assert.equal(window._tvLiveBuildSnapshot(futureScore, Date.parse('2026-10-23T22:00:00Z')).resultDay,
  '2026-10-23', 'jogo concluído com data operacional futura não troca a TV');
const earlySimulation = { ...t, matches: [
  match(46, 'Quadra 1', 'VORTEX', 'BLAST', { requiredDay:'2026-11-13',
    resultAt:'2026-11-12T07:00:00Z', winner:'p1' })
] };
const earlySnapshot = window._tvLiveBuildSnapshot(earlySimulation, Date.parse('2026-11-12T07:05:00Z'));
assert.equal(earlySnapshot.resultDay, '2026-11-13', 'simulação antecipada usa o dia operacional com placar');
assert.equal(earlySnapshot.results.map(r => r.number).join(','), '46', 'placar simulado aparece em Últimos resultados');
const noDay = { ...nextDayResults, matches: [...nextDayResults.matches,
  match(45, 'Quadra 8', 'VORTEX', 'PHANTOM', { scheduledAt:null, resultAt:'2026-10-23T22:02:00Z', winner:'p1' })] };
assert.equal(window._tvLiveBuildSnapshot(noDay, Date.parse('2026-10-23T22:05:00Z')).resultDay,
  '2026-10-23', 'jogo sem dia nem agendamento não define a data da TV');
const noResults = { ...t, matches:t.matches.map(m => ({ ...m, winner:null, resultAt:null, wo:false })) };
assert.equal(window._tvLiveBuildSnapshot(noResults, Date.parse('2026-10-23T22:05:00Z')).results.length,
  0, 'sem placares a lista permanece vazia');
assert.match(window._tvLiveBodyHtml(daySnapshot), /<h2>ÚLTIMOS RESULTADOS<\/h2><div class="tv-results-list"/, 'cabeçalho fica fora da área rolável');
assert.match(window._tvLiveBodyHtml(daySnapshot), /18:40 · JOGO 41/, 'hora local precede número do jogo');
const woWithoutTime = { ...t, matches: [match(42, 'Quadra 4', 'PANIC', 'PHANTOM',
  { wo: true, winner: 'p1', scheduledAt: '2026-10-23T21:00:00Z' })] };
const woSnapshot = window._tvLiveBuildSnapshot(woWithoutTime, Date.parse('2026-10-23T22:00:00Z'));
assert.equal(woSnapshot.results[0].number, 42, 'W.O. sem resultAt não desaparece da TV');
assert.equal(woSnapshot.results[0].time, 'Horário indisponível', 'TV não inventa horário de lançamento legado');
assert.doesNotMatch(window._tvLiveBodyHtml(woSnapshot), /tv-result-latest/, 'W.O. não recebe borda de placar lançado');
const scoredBeforeWo = { ...t, matches: [
  match(46, 'Quadra 4', 'PANIC', 'PHANTOM', { scheduledAt:'2026-10-23T19:00:00Z', scoreP1:6, scoreP2:3, resultAt:'2026-10-23T20:00:00Z', winner:'p1' }),
  match(47, 'Quadra 5', 'BLAST', 'VOLT', { wo:true, winner:'p1', scheduledAt:'2026-10-23T21:00:00Z' })
] };
assert.equal(window._tvLiveBuildSnapshot(scoredBeforeWo, Date.parse('2026-10-23T22:00:00Z')).results[0].number,
  46, 'último placar, não um W.O. posterior, ocupa o topo destacado');
assert.equal(snapshot.results[1].scoreA, '7');
assert.equal(snapshot.rankings.length, 1, 'classificação geral, sem categoria forçada');
assert.equal(snapshot.rankings[0].rows.length, 8);
assert.equal(snapshot.rankings[0].rows[0].name, 'VORTEX');
assert.equal(snapshot.rankings[0].rows[0].gamesDiff, 8);
assert.equal(snapshot.rankings[0].rows[0].gamesWon, 12);
assert.equal(snapshot.rankings[0].rows[0].wins, 2);
assert.equal(snapshot.rankings[0].rows[0].played, 2);
window._isEliminationPhase = (_t, index) => index === 1;
vm.runInContext("window.__bracketLayout=window.ScoreplaceTvLayout.defaults();window.__bracketLayout.bracketBoxes=['Diamante','Ouro','Prata'].map((category,index)=>({category,visible:true,x:index*30,y:10,w:29,h:70}));", context);
const bracketLayout = window.__bracketLayout;
const elimination = { ...t, combinedCategories:['Diamante','Ouro','Prata'], currentPhaseIndex:1,
  phases:[{ kind:'groups' }, { kind:'elimination' }], tvLayout:bracketLayout,
  matches:[
    { id:'d1', phaseIndex:1, category:'Diamante', round:1, p1:'Ana / Bia', p2:'Cris / Dani', winner:'p1', scoreP1:6, scoreP2:3, resultAt:'2026-10-22T20:00:00Z' },
    { id:'d2', phaseIndex:1, category:'Diamante', round:1, p1:'Eva / Fran', p2:'Gabi / Helo', court:'Quadra 4', courtCalledAt:'2026-10-22T21:00:00Z' },
    { id:'d3', phaseIndex:1, category:'Diamante', round:2, p1:'Vencedor d1', p2:'Vencedor d2' },
    { id:'o1', phaseIndex:1, category:'Ouro', round:1, p1:'Iara / Ju', p2:'Katia / Lu' },
    { id:'p1', phaseIndex:1, category:'Prata', round:1, p1:'Mara / Na', p2:'Olga / Pa' }
  ] };
const eliminationSnap = window._tvLiveBuildSnapshot(elimination, Date.parse('2026-10-22T21:01:00Z'));
assert.deepEqual(Array.from(eliminationSnap.brackets, part => part.category), ['Diamante','Ouro','Prata']);
assert.equal(eliminationSnap.brackets[0].activeRound, 1);
assert.equal(eliminationSnap.brackets[0].matches.find(m => m.id === 'd2').inCourt, true);
const eliminationHtml = window._tvLiveBodyHtml(eliminationSnap);
assert.equal((eliminationHtml.match(/<h2>ELIMINATÓRIAS · /g) || []).length, 3, 'um box independente por categoria');
assert.match(eliminationHtml, /tv-bracket-match-in-court/, 'jogo chamado ganha borda verde');
assert.match(eliminationHtml, /data-tv-autoscroll="bracket-Diamante"/, 'chave usa rolagem contínua');
const advancedElimination = { ...elimination, matches:elimination.matches.map(m => m.id === 'd2'
  ? { ...m, winner:'p1', scoreP1:6, scoreP2:4, resultAt:'2026-10-22T21:30:00Z' } : m) };
assert.equal(window._tvLiveBuildSnapshot(advancedElimination, Date.parse('2026-10-22T21:31:00Z')).brackets[0].activeRound,
  2, 'ao encerrar a rodada a categoria avança para a seguinte');
delete window._isEliminationPhase;
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.timing)), { call: 0, warmup: 0, game: 0 });
const phaseBase = Date.parse('2026-10-22T21:00:00Z');
const phaseTournament = { ...t, callTime: 1, warmupTime: 1, gameDuration: 1, matches: [
  match(11, 'Quadra 4', 'VORTEX', 'BLAST', { courtCalledAt: new Date(phaseBase).toISOString() }),
  match(12, 'Quadra 5', 'ECLIPSE', 'VENOM', { courtCalledAt: new Date(phaseBase + 30000).toISOString() })
] };
function highlightedAt(seconds, tournament = phaseTournament) {
  const cards = window._tvLiveBuildSnapshot(tournament, phaseBase + seconds * 1000).courts;
  return cards.filter(card => card.latest).map(card => card.number);
}
assert.deepEqual(highlightedAt(45), [12], 'nova chamada toma a borda dourada');
assert.deepEqual(highlightedAt(61), [11], 'início do aquecimento toma a borda da chamada posterior');
assert.deepEqual(highlightedAt(91), [12], 'aquecimento posterior assume a borda');
assert.deepEqual(highlightedAt(121), [11], 'início do jogo assume a borda');
assert.deepEqual(highlightedAt(151), [12], 'outro jogo entrando em tempo de jogo assume a borda');
assert.deepEqual(highlightedAt(181), [11], 'início do atraso assume a borda');
assert.deepEqual(highlightedAt(211), [12], 'atraso mais recente assume a borda');
assert.deepEqual(highlightedAt(211, { ...phaseTournament, matches: [
  { ...phaseTournament.matches[0], winner: 'p1', resultAt: new Date(phaseBase + 200000).toISOString() },
  phaseTournament.matches[1]
] }), [12], 'resultado tira o jogo encerrado da disputa pela borda');
const timingCore = window.ScoreplaceMatchTiming;
const timing = timingCore.config(phaseTournament);
assert.equal(timingCore.text(timingCore.phaseAt(phaseBase, timing, phaseBase + 45000), phaseBase + 45000), 'Chamado 00:00:45');
assert.equal(timingCore.text(timingCore.phaseAt(phaseBase, timing, phaseBase + 90000), phaseBase + 90000), 'Aquecimento 00:00:30');
assert.equal(timingCore.text(timingCore.phaseAt(phaseBase, timing, phaseBase + 150000), phaseBase + 150000), 'Tempo de jogo 00:00:30');
assert.equal(timingCore.text(timingCore.phaseAt(phaseBase, timing, phaseBase + 210000), phaseBase + 210000), 'Atrasado 00:01:30',
  'a fase atrasada continua a contagem do jogo');
window._slotUidsPositional = (_match, slot) => slot === 'p1' ? ['uid-1', 'uid-2'] : ['uid-3', 'uid-4'];
window._resolveSideLive = (_tour, _raw, uids) => uids.map(uid => ({
  'uid-1': 'Maira Cavalcanti', 'uid-2': 'Juliana Penha',
  'uid-3': 'Flavia Cocozza', 'uid-4': 'Juliana Carneiro'
})[uid]).join(' / ');
const profileSnapshot = window._tvLiveBuildSnapshot({ ...t, matches: [
  match(10, 'Quadra 4', 'PANIC', 'PHANTOM', { courtCalledAt: '2026-10-22T21:00:00Z',
    p1: 'Jogador sem perfil (QLAn) / Jogador sem perfil (MjgO)',
    p2: 'Jogador sem perfil (JrqP) / Jogador sem perfil (hVw1)' })
] });
assert.equal(profileSnapshot.courts[0].a, 'Maira Cavalcanti / Juliana Penha', 'TV usa os nomes vivos dos slots');
assert.equal(profileSnapshot.courts[0].b, 'Flavia Cocozza / Juliana Carneiro');
const finishedSnapshot = window._tvLiveBuildSnapshot({ ...t, matches: [
  match(10, 'Quadra 4', 'PANIC', 'PHANTOM', { courtCalledAt: '2026-10-22T21:00:00Z',
    winner: 'p1', scoreP1: 6, scoreP2: 4, resultAt: '2026-10-22T21:35:00Z' })
] });
assert.equal(finishedSnapshot.courts[0].number, undefined, 'resultado final libera o slot da quadra');
assert.equal(finishedSnapshot.results[0].scoreA, '6', 'resultado final passa aos últimos resultados');
delete window._slotUidsPositional;
delete window._resolveSideLive;
assert.equal(snapshot.qrUrl, 'https://scoreplace.app/open.html', 'sandbox não expõe ID na página pública');
assert.equal(window._tvLiveBuildSnapshot({ ...t, id:'tour_1790628592058_c342a1e8f5068424887f1702a1633a44' }).qrUrl,
  'https://scoreplace.app/open.html?t=tour_1790628592058_c342a1e8f5068424887f1702a1633a44');
const multi = { ...t, matches: [
  match(8, 'Quadra 4', 'VORTEX', 'BLAST', { courtCalledAt: '2026-10-22T21:00:00Z', startedAt: '2026-10-22T21:03:00Z',
    sets: [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 2, gamesP2: 3 }] }),
  match(9, 'Quadra 5', 'ECLIPSE', 'VENOM', { winner: 'p1', resultAt: '2026-10-22T21:30:00Z',
    sets: [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 3, gamesP2: 6 }, { gamesP1: 10, gamesP2: 8 }] })
] };
const multiSnapshot = window._tvLiveBuildSnapshot(multi);
assert.equal(multiSnapshot.courts[0].scoreA, '2', 'placar ao vivo usa set atual');
assert.equal(multiSnapshot.courts[0].scoreB, '3');
assert.equal(multiSnapshot.results[0].scoreA, '6 / 3 / 10', 'resultado mostra todos os sets');
assert.equal(multiSnapshot.results[0].scoreB, '4 / 6 / 8');
let toast = '';
t.matches[0].courtCalledAt = new Date(Date.now() - 15000).toISOString();
t.matches[1].courtCalledAt = new Date(Date.now() - 25000).toISOString();
window._currentBracketTournament = t;
window.open = () => null;
window.showToast = message => { toast = message; };
window._tvLiveToggle();
assert.match(toast, /Permita abrir/, 'popup bloqueado informa o organizador');
const tvRoot = { innerHTML: '' };
let popupHtml = '';
let wakeRequests = 0;
let fullscreenRequests = 0;
const fullscreenHandlers = {};
const fullscreenButton = { hidden:false, textContent:'', title:'' };
const onFullscreen = (name, fn) => (fullscreenHandlers[name] ||= []).push(fn);
const tvTimer = { start:Date.now() - 15000, getAttribute() { return String(this.start); }, textContent:'', className:'', title:'' };
t.callTime = 1;
t.warmupTime = 1;
t.gameDuration = 1;
const fakePopup = { name:'scoreplace-live-tv-neon-test', closed: false, navigator: { wakeLock: { request: type => {
  assert.equal(type, 'screen'); wakeRequests++; return Promise.resolve({ addEventListener() {}, release: () => Promise.resolve() });
} } }, document: {
  open() {}, write(html) { popupHtml = html; }, close() {},
  visibilityState: 'visible', fullscreenElement:null,
  documentElement: { requestFullscreen() { fullscreenRequests++; fakePopup.document.fullscreenElement = this; fullscreenHandlers.fullscreenchange.forEach(fn => fn()); return Promise.resolve(); } },
  addEventListener: onFullscreen,
  getElementById: id => id === 'tv-root' ? tvRoot : id === 'tv-fullscreen-action' ? fullscreenButton : { addEventListener() {} },
  querySelector: () => null,
  querySelectorAll: selector => selector === '[data-tv-start]' ? [tvTimer] : []
}, focus() {}, close() { this.closed = true; } };
let openCalls = 0;
window.open = () => { openCalls++; return fakePopup; };
window._findTournamentById = () => t;
let matchListener, matchUnsubscribed = false;
let liveScoreListener, liveScoreUnsubscribed = false;
window._liveNowSubscribe = (callback, opts) => {
  assert.equal(opts.tournamentId, t.id, 'a TV consulta apenas o torneio aberto');
  liveScoreListener = callback;
  return () => { liveScoreUnsubscribed = true; };
};
window.FirestoreDB = { db: { collection() { return { doc() { return { collection() { return {
  onSnapshot(callback) { matchListener = callback; return () => { matchUnsubscribed = true; }; }
}; } }; } }; } } };
window._tvLiveToggle();
assert.match(tvRoot.innerHTML, /<h1>NEON NIGHTMARE<\/h1><button id="tv-fullscreen-action"[^>]*>⛶ Tela cheia<\/button><time id="tv-now">/,
  'ação de tela cheia fica entre o título e o relógio');
fullscreenHandlers.click[0]({ target:{ closest: () => fullscreenButton } });
assert.equal(fullscreenRequests, 1, 'o clique solicita tela cheia na própria janela');
assert.equal(fullscreenButton.hidden, true, 'o botão some depois que a TV ocupa a tela');
fakePopup.document.fullscreenElement = null;
fullscreenHandlers.fullscreenchange.forEach(fn => fn());
assert.equal(fullscreenButton.hidden, false, 'o botão volta ao sair da tela cheia');
assert.equal(typeof matchListener, 'function', 'a tela assina os jogos canônicos');
const updated = { ...t.matches[2], courtCalledAt: new Date(Date.now() - 5000).toISOString() };
delete updated._gameNum;
matchListener({ docChanges: () => [{ type:'modified', doc: { id:String(updated.id), data: () => ({ jogo:updated }) } }] });
assert.equal(window._tvLiveBuildSnapshot(t).courts[2].number, 3,
  'chamada salva na subcoleção ocupa a quadra mesmo com o torneio em memória desatualizado');
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'abrir a janela ainda não liga NO AR sem confirmação da própria página');
assert.equal(window._tvLiveWindow, null, 'botão renderizado depois da abertura ainda nasce desligado');
assert.equal(wakeRequests, 1, 'NO AR solicita bloqueio de repouso da tela');
assert.match(tvTimer.textContent, /^Chamado 00:00:\d\d$/, 'a chamada aparece como Chamado hh:mm:ss');
assert.equal(tvTimer.className, 'tv-phase-call', 'chamada usa a fase azul');
tvTimer.start = Date.now() - 90000;
window._tvLiveRefresh();
assert.match(tvTimer.textContent, /^Aquecimento 00:00:\d\d$/, 'aquecimento recomeça em zero após a chamada');
assert.equal(tvTimer.className, 'tv-phase-warmup', 'aquecimento usa a fase amarela');
tvTimer.start = Date.now() - 150000;
window._tvLiveRefresh();
assert.match(tvTimer.textContent, /^Tempo de jogo 00:00:\d\d$/, 'o tempo de jogo recomeça após o aquecimento');
assert.equal(tvTimer.className, 'tv-phase-game', 'tempo de jogo usa a fase verde');
tvTimer.start = Date.now() - 210000;
window._tvLiveRefresh();
assert.match(tvTimer.textContent, /^Atrasado 00:01:\d\d$/, 'o atraso preserva a contagem iniciada no tempo de jogo');
assert.equal(tvTimer.className, 'tv-phase-overdue', 'atraso usa a fase vermelha');
assert.match(tvRoot.innerHTML, /ÚLTIMOS RESULTADOS/);
assert.doesNotMatch(tvRoot.innerHTML, /CHAMADO|EM JOGO/);
assert.match(tvRoot.innerHTML, /class="tv-team-tag">VORTEX<\/span><div class="tv-players"><span><img class="tv-player-photo"[^>]*>VORTEX 1<\/span><span><img class="tv-player-photo"[^>]*>Parceira<\/span>/,
  'card da TV mantém etiqueta vertical do time e atletas em linhas, como na chave');
assert.match(tvRoot.innerHTML, /<h2>Quadra 4 · JOGO 1<\/h2><b class="tv-court-phase">[^<]+<\/b><span>Fem Light<\/span>/,
  'quadra e jogo ficam à esquerda, fase no centro e categoria à direita');
assert.match(tvRoot.innerHTML, /class="tv-court-footer"><strong data-tv-start=/,
  'timer aparece sozinho abaixo do confronto');
assert.doesNotMatch(tvRoot.innerHTML, /ÚLTIMOS 3 RESULTADOS/);
assert.match(tvRoot.innerHTML, /<article class="tv-court tv-court-active tv-court-latest">/, 'slot da transição mais recente recebe destaque');
assert.match(popupHtml, /\.tv-result>div\.tv-result-match \.tv-result-left \.tv-result-players span\{text-align:left\}/,
  'os dois nomes à esquerda, inclusive o último, vencem a regra herdada por especificidade');
assert.match(popupHtml, /\.tv-result-right \.tv-result-players span\{text-align:right\}/,
  'os dois nomes à direita continuam alinhados à direita');
assert.match(popupHtml, /\.tv-result>div span:last-child\{text-align:right\}/,
  'a regra herdada da etiqueta vertical direita continua presente');
assert.doesNotMatch(popupHtml, /\.tv-court\.tv-court-active\{border:3px solid #22c55e\}/,
  'TV não destaca toda quadra ocupada em verde');
assert.match(popupHtml, /\.tv-court\.tv-court-latest\{border:3px solid #fbbf24/,
  'TV conserva o destaque dourado da transição mais recente');
assert.match(tvRoot.innerHTML, /tv-result-left.*tv-result-side-score.*tv-result-versus">VS.*tv-result-right/, 'resultados exibem placares dentro dos boxes e VS entre eles');
assert.match(tvRoot.innerHTML, /<span>GAMES<\/span><span class="tv-win">V<\/span><span class="tv-loss">D<\/span><span>J<\/span>/);
assert.match(tvRoot.innerHTML, /class="tv-ranking-team"[^>]*>VORTEX<\/strong><b>\+8<\/b><span>12 - 4<\/span><span class="tv-win">2<\/span><span class="tv-loss">0<\/span><span>2<\/span>/);
assert.doesNotMatch(tvRoot.innerHTML, /<h3>Times<\/h3>/, 'classificação geral usa somente o cabeçalho da tabela');
assert.match(tvRoot.innerHTML, /class="tv-qr-code"[^>]*open\.html/);
assert.match(tvRoot.innerHTML, /<svg class="tv-scoreplace-mark"[^>]*aria-label="Logo Scoreplace"/,
  'o QR da TV inclui o logo dentro do próprio HTML');
const beforeLiveMatches = t.matches, beforeLiveLayout = t.tvLayout, beforeLiveScoring = t.scoring;
t.matches = pendingFinals;
t.tvLayout = finalsLayout;
t.scoring = { type:'sets', setsToWin:2, countingType:'tennis' };
window._formatGamePoint = (points, _other, _tb, cfg) => {
  assert.equal(cfg.countingType, 'tennis', 'a TV usa a regra do placar do jogo');
  return ['0','15','30','40'][points];
};
liveScoreListener([{kind:'tournament', status:'live', tournamentId:t.id, matchId:'198',
  lastActivityAt:nowMs, state:{sets:[{gamesP1:2,gamesP2:1}], currentGameP1:2,
    currentGameP2:1, isTiebreak:false, isFinished:false}}]);
const liveFinal = window._tvLiveBuildSnapshot(t, nowMs).selectedMatches.live1;
assert.equal(liveFinal.setColumns[0].set.gamesP1, 2, 'final lê os games do placar ao vivo');
assert.equal(liveFinal.headline, 'AO VIVO · PONTOS 30 × 15', 'final lê os pontos e a conversão do tênis');
assert.match(tvRoot.innerHTML, /AO VIVO · PONTOS 30 × 15/, 'a janela aberta repinta ao receber um ponto');
liveScoreListener([{kind:'tournament', status:'live', tournamentId:t.id, matchId:'198',
  lastActivityAt:nowMs - 61000, state:{sets:[{gamesP1:2,gamesP2:1}], currentGameP1:2,
    currentGameP2:1, isTiebreak:false, isFinished:false}}]);
assert.doesNotMatch(window._tvLiveBuildSnapshot(t, nowMs).selectedMatches.live1.headline, /AO VIVO/,
  'placar sem sinal recente não aparece como ao vivo');
liveScoreListener([]);
t.matches = beforeLiveMatches; t.tvLayout = beforeLiveLayout; t.scoring = beforeLiveScoring;
delete window._formatGamePoint;
const childSource = popupHtml.match(/<script>\(function\(\)\{"use strict";[\s\S]*?<\/script>/);
assert(childSource, 'NO AR inclui um relógio próprio na janela, independente do intervalo da aba');
const childRoot = { innerHTML: '', querySelector: () => null };
const childWarning = { hidden: true };
const childOwner = { _findTournamentById: () => t, _tvLiveIsComplete: () => true, _tvLiveBuildSnapshot: window._tvLiveBuildSnapshot,
  _tvLiveBodyHtml: window._tvLiveBodyHtml,
  postMessage(data, origin) { parentHandlers.message({ data, origin, source:fakePopup }); } };
const childHandlers = {};
const childWindow = { opener: childOwner, ScoreplaceMatchTiming: timingCore, __tvParentBeat: 0,
  addEventListener(name, fn) { childHandlers[name] = fn; }, requestAnimationFrame() {} };
let childTick, childIntervalClears = 0;
const childDocument = { visibilityState:'visible', addEventListener() {}, getElementById: id => id === 'tv-root' ? childRoot : id === 'tv-connection' ? childWarning : null,
  querySelector: () => null,
  querySelectorAll: () => [] };
vm.runInNewContext(childSource[0].slice(8, -9), { window: childWindow, document: childDocument,
  setInterval: fn => { childTick = fn; return 1; }, clearInterval: () => { childIntervalClears++; }, Date, Number });
assert(childTick && childRoot.innerHTML.includes('CLASSIFICAÇÃO'), 'janela restaura conteúdo sem o timer da aba');
// Exercita o script real da janela com geometria de scroll controlada. Um
// avanço de 1 s inteiro seria visível como salto; 100 quadros devem acumular
// deslocamentos pequenos, inclusive quando scrollTop arredonda no browser.
let frameNow = 1000;
const frames = [];
const scrollListeners = {};
let reducedMotion = false;
let smoothList;
function makeResultNode(list, repeated = false, id = '', at = 0) {
  const classes = new Set();
  if (id) classes.add('tv-result-latest');
  const node = { repeated, cloneNode() { return makeResultNode(list, true, id, at); },
    setAttribute(name) { if (name === 'data-tv-repeat') this.repeated = true; },
    getAttribute(name) { return name === 'data-result-id' ? id : name === 'data-result-at' ? String(at) : null; },
    classList: { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
      remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); } },
    querySelectorAll() { return []; }, removeAttribute() {},
    remove() { list.nodes.splice(list.nodes.indexOf(this), 1); } };
  Object.defineProperty(node, 'offsetTop', { get() { return list.nodes.indexOf(node) * 100; } });
  return node;
}
function makeList(day, count, height = 150, latestId = '', latestAt = 0) {
  const list = { day, clientHeight:height, scrollTop:0, nodes:[],
    getAttribute(name) { return name === 'data-result-day' ? this.day : null; },
    querySelectorAll(selector) { return this.nodes.filter(node => selector === '[data-tv-repeat]' ? node.repeated : !node.repeated); },
    querySelector(selector) { return selector === '[data-tv-repeat]' ? this.nodes.find(node => node.repeated)
      : selector === '.tv-result:not([data-tv-repeat])' ? this.nodes.find(node => !node.repeated) : null; },
    appendChild(node) { this.nodes.push(node); } };
  Object.defineProperty(list, 'scrollHeight', { get() { return list.nodes.length * 100; } });
  for (let i = 0; i < count; i++) list.nodes.push(makeResultNode(list, false, i === 0 ? latestId : '', i === 0 ? latestAt : 0));
  return list;
}
const smoothRoot = { querySelector: selector => selector === '.tv-results-list' ? smoothList : null };
Object.defineProperty(smoothRoot, 'innerHTML', { set(markup) {
  const day = (markup.match(/data-result-day="([^"]+)/) || [])[1] || '';
  const latest = markup.match(/class="tv-result tv-result-latest" data-result-id="([^"]*)" data-result-at="([^"]*)"/);
  smoothList = makeList(day, (markup.match(/class="tv-result(?: tv-result-latest)?"/g) || []).length,
    150, latest ? latest[1] : '', latest ? Number(latest[2]) : 0);
} });
const smoothDocument = { visibilityState:'visible', fonts:null,
  addEventListener(name, fn) { scrollListeners[name] = fn; },
  getElementById(id) { return id === 'tv-root' ? smoothRoot : null; },
  querySelector(selector) { return selector === '.tv-results-list' ? smoothList : null; },
  querySelectorAll() { return []; } };
const smoothWindow = { __tvParentBeat:frameNow, opener:null,
  addEventListener(name, fn) { scrollListeners[name] = fn; },
  requestAnimationFrame(fn) { frames.push(fn); },
  matchMedia() { return { matches:reducedMotion }; } };
vm.runInNewContext(childSource[0].slice(8, -9), { window:smoothWindow, document:smoothDocument,
  setInterval() { return 1; }, clearInterval() {}, Date:{ now:() => frameNow }, Number });
const resultMarkup = (day, count, latestId = '', latestAt = 0) => '<div class="tv-results-list" data-result-day="' + day + '">' +
  (latestId ? '<div class="tv-result tv-result-latest" data-result-id="' + latestId + '" data-result-at="' + latestAt + '"></div>' : '<div class="tv-result"></div>') +
  '<div class="tv-result"></div>'.repeat(count - 1) + '</div>';
smoothWindow.__tvReplaceMarkup(resultMarkup('2026-10-23', 4));
assert.equal(smoothList.nodes.length, 8, 'somente resultados que excedem a área recebem cópia visual');
for (let i = 0; i < 100; i++) { frameNow += 16; frames.shift()(); }
assert(Math.abs(smoothList.scrollTop - 35.2) < .01, '100 quadros acumulam 35,2 px sem degrau de 22 px');
smoothWindow.__tvReplaceMarkup(resultMarkup('2026-10-23', 4));
assert(Math.abs(smoothList.scrollTop - 35.2) < .01, 'refresh no mesmo dia preserva posição fracionária');
smoothWindow.__tvReplaceMarkup(resultMarkup('2026-10-24', 4));
assert.equal(smoothList.scrollTop, 0, 'novo dia começa no primeiro resultado');
for (let i = 0; i < 1137; i++) { frameNow += 16; frames.shift()(); }
assert(smoothList.scrollTop < 1, 'ao atravessar o ciclo, o excedente é preservado sem voltar bruscamente a zero');
smoothWindow.__tvReplaceMarkup(resultMarkup('2026-10-24', 1));
assert.equal(smoothList.nodes.length, 1, 'lista sem overflow não recebe cópia');
const beforeIdle = smoothList.scrollTop;
frameNow += 16; frames.shift()();
assert.equal(smoothList.scrollTop, beforeIdle, 'sem cópia, a lista não se move');
smoothWindow.__tvReplaceMarkup(resultMarkup('2026-10-24', 4));
reducedMotion = true;
frameNow += 16; frames.shift()();
assert.equal(smoothList.scrollTop, 0, 'preferência de movimento reduzido paralisa a animação');
reducedMotion = false;
smoothDocument.visibilityState = 'hidden';
frameNow += 10000; frames.shift()();
smoothDocument.visibilityState = 'visible';
scrollListeners.visibilitychange();
frameNow += 16; frames.shift()();
assert(smoothList.scrollTop < 1, 'retorno de aba oculta não avança pelo tempo em segundo plano');
smoothWindow.__tvReplaceMarkup(resultMarkup('2026-10-24', 4, 'fresh-score', frameNow));
assert(smoothList.nodes[0].classList.contains('tv-result-pinned'), 'placar novo fica fixo no topo da seção');
for (let i = 0; i < 1900; i++) { frameNow += 16; frames.shift()(); }
assert(smoothList.nodes[0].classList.contains('tv-result-pinned'), 'não solta o resultado antes do retorno ao topo após 30 segundos');
for (let i = 0; i < 450; i++) { frameNow += 16; frames.shift()(); }
assert(!smoothList.nodes[0].classList.contains('tv-result-pinned'), 'após 30 segundos e retorno ao topo, jogo rola normalmente');
assert.equal(liveButton.attributes['aria-pressed'], 'true', 'heartbeat da página liga o botão');
assert.equal(window._tvLiveWindow, fakePopup, 'só página confirmada aparece como NO AR');
fakePopup.document.visibilityState = 'hidden';
childDocument.visibilityState = 'hidden';
childTick();
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'janela oculta desliga o indicador mesmo continuando aberta');
assert.equal(window._tvLiveWindow, null, 'renderizações da chave também veem a janela oculta como inativa');
fakePopup.document.visibilityState = 'visible';
childDocument.visibilityState = 'visible';
childTick();
assert.equal(liveButton.attributes['aria-pressed'], 'true', 'janela visível volta a indicar NO AR sem reabrir');
childOwner._findTournamentById = () => ({ ...t, name: 'Após recarregar' });
childTick();
assert.match(childRoot.innerHTML, /Após recarregar/, 'janela retoma o torneio quando a aba conclui o reload');
childWindow.opener = null;
childWindow.__tvLastSync = Date.now() - 11000;
childTick();
assert.equal(childWarning.hidden, false, 'janela avisa perda prolongada da conexão com a aba');
window._tvLiveToggle();
assert.equal(window._tvLiveRefresh, null, 'janela fechada solta o refresh em tempo real');
assert.equal(matchUnsubscribed, true, 'janela fechada encerra a assinatura dos jogos');
assert.equal(liveScoreUnsubscribed, true, 'janela fechada encerra a assinatura dos pontos');
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'fechar a página apaga o NO AR');
fakePopup.closed = false;
window._tvLiveToggle();
const reopenedGeneration = Number(popupHtml.match(/,gen=(\d+),origin=/)[1]);
assert(reopenedGeneration > childWindow.__tvGeneration, 'reabrir cria uma geração mais recente');
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'reabrir espera confirmação da nova página');
childHandlers.pagehide();
assert.equal(typeof window._tvLiveRefresh, 'function', 'pagehide da geração antiga não encerra a nova TV');
parentHandlers.message({ origin:'https://scoreplace.app', source:fakePopup,
  data:{ type:'scoreplace-tv-heartbeat', id:t.id, gen:reopenedGeneration, visible:true } });
assert.equal(liveButton.attributes['aria-pressed'], 'true', 'heartbeat da nova geração reativa o botão');
nowMs += 11000;
parentIntervals[0]();
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'heartbeat vencido desativa o indicador');
assert.equal(window._tvLiveWindow, null, 're-render da chave também verá estado inativo');
window._tvLiveToggle();
const staleRecoveryGeneration = Number(popupHtml.match(/,gen=(\d+),origin=/)[1]);
assert.equal(openCalls, 3, 'clique sem heartbeat reaproveita uma única janela nomeada');
assert(staleRecoveryGeneration > reopenedGeneration, 'recuperação substitui a geração anterior');
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'recuperação aguarda o novo heartbeat');
assert.equal(parentActiveIntervals.size, 2, 'só o monitor global e o refresh novo ficam ativos');
assert(parentActiveIntervals.has(parentIntervals.length), 'refresh antigo foi cancelado antes do novo');
childWindow.__tvGeneration = staleRecoveryGeneration;
childTick();
assert.equal(childIntervalClears, 1, 'script da geração antiga encerra seu único intervalo');
parentHandlers.message({ origin:'https://scoreplace.app', source:fakePopup,
  data:{ type:'scoreplace-tv-heartbeat', id:t.id, gen:reopenedGeneration, visible:true } });
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'heartbeat antigo não reativa a janela substituída');
parentHandlers.message({ origin:'https://scoreplace.app', source:fakePopup,
  data:{ type:'scoreplace-tv-heartbeat', id:t.id, gen:staleRecoveryGeneration, visible:true } });
assert.equal(liveButton.attributes['aria-pressed'], 'true', 'nova geração reativa a mesma janela');
const oldDocument = fakePopup.document;
Object.defineProperty(fakePopup, 'document', { configurable:true, get() { throw new Error('SecurityError'); } });
parentIntervals[0]();
assert.equal(liveButton.attributes['aria-pressed'], 'false', 'navegação cross-origin fica inativa sem lançar');
window._tvLiveRefresh();
assert.equal(window._tvLiveRefresh, null, 'refresh cross-origin interrompe o loop sem lançar');
Object.defineProperty(fakePopup, 'document', { configurable:true, writable:true, value:oldDocument });

const reloadHandlers = {}, reloadIntervals = [];
const reloadButton = { attributes:{}, style:{}, setAttribute(name,value){this.attributes[name]=value;} };
const reloadWindow = { location:{origin:'https://scoreplace.app'}, _currentBracketTournament:t,
  addEventListener(name,fn){reloadHandlers[name]=fn;} };
reloadWindow.ScoreplaceMatchDay = window.ScoreplaceMatchDay;
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8'), {
  window:reloadWindow, document:{querySelectorAll:()=>[reloadButton]}, Date:TestDate, Number, String, Array, Set,
  setInterval:fn=>{reloadIntervals.push(fn);return reloadIntervals.length;}, clearInterval:()=>{} });
reloadHandlers.message({origin:'https://scoreplace.app',source:{name:'outra-janela',closed:false},
  data:{type:'scoreplace-tv-heartbeat',id:t.id,gen:reopenedGeneration,visible:true}});
assert.equal(!!reloadWindow._tvLiveWindow, false, 'após reload ignora heartbeat de janela com nome diferente');
reloadHandlers.message({origin:'https://scoreplace.app',source:fakePopup,
  data:{type:'scoreplace-tv-heartbeat',id:t.id,gen:reopenedGeneration,visible:true}});
assert.equal(reloadButton.attributes['aria-pressed'], 'true', 'após reload recupera a TV nomeada viva');
fakePopup.closed = true;
reloadIntervals[0]();
assert.equal(reloadButton.attributes['aria-pressed'], 'false', 'após reload fechar a TV apaga o botão');
const liveSource = fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8');
assert.match(popupHtml, /tv-fullscreen-action/,
  'janela NO AR oferece controle de tela cheia para a TV');
assert.match(liveSource, /requestFullscreen\.call\(doc\.documentElement/,
  'tela cheia é solicitada pelo clique na própria janela da TV');
assert.match(popupHtml, /root\.replaceChildren\.apply\(root,Array\.from\(draft\.childNodes\)\);fit\(\)/,
  'TV continua ajustando a grade após atualizar resultados e quadras');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8'), /window\._tvMode\(/,
  'ficha do torneio não exibe mais o modo antigo');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/views/bracket-ui.js'), 'utf8'), /window\._tvMode =/,
  'implementação antiga removida');
const bracketSource = fs.readFileSync(path.join(root, 'js/views/bracket.js'), 'utf8');
const bracketClockStart = bracketSource.indexOf('window._spCourtClockHtml = function');
const bracketClockEnd = bracketSource.indexOf('// ─── Formação de duplas', bracketClockStart);
assert(bracketClockStart > 0 && bracketClockEnd > bracketClockStart, 'relógio da chave localizado');
let clockTick, clockNow = phaseBase + 45000;
const clockClasses = new Set(['sp-match-estimated-time', 'sp-match-phase-call']);
const clockParent = { title:'', querySelector: () => null, classList: {
  remove: (...names) => names.forEach(name => clockClasses.delete(name)),
  add: name => clockClasses.add(name)
} };
let courtLocked = false, okLocked = false;
const courtControl = { value:'Quadra 4', closest: () => ({ replaceWith: () => { courtLocked = true; } }) };
const okControl = { replaceWith: () => { okLocked = true; } };
const courtRow = { querySelector: selector => selector.includes('select') ? (courtLocked ? null : courtControl) : (okLocked ? null : okControl) };
const clockNode = { textContent:'', getAttribute: name => ({
  'data-start-ms': String(phaseBase), 'data-call-min':'1', 'data-warmup-min':'1', 'data-game-min':'1'
})[name], closest: selector => selector === '.sp-match-operational' ? courtRow : clockParent };
const bracketClockWindow = { ScoreplaceMatchTiming: timingCore, _safeHtml: String };
vm.runInNewContext(bracketSource.slice(bracketClockStart, bracketClockEnd), {
  window:bracketClockWindow, document:{ querySelectorAll: () => [clockNode], createElement: () => ({}) },
  Date:{ now: () => clockNow, parse: Date.parse }, setInterval: callback => { clockTick = callback; return 1; },
  Number, String
});
const clockHtml = bracketClockWindow._spCourtClockHtml(phaseBase, phaseTournament, clockNow);
assert.match(clockHtml, /sp-match-phase-call.*sp-match-clock-label">Chamado<.*sp-match-call-timer[^>]*>00:00:45/, 'chave nasce com fase e hora idênticas ao NO AR');
assert.doesNotMatch(clockHtml, /Reiniciar etapa do relógio|Próxima etapa do relógio/,
  'sem controles, o relógio não mostra REW nem FF');
const organizerClockHtml = bracketClockWindow._spCourtClockHtml(phaseBase, phaseTournament, clockNow, 'sb_tour', 'match-1', true);
const rewPosition = organizerClockHtml.indexOf('Reiniciar etapa do relógio');
const labelPosition = organizerClockHtml.indexOf('sp-match-clock-label">Chamado');
const ffPosition = organizerClockHtml.indexOf('Próxima etapa do relógio');
const timerPosition = organizerClockHtml.indexOf('>00:00:45</span>');
assert(rewPosition >= 0 && rewPosition < labelPosition && labelPosition < ffPosition && ffPosition < timerPosition,
  'no card do organizador: REW, fase, FF e HH:MM:SS');
const clockIcons = organizerClockHtml.match(/<svg[^>]*>[\s\S]*?<\/svg>/g) || [];
assert.equal(clockIcons.length, 2, 'os dois controles usam ícones');
assert(clockIcons.every(icon => /aria-hidden="true"/.test(icon) && /currentColor/.test(icon) && !/#[0-9a-f]{3,8}/i.test(icon)),
  'ícones decorativos usam a cor do tema');
const overdueClockHtml = bracketClockWindow._spCourtClockHtml(phaseBase, phaseTournament,
  phaseBase + 210000, 'sb_tour', 'match-1', true);
assert.doesNotMatch(overdueClockHtml, /Próxima etapa do relógio/,
  'FF desaparece quando o jogo já está atrasado');
assert(!courtLocked && !okLocked, 'quadra e OK permanecem editáveis durante a chamada');
for (const [seconds, label, colorClass] of [
  [90, 'Aquecimento 00:00:30', 'sp-match-phase-warmup'],
  [150, 'Tempo de jogo 00:00:30', 'sp-match-phase-game'],
  [210, 'Atrasado 00:01:30', 'sp-match-phase-overdue']
]) {
  clockNow = phaseBase + seconds * 1000;
  clockTick();
  assert.equal(clockNode.textContent, label.split(' ').at(-1), 'chave atualiza ' + label);
  assert(clockClasses.has(colorClass), 'chave atualiza a cor para ' + colorClass);
}
assert(courtLocked && okLocked, 'quadra e OK deixam de ser controles ao iniciar aquecimento');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(htmlSource.indexOf('js/domain/match-timing.js') < htmlSource.indexOf('js/views/bracket.js') &&
  htmlSource.indexOf('js/views/bracket.js') < htmlSource.indexOf('js/views/tv-live.js'),
  'módulo de fases carrega antes da chave e do NO AR');
assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /'\/js\/domain\/match-timing\.js'/,
  'relógio compartilhado está no precache para a chave funcionar offline');
assert.match(popupHtml, /\.tv-theme \.tv-qr-brand\{background:#fff;color:#111;/,
  'legenda do QR usa texto preto sobre fundo branco mesmo com o tema do torneio');
if (process.env.SP_TV_CAPTURE) fs.writeFileSync(process.env.SP_TV_CAPTURE,
  popupHtml.replace('<div id="tv-root"></div>', '<div id="tv-root">' + window._tvLiveBodyHtml(snapshot) + '</div>'));
if (process.env.SP_TV_CAPTURE_CUSTOM) {
  const customTournament = { ...t, tvLayout: window.ScoreplaceTvLayout.defaults() };
  const customSnapshot = window._tvLiveBuildSnapshot(customTournament, Date.parse('2026-10-22T21:02:10Z'));
  fs.writeFileSync(process.env.SP_TV_CAPTURE_CUSTOM,
    popupHtml.replace('<div id="tv-root"></div>', '<div id="tv-root">' + window._tvLiveBodyHtml(customSnapshot) + '</div>'));
}
if (process.env.SP_TV_CAPTURE_CAMIS) fs.writeFileSync(process.env.SP_TV_CAPTURE_CAMIS,
  popupHtml.replace('<div id="tv-root"></div>', '<div id="tv-root">' + camisHtml + '</div>'));
console.log('✓ TV: 6 quadras chamadas, relógio, placar ao vivo, 3 resultados e saldo geral por time');
