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
assert.equal(window._tvLiveIsComplete({ ...t, _nJogos: 8 }), false, 'NO AR recusa fotografia com um jogo faltando');
assert.equal(window._tvLiveIsComplete({ ...t, _nJogos: 7 }), true, 'NO AR aceita os sete IDs canônicos completos');
const multiPhaseConfig = { enabled:true, aggregation:'per_category', classificationUnit:'pair' };
const plannedLaterPhase = { enabled:true, aggregation:'overall', classificationUnit:'team',
  schedule:{ enabled:true, modeChosen:true, mode:'structured' } };
const unrelatedMultiPhase = window._tvLiveBuildSnapshot({ ...t, id:'other-tournament',
  teamCompetition:multiPhaseConfig, phases:[{ teamCompetition:multiPhaseConfig }, { teamCompetition:plannedLaterPhase }] });
assert.equal(unrelatedMultiPhase.rankings[0].title, 'Fem Light',
  'torneio multifase comum preserva o escopo por categoria já usado na TV');
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
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/court-occupancy.js'), 'utf8'), context);
const samePlayerQueue = { ...queue, matches: [
  match(19, 'Quadra 4', 'VORTEX', 'BLAST', { p1:'Atleta ativa / Parceira A', p2:'Adversaria A / Adversaria B', team1Uids:['same-uid','pair-a'], courtCalledAt:'2026-10-23T18:00:00Z' }),
  match(20, 'Quadra 5', 'VOLT', 'BLACKOUT', { p1:'Atleta ativa / Parceira B', p2:'Adversaria C / Adversaria D', team1Uids:['same-uid','pair-b'], scheduledAt:'2026-10-23T18:10:00Z' }),
  match(21, 'Quadra 6', 'PANIC', 'PHANTOM', { p1:'Livre A / Livre B', p2:'Livre C / Livre D', scheduledAt:'2026-10-23T18:20:00Z' })
] };
assert.equal(window._tvLiveBuildSnapshot(samePlayerQueue).nextGame.number, 21,
  'TV pula próximo jogo quando uma atleta já disputa outra partida');
assert.match(window._tvLiveBodyHtml(window._tvLiveBuildSnapshot(emptyQueue)), /Próximo jogo ainda não definido/);
const upcomingHtml = window._tvLiveBodyHtml(snapshot).split('class="tv-upcoming"')[1].split('</section>')[0];
assert.match(upcomingHtml, /JOGO 3 · Fem Light/);
assert.match(upcomingHtml, /PANIC 1/);
assert.doesNotMatch(upcomingHtml, /tv-result-side-score|tv-score/, 'próximo jogo não tem placar');
assert.equal(snapshot.results.length, 4, 'histórico acumula resultados para rolagem');
assert.equal(snapshot.results.map(r => r.number).join(','), '5,6,4,7', 'resultado novo entra no topo');
assert.equal(snapshot.resultDay, '2026-10-22');
assert.equal(snapshot.results[0].time, '17:30', 'horário de lançamento usa o fuso do torneio');
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
assert.equal(snapshot.results[1].scoreA, '7');
assert.equal(snapshot.rankings.length, 1, 'classificação geral, sem categoria forçada');
assert.equal(snapshot.rankings[0].rows.length, 8);
assert.equal(snapshot.rankings[0].rows[0].name, 'VORTEX');
assert.equal(snapshot.rankings[0].rows[0].gamesDiff, 8);
assert.equal(snapshot.rankings[0].rows[0].gamesWon, 12);
assert.equal(snapshot.rankings[0].rows[0].wins, 2);
assert.equal(snapshot.rankings[0].rows[0].played, 2);
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
const tvTimer = { start:Date.now() - 15000, getAttribute() { return String(this.start); }, textContent:'', className:'', title:'' };
t.callTime = 1;
t.warmupTime = 1;
t.gameDuration = 1;
const fakePopup = { name:'scoreplace-live-tv-neon-test', closed: false, navigator: { wakeLock: { request: type => {
  assert.equal(type, 'screen'); wakeRequests++; return Promise.resolve({ addEventListener() {}, release: () => Promise.resolve() });
} } }, document: {
  open() {}, write(html) { popupHtml = html; }, close() {},
  visibilityState: 'visible', addEventListener() {},
  getElementById: id => id === 'tv-root' ? tvRoot : { addEventListener() {} },
  querySelector: () => null,
  querySelectorAll: selector => selector === '[data-tv-start]' ? [tvTimer] : []
}, focus() {}, close() { this.closed = true; } };
let openCalls = 0;
window.open = () => { openCalls++; return fakePopup; };
window._findTournamentById = () => t;
window._tvLiveToggle();
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
assert.match(tvRoot.innerHTML, /class="tv-team-tag">VORTEX<\/span><div class="tv-players"><span>VORTEX 1<\/span><span>Parceira<\/span>/,
  'card da TV mantém etiqueta vertical do time e atletas em linhas, como na chave');
