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

const teams = ['VORTEX', 'BLAST', 'ECLIPSE', 'VENOM', 'PANIC', 'PHANTOM', 'VOLT', 'BLACKOUT']
  .map((name, i) => ({ id: `t${i}`, name, hue: i * 42 }));
const match = (id, court, a, b, extra = {}) => ({ id, _gameNum: id, court, category: 'Fem Light',
  p1: `${a} 1 / Parceira`, p2: `${b} 1 / Parceira`, p1CompetitionTeamId: teams.find(t => t.name === a).id,
  p2CompetitionTeamId: teams.find(t => t.name === b).id, ...extra });
const t = { id: 'neon-test', name: 'NEON NIGHTMARE', logo: 'logo.png', courtNames: [4, 5, 6, 7, 8, 9].map(n => `Quadra ${n}`),
  competitionTeams: teams, teamCompetition: { enabled: true, aggregation: 'overall', classificationUnit: 'team', ranking: 'games_diff' },
  matches: [
    match(1, 'Quadra 4', 'VORTEX', 'BLAST', { courtCalledAt: '2026-10-22T21:00:00Z' }),
    match(2, 'Quadra 5', 'ECLIPSE', 'VENOM', { courtCalledAt: '2026-10-22T21:00:00Z', startedAt: '2026-10-22T21:03:00Z', scoreP1: 4, scoreP2: 3 }),
    match(3, 'Quadra 6', 'PANIC', 'PHANTOM', { scheduledAt: '2026-10-22T21:00:00Z' }),
    match(4, 'Quadra 4', 'VORTEX', 'VENOM', { winner: 'p1', scoreP1: 6, scoreP2: 3, resultAt: '2026-10-22T20:00:00Z' }),
    match(5, 'Quadra 5', 'BLAST', 'PANIC', { winner: 'p2', scoreP1: 2, scoreP2: 6, resultAt: '2026-10-22T20:30:00Z' }),
    match(6, 'Quadra 6', 'VOLT', 'BLACKOUT', { winner: 'p1', sets: [{ gamesP1: 7, gamesP2: 5 }], resultAt: '2026-10-22T20:20:00Z' }),
    match(7, 'Quadra 7', 'PHANTOM', 'VORTEX', { winner: 'p2', scoreP1: 1, scoreP2: 6, resultAt: '2026-10-22T19:00:00Z' })
  ] };
const snapshot = window._tvLiveBuildSnapshot(t);
assert.equal(snapshot.courts.length, 6);
assert.equal(snapshot.courts[0].number, 1);
assert.equal(snapshot.courts[0].timerLabel, 'CHAMADO');
assert.equal(snapshot.courts[1].timerLabel, 'EM JOGO');
assert.equal(snapshot.courts[1].scoreA, '4');
assert.equal(snapshot.courts[2].number, undefined, 'jogo só agendado não ocupa TV');
assert.equal(snapshot.results.length, 3);
assert.equal(snapshot.results.map(r => r.number).join(','), '5,6,4');
assert.equal(snapshot.results[1].scoreA, '7');
assert.equal(snapshot.rankings.length, 1, 'classificação geral, sem categoria forçada');
assert.equal(snapshot.rankings[0].rows.length, 8);
assert.equal(snapshot.rankings[0].rows[0].name, 'VORTEX');
assert.equal(snapshot.rankings[0].rows[0].gamesDiff, 8);
assert.equal(snapshot.rankings[0].rows[0].gamesWon, 12);
assert.equal(snapshot.rankings[0].rows[0].wins, 2);
assert.equal(snapshot.rankings[0].rows[0].played, 2);
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
const fakePopup = { closed: false, document: {
  open() {}, write() {}, close() {},
  getElementById: id => id === 'tv-root' ? tvRoot : { addEventListener() {} },
  querySelectorAll: () => []
}, focus() {}, close() { this.closed = true; } };
window.open = () => fakePopup;
window._findTournamentById = () => t;
window._tvLiveToggle();
assert.match(tvRoot.innerHTML, /ÚLTIMOS RESULTADOS/);
assert.doesNotMatch(tvRoot.innerHTML, /ÚLTIMOS 3 RESULTADOS/);
assert.match(tvRoot.innerHTML, /<span>GAMES<\/span><span>V<\/span><span>D<\/span><span>J<\/span>/);
assert.match(tvRoot.innerHTML, /class="tv-ranking-team"[^>]*>VORTEX<\/strong><b>\+8<\/b><span>12–4<\/span><span>2<\/span><span>0<\/span><span>2<\/span>/);
assert.match(tvRoot.innerHTML, /class="tv-qr-code"[^>]*neon-test/);
assert.match(tvRoot.innerHTML, /scoreplace\.app\/icons\/logo-podium\.svg/);
window._tvLiveToggle();
const liveSource = fs.readFileSync(path.join(root, 'js/views/tv-live.js'), 'utf8');
assert.match(liveSource, /id=\\?"tv-fullscreen-action/, 'janela NO AR oferece entrada em tela cheia na própria janela');
assert.match(liveSource, /root\.requestFullscreen\(\)/, 'tela cheia é acionada pela janela que será exibida na TV');
assert.match(liveSource, /html:fullscreen #tv-fullscreen-action\{display:none\}/, 'controle some da saída limpa');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8'), /window\._tvMode\(/,
  'ficha do torneio não exibe mais o modo antigo');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'js/views/bracket-ui.js'), 'utf8'), /window\._tvMode =/,
  'implementação antiga removida');
console.log('✓ TV: 6 quadras chamadas, relógio, placar ao vivo, 3 resultados e saldo geral por time');
