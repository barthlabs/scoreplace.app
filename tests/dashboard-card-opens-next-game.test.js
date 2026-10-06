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
  await page.addScriptTag({ content: section('window._nextScheduledTournamentMatchTarget = function', 'window._scrollToBracketSection = function') });
  await page.addScriptTag({ content: section('window._scrollToBracketSection = function', '// v2.7.85: funções de DUPLA') });

  const result = await page.evaluate(async () => {
    const card = (id, at, court, resultAt, num) =>
      '<article id="card-' + id + '" data-bracket-scheduled-at="' + at + '" data-bracket-court="' + court +
      '" data-bracket-result-at="' + (resultAt || '') + '" data-match-num="' + num +
      '" data-bracket-tab-gender="fem">' + id + '</article>';
    document.body.innerHTML = '<main id="view-container">' +
      '<nav data-bracket-tabs-root="1" data-tournament-id="neon"></nav>' +
      '<section id="published">' +
        card('played', 1000, 'Quadra 1', 1200, 1) +
        card('later', 2000, 'Quadra 1', '', 2) +
        card('earlier-court-5', 1500, 'Quadra 5', '', 4) +
        card('earlier-court-4', 1500, 'Quadra 4', '', 3) +
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
      root._bracketGeneralView.appendChild(document.getElementById('card-earlier-court-4'));
    };
    Element.prototype.scrollIntoView = function () { scrolled.push(this.id || this.textContent); };

    window._scrollToBracketSection('neon');
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { selected, scrolled };
  });

  console.log('\n📋 Card da dashboard abre o próximo jogo, não a classificação');
  ok(result.selected.length === 1 && result.selected[0].join(',') === 'neon,fem,__upcoming,',
    'a entrada genérica ativa Próximos jogos no gênero do próximo jogo');
  ok(result.scrolled[0] === 'card-earlier-court-4',
    'o foco usa o primeiro jogo sem resultado por horário e depois por quadra');
  ok(result.scrolled.indexOf('inline-bracket-container') === -1,
    'a classificação inline nunca é usada como fallback quando há agenda');
  const target = await page.evaluate(() => {
    window._collectAllMatches = (t) => t.matches;
    return window._nextScheduledTournamentMatchTarget({ matches: [
      { id: 'done', winner: 'a', scheduledAt: '2026-10-22T18:00:00Z', court: 'Quadra 1', _gameNum: 1, category: 'Fem Light' },
      { id: 'unscheduled', court: 'Quadra 1', _gameNum: 2, category: 'Fem Light' },
      { id: 'court-5', scheduledAt: { seconds: 1792694100 }, court: 'Quadra 5', _gameNum: 4, category: 'Fem Power' },
      { id: 'court-4', scheduledAt: { toMillis: () => 1792694100000 }, court: 'Quadra 4', _gameNum: 3, category: 'Fem Light' }
    ] });
  });
  ok(target && target.matchId === 'court-4' && target.tab.category === '__upcoming' && target.tab.gender === 'fem',
    'o alvo persistido é o primeiro jogo pendente por horário e quadra, na aba Próximos jogos');
  ok(store.includes('window._nextScheduledTournamentMatchTarget(_tournament)') &&
    store.includes('_target && _target.matchId ? _target.matchId : null'),
    'o clique genérico calcula e persiste o primeiro jogo agendado, não um alvo vazio');
  ok(tournaments.includes('window._nextScheduledTournamentMatchTarget = function(t)') &&
    tournaments.includes("category: '__upcoming'"),
    'o alvo genérico força a aba Próximos jogos antes de o detalhe ser renderizado');
  ok(tournaments.includes("sessionStorage.setItem('sp_scrollToMatch', String(_pendingBracketTarget.matchId))") &&
    bracket.includes("sessionStorage.getItem('sp_scrollToMatch')") &&
    bracket.includes("document.getElementById('card-' + String(_pm))"),
    'o alvo persistido chega ao leitor da chave depois que o card é montado');
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