assert.match(tvRoot.innerHTML, /<h2>Quadra 4 · JOGO 1<\/h2><span>Fem Light<\/span>/,
  'quadra e jogo aparecem juntos à esquerda, categoria à direita');
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
assert.match(tvRoot.innerHTML, /scoreplace\.app\/icons\/logo-podium\.svg/);
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
function makeResultNode(list, repeated = false) {
  const node = { repeated, cloneNode() { return makeResultNode(list, true); },
    setAttribute(name) { if (name === 'data-tv-repeat') this.repeated = true; },
    querySelectorAll() { return []; }, removeAttribute() {},
    remove() { list.nodes.splice(list.nodes.indexOf(this), 1); } };
  Object.defineProperty(node, 'offsetTop', { get() { return list.nodes.indexOf(node) * 100; } });
  return node;
}
function makeList(day, count, height = 150) {
  const list = { day, clientHeight:height, scrollTop:0, nodes:[],
    getAttribute(name) { return name === 'data-result-day' ? this.day : null; },
    querySelectorAll(selector) { return this.nodes.filter(node => selector === '[data-tv-repeat]' ? node.repeated : !node.repeated); },
    querySelector(selector) { return selector === '[data-tv-repeat]' ? this.nodes.find(node => node.repeated) : null; },
    appendChild(node) { this.nodes.push(node); } };
  Object.defineProperty(list, 'scrollHeight', { get() { return list.nodes.length * 100; } });
  for (let i = 0; i < count; i++) list.nodes.push(makeResultNode(list));
  return list;
}
const smoothRoot = { querySelector: selector => selector === '.tv-results-list' ? smoothList : null };
Object.defineProperty(smoothRoot, 'innerHTML', { set(markup) {
  const day = (markup.match(/data-result-day="([^"]+)/) || [])[1] || '';
  smoothList = makeList(day, (markup.match(/class="tv-result"/g) || []).length);
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
const resultMarkup = (day, count) => '<div class="tv-results-list" data-result-day="' + day + '">' +
  '<div class="tv-result"></div>'.repeat(count) + '</div>';
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
assert.match(liveSource, /id=\\?"tv-fullscreen-action/, 'janela NO AR oferece entrada em tela cheia na própria janela');
assert.match(liveSource, /target\.requestFullscreen\(\)/, 'tela cheia é acionada pela janela que será exibida na TV');
assert.match(popupHtml, /document\.addEventListener\("fullscreenchange",syncFullscreenButton\)/,
  'TV atualiza o botão quando o navegador sai da tela cheia');
assert.match(popupHtml, /root\.replaceChildren\.apply\(root,Array\.from\(draft\.childNodes\)\);syncFullscreenButton\(\)/,
  'TV restaura o rótulo correto após atualizar resultados e quadras');
assert.match(popupHtml, /html:fullscreen #tv-fullscreen-action\{display:block\}/,
  'saída explícita continua disponível na própria TV');
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
const bracketClockWindow = { ScoreplaceMatchTiming: timingCore };
vm.runInNewContext(bracketSource.slice(bracketClockStart, bracketClockEnd), {
  window:bracketClockWindow, document:{ querySelectorAll: () => [clockNode], createElement: () => ({}) },
  Date:{ now: () => clockNow }, setInterval: callback => { clockTick = callback; return 1; },
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
if (process.env.SP_TV_CAPTURE) fs.writeFileSync(process.env.SP_TV_CAPTURE,
  popupHtml.replace('<div id="tv-root"></div>', '<div id="tv-root">' + window._tvLiveBodyHtml(snapshot) + '</div>'));
console.log('✓ TV: 6 quadras chamadas, relógio, placar ao vivo, 3 resultados e saldo geral por time');
