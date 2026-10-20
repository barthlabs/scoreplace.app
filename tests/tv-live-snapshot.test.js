const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const window = { _collectAllMatches: t => t.matches, _tourLogoSrc: t => t.logo,
  _tournamentUrl: id => `https://scoreplace.app/#tournaments/${id}`,
  _qrCodeUrl: url => `https://qr.example/?data=${encodeURIComponent(url)}` };
const context = vm.createContext({ window, document: { querySelectorAll: () => [] }, Date, Number, String, Array, Set,
  setInterval: () => 1, clearInterval: () => {} });
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/team-competition.js'), 'utf8'), context);
window.ScoreplaceTeamCompetition = context.ScoreplaceTeamCompetition;
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8'), context);
window._isNeonTournament = tournament => tournament.id === 'tour_1790628592058_c342a1e8f5068424887f1702a1633a44';

const teams = ['VORTEX', 'BLAST', 'ECLIPSE', 'VENOM', 'PANIC', 'PHANTOM', 'VOLT', 'BLACKOUT']
  .map((name, i) => ({ id: `t${i}`, name, hue: i * 42 }));
const match = (id, court, a, b, extra = {}) => ({ id, _gameNum: id, court, category: 'Fem Light',
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
const snapshot = window._tvLiveBuildSnapshot(t);
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
assert.equal(snapshot.courts[0].latest, false, 'borda dourada fica só na chamada mais recente');
assert.equal(snapshot.courts[1].timerStart, Date.parse('2026-10-22T21:02:00Z'));
assert.equal(snapshot.courts[1].latest, true, 'jogo chamado por último é destacado');
assert.equal(snapshot.courts[1].scoreA, '4');
assert.equal(snapshot.courts[2].number, undefined, 'jogo só agendado não ocupa TV');
assert.equal(snapshot.results.length, 4, 'histórico acumula resultados para rolagem');
assert.equal(snapshot.results.map(r => r.number).join(','), '5,6,4,7', 'resultado novo entra no topo');
assert.equal(snapshot.results[1].scoreA, '7');
assert.equal(snapshot.rankings.length, 1, 'classificação geral, sem categoria forçada');
assert.equal(snapshot.rankings[0].rows.length, 8);
assert.equal(snapshot.rankings[0].rows[0].name, 'VORTEX');
assert.equal(snapshot.rankings[0].rows[0].gamesDiff, 8);
assert.equal(snapshot.rankings[0].rows[0].gamesWon, 12);
assert.equal(snapshot.rankings[0].rows[0].wins, 2);
assert.equal(snapshot.rankings[0].rows[0].played, 2);
assert.deepEqual(JSON.parse(JSON.stringify(snapshot.timing)), { call: 0, warmup: 0, game: 0 });
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
assert.equal(snapshot.qrUrl, 'https://scoreplace.app/#tournaments/neon-test');
assert.match(snapshot.qrImage, /neon-test/);
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
window._currentBracketTournament = t;
window.open = () => null;
window.showToast = message => { toast = message; };
window._tvLiveToggle();
assert.match(toast, /Permita abrir/, 'popup bloqueado informa o organizador');
const tvRoot = { innerHTML: '' };
let wakeRequests = 0;
const tvTimer = { start:Date.now() - 15000, getAttribute() { return String(this.start); }, textContent:'', className:'', title:'' };
t.callTime = 1;
t.warmupTime = 1;
t.gameDuration = 1;
const fakePopup = { closed: false, navigator: { wakeLock: { request: type => {
  assert.equal(type, 'screen'); wakeRequests++; return Promise.resolve({ addEventListener() {}, release: () => Promise.resolve() });
} } }, document: {
  open() {}, write() {}, close() {},
  visibilityState: 'visible', addEventListener() {},
  getElementById: id => id === 'tv-root' ? tvRoot : { addEventListener() {} },
  querySelectorAll: selector => selector === '[data-tv-start]' ? [tvTimer] : []
}, focus() {}, close() { this.closed = true; } };
window.open = () => fakePopup;
window._findTournamentById = () => t;
window._tvLiveToggle();
assert.equal(wakeRequests, 1, 'NO AR solicita bloqueio de repouso da tela');
assert.match(tvTimer.textContent, /^Chamado 00:00:\d\d$/, 'a chamada aparece como Chamado hh:mm:ss');
tvTimer.start = Date.now() - 90000;
window._tvLiveRefresh();
assert.match(tvTimer.textContent, /^Aquecimento 00:01:\d\d$/, 'o rótulo acompanha o tempo de aquecimento');
tvTimer.start = Date.now() - 150000;
window._tvLiveRefresh();
assert.match(tvTimer.textContent, /^Em jogo 00:02:\d\d$/, 'o rótulo acompanha o tempo de jogo');
tvTimer.start = Date.now() - 210000;
window._tvLiveRefresh();
assert.match(tvTimer.textContent, /^Tempo excedido 00:03:\d\d$/, 'o tempo excedido tem rótulo próprio');
assert.match(tvRoot.innerHTML, /ÚLTIMOS RESULTADOS/);
assert.doesNotMatch(tvRoot.innerHTML, /CHAMADO|EM JOGO/);
assert.match(tvRoot.innerHTML, /class="tv-team-tag">VORTEX<\/span><div class="tv-players"><span>VORTEX 1<\/span><span>Parceira<\/span>/,
  'card da TV mantém etiqueta vertical do time e atletas em linhas, como na chave');
assert.match(tvRoot.innerHTML, /<h2>Quadra 4 · JOGO 1<\/h2><span>Fem Light<\/span>/,
  'quadra e jogo aparecem juntos à esquerda, categoria à direita');
assert.match(tvRoot.innerHTML, /class="tv-court-footer"><strong data-tv-start=/,
  'timer aparece sozinho abaixo do confronto');
assert.doesNotMatch(tvRoot.innerHTML, /ÚLTIMOS 3 RESULTADOS/);
assert.match(tvRoot.innerHTML, /tv-court-latest/, 'slot mais recente recebe destaque');
assert.match(tvRoot.innerHTML, /tv-result-left.*tv-result-score.*tv-result-right/, 'resultados exibem times nas pontas e placares no centro');
assert.match(tvRoot.innerHTML, /<span>GAMES<\/span><span class="tv-win">V<\/span><span class="tv-loss">D<\/span><span>J<\/span>/);
assert.match(tvRoot.innerHTML, /class="tv-ranking-team"[^>]*>VORTEX<\/strong><b>\+8<\/b><span>12 - 4<\/span><span class="tv-win">2<\/span><span class="tv-loss">0<\/span><span>2<\/span>/);
assert.doesNotMatch(tvRoot.innerHTML, /<h3>Times<\/h3>/, 'classificação geral usa somente o cabeçalho da tabela');
assert.match(tvRoot.innerHTML, /class="tv-qr-code"[^>]*neon-test/);
assert.match(tvRoot.innerHTML, /scoreplace\.app\/icons\/logo-podium\.svg/);
window._tvLiveToggle();
assert.equal(window._tvLiveRefresh, null, 'janela fechada solta o refresh em tempo real');
const liveSource = fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8');
assert.match(liveSource, /id=\\?"tv-fullscreen-action/, 'janela NO AR oferece entrada em tela cheia na própria janela');
assert.match(liveSource, /root\.requestFullscreen\(\)/, 'tela cheia é acionada pela janela que será exibida na TV');
assert.match(liveSource, /html:fullscreen #tv-fullscreen-action\{display:none\}/, 'controle some da saída limpa');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8'), /window\._tvMode\(/,
  'ficha do torneio não exibe mais o modo antigo');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/views/bracket-ui.js'), 'utf8'), /window\._tvMode =/,
  'implementação antiga removida');
console.log('✓ TV: 6 quadras chamadas, relógio, placar ao vivo, 3 resultados e saldo geral por time');
