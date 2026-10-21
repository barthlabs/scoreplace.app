/* A aba Geral da chave concentrada é uma agenda por DIA — node tests/bracket-geral-agenda.test.js
 *
 * Não é teste de texto: carrega as funções reais no Chromium e toca as abas reais.
 * Mede a falha que não pode voltar: Geral move cards sem cloná-los, inclui categorias
 * de qualquer gênero no mesmo dia, restaura tudo ao sair e não deixa wrappers órfãos
 * se um novo render (por exemplo, depois de salvar placar) desmonta a chave.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
let pass = 0, fail = 0;
function ok(condition, message) {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
}
function trecho(inicio, fim) {
  const from = src.indexOf('function ' + inicio);
  const to = src.indexOf('\nfunction ' + fim, from);
  if (from < 0 || to < 0) throw new Error('função real não encontrada: ' + inicio);
  return src.slice(from, to);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  // A ordem é proposital: _limpar chama _bracketGeneralView, como no arquivo real.
  await page.addScriptTag({ content: trecho('_limparCamadasTransitóriasDaChave', '_pintarEmEtapas') });
  await page.addScriptTag({ content: trecho('_bracketOperationalCards', '_bracketToggleEmptySourceRounds') });
  await page.addScriptTag({ content: trecho('_bracketToggleEmptySourceRounds', '_bracketGeneralView') });
  await page.addScriptTag({ content: trecho('_bracketFocusOperationalCard', '_bracketGeneralView') });
  await page.addScriptTag({ content: trecho('_bracketGeneralView', '_bracketTabsApply') });
  await page.addScriptTag({ content: trecho('_bracketTabsApply', '_bracketSyncRoundHeadingOffsets') });

  const result = await page.evaluate(async () => {
    window._bracketTabsRefreshRoundRail = function () {};
    window._bracketLayoutEliminationTree = function () {};
    window._bracketIsEliminationTree = function () { return false; };
    // A Geral sincroniza a régua após mover os cards. Este teste carrega só o
    // recorte da função real, então fornece a mesma dependência inofensiva que
    // existe no arquivo completo sem iniciar outro portal dentro do Chromium.
    window._bracketSyncRoundHeadingOffsets = function () {};
    const at = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour + 3, minute);
    const card = (id, gender, category, when, court, upcoming, round, presence, resultAt) =>
      '<div class="wrap" data-wrap="' + id + '"><article class="sp-match-card" id="' + id + '" data-bracket-tab-category="' + category +
      '" data-bracket-tab-gender="' + gender + '" data-bracket-tab-round="' + (round || 1) + '" data-bracket-scheduled-at="' + when +
      '" data-bracket-court="' + court + '" data-bracket-upcoming="' + (upcoming ? '1' : '0') + '" data-bracket-presence="' + (presence || '') + '" data-bracket-result-at="' + (resultAt || '') + '">' + id + '</article></div>';
    document.body.innerHTML =
      '<main id="view-container"><nav data-bracket-tabs-root="1" data-tournament-id="neon" data-bracket-line-tabs="0" data-bracket-round-tabs="0">' +
        '<button id="geral" data-bracket-subtab="__general" data-bracket-tab-gender="fem">Geral</button>' +
        '<button id="upcoming" data-bracket-subtab="__upcoming" data-bracket-tab-gender="fem">Próximos jogos</button>' +
        '<button id="light" data-bracket-subtab="Light" data-bracket-tab-gender="fem">Light</button>' +
      '</nav><section class="bracket-scroll-container" id="source">' +
        card('fem-court-5', 'fem', 'Light', at(22, 18), 'Quadra 5', true) +
        card('masc-same-day', 'masc', 'Power', at(22, 18), 'Quadra 4') +
        card('fem-round-2', 'fem', 'Light', at(22, 18, 35), 'Quadra 5', true, 1) +
        card('fem-waiting', 'fem', 'Power', at(22, 18), 'Quadra 6', false, 1, 'partial') +
        card('tomorrow', 'fem', 'Extreme', at(23, 18), 'Quadra 4', true, 2) +
      '</section><section id="tourn-grid-container">Detalhe do torneio</section></main>';
    const scope = document.getElementById('view-container');
    const root = document.querySelector('[data-bracket-tabs-root]');
    root._bracketTabsScope = scope;
    document.getElementById('geral').addEventListener('click', () => window._bracketSelectCategoryTab('neon', 'fem', '__general', ''));
    document.getElementById('upcoming').addEventListener('click', () => window._bracketSelectCategoryTab('neon', 'fem', '__upcoming', ''));
    document.getElementById('light').addEventListener('click', () => window._bracketSelectCategoryTab('neon', 'fem', 'Light', ''));

    document.getElementById('geral').click();
    const agenda = root._bracketGeneralView;
    const inAgenda = Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).map((el) => el.id);
    const generalState = {
      sourceHidden: document.getElementById('source').hidden,
      order: inAgenda,
      noClone: new Set(inAgenda).size === inAgenda.length && document.querySelectorAll('#fem-court-5').length === 1,
      visibleCards: Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).every((el) => !el.hidden),
      roundColumns: Array.from(agenda.querySelectorAll('h4')).map((el) => el.textContent.trim()),
      followsDetails: agenda.previousElementSibling && agenda.previousElementSibling.id === 'tourn-grid-container'
    };

    document.getElementById('upcoming').click();
    const upcomingState = {
      sourceHidden: document.getElementById('source').hidden,
      order: Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).map((el) => el.id),
      visibleCards: Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).every((el) => !el.hidden),
      separatePresenceSection: !!agenda.querySelector('[data-bracket-upcoming-waiting]'),
      partialRoundHeading: agenda.querySelector('#fem-waiting').closest('.bracket-general-round-column').querySelector('h4').textContent.trim()
    };

    // Resultado persistido não pertence à fila operacional numa abertura
    // normal. Só o último placar confirmado nesta mesma sessão de tela fica
    // visível para conferência; o histórico não volta após recarregar.
    document.getElementById('source').insertAdjacentHTML('beforeend',
      card('played-old', 'fem', 'Light', at(22, 19), 'Quadra 4', false, 1, '', 100) +
      card('played-mid', 'fem', 'Light', at(22, 19), 'Quadra 5', false, 1, '', 200) +
      card('played-new', 'fem', 'Light', at(22, 19), 'Quadra 6', false, 1, '', 300));
    document.getElementById('light').click();
    document.getElementById('upcoming').click();
    const freshUpcomingResults = Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).map((el) => el.id);
    window._bracketJustScoredByTournament = { neon: 'played-new' };
    document.getElementById('upcoming').click();
    const justScoredResults = Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).map((el) => el.id);

    document.getElementById('light').click();
    const restored = {
      sourceVisible: !document.getElementById('source').hidden,
      originalOrder: Array.from(document.querySelectorAll('#source > .wrap')).map((el) => el.getAttribute('data-wrap')),
      agendaHidden: agenda.style.display === 'none'
    };

    document.getElementById('geral').click();
    // Reentrar na mesma aba já moveu os wrappers uma vez; não pode apagá-los
    // ao limpar a visão transitória antes da nova montagem.
    document.getElementById('geral').click();
    const generalReentry = {
      order: Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).map((el) => el.id),
      visible: Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).every((el) => !el.hidden)
    };
    const orphanPortal = document.createElement('div');
    orphanPortal.setAttribute('data-bracket-round-heading-portal', '1');
    document.body.appendChild(orphanPortal);
    window._limparCamadasTransitóriasDaChave(scope);
    const cleanup = {
      rootGone: !document.querySelector('[data-bracket-tabs-root]'),
      agendaGone: !document.querySelector('[data-bracket-general-view]'),
      cardsReturned: Array.from(document.querySelectorAll('#source > .wrap')).map((el) => el.getAttribute('data-wrap')),
      portalGone: !document.querySelector('[data-bracket-round-heading-portal]')
    };

    // Horário ausente não é "agenda no fim": é ausência de agenda. A função
    // não pode deslocar card algum nem abrir uma visão vazia quando recebe esse
    // dado legado/incompleto (a montagem também esconde o botão nesse cenário).
    document.body.innerHTML = '<main id="empty-scope"><nav id="empty-root"></nav><section id="empty-source" class="bracket-scroll-container">' +
      card('without-schedule', 'fem', 'Light', 0, 'Quadra 5') + '</section></main>';
    const emptyScope = document.getElementById('empty-scope');
    const emptyRoot = document.getElementById('empty-root');
    emptyRoot._bracketTabsScope = emptyScope;
    const noScheduleResult = window._bracketGeneralView(emptyRoot, true, 'fem');
    const noSchedule = {
      returnedFalse: noScheduleResult === false,
      sourceStillVisible: !document.getElementById('empty-source').hidden,
      noMovedCards: document.querySelectorAll('[data-bracket-general-view] [data-bracket-tab-category]').length === 0
    };

    // Na tela real a barra pode estar dentro do mesmo trilho da chave. A Geral
    // não pode ocultar seu próprio portal por esconder esse ancestral.
    document.body.innerHTML = '<main id="nested-scope"><section id="nested-source" class="bracket-scroll-container"><nav id="nested-root"></nav>' +
      card('played-card', 'fem', 'Extreme', at(22, 18), 'Quadra 4', false) + '</section></main>';
    const nestedRoot = document.getElementById('nested-root');
    nestedRoot._bracketTabsScope = document.getElementById('nested-scope');
    const nestedShown = window._bracketGeneralView(nestedRoot, true, 'fem');
    const nested = {
      shown: nestedShown,
      sourceVisible: !document.getElementById('nested-source').hidden,
      movedVisible: !!nestedRoot._bracketGeneralView.querySelector('#played-card') && !nestedRoot._bracketGeneralView.querySelector('#played-card').hidden
    };

    // Reproduz o detalhe real: a chave inline só traz a classificação e os
    // cabeçalhos, mas os cards agendados pertencem ao detalhe inteiro.
    document.body.innerHTML = '<main id="detail-scope"><section id="published-agenda" class="bracket-scroll-container">' +
      card('real-scheduled', 'fem', 'Light', at(22, 18), 'Quadra 5', true) +
      '</section><section id="inline-bracket-container"><nav id="external-root"></nav><section class="bracket-round-column"><h4 class="bracket-round-heading">Rodada 1</h4></section></section></main>';
    const externalRoot = document.getElementById('external-root');
    externalRoot._bracketTabsScope = document.getElementById('inline-bracket-container');
    externalRoot._bracketCardsScope = document.getElementById('detail-scope');
    const externalShown = window._bracketGeneralView(externalRoot, true, 'fem');
    const externalSource = {
      shown: externalShown,
      cards: Array.from(externalRoot._bracketGeneralView.querySelectorAll('[data-bracket-tab-category]')).map((el) => el.id),
      emptyHeadingHidden: document.querySelector('#inline-bracket-container .bracket-round-column:not(.bracket-general-round-column) .bracket-round-heading').hidden
    };

    // A categoria de evento com grade usa as MESMAS faixas horárias da Geral,
    // mesmo quando o round interno do sorteio cruza dias e horários.
    document.body.innerHTML = '<main id="team-scope"><nav id="team-root" data-bracket-tabs-root="1" data-tournament-id="neon-team" data-bracket-team-schedule="1" data-bracket-line-tabs="0" data-bracket-round-tabs="0">' +
      '<button data-bracket-primary-tab="fem">Feminina</button>' +
      '<button data-bracket-subtab="__general" data-bracket-tab-gender="fem">Geral</button>' +
      '<button data-bracket-subtab="Fem Light" data-bracket-tab-gender="fem">Light</button>' +
      '<button data-bracket-subtab="Fem Power" data-bracket-tab-gender="fem">Power</button></nav>' +
      '<section id="team-source" class="bracket-scroll-container">' +
      card('light-r2-early', 'fem', 'Fem Light', at(22, 18), 'Quadra 4', true, 2) +
      card('light-r1-late', 'fem', 'Fem Light', at(22, 18, 35), 'Quadra 5', true, 1) +
      card('light-day2', 'fem', 'Fem Light', at(23, 18), 'Quadra 4', true, 3) +
      card('power-early', 'fem', 'Fem Power', at(22, 18), 'Quadra 6', true, 1) +
      '</section></main>';
    const teamRoot = document.getElementById('team-root');
    teamRoot._bracketTabsScope = document.getElementById('team-scope');
    window._bracketSelectCategoryTab('neon-team', 'fem', 'Fem Light', '');
    const categorySchedule = {
      headings: Array.from(teamRoot._bracketGeneralView.querySelectorAll('.bracket-general-round-column h4')).map(el => el.textContent.trim()),
      games: Array.from(teamRoot._bracketGeneralView.querySelectorAll('[data-bracket-tab-category]')).map(el => el.id),
      stickyContract: Array.from(teamRoot._bracketGeneralView.querySelectorAll('.bracket-general-round-column')).every(col =>
        col.classList.contains('bracket-round-column') && !!col.querySelector('h4.bracket-round-heading'))
    };
    window._bracketSelectCategoryTab('neon-team', 'fem', '__general', '');
    categorySchedule.generalAfterCategory = teamRoot._bracketGeneralView.querySelectorAll('.sp-match-card').length;
    window._bracketSelectCategoryTab('neon-team', 'fem', 'Fem Power', '');
    categorySchedule.powerAfterGeneral = teamRoot._bracketGeneralView.querySelectorAll('.sp-match-card').length;
    document.getElementById('team-source').insertAdjacentHTML('beforeend',
      card('light-unscheduled', 'fem', 'Fem Light', 0, 'Quadra 4', false, 4));
    window._bracketSelectCategoryTab('neon-team', 'fem', 'Fem Light', '');
    categorySchedule.partialFallback = !document.getElementById('team-source').hidden &&
      teamRoot._bracketGeneralView.style.display === 'none' &&
      Array.from(document.querySelectorAll('#team-source .sp-match-card:not([hidden])')).filter(el =>
        el.getAttribute('data-bracket-tab-category') === 'Fem Light').length === 4;

    // Abas por data recortam a agenda antes de formar as colunas. Na sexta há
    // categorias femininas e masculinas; voltar à quinta restaura os wrappers.
    document.body.innerHTML = '<main id="date-scope"><nav id="date-root" data-bracket-tabs-root="1" data-tournament-id="dated" data-bracket-date-tabs="1" data-bracket-team-schedule="1" data-bracket-line-tabs="0" data-bracket-round-tabs="0">' +
      '<button data-bracket-primary-tab="2026-10-22">22/10</button><button data-bracket-primary-tab="2026-10-23">23/10</button>' +
      '<button data-bracket-subtab="__general" data-bracket-tab-gender="2026-10-22">Geral</button>' +
      '<button data-bracket-subtab="__general" data-bracket-tab-gender="2026-10-23">Geral</button>' +
      '<button data-bracket-subtab="Fem Light" data-bracket-tab-gender="2026-10-23">Fem Light</button></nav>' +
      '<section id="date-source" class="bracket-scroll-container">' +
      card('thu-r8', 'fem', 'Fem Light', at(22, 22, 5), 'Quadra 4', true).replace('data-bracket-court=', 'data-bracket-tab-day="2026-10-22" data-bracket-court=') +
      card('fri-fem-r1', 'fem', 'Fem Light', at(23, 18), 'Quadra 4', true).replace('data-bracket-court=', 'data-bracket-tab-day="2026-10-23" data-bracket-court=') +
      card('fri-masc-r1', 'masc', 'Masc Extreme', at(23, 18), 'Quadra 5', true).replace('data-bracket-court=', 'data-bracket-tab-day="2026-10-23" data-bracket-court=') +
      '</section></main>';
    const dateRoot = document.getElementById('date-root');
    dateRoot._bracketTabsScope = document.getElementById('date-scope');
    window._bracketSelectCategoryTab('dated', '2026-10-22', '__general', '');
    const thursday = Array.from(dateRoot._bracketGeneralView.querySelectorAll('.sp-match-card')).map(el => el.id);
    window._bracketSelectCategoryTab('dated', '2026-10-23', '__general', '');
    const friday = Array.from(dateRoot._bracketGeneralView.querySelectorAll('.sp-match-card')).map(el => el.id);
    window._bracketSelectCategoryTab('dated', '2026-10-23', 'Fem Light', '');
    const fridayCategory = Array.from(dateRoot._bracketGeneralView.querySelectorAll('.sp-match-card')).map(el => el.id);
    window._bracketSelectCategoryTab('dated', '2026-10-22', '__general', '');
    const thursdayAgain = Array.from(dateRoot._bracketGeneralView.querySelectorAll('.sp-match-card')).map(el => el.id);
    const dateTabs = { thursday, friday, fridayCategory, thursdayAgain,
      noDuplicate: document.querySelectorAll('#thu-r8').length === 1 && document.querySelectorAll('#fri-fem-r1').length === 1 };

    // Reproduz a sobra da chave interna do Neon: a sexta usa os jogos da
    // agenda, enquanto o wrapper da fase ainda contém cards de outra data.
    // O título da fase e as rodadas vazias devem sumir junto com esse wrapper;
    // uma categoria sem agenda completa restaura a chave canônica.
    document.body.innerHTML = '<main id="view-container"><nav data-bracket-tabs-root="1" data-tournament-id="dated-phase" data-bracket-date-tabs="1" data-bracket-team-schedule="1" data-bracket-line-tabs="0" data-bracket-round-tabs="0">' +
      '<button data-bracket-primary-tab="2026-10-22">22/10</button><button data-bracket-primary-tab="2026-10-23">23/10</button>' +
      '<button data-bracket-subtab="Masc Light" data-bracket-tab-gender="2026-10-22">Masc Light</button>' +
      '<button data-bracket-subtab="Masc Light" data-bracket-tab-gender="2026-10-23">Masc Light</button></nav>' +
      '<section id="published-agenda">' +
      card('friday-published', 'masc', 'Masc Light', at(23, 18), 'Quadra 4', true).replace('data-bracket-court=', 'data-bracket-tab-day="2026-10-23" data-bracket-court=') +
      '</section><section id="inline-bracket-container"><section id="team-ranking">Classificação geral dos times</section>' +
      '<div id="legacy-phase"><div class="team-schedule-bracket"><div class="bracket-round-column"><h4 class="bracket-round-heading">Rodada 1</h4>' +
      card('thursday-unscheduled', 'masc', 'Masc Light', 0, 'Quadra 5', false).replace('data-bracket-court=', 'data-bracket-tab-day="2026-10-22" data-bracket-court=') +
      '</div></div></div></section></main>';
    const phaseRoot = document.querySelector('[data-bracket-tabs-root]');
    phaseRoot._bracketTabsScope = document.getElementById('view-container');
    phaseRoot._bracketCardsScope = document.getElementById('view-container');
    window._bracketSelectCategoryTab('dated-phase', '2026-10-23', 'Masc Light', '');
    const emptyPhaseHidden = getComputedStyle(document.getElementById('legacy-phase')).display === 'none' &&
      getComputedStyle(document.getElementById('team-ranking')).display !== 'none' &&
      !!document.querySelector('[data-bracket-general-view] #friday-published');
    window._bracketSelectCategoryTab('dated-phase', '2026-10-22', 'Masc Light', '');
    const canonicalPhaseRestored = getComputedStyle(document.getElementById('legacy-phase')).display !== 'none' &&
      !document.getElementById('thursday-unscheduled').hidden;
    const groupTable = document.createElement('table');
    groupTable.textContent = 'Classificação do grupo';
    document.getElementById('legacy-phase').appendChild(groupTable);
    window._bracketSelectCategoryTab('dated-phase', '2026-10-23', 'Masc Light', '');
    const groupTablePreserved = getComputedStyle(document.getElementById('legacy-phase')).display !== 'none' &&
      getComputedStyle(groupTable).display !== 'none';
    groupTable.remove();
    window._bracketSelectCategoryTab('dated-phase', '2026-10-23', 'Masc Light', '');
    phaseRoot.setAttribute('data-bracket-date-tabs', '0');
    window._bracketSelectCategoryTab('dated-phase', '2026-10-23', 'Masc Light', '');
    const modeRestored = getComputedStyle(document.getElementById('legacy-phase')).display !== 'none';
    const emptyPhase = { hidden: emptyPhaseHidden, restored: canonicalPhaseRestored,
      groupTablePreserved, modeRestored };

    // Se a rota desmontou o escopo antes da agenda montar, o horário sozinho
    // não pode deixar a categoria em branco: o card canônico continua visível.
    document.body.innerHTML = '<nav id="orphan-root" data-bracket-tabs-root="1" data-tournament-id="orphan-team" data-bracket-team-schedule="1" data-bracket-line-tabs="0" data-bracket-round-tabs="1">' +
      '<button data-bracket-primary-tab="fem">Feminina</button><button data-bracket-subtab="Fem Light" data-bracket-tab-gender="fem">Light</button>' +
      '<button data-bracket-round-tab="1" data-bracket-tab-category="Fem Light" data-bracket-tab-gender="fem">R1</button>' +
      '<button data-bracket-round-tab="2" data-bracket-tab-category="Fem Light" data-bracket-tab-gender="fem">R2</button></nav>' +
      '<section id="orphan-source" class="bracket-scroll-container">' +
      card('orphan-r1', 'fem', 'Fem Light', at(22, 18), 'Quadra 4', true, 1) +
      card('orphan-r2', 'fem', 'Fem Light', at(22, 18, 35), 'Quadra 5', true, 2) + '</section>';
    window._bracketSelectCategoryTab('orphan-team', 'fem', 'Fem Light', '2');
    categorySchedule.missingScopeFallback = document.getElementById('orphan-r1').hidden &&
      !document.getElementById('orphan-r2').hidden &&
      document.getElementById('orphan-source').contains(document.getElementById('orphan-r2'));

    // Ao abrir Geral/Próximos, a âncora é sempre o primeiro jogo sem placar
    // por horário e quadra — presença ainda incompleta não pode fazer um jogo
    // posterior saltar para o topo da agenda.
    document.body.innerHTML = '<main id="focus-scope"><nav id="focus-root"></nav><section id="focus-source" class="bracket-scroll-container">' +
      card('focus-pending', 'fem', 'Light', at(22, 18), 'Quadra 4', false) +
      card('focus-ready', 'fem', 'Light', at(22, 19), 'Quadra 5', true) +
      '</section></main>';
    const focusRoot = document.getElementById('focus-root');
    focusRoot._bracketTabsScope = document.getElementById('focus-scope');
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    let focusedTop = -1;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.id === 'focus-root') return { top: 0, bottom: 50, left: 0, right: 600, width: 600, height: 50 };
      if (this.id === 'focus-pending') return { top: 240, bottom: 340, left: 0, right: 300, width: 300, height: 100 };
      if (this.id === 'focus-ready') return { top: 300, bottom: 400, left: 0, right: 300, width: 300, height: 100 };
      if (this.classList && this.classList.contains('bracket-round-heading')) return { top: 60, bottom: 100, left: 0, right: 300, width: 300, height: 40 };
      return originalRect.call(this);
    };
    window.scrollTo = function (opts) { focusedTop = typeof opts === 'object' ? Number(opts.top) : Number(arguments[1]); };
    window._bracketGeneralView(focusRoot, true, 'fem', false, true);
    await new Promise((resolve) => setTimeout(resolve, 130));
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    const nextFocus = {
      top: focusedTop,
      moved: !!focusRoot._bracketGeneralView.querySelector('#focus-pending'),
      track: !!focusRoot._bracketGeneralView.querySelector('.bracket-general-rounds-track')
    };
    return { generalState, upcomingState, freshUpcomingResults, justScoredResults, restored, generalReentry, cleanup, noSchedule, nested, externalSource, categorySchedule, dateTabs, emptyPhase, nextFocus };
  });

  console.log('\n📋 Geral é a agenda completa do torneio, não uma cópia por gênero');
  ok(result.generalState.sourceHidden, 'ao clicar Geral, a chave de origem fica fora da leitura duplicada');
  ok(result.generalState.order.join(',') === 'masc-same-day,fem-court-5,fem-waiting,fem-round-2,tomorrow', 'inclui a agenda completa, inclusive os jogos dos dias seguintes, nas colunas corretas');
  ok(result.generalState.noClone, 'os cards reais são movidos: não há id nem input duplicado');
  ok(result.generalState.visibleCards, 'os cards movidos para Geral são visíveis, não herdam o hidden do filtro de categoria');
  ok(result.generalState.roundColumns.join(',') === 'Rodada 1 · 22/10 · 18:00,Rodada 2 · 22/10 · 18:35,Rodada 1 · 23/10 · 18:00', 'Geral agrupa pelo horário da grade em cada dia, mesmo quando m.round diverge');
  ok(result.generalState.followsDetails, 'Geral fica depois do card de detalhes do torneio, mesmo quando o detalhe é irmão da chave');
  console.log('\n📋 Próximos jogos mostra todos os jogos sem placar');
  ok(result.upcomingState.sourceHidden, 'Próximos jogos também troca a chave canônica por uma única visão operacional');
  ok(result.upcomingState.order.join(',') === 'masc-same-day,fem-court-5,fem-waiting,fem-round-2,tomorrow', 'a fila inclui jogos parciais na ordem cronológica e de quadra');
  ok(!result.upcomingState.separatePresenceSection && result.upcomingState.partialRoundHeading === 'Rodada 1 · 22/10 · 18:00', 'presença parcial fica na rodada correta, sem seção separada');
  ok(result.upcomingState.visibleCards, 'o card pronto continua visível depois de mover entre Geral e Próximos jogos');
  ok(result.freshUpcomingResults.indexOf('played-new') === -1 && result.freshUpcomingResults.indexOf('played-mid') === -1 && result.freshUpcomingResults.indexOf('played-old') === -1,
    'Próximos jogos não reintroduz resultados persistidos após uma abertura nova');
  ok(result.justScoredResults.indexOf('played-new') !== -1 && result.justScoredResults.indexOf('played-mid') === -1 && result.justScoredResults.indexOf('played-old') === -1,
    'Próximos jogos conserva apenas o último placar recém-lançado na sessão atual');
  console.log('\n📋 Voltar para categoria restaura a chave canônica');
  ok(result.restored.sourceVisible && result.restored.agendaHidden, 'Light fecha a agenda e restaura a fonte');
  ok(result.restored.originalOrder.join(',') === 'fem-court-5,masc-same-day,fem-round-2,fem-waiting,tomorrow,played-old,played-mid,played-new', 'cada wrapper volta exatamente ao seu placeholder');
  ok(result.generalReentry.order.join(',') === 'masc-same-day,fem-court-5,fem-waiting,fem-round-2,played-old,played-mid,played-new,tomorrow' && result.generalReentry.visible,
    'voltar para Geral reconstrói os cards reais, sem colunas vazias');
  console.log('\n📋 Novo render limpa Geral aberta antes de substituir a chave');
  ok(result.cleanup.rootGone && result.cleanup.agendaGone, 'abas e agenda transitória são destruídas');
  ok(result.cleanup.cardsReturned.join(',') === 'fem-court-5,masc-same-day,fem-round-2,fem-waiting,tomorrow,played-old,played-mid,played-new', 'nenhum card fica órfão fora do container');
  ok(result.cleanup.portalGone, 'portal de cabeçalho de pintura anterior também é removido');
  console.log('\n📋 Sem horário não há agenda enganosa');
  ok(result.noSchedule.returnedFalse && result.noSchedule.sourceStillVisible && result.noSchedule.noMovedCards,
    'cards sem scheduledAt não são deslocados para uma Geral vazia (a montagem nem oferece a aba)');
  console.log('\n📋 Geral dentro do próprio trilho continua visível');
  ok(result.nested.shown && result.nested.sourceVisible && result.nested.movedVisible,
    'a Geral não esconde o ancestral que contém a própria agenda; inclusive jogo já concluído permanece visível');
  console.log('\n📋 Detalhe publicado e chave inline usam a mesma agenda');
  ok(result.externalSource.shown, 'Geral abre quando os cards publicados estão fora da chave inline');
  ok(result.externalSource.cards.join(',') === 'real-scheduled', 'Geral usa o card publicado, não o cabeçalho vazio da chave inline');
  ok(result.nextFocus.track && result.nextFocus.moved && result.nextFocus.top >= 0,
    'ao abrir Geral, o foco usa o primeiro jogo sem placar mesmo se sua presença ainda aguarda confirmação');
  ok(result.nextFocus.top === 120,
    'o foco reserva a régua fixa da Rodada (50px de abas + 40px de título + 30px), sem cortar o topo do card');
  ok(result.externalSource.emptyHeadingHidden, 'Geral remove cabeçalho de rodada sem jogo da chave inline');
  ok(result.categorySchedule.headings.join(',') === 'Rodada 1 · 22/10 · 18:00,Rodada 2 · 22/10 · 18:35,Rodada 1 · 23/10 · 18:00', 'a categoria usa as faixas da grade, não m.round');
  ok(result.categorySchedule.games.join(',') === 'light-r2-early,light-r1-late,light-day2', 'a categoria conserva só seus jogos reais em ordem cronológica');
  ok(result.categorySchedule.stickyContract, 'cabeçalhos da categoria usam o mesmo contrato sticky da Geral');
  ok(result.categorySchedule.generalAfterCategory === 4 && result.categorySchedule.powerAfterGeneral === 1, 'alternar categoria → Geral → outra categoria conserva todos os cards');
  ok(result.categorySchedule.partialFallback, 'categoria com jogo sem horário volta à chave canônica sem esconder a partida');
  ok(result.dateTabs.thursday.join(',') === 'thu-r8' && result.dateTabs.thursdayAgain.join(',') === 'thu-r8', 'quinta termina na sua rodada 8 mesmo depois de alternar dias');
  ok(result.dateTabs.friday.join(',') === 'fri-fem-r1,fri-masc-r1', 'sexta reúne jogos femininos e masculinos sem mostrar quinta');
  ok(result.dateTabs.fridayCategory.join(',') === 'fri-fem-r1' && result.dateTabs.noDuplicate, 'categoria da sexta respeita a data e nenhum card é duplicado');
  ok(result.emptyPhase.hidden && result.emptyPhase.restored && result.emptyPhase.groupTablePreserved && result.emptyPhase.modeRestored,
    'a agenda esconde rodadas vazias, preserva tabelas de classificação e restaura a chave ao trocar de modo');
  ok(result.categorySchedule.missingScopeFallback, 'falha de montagem executa o filtro canônico e preserva só a rodada selecionada');

  const stableAgenda = await page.evaluate(() => {
    const at = Date.UTC(2026, 9, 22, 21);
    const make = (num, court) => '<div class="wrap"><article class="sp-match-card" id="card-m' + num +
      '" data-bracket-scheduled-at="' + at + '" data-bracket-tab-day="2026-10-22" data-bracket-tab-category="Fem Light"' +
      ' data-bracket-tab-round="1" data-scheduled-game-number="' + num + '" data-bracket-court="Quadra ' + court + '">Jogo ' + num + '</article></div>';
    document.body.innerHTML = '<main id="view-container"><nav id="agenda-root" data-bracket-date-tabs="1"></nav>' +
      '<section id="agenda-source" class="bracket-scroll-container">' + make(3, 4) + make(2, 5) + make(1, 6) + '</section></main>';
    const root = document.getElementById('agenda-root');
    root._bracketTabsScope = document.getElementById('view-container');
    window._matchCardTimestamp = value => Date.parse(value);
    window._collectAllMatches = t => t.matches || [];
    window._currentBracketTournament = { _nJogos: 3, matches: [1, 2, 3].map(num => ({
      id: 'm' + num, scheduledAt: '2026-10-22T18:00:00-03:00', category: 'Fem Light'
    })) };
    window._bracketGeneralView(root, true, '2026-10-22');
    const order = () => [...root._bracketGeneralView.querySelectorAll('.sp-match-card')].map(c => c.id);
    const initial = order();
    document.getElementById('card-m1').setAttribute('data-bracket-court', 'Quadra 9');
    window._bracketGeneralView(root, true, '2026-10-22');
    const afterCourt = order();
    window._currentBracketTournament.matches.pop();
    window._bracketGeneralView(root, true, '2026-10-22');
    const afterPartial = order();
    window._currentBracketTournament.matches = [1, 2, 3].map(num => ({
      id: 'm' + num, scheduledAt: num === 1 ? '2026-10-23T18:00:00-03:00' : '2026-10-22T18:00:00-03:00',
      category: 'Fem Light'
    }));
    document.getElementById('card-m1').setAttribute('data-bracket-tab-day', '2026-10-23');
    document.getElementById('card-m1').setAttribute('data-bracket-scheduled-at', String(Date.UTC(2026, 9, 23, 21)));
    window._bracketGeneralView(root, true, '2026-10-22');
    const afterReschedule = order();
    return { initial, afterCourt, afterPartial, afterReschedule };
  });
  ok(stableAgenda.initial.join(',') === 'card-m1,card-m2,card-m3' &&
    stableAgenda.afterCourt.join(',') === stableAgenda.initial.join(','),
    'Geral ordena pelo JOGO canônico e não muda ao redesignar quadra');
  ok(stableAgenda.afterPartial.join(',') === stableAgenda.initial.join(','),
    'eco parcial não apaga jogos já exibidos na Geral');
  ok(stableAgenda.afterReschedule.join(',') === 'card-m2,card-m3',
    'reagendamento completo retira o jogo do dia antigo sem congelar a Geral');

  // O portal usa retângulos de viewport, mas nasce dentro do body com zoom.
  // Medir três colunas prova que o erro não cresce a cada rodada.
  await page.addScriptTag({ content: trecho('_bracketUpdateRoundHeadingPortal', '_bracketEnsureRoundHeadingResizeListener') });
  const alignment = await page.evaluate(() => [1, 1.2].map((zoom) => {
    document.body.style.zoom = String(zoom);
    document.body.innerHTML = '<main><nav id="round-tabs" style="position:fixed;top:0;left:20px;width:960px;height:70px;"></nav>' +
      '<section id="rounds" style="display:flex;gap:20px;margin-top:45px;">' +
      [1, 2, 3].map((round) => '<div class="bracket-round-column" style="flex:0 0 280px;height:220px;">' +
        '<h4 class="bracket-round-heading" style="margin:0;height:40px;">Rodada ' + round + '</h4>' +
        '<article style="height:160px;">Jogo ' + round + '</article></div>').join('') + '</section></main>';
    const root = document.getElementById('round-tabs');
    const scope = document.getElementById('rounds');
    root._bracketGeneralView = scope;
    _bracketUpdateRoundHeadingPortal(root, scope);
    const headings = [...scope.querySelectorAll('.bracket-round-heading')];
    const clones = [...root._bracketRoundHeadingPortal.querySelectorAll('.bracket-round-heading-portal')];
    const portalTop = root._bracketRoundHeadingPortal.getBoundingClientRect().top;
    const expectedTop = Math.floor(root.getBoundingClientRect().bottom) - 24;
    return { zoom, count: clones.length, topError: Math.abs(portalTop - expectedTop), maxError: Math.max(...clones.map((clone, index) =>
      Math.max(Math.abs(clone.getBoundingClientRect().left - headings[index].getBoundingClientRect().left),
        Math.abs(clone.getBoundingClientRect().width - headings[index].getBoundingClientRect().width)))) };
  }));
  ok(alignment.every((item) => item.count === 3 && item.maxError < 1 && item.topError < 1),
    'cabeçalhos fixos seguem as três colunas e o topo das abas com zoom normal e ampliado');

  // Reproduz o defeito da ficha real: a busca não foi emitida, a raiz e seu
  // portal nasceram em um grupo que a Geral esconde, mas a agenda é irmã dele.
  // A montagem precisa tirá-los dali e manter as abas clicáveis após scroll.
  await page.addScriptTag({ content: trecho('_bracketFindTabsRoot', '_bracketIsEliminationTree') });
  await page.addScriptTag({ content: src.slice(src.indexOf('function _bracketTabsHostReference'), src.indexOf('// O filtro pode encontrar jogos', src.indexOf('function _bracketTabsHostReference'))) });
  const stickyMount = await page.evaluate(async () => {
    document.body.style.zoom = '';
    document.body.style.margin = '0';
    document.body.style.setProperty('--topbar-h', '0px');
    document.body.style.setProperty('--backheader-h', '60px');
    document.body.innerHTML = '<main id="view-container" style="min-height:2500px;background:#111114">' +
      '<div class="sticky-back-header" style="position:sticky;top:0;height:60px;background:#111114;z-index:40">Voltar</div>' +
      '<div id="tourn-grid-container" style="height:220px">Detalhes</div>' +
      '<section data-bracket-general-view="1" style="height:1600px"><div class="bracket-general-round-column" style="height:1500px;width:300px">' +
      '<h4 class="bracket-round-heading" style="height:40px;margin:0">Rodada 1</h4></div></section>' +
      '<div id="inline-bracket-container"><div id="group-section-0" style="display:none">' +
      '<nav data-bracket-tabs-root="1" data-tournament-id="sticky-fixture" style="position:sticky;top:59px;height:78px;background:#111114;z-index:31"></nav>' +
      '<div data-bracket-round-heading-portal="1"></div>' +
      '<article data-bracket-tab-category="Light" data-bracket-tab-gender="fem" data-bracket-scheduled-at="1"></article>' +
      '<article data-bracket-tab-category="Power" data-bracket-tab-gender="fem" data-bracket-scheduled-at="2"></article>' +
      '</div></div></main>';
    const oldRoot = document.querySelector('[data-bracket-tabs-root]');
    oldRoot._bracketRoundHeadingPortal = document.querySelector('[data-bracket-round-heading-portal]');
    oldRoot._bracketGeneralView = document.querySelector('[data-bracket-general-view]');
    window._currentBracketTournament = { id: 'sticky-fixture', matches: [], teamCompetition: { enabled: true, schedule: { enabled: true } } };
    window._collectAllMatches = () => [];
    window._bracketTabGender = () => 'fem';
    window._bracketScheduledDay = () => '2026-10-22';
    window._bracketTabLabel = (cat) => cat;
    window._bracketIsEliminationTree = () => false;
    window._bracketTabsPlaceSearch = (root, search) => { if (search) root.querySelector('[data-bracket-search-slot="inline"]').appendChild(search); };
    window._bracketTabsObserveSearchLayout = () => {};
    window._bracketEnsureRoundHeadingResizeListener = () => {};
    window._bracketTabsRefreshRoundRail = () => {};
    window._bracketLayoutEliminationTree = () => {};
    window._bracketSelectCategoryTab = (_id, _gender, category) => { window.__selectedBracketTab = category; };
    window._bracketTabsApply = (_id, _gender, category) => { window.__selectedBracketTab = category; };
    window._bracketSyncRoundHeadingOffsets = () => {
      const root = document.querySelector('[data-bracket-tabs-root]');
      if (root) _bracketUpdateRoundHeadingPortal(root, root._bracketTabsScope || document.getElementById('inline-bracket-container'));
    };
    window._bracketPrimaryTabsHtml = (genderHtml) => '<div data-bracket-tabs-primary>' + genderHtml + '<div data-bracket-search-slot="inline"></div></div>';
    window._bracketCategoryTabsMount();
    const root = document.querySelector('[data-bracket-tabs-root]');
    const portal = root._bracketRoundHeadingPortal;
    window.scrollTo({ top: 550, behavior: 'instant' });
    document.documentElement.scrollTop = 550;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window._bracketSyncRoundHeadingOffsets();
    const rect = root.getBoundingClientRect();
    const portalRect = portal.getBoundingClientRect();
    const mounted = {
      rootInDetail: root.parentNode.id === 'view-container',
      afterHeader: root.previousElementSibling.classList.contains('sticky-back-header'),
      singleRoot: document.querySelectorAll('[data-bracket-tabs-root]').length === 1,
      portalTogether: portal.parentNode === root.parentNode,
      stickyTop: rect.top,
      portalVisible: getComputedStyle(portal).display !== 'none' && portalRect.width > 0 && !!portal.querySelector('.bracket-round-heading-portal'),
      portalDisplay: getComputedStyle(portal).display,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      rootBottom: rect.bottom,
      headingTop: document.querySelector('[data-bracket-general-view] .bracket-round-heading').getBoundingClientRect().top,
      columnBottom: document.querySelector('[data-bracket-general-view] .bracket-general-round-column').getBoundingClientRect().bottom,
      viewLinked: root._bracketGeneralView === document.querySelector('[data-bracket-general-view]')
    };
    root.querySelector('[data-bracket-subtab="__upcoming"]').click();
    mounted.clicked = window.__selectedBracketTab === '__upcoming';
    const search = document.createElement('div');
    search.id = 'fbwrap-chaves';
    root.appendChild(search);
    window._bracketCategoryTabsMount();
    mounted.searchRecovered = document.querySelectorAll('#fbwrap-chaves').length === 1 &&
      document.querySelector('#fbwrap-chaves').closest('[data-bracket-tabs-root]') === root;
    mounted.singleAfterRemount = document.querySelectorAll('[data-bracket-tabs-root]').length === 1 &&
      root._bracketRoundHeadingPortal.parentNode === root.parentNode;
    return mounted;
  });
  if (!stickyMount.rootInDetail || !stickyMount.afterHeader || !stickyMount.singleRoot ||
      !stickyMount.portalTogether || !stickyMount.portalVisible || !stickyMount.clicked ||
      !stickyMount.searchRecovered || !stickyMount.singleAfterRemount) console.error('  diagnóstico sticky:', stickyMount);
  ok(stickyMount.rootInDetail && stickyMount.afterHeader && stickyMount.singleRoot &&
    stickyMount.portalTogether && stickyMount.stickyTop >= 58 && stickyMount.stickyTop <= 61 &&
    stickyMount.portalVisible && stickyMount.clicked,
    'abas e títulos das rodadas ficam fixos, visíveis e clicáveis quando o grupo original está oculto');
  ok(stickyMount.searchRecovered && stickyMount.singleAfterRemount,
    'a remontagem recupera a busca sem duplicar abas e mantém o portal com sua raiz');
  const tierMount = await page.evaluate(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.body.innerHTML = '<main id="view-container"><div class="sticky-back-header">Voltar</div>' +
      '<div id="inline-bracket-container"><section id="gold"><article data-bracket-tab-category="Ouro" data-bracket-tab-gender="linhas"></article></section>' +
      '<section id="silver"><article data-bracket-tab-category="Prata" data-bracket-tab-gender="linhas"></article></section></div></main>';
    window._currentBracketTournament = { id: 'tiers-fixture', matches: [] };
    window._bracketCategoryTabsMount();
    const root = document.querySelector('[data-bracket-tabs-root]');
    document.getElementById('silver').hidden = true;
    const stillVisible = root.parentNode.id === 'view-container' && root.getClientRects().length > 0;
    root.querySelector('[data-bracket-primary-tab="Prata"]').click();
    const clicked = window.__selectedBracketTab === 'Prata';
    window._bracketCategoryTabsMount();
    return { stillVisible, clicked, oneRoot: document.querySelectorAll('[data-bracket-tabs-root]').length === 1 };
  });
  if (!tierMount.stillVisible || !tierMount.clicked || !tierMount.oneRoot) console.error('  diagnóstico linhas:', tierMount);
  ok(tierMount.stillVisible && tierMount.clicked && tierMount.oneRoot,
    'Ouro/Prata conserva a navegação fora da linha inativa e sem duplicação');

  await browser.close();
  console.log('\n' + (fail ? '❌' : '✅') + ' bracket-geral-agenda: ' + pass + ' ok, ' + fail + ' falharam');
  process.exitCode = fail ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
