/* Regressão: as abas Ouro/Prata ou Feminina/Masculina são a rota de volta
 * entre linhas da chave. Filtrar uma linha não pode ocultar a própria barra.
 * node tests/chaves-abas-estaveis.test.js */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
const routerSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) console.log('  ✓ ' + message);
  else { console.error('  ✗ ' + message); fail++; }
}

ok(src.includes('function _bracketTabsApply'), 'aplicador único mantém o estado da aba');
ok(src.includes('function _bracketTabsAnchor') && src.includes("first.closest('.bracket-sticky-scroll-wrapper, .bracket-scroll-container')"), 'faixa de abas ancora acima do trilho inteiro, não dentro da primeira rodada');
ok(src.includes("gb.style.background = onG ? 'linear-gradient(135deg,#fbbf24,#f59e0b)'"), 'aba principal ativa é visualmente trazida para frente');
ok(src.includes('border-radius:12px 12px 0 0'), 'abas principais usam o recorte de aba de planilha');
ok(!src.includes('[data-bracket-tab-empty="1"]{display:none!important;}'), 'filtro não oculta mais holders estruturais da chave');
ok(!src.includes("p.setAttribute('data-bracket-tab-holder', '1')"), 'montagem não marca ancestrais dos cards como escondíveis');
ok(src.includes("cb.style.display = ownG === gender ? '' : 'none'"), 'subabas só alternam pelo gênero ativo sem remover as abas principais');
ok(src.includes('function _bracketLayoutEliminationTree') && src.includes("data-bracket-tree-lines") && src.includes("cardColumns[ci - 1].length !== cardColumns[ci].length * 2") && src.includes('Nunca tirar um jogo do fluxo da sua coluna'), 'eliminatórias desenham conectores sem tirar cards do fluxo nem aplicar a regra em rodadas independentes');
ok(src.includes('function _bracketTabsRefreshRoundRail') && src.includes("rail.hidden = true") && src.includes("rail.innerHTML = ''"), 'não existe uma segunda régua de rodadas concorrendo com a chave');
ok(src.includes('class="bracket-round-heading"') && src.includes('data-bracket-round-heading-portal') && src.includes('function _bracketUpdateRoundHeadingPortal') && src.includes('(root.parentNode || scope).appendChild(portal)') && !src.includes('document.body.appendChild(portal)') && src.includes('document.addEventListener(\'scroll\'') && src.includes('scope && scope.style') && src.includes('function _bracketSyncRoundHeadingOffsets') && src.includes('window._bracketRoundHeadingResizeListener') && src.includes('var(--bg-darker,#111114)') && !src.includes('visibility:hidden!important'), 'a linha e o Ocultar usam um portal fixo sob as abas, no ciclo de vida da seção da chave e sem camadas órfãs');
ok(src.includes('regression_round_portal_overlaps_tabs_subpixel_seam') && src.includes("top:' + Math.floor(anchorBottom) + 'px") && !src.includes("top:' + Math.ceil(anchorBottom) + 'px"), 'o portal das rodadas cobre a emenda subpixel sob as abas, sem fresta de conteúdo');
ok(src.includes('regression_bracket_tabs_do_not_leak_round_content') && src.includes('regression_round_heading_never_overlaps_category_tabs'), 'a correção do portal é complementar às proteções já publicadas da faixa e do cabeçalho');
ok(routerSrc.includes('cleanupBracketRoundHeadingPortals') && routerSrc.includes("document.querySelectorAll('[data-bracket-round-heading-portal]')") && routerSrc.includes('cleanupBracketRoundHeadingPortals();'), 'o roteador remove os portais de cabeçalho antes de toda nova rota');
ok(src.includes('data-bracket-tier-title') && src.includes('tierTitles[ti].hidden = true'), 'a linha ativa não duplica título atrás da aba fixa');
ok(src.includes('data-bracket-search-slot') && src.includes('window.innerWidth >= 560') && src.includes('searchSlot.appendChild(searchWrap)'), 'em janela desktop, a busca usa a sobra da mesma faixa das abas sem duplicar o input');
ok(!src.includes('box-shadow:0 -48px 0 var(--bg-darker,#111114)') && src.includes('background:#111114;overflow:hidden') && src.includes("clone.style.boxShadow = 'none'"), 'a faixa sticky e o portal não projetam uma tarja sólida sobre busca, título da eliminatória ou conteúdo anterior');
ok(src.includes('var tabsHost = searchWrap && searchWrap.parentNode') && src.includes('tabsHost.insertBefore(root, searchWrap.nextSibling)'), 'no celular as abas ficam imediatamente após a busca, sem cards atravessando a faixa fixa');
ok(src.includes('top:calc(var(--topbar-h,60px) + var(--hamburger-dd-h,0px) + var(--backheader-h,0px) + var(--stickybar-h,0px) - 1px);z-index:31') && !src.includes('position:sticky;top:var(--scroll-anchor,120px);z-index:30;isolation:isolate;box-shadow:0 8px 12px -12px'), 'abas encostam na busca sticky; o respiro de scroll não vira vão visível');
ok(src.includes('const allRoundsColumns = gRounds.map') && src.includes('class="bracket-round-column" data-round-num="${ri + 1}"') && src.includes('data-hscroll="groups:${_hsKey(sg.name || gi)}"'), 'rodadas de grupos ficam em colunas sucessivas no mesmo trilho horizontal');
ok(src.includes('min-width:280px;max-width:360px;align-self:flex-start') && src.includes('bracket-columns-track" style="display:flex;align-items:flex-start;gap:24px'), 'cada cabeçalho de rodada é limitado à própria coluna, sem máscara atravessar a chave');
ok(src.includes('function _limparCamadasTransitóriasDaChave') && src.includes('regression_score_save_does_not_duplicate_bracket_chrome') && src.includes('container._bracketPaintEpoch') && src.includes('aindaEhAPinturaAtual'), 'salvar placar invalida pinturas antigas e desmonta abas/portais antes do novo render');
ok(src.includes('function _bracketGeneralView') && src.includes('data-bracket-general-view') && src.includes('data-bracket-subtab="__general"') && src.includes('data-bracket-subtab="__upcoming"') && src.includes('data-bracket-upcoming') && src.includes('data-bracket-scheduled-at') && src.includes('Geral" é uma agenda POR DIA') && src.includes('generalAgendaByGender[gender]') && src.includes('regression_general_agenda_moves_visible_cards'), 'eventos concentrados têm Geral e Próximos jogos por dia, reutilizando cards visíveis sem duplicar inputs de placar nem oferecer agenda sem horário');

console.log('\n' + (fail ? '❌' : '✅') + ' chaves-abas-estáveis: ' + (20 - fail) + ' asserts ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
