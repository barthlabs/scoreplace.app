const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const window = { _collectAllMatches: t => t.matches, _tourLogoSrc: t => t.logo,
  location: { origin: 'https://scoreplace.app' },
  _tournamentUrl: id => `https://scoreplace.app/#tournaments/${id}`,
  _qrCodeUrl: url => `https://qr.example/?data=${encodeURIComponent(url)}` };
const context = vm.createContext({ window, document: { querySelectorAll: () => [] }, Date, Number, String, Array, Set,
  setInterval: () => 1, clearInterval: () => {} });
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/team-competition.js'), 'utf8'), context);
window.ScoreplaceTeamCompetition = context.ScoreplaceTeamCompetition;
vm.runInContext(fs.readFileSync(path.join(root, 'js/domain/match-timing.js'), 'utf8'), context);
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
const snapshot = window._tvLiveBuildSnapshot(t, Date.parse('2026-10-22T21:02:10Z'));
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
const fakePopup = { closed: false, navigator: { wakeLock: { request: type => {
  assert.equal(type, 'screen'); wakeRequests++; return Promise.resolve({ addEventListener() {}, release: () => Promise.resolve() });
} } }, document: {
  open() {}, write(html) { popupHtml = html; }, close() {},
  visibilityState: 'visible', addEventListener() {},
  getElementById: id => id === 'tv-root' ? tvRoot : { addEventListener() {} },
  querySelectorAll: selector => selector === '[data-tv-start]' ? [tvTimer] : []
}, focus() {}, close() { this.closed = true; } };
window.open = () => fakePopup;
window._findTournamentById = () => t;
window._tvLiveToggle();
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
assert.match(tvRoot.innerHTML, /<article class="tv-court tv-court-latest">/, 'slot da transição mais recente recebe destaque');
assert.match(tvRoot.innerHTML, /tv-result-left.*tv-result-score.*tv-result-right/, 'resultados exibem times nas pontas e placares no centro');
assert.match(tvRoot.innerHTML, /<span>GAMES<\/span><span class="tv-win">V<\/span><span class="tv-loss">D<\/span><span>J<\/span>/);
assert.match(tvRoot.innerHTML, /class="tv-ranking-team"[^>]*>VORTEX<\/strong><b>\+8<\/b><span>12 - 4<\/span><span class="tv-win">2<\/span><span class="tv-loss">0<\/span><span>2<\/span>/);
assert.doesNotMatch(tvRoot.innerHTML, /<h3>Times<\/h3>/, 'classificação geral usa somente o cabeçalho da tabela');
assert.match(tvRoot.innerHTML, /class="tv-qr-code"[^>]*neon-test/);
assert.match(tvRoot.innerHTML, /scoreplace\.app\/icons\/logo-podium\.svg/);
const childSource = popupHtml.match(/<script>\(function\(\)\{"use strict";[\s\S]*?<\/script>/);
assert(childSource, 'NO AR inclui um relógio próprio na janela, independente do intervalo da aba');
const childRoot = { innerHTML: '' };
const childWarning = { hidden: true };
const childOwner = { _findTournamentById: () => t, _tvLiveBuildSnapshot: window._tvLiveBuildSnapshot,
  _tvLiveBodyHtml: window._tvLiveBodyHtml };
const childWindow = { opener: childOwner, ScoreplaceMatchTiming: timingCore, __tvParentBeat: 0 };
let childTick;
const childDocument = { getElementById: id => id === 'tv-root' ? childRoot : id === 'tv-connection' ? childWarning : null,
  querySelectorAll: () => [] };
vm.runInNewContext(childSource[0].slice(8, -9), { window: childWindow, document: childDocument,
  setInterval: fn => { childTick = fn; return 1; }, Date, Number });
assert(childTick && childRoot.innerHTML.includes('CLASSIFICAÇÃO'), 'janela restaura conteúdo sem o timer da aba');
childOwner._findTournamentById = () => ({ ...t, name: 'Após recarregar' });
childTick();
assert.match(childRoot.innerHTML, /Após recarregar/, 'janela retoma o torneio quando a aba conclui o reload');
childWindow.opener = null;
childWindow.__tvLastSync = Date.now() - 11000;
childTick();
assert.equal(childWarning.hidden, false, 'janela avisa perda prolongada da conexão com a aba');
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
assert.match(clockHtml, /sp-match-phase-call.*Chamado 00:00:45/, 'chave nasce com fase e hora idênticas ao NO AR');
const organizerClockHtml = bracketClockWindow._spCourtClockHtml(phaseBase, phaseTournament, clockNow, 'sb_tour', 'match-1', true);
assert.match(organizerClockHtml, />FF<\/button>.*>REW<\/button>.*Chamado 00:00:45/,
  'FF e REW aparecem à esquerda do relógio apenas no card do organizador');
assert(!courtLocked && !okLocked, 'quadra e OK permanecem editáveis durante a chamada');
for (const [seconds, label, colorClass] of [
  [90, 'Aquecimento 00:00:30', 'sp-match-phase-warmup'],
  [150, 'Tempo de jogo 00:00:30', 'sp-match-phase-game'],
  [210, 'Atrasado 00:01:30', 'sp-match-phase-overdue']
]) {
  clockNow = phaseBase + seconds * 1000;
  clockTick();
  assert.equal(clockNode.textContent, label, 'chave atualiza ' + label);
  assert(clockClasses.has(colorClass), 'chave atualiza a cor para ' + colorClass);
}
assert(courtLocked && okLocked, 'quadra e OK deixam de ser controles ao iniciar aquecimento');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(htmlSource.indexOf('js/domain/match-timing.js') < htmlSource.indexOf('js/views/bracket.js') &&
  htmlSource.indexOf('js/views/bracket.js') < htmlSource.indexOf('js/views/tv-live.js'),
  'módulo de fases carrega antes da chave e do NO AR');
assert.match(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), /'\/js\/domain\/match-timing\.js'/,
  'relógio compartilhado está no precache para a chave funcionar offline');
console.log('✓ TV: 6 quadras chamadas, relógio, placar ao vivo, 3 resultados e saldo geral por time');
