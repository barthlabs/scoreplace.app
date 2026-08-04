// scoreplace.app — BUSCA NAS CHAVES filtra o que o usuário VÊ (navegador real).
//
// Relato do dono (02/ago/2026, print do Confra em Rei/Rainha): digitou "Kelly" na barra de
// busca da chave e "não filtrou nada" — a tela continuou mostrando o box do SEU GRUPO
// inteiro (cabeçalho, botões W.O./Cheguei/Combinar, CLASSIFICAÇÃO DO GRUPO com os 4 nomes),
// nenhum deles a Kelly.
//
// CAUSA: `_bracketApplyFilter` escondia o CARD de jogo e, no máximo, o PAI IMEDIATO dele.
// No Rei/Rainha (e na Fase de Grupos) o card mora dentro de um grid que mora dentro do BOX
// DO GRUPO — o grid sumia, o box ficava. Resultado: some justamente a única coisa que a
// pessoa quer ver (os jogos) e fica todo o resto. Em Liga/Suíço, o mesmo com o <details>
// "Demais jogos da rodada", que continuava anunciando "(N)" com zero card dentro.
//
// REGRA: o filtro esconde qualquer CONTAINER que só existe por causa de cards de jogo e
// ficou sem nenhum visível — grid, coluna de rodada, box de grupo, <details> de rodada.
// Este teste FALHA no código anterior (o box do grupo sem Kelly continuava visível).
//
// Roda contra SCOREPLACE_URL (staging por padrão). Pra validar o código LOCAL:
//   python3 -m http.server 8099   &&   SCOREPLACE_URL=http://localhost:8099 npx playwright test bracket-search-filter

const { test, expect } = require('@playwright/test');

const NAMES = ['Rodrigo Barth', 'Erika de Paula', 'Livia Morais', 'Loraine Soares',
               'Kelly Barth', 'Nelson Barth', 'Zilda Quintas', 'Ana Paula Schmidt'];

// Monta Rei/Rainha (8 pessoas → 2 grupos de 4 → 3 jogos por grupo) com o SHAPE CANÔNICO
// (format 'Liga' + ligaRoundFormat 'rei_rainha', via _generateNextRound) e renderiza a chave
// INTEIRA pelo renderBracket real — é ele quem emite a barra de busca (window._bracketBar).
async function renderMonarch(page) {
  return page.evaluate((names) => {
    const parts = names.map((n, i) => ({ displayName: n, name: n, uid: 'u' + i }));
    const t = {
      id: 'E2E-SEARCH', name: 'Busca E2E', format: 'Liga', teamSize: 1,
      participants: parts, rounds: [], matches: [], currentPhaseIndex: 0,
      status: 'active', tournamentStarted: true, drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha'
    };
    window._generateNextRound(t);
    window.AppStore.currentUser = { uid: 'u0', email: 'u0@e2e.test', displayName: names[0] };
    window.AppStore.tournaments = [t];
    window._currentBracketTournament = t;
    window._lastActiveTournamentId = t.id;
    const r = t.rounds[t.rounds.length - 1];
    const groups = (r.monarchGroups || []).map((g) => ({ name: g.name, players: (g.players || []).slice() }));
    renderBracket(document.getElementById('view-container'), t.id, false);
    return { groups: groups, cards: document.querySelectorAll('[data-players]').length };
  }, NAMES);
}

