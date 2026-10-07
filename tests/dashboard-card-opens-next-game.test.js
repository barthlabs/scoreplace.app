/* O card genérico da dashboard abre o primeiro jogo pendente — node tests/dashboard-card-opens-next-game.test.js */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const tournaments = fs.readFileSync(path.join(ROOT, 'js/views/tournaments.js'), 'utf8');
const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const bracket = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
let pass = 0, fail = 0;
function ok(condition, message) {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}
function section(from, to) {
  const start = tournaments.indexOf(from);
  const end = tournaments.indexOf(to, start);
  if (start < 0 || end < 0) throw new Error('trecho real não encontrado');
  return tournaments.slice(start, end);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  await page.addScriptTag({ content: section('window._nextParticipantTournamentMatchTarget = function', '// Entrada genérica da dashboard:') });
  await page.addScriptTag({ content: section('window._nextScheduledTournamentMatchTarget = function', 'window._scrollToBracketSection = function') });
  await page.addScriptTag({ content: section('window._scrollToBracketSection = function', '// v2.7.85: funções de DUPLA') });

  const result = await page.evaluate(async () => {
    const card = (id, at, court, resultAt, num, upcoming, presence) =>
      '<article id="card-' + id + '" data-bracket-scheduled-at="' + at + '" data-bracket-court="' + court +
      '" data-bracket-result-at="' + (resultAt || '') + '" data-match-num="' + num +
      '" data-bracket-tab-gender="fem" data-bracket-upcoming="' + (upcoming ? '1' : '0') +
      '" data-bracket-presence="' + (presence || 'none') + '">' + id + '</article>';
    document.body.innerHTML = '<main id="view-container">' +
      '<nav data-bracket-tabs-root="1" data-tournament-id="neon"></nav>' +
      '<section id="published">' +
        card('played', 1000, 'Quadra 1', 1200, 1) +
        card('waiting-earlier', 1500, 'Quadra 4', '', 3) +
        card('partial', 1600, 'Quadra 5', '', 4, false, 'partial') +
        card('ready', 2000, 'Quadra 1', '', 2, true, 'complete') +
      '</section>' +
      '<section id="inline-bracket-container">Classificação geral dos times</section>' +
      '</main>';
    const root = document.querySelector('[data-bracket-tabs-root]');
    root._bracketGeneralView = document.createElement('section');
    root._bracketGeneralView.setAttribute('data-bracket-general-view', '1');
    document.body.appendChild(root._bracketGeneralView);
    window.AppStore = { tournaments: [{ id: 'neon' }] };
    window._souOrganizador = () => true;
    const selected = [];
    const scrolled = [];
    window._bracketSelectCategoryTab = (...args) => {
      selected.push(args);
      root._bracketGeneralView.appendChild(document.getElementById('card-ready'));
    };
    Element.prototype.scrollIntoView = function () { scrolled.push(this.id || this.textContent); };
    window.scrollTo = function () { scrolled.push('window'); };

    window._scrollToBracketSection('neon');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { selected, scrolled };
  });

  console.log('\n📋 Card da dashboard abre o próximo jogo, não a classificação');
  ok(result.selected.length === 1 && result.selected[0].join(',') === 'neon,fem,__upcoming,',
    'a entrada genérica ativa Próximos jogos no gênero do próximo jogo');
  ok(result.scrolled[0] === 'window',
    'o foco prioriza o primeiro jogo pronto e usa a rolagem vertical da página, não uma pendência invisível');
  ok(result.scrolled.indexOf('inline-bracket-container') === -1,
    'a classificação inline nunca é usada como fallback quando há agenda');
  const lateTarget = await page.evaluate(() => {
    document.body.innerHTML = '<section id="inline-bracket-container">Classificação geral dos times</section>';
    window.AppStore = { tournaments: [{ id: 'neon' }] };
    window._bracketPendingScroll = null;
    const scrolled = [];
    Element.prototype.scrollIntoView = function () { scrolled.push(this.id || this.textContent); };
    window._scrollToBracketSection('neon', 'card-que-ainda-vai-nascer');
    return {
      scrolled,
      pending: window._bracketPendingScroll
    };
  });
  ok(lateTarget.scrolled.length === 0 && lateTarget.pending === 'neon',
    'um alvo explícito ainda não montado é preservado, sem cair no topo/classificação');
  const lateCardFocus = await page.evaluate(async () => {
    document.body.innerHTML = '<section id="inline-bracket-container">Classificação geral dos times</section>';
    window.AppStore = { tournaments: [{ id: 'neon' }] };
    window._bracketPendingScroll = null;
    const scrolled = [];
    Element.prototype.scrollIntoView = function () { scrolled.push(this.id || this.textContent); };
    window._scrollToBracketSection('neon', 'nasce-depois');
    setTimeout(() => {
      const card = document.createElement('article');
      card.id = 'card-nasce-depois';
      document.body.appendChild(card);
    }, 80);
    await new Promise((resolve) => setTimeout(resolve, 260));
    return scrolled;
  });
  ok(lateCardFocus[0] === 'card-nasce-depois',
    'se o card nasce depois da aba, a retentativa independente ainda o focaliza');
  const target = await page.evaluate(() => {
    window._collectAllMatches = (t) => t.matches;
    return window._nextScheduledTournamentMatchTarget({ matches: [
      { id: 'done', resultAt: 1792694000000, scheduledAt: '2026-10-22T18:00:00Z', court: 'Quadra 1', _gameNum: 1, category: 'Fem Light' },
      { id: 'unscheduled', court: 'Quadra 1', _gameNum: 2, category: 'Fem Light' },
      { id: 'court-5', scheduledAt: { seconds: 1792694100 }, court: 'Quadra 5', _gameNum: 4, category: 'Fem Power' },
      { id: 'court-4', scheduledAt: { toMillis: () => 1792694100000 }, court: 'Quadra 4', _gameNum: 3, category: 'Fem Light' }
    ] });
  });
  ok(target && target.matchId === 'court-4' && target.tab.category === '__upcoming' && target.tab.gender === 'fem',
    'o alvo persistido é o primeiro jogo pendente por horário e quadra, na aba Próximos jogos');
  const perUserTarget = await page.evaluate(() => {
    const tournament = { matches: [
      { id: 'ana-mais-tarde', owner: 'ana', round: 3, _gameNum: 1, category: 'Fem Prata' },
      { id: 'bia-proximo', owner: 'bia', round: 1, _gameNum: 2, category: 'Fem Ouro' },
      { id: 'ana-proximo', owner: 'ana', round: 1, _gameNum: 7, category: 'Fem Prata' }
    ] };
    window._collectAllMatches = (t) => t.matches;
    window._userTeamInMatch = (_t, match, user) => match.owner === user.uid ? 1 : 0;
    window.AppStore = { currentUser: { uid: 'ana' } };
    const ana = window._nextParticipantTournamentMatchTarget(tournament);
    window.AppStore = { currentUser: { uid: 'bia' } };
    const bia = window._nextParticipantTournamentMatchTarget(tournament);
    return { ana, bia };
  });
  ok(perUserTarget.ana && perUserTarget.ana.matchId === 'ana-proximo' &&
    perUserTarget.bia && perUserTarget.bia.matchId === 'bia-proximo',
    'o mesmo torneio leva cada usuário ao próprio próximo jogo, nunca a um id fixo ou global');
  ok(store.includes('window._setTournamentMatchTarget(tournamentId, null, null);') &&
    !store.includes('window._nextScheduledTournamentMatchTarget(_tournament)'),
    'o clique genérico persiste intenção sem id para o detalhe usar a agenda já montada');
  ok(tournaments.includes('window._nextScheduledTournamentMatchTarget = function(t)') &&
    tournaments.includes("category: '__upcoming'"),
    'o alvo genérico força a aba Próximos jogos antes de o detalhe ser renderizado');
  const routeTargetStart = tournaments.indexOf('var _openedFromDashboard');
  const routeTargetEnd = tournaments.indexOf('if (_pendingBracketTarget && _pendingBracketTarget.tab', routeTargetStart);
  const routeTarget = routeTargetStart < 0 || routeTargetEnd < 0 ? '' : tournaments.slice(routeTargetStart, routeTargetEnd);
  ok(routeTarget.includes('window._nextParticipantTournamentMatchTarget(_detailTournamentForTarget)') &&
    routeTarget.includes('window._nextScheduledTournamentMatchTarget(_detailTournamentForTarget)') &&
    routeTarget.indexOf('_nextParticipantTournamentMatchTarget') < routeTarget.indexOf('_nextScheduledTournamentMatchTarget'),
    'a entrada genérica calcula primeiro o próximo jogo do usuário; agenda global é só fallback');
  ok(tournaments.includes("sessionStorage.setItem('sp_scrollToMatch', String(_pendingBracketTarget.matchId))") &&
    bracket.includes("sessionStorage.getItem('sp_scrollToMatch')") &&
    bracket.includes("document.getElementById('card-' + String(_pm))"),
    'o alvo persistido chega ao leitor da chave depois que o card é montado');
  const explicitMatchRead = bracket.indexOf('var _pm = null;');
  const phaseAdvanceFallback = bracket.indexOf("var _adv = document.getElementById('phase-advance-banner');");
  ok(explicitMatchRead >= 0 && phaseAdvanceFallback > explicitMatchRead,
    'um jogo explícito vence o banner de avançar fase: o destino não cai no topo do card do torneio');
  const applyStart = bracket.indexOf('function _applyMyMatchesFilter()');
  const pendingStart = bracket.indexOf('if (window._bracketPendingScroll)', applyStart);
  const applyBlock = bracket.slice(applyStart, pendingStart);
  ok(!applyBlock.includes('if (!cards.length) return;') &&
    applyBlock.includes('if (cards.length) window._bracketApplyFilter();'),
    'organizador sem jogo próprio ainda consome a rolagem pendente da dashboard');
  const pendingReaderStart = bracket.indexOf('if (window._bracketPendingScroll)', applyStart);
  const pendingReader = pendingReaderStart < 0 ? '' : bracket.slice(pendingReaderStart, pendingReaderStart + 6000);
  ok(tournaments.includes('window._bracketPendingScroll = String(tournamentId);') &&
    pendingReader.includes("setTimeout(function () { _goMine('smooth'); }, 80);") &&
    pendingReader.includes('var _el = _alvoDeEntrada();'),
    'o alvo explícito arma o leitor da agenda, que espera os cards e rola para o mesmo alvo');

  await browser.close();
  console.log('\n' + (fail ? '❌' : '✅') + ' dashboard-card-opens-next-game: ' + pass + ' ok, ' + fail + ' falharam');
  process.exitCode = fail ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
