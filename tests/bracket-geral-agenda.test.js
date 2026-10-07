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
    // A Geral sincroniza a régua após mover os cards. Este teste carrega só o
    // recorte da função real, então fornece a mesma dependência inofensiva que
    // existe no arquivo completo sem iniciar outro portal dentro do Chromium.
    window._bracketSyncRoundHeadingOffsets = function () {};
    const at = (day, hour) => new Date(2026, 9, day, hour, 0, 0, 0).getTime();
    const card = (id, gender, category, when, court, upcoming, round, presence, resultAt) =>
      '<div class="wrap" data-wrap="' + id + '"><article id="' + id + '" data-bracket-tab-category="' + category +
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
        card('fem-round-2', 'fem', 'Light', at(22, 20), 'Quadra 5', true, 2) +
        card('fem-waiting', 'fem', 'Power', at(22, 18), 'Quadra 6', false, 1, 'partial') +
        card('tomorrow', 'fem', 'Extreme', at(23, 18), 'Quadra 4', true) +
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
      waiting: Array.from(agenda.querySelectorAll('[data-bracket-upcoming-waiting] [data-bracket-tab-category]')).map((el) => el.id)
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
    return { generalState, upcomingState, freshUpcomingResults, justScoredResults, restored, generalReentry, cleanup, noSchedule, nested, externalSource, nextFocus };
  });

  console.log('\n📋 Geral é a agenda completa do torneio, não uma cópia por gênero');
  ok(result.generalState.sourceHidden, 'ao clicar Geral, a chave de origem fica fora da leitura duplicada');
  ok(result.generalState.order.join(',') === 'masc-same-day,fem-court-5,fem-waiting,tomorrow,fem-round-2', 'inclui a agenda completa, inclusive os jogos dos dias seguintes, nas colunas corretas');
  ok(result.generalState.noClone, 'os cards reais são movidos: não há id nem input duplicado');
  ok(result.generalState.visibleCards, 'os cards movidos para Geral são visíveis, não herdam o hidden do filtro de categoria');
  ok(result.generalState.roundColumns.join(',') === 'Rodada 1,Rodada 2', 'Geral agrupa a agenda pela rodada, com cabeçalho de coluna estável');
  ok(result.generalState.followsDetails, 'Geral fica depois do card de detalhes do torneio, mesmo quando o detalhe é irmão da chave');
  console.log('\n📋 Próximos jogos mostra todos os jogos sem placar');
  ok(result.upcomingState.sourceHidden, 'Próximos jogos também troca a chave canônica por uma única visão operacional');
  ok(result.upcomingState.order.join(',') === 'fem-waiting,masc-same-day,fem-court-5,tomorrow,fem-round-2', 'a fila inclui todos os jogos sem placar, mantendo presença parcial no topo');
  ok(result.upcomingState.waiting.join(',') === 'fem-waiting', 'a lista de aguardando presença fica no topo de Próximos jogos');
  ok(result.upcomingState.visibleCards, 'o card pronto continua visível depois de mover entre Geral e Próximos jogos');
  ok(result.freshUpcomingResults.indexOf('played-new') === -1 && result.freshUpcomingResults.indexOf('played-mid') === -1 && result.freshUpcomingResults.indexOf('played-old') === -1,
    'Próximos jogos não reintroduz resultados persistidos após uma abertura nova');
  ok(result.justScoredResults.indexOf('played-new') !== -1 && result.justScoredResults.indexOf('played-mid') === -1 && result.justScoredResults.indexOf('played-old') === -1,
    'Próximos jogos conserva apenas o último placar recém-lançado na sessão atual');
  console.log('\n📋 Voltar para categoria restaura a chave canônica');
  ok(result.restored.sourceVisible && result.restored.agendaHidden, 'Light fecha a agenda e restaura a fonte');
  ok(result.restored.originalOrder.join(',') === 'fem-court-5,masc-same-day,fem-round-2,fem-waiting,tomorrow,played-old,played-mid,played-new', 'cada wrapper volta exatamente ao seu placeholder');
  ok(result.generalReentry.order.join(',') === 'masc-same-day,fem-court-5,fem-waiting,played-old,played-mid,played-new,tomorrow,fem-round-2' && result.generalReentry.visible,
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

  await browser.close();
  console.log('\n' + (fail ? '❌' : '✅') + ' bracket-geral-agenda: ' + pass + ' ok, ' + fail + ' falharam');
  process.exitCode = fail ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
