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
  await page.addScriptTag({ content: trecho('_bracketGeneralView', '_bracketTabsApply') });
  await page.addScriptTag({ content: trecho('_bracketTabsApply', '_bracketSyncRoundHeadingOffsets') });

  const result = await page.evaluate(() => {
    window._bracketTabsRefreshRoundRail = function () {};
    window._bracketLayoutEliminationTree = function () {};
    const at = (day, hour) => new Date(2026, 9, day, hour, 0, 0, 0).getTime();
    const card = (id, gender, category, when, court, upcoming, round, presence) =>
      '<div class="wrap" data-wrap="' + id + '"><article id="' + id + '" data-bracket-tab-category="' + category +
      '" data-bracket-tab-gender="' + gender + '" data-bracket-tab-round="' + (round || 1) + '" data-bracket-scheduled-at="' + when +
      '" data-bracket-court="' + court + '" data-bracket-upcoming="' + (upcoming ? '1' : '0') + '" data-bracket-presence="' + (presence || '') + '">' + id + '</article></div>';
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
      '</section></main>';
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
      roundColumns: Array.from(agenda.querySelectorAll('h4')).map((el) => el.textContent.trim())
    };

    document.getElementById('upcoming').click();
    const upcomingState = {
      sourceHidden: document.getElementById('source').hidden,
      order: Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).map((el) => el.id),
      visibleCards: Array.from(agenda.querySelectorAll('[data-bracket-tab-category]')).every((el) => !el.hidden),
      waiting: Array.from(agenda.querySelectorAll('[data-bracket-upcoming-waiting] [data-bracket-tab-category]')).map((el) => el.id)
    };

    document.getElementById('light').click();
    const restored = {
      sourceVisible: !document.getElementById('source').hidden,
      originalOrder: Array.from(document.querySelectorAll('#source > .wrap')).map((el) => el.getAttribute('data-wrap')),
      agendaHidden: agenda.style.display === 'none'
    };

    document.getElementById('geral').click();
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
    return { generalState, upcomingState, restored, cleanup, noSchedule, nested };
  });

  console.log('\n📋 Geral é a agenda do dia, não uma cópia por gênero');
  ok(result.generalState.sourceHidden, 'ao clicar Geral, a chave de origem fica fora da leitura duplicada');
  ok(result.generalState.order.join(',') === 'masc-same-day,fem-court-5,fem-waiting,fem-round-2', 'inclui partidas jogadas e pendentes do dia nas colunas corretas');
  ok(result.generalState.noClone, 'os cards reais são movidos: não há id nem input duplicado');
  ok(result.generalState.visibleCards, 'os cards movidos para Geral são visíveis, não herdam o hidden do filtro de categoria');
  ok(result.generalState.roundColumns.join(',') === 'Rodada 1,Rodada 2', 'Geral agrupa a agenda pela rodada, com cabeçalho de coluna estável');
  console.log('\n📋 Próximos jogos só mostra partidas pendentes e com ambas as duplas presentes');
  ok(result.upcomingState.sourceHidden, 'Próximos jogos também troca a chave canônica por uma única visão operacional');
  ok(result.upcomingState.order.join(',') === 'fem-court-5,fem-round-2,fem-waiting', 'Próximos jogos separa a partida parcialmente presente depois das partidas prontas');
  ok(result.upcomingState.waiting.join(',') === 'fem-waiting', 'a lista de aguardando presença fica abaixo dos próximos jogos');
  ok(result.upcomingState.visibleCards, 'o card pronto continua visível depois de mover entre Geral e Próximos jogos');
  console.log('\n📋 Voltar para categoria restaura a chave canônica');
  ok(result.restored.sourceVisible && result.restored.agendaHidden, 'Light fecha a agenda e restaura a fonte');
  ok(result.restored.originalOrder.join(',') === 'fem-court-5,masc-same-day,fem-round-2,fem-waiting,tomorrow', 'cada wrapper volta exatamente ao seu placeholder');
  console.log('\n📋 Novo render limpa Geral aberta antes de substituir a chave');
  ok(result.cleanup.rootGone && result.cleanup.agendaGone, 'abas e agenda transitória são destruídas');
  ok(result.cleanup.cardsReturned.join(',') === 'fem-court-5,masc-same-day,fem-round-2,fem-waiting,tomorrow', 'nenhum card fica órfão fora do container');
  ok(result.cleanup.portalGone, 'portal de cabeçalho de pintura anterior também é removido');
  console.log('\n📋 Sem horário não há agenda enganosa');
  ok(result.noSchedule.returnedFalse && result.noSchedule.sourceStillVisible && result.noSchedule.noMovedCards,
    'cards sem scheduledAt não são deslocados para uma Geral vazia (a montagem nem oferece a aba)');
  console.log('\n📋 Geral dentro do próprio trilho continua visível');
  ok(result.nested.shown && result.nested.sourceVisible && result.nested.movedVisible,
    'a Geral não esconde o ancestral que contém a própria agenda; inclusive jogo já concluído permanece visível');

  await browser.close();
  console.log('\n' + (fail ? '❌' : '✅') + ' bracket-geral-agenda: ' + pass + ' ok, ' + fail + ' falharam');
  process.exitCode = fail ? 1 : 0;
})().catch((error) => { console.error(error); process.exitCode = 1; });