// Digita na barra CANÔNICA (o mesmo caminho do dedo do usuário: input → oninput).
async function typeSearch(page, q) {
  await page.evaluate((v) => {
    const el = document.getElementById('bracket-search');
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
}

// O que SOBRA na tela: cards de jogo visíveis + boxes de grupo visíveis + nomes visíveis.
async function visibleState(page) {
  return page.evaluate(() => {
    const vis = (el) => !!(el.offsetParent || el.getClientRects().length);
    const cards = Array.from(document.querySelectorAll('[data-players]'));
    const boxes = Array.from(document.querySelectorAll('[data-group-box]'));
    return {
      cardsVisible: cards.filter(vis).map((c) => c.getAttribute('data-players')),
      boxesTotal: boxes.length,
      boxesVisible: boxes.filter(vis).length,
      emptyMsg: (() => { const e = document.getElementById('bracket-search-empty'); return !!(e && vis(e)); })()
    };
  });
}

test.describe('Busca nas chaves — Rei/Rainha (navegador real)', () => {
  test('filtra por trecho de nome: só os jogos da pessoa e só o grupo dela ficam', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const info = await renderMonarch(page);
    expect(info.groups.length, '8 pessoas → 2 grupos').toBe(2);
    expect(info.cards, '2 grupos × 3 jogos').toBe(6);

    // De qual grupo é a Kelly? (o sorteio é aleatório — lemos o que saiu, não assumimos)
    const kellyGroup = info.groups.filter((g) => (g.players || []).indexOf('Kelly Barth') !== -1);
    expect(kellyGroup.length, 'Kelly está em exatamente 1 grupo').toBe(1);

    // 1) tudo visível antes de buscar
    let st = await visibleState(page);
    expect(st.cardsVisible.length).toBe(6);
    expect(st.boxesVisible).toBe(st.boxesTotal);
    expect(st.boxesTotal).toBe(2);

    // 2) busca "Kelly" → 3 jogos (ela joga com cada um dos outros 3) e 1 box de grupo
    await typeSearch(page, 'Kelly');
    st = await visibleState(page);
    expect(st.cardsVisible.length, 'Rei/Rainha: 3 jogos por pessoa no grupo').toBe(3);
    st.cardsVisible.forEach((p) => expect(p.toLowerCase()).toContain('kelly'));
    expect(st.boxesVisible, 'o grupo SEM a Kelly some inteiro (bug do print)').toBe(1);
    expect(st.emptyMsg).toBe(false);

    // 3) acento-insensitive e por trecho no meio do nome
    await typeSearch(page, 'livia');
    st = await visibleState(page);
    expect(st.cardsVisible.length).toBe(3);
    expect(st.boxesVisible).toBe(1);

    // 4) ninguém casa → nenhum card, nenhum box, e a mensagem de vazio aparece
    await typeSearch(page, 'zzzznaoexiste');
    st = await visibleState(page);
    expect(st.cardsVisible.length).toBe(0);
    expect(st.boxesVisible, 'sem jogo casando, nenhum box de grupo fica na tela').toBe(0);
    expect(st.emptyMsg, 'mensagem "Nenhum jogo encontrado" visível').toBe(true);

    // 5) limpar devolve TUDO (nenhum container fica escondido por acidente)
    await typeSearch(page, '');
    st = await visibleState(page);
    expect(st.cardsVisible.length).toBe(6);
    expect(st.boxesVisible).toBe(st.boxesTotal);
    expect(st.emptyMsg).toBe(false);
  });

  // A busca e o toggle "Só meus jogos" escrevem no MESMO display dos MESMOS cards. Eram
  // duas decisões separadas: ligar/desligar o toggle rodava um loop que punha display=''
  // em todo card do usuário — DESFAZENDO a busca ativa. Agora é uma decisão só.
  test('convive com "Só meus jogos": um não desfaz o outro', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await renderMonarch(page);
    const toggle = (on) => page.evaluate((v) => window._toggleMyMatches(v), on);

    // toggle ligado, sem busca → só os jogos do usuário logado (Rodrigo) e só o grupo dele
    await toggle(true);
    let st = await visibleState(page);
    expect(st.cardsVisible.length, 'Rei/Rainha: o usuário joga 3 no grupo dele').toBe(3);
    st.cardsVisible.forEach((p) => expect(p.toLowerCase()).toContain('rodrigo'));
    expect(st.boxesVisible, 'o outro grupo some com o toggle também').toBe(1);

    // toggle ligado + busca que não casa → nada sobra e a mensagem aparece
    await typeSearch(page, 'zzzznaoexiste');
    st = await visibleState(page);
    expect(st.cardsVisible.length).toBe(0);
    expect(st.boxesVisible).toBe(0);
    expect(st.emptyMsg).toBe(true);

    // DESLIGAR o toggle NÃO pode ressuscitar os cards: a busca segue valendo
    await toggle(false);
    st = await visibleState(page);
    expect(st.cardsVisible.length, 'busca ativa sobrevive ao toggle').toBe(0);
    expect(st.boxesVisible).toBe(0);

    // limpar a busca com o toggle desligado → volta tudo
    await typeSearch(page, '');
    st = await visibleState(page);
    expect(st.cardsVisible.length).toBe(6);
    expect(st.boxesVisible).toBe(2);
  });
});

test.describe('Busca nas chaves — Pontos Corridos/Liga (navegador real)', () => {
  // Formato rounds-based: sem box de grupo, mas com o <details> "Demais jogos da rodada".
  // Sem a subida pelos ancestrais, o <details> continuava na tela anunciando "(N)" com zero
  // card dentro — mesma classe de bug do box do grupo.
  test('o <details> de "demais jogos" some quando nenhum jogo dele casa', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const info = await page.evaluate((names) => {
      const parts = names.map((n, i) => ({ displayName: n, name: n, uid: 'u' + i }));
      const t = {
        id: 'E2E-LIGA', name: 'Liga E2E', format: 'Liga', teamSize: 1,
        participants: parts, rounds: [], matches: [], currentPhaseIndex: 0,
        status: 'active', tournamentStarted: true
      };
      window._generateNextRound(t);
      window.AppStore.currentUser = { uid: 'u0', email: 'u0@e2e.test', displayName: names[0] };
      window.AppStore.tournaments = [t];
      window._currentBracketTournament = t;
      window._lastActiveTournamentId = t.id;
      renderBracket(document.getElementById('view-container'), t.id, false);
      return { cards: document.querySelectorAll('[data-players]').length };
    }, NAMES);
    expect(info.cards, 'Liga padrão: duplas aleatórias 2v2 → 2 jogos com 8 pessoas').toBeGreaterThan(1);

    const countVisible = () => page.evaluate(() => {
      const vis = (el) => !!(el.offsetParent || el.getClientRects().length);
      const cards = Array.from(document.querySelectorAll('[data-players]'));
      // <details> que existem POR CAUSA de cards (os que têm card dentro)
      const dets = Array.from(document.querySelectorAll('details')).filter((d) => d.querySelector('[data-players]'));
      return { cards: cards.filter(vis).length, dets: dets.length, detsVisible: dets.filter(vis).length };
    });

    let st = await countVisible();
    expect(st.cards).toBe(info.cards);
    const detsWithCards = st.dets;

    // o contador do <details> acompanha o filtro (não pode anunciar "(3)" mostrando 1)
    const summaryCount = () => page.evaluate(() => {
      const d = Array.from(document.querySelectorAll('details')).find((x) => x.querySelector('[data-players]'));
      if (!d) return null;
      const m = /\((\d+)\)\s*$/.exec((d.querySelector('summary').textContent || '').trim());
      return m ? Number(m[1]) : null;
    });
    const beforeN = await summaryCount();

    // busca por alguém DE DENTRO do <details>: o contador passa a dizer quantos sobraram
    const oneName = await page.evaluate(() => {
      const d = Array.from(document.querySelectorAll('details')).find((x) => x.querySelector('[data-players]'));
      return (d.querySelector('[data-players]').getAttribute('data-players') || '').split(/\s*,\s*|\s*\/\s*/)[0];
    });
    await typeSearch(page, oneName);
    const partial = await page.evaluate(() => {
      const d = Array.from(document.querySelectorAll('details')).find((x) => x.querySelector('[data-players]'));
      const inside = Array.from(d.querySelectorAll('[data-players]'));
      const m = /\((\d+)\)\s*$/.exec((d.querySelector('summary').textContent || '').trim());
      return { vis: inside.filter((c) => c.style.display !== 'none').length, label: m ? Number(m[1]) : null };
    });
    expect(partial.vis).toBeGreaterThan(0);
    expect(partial.label, 'contador do <details> = jogos que sobraram').toBe(partial.vis);

    await typeSearch(page, 'zzzznaoexiste');
    st = await countVisible();
    expect(st.cards, 'nenhum jogo casa').toBe(0);
    expect(st.detsVisible, 'nenhum <details> de jogos fica de pé vazio').toBe(0);

    await typeSearch(page, '');
    st = await countVisible();
    expect(st.cards).toBe(info.cards);
    expect(st.detsVisible).toBe(detsWithCards);
    expect(await summaryCount(), 'contador volta ao original ao limpar').toBe(beforeN);
  });
});
