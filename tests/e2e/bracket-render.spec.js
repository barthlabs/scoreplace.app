// scoreplace.app — RENDER de bracket/classificação no NAVEGADOR REAL (Chromium).
//
// Diferença do headless (tests/*-render.test.js): aqui roda no browser de verdade, com o
// CSS carregado e o DOM real — então pega a classe de bug que o vm-sandbox NÃO vê: cor
// computada (box escuro do pódio), layout/visibilidade, i18n real, erros de runtime.
//
// Estratégia: usa as MESMAS funções que o app já carregou (window._phasesEngine,
// _buildRepechageDoubleElim, _advanceWinner, renderDoubleElimBracket, _renderPodiumsAndClassif)
// pra montar+simular+renderizar um torneio de 14 duplas, injeta no #view-container e assere
// no DOM renderizado. Aponta pro código sob teste via SCOREPLACE_URL (staging por padrão nos
// scripts; senão prod).

const { test, expect } = require('@playwright/test');

// monta 14 duplas (Dupla Eliminatória + repescagem), simula tudo e injeta o render na página.
async function renderDupla14(page) {
  return page.evaluate(() => {
    const E = window._phasesEngine;
    const mkPool = (n) => { const a = []; for (let i = 0; i < n; i++) a.push({ displayName: 'D' + i, categories: ['C'] }); return a; };
    const cfg = { format: 'Dupla Eliminatória', formatCode: 'elim_dupla', teamSize: 2, bracketResolution: 'playin', source: { type: 'enrollment' }, categories: ['C'] };
    const t = { id: 'E2E', name: 'E2E Dupla', format: 'Dupla Eliminatória', teamSize: 2, matches: [], currentPhaseIndex: 0, status: 'active' };
    const b = E.generatePhase(mkPool(14), cfg, { idPrefix: 'p', ordered: true, t, isVip: () => false, catOf: (e) => (e.categories || [])[0] });
    E.storePhase(t, 0, b);
    (b.repMetaByCat || [b.repMeta]).forEach((mm) => window._buildRepechageDoubleElim(t, mm));
    let g = 0;
    while (g++ < 5000) {
      const m = t.matches.find((x) => x && !x.winner && !x.isBye && x.p1 && x.p2 && x.p1 !== 'TBD' && x.p2 !== 'TBD' && x.p1 !== 'BYE' && x.p2 !== 'BYE' && !/aguard|derrotad|melhor/i.test(String(x.p1) + String(x.p2)));
      if (!m) break;
      m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
      window._advanceWinner(t, m);
      if (window._resolveRepFills) window._resolveRepFills(t);
    }
    window.AppStore.tournaments = [t];
    window._currentBracketTournament = t;
    const c = document.getElementById('view-container');
    c.innerHTML = window._renderPodiumsAndClassif(t) + window.renderDoubleElimBracket(t, false, '');
    return { matches: t.matches.length, gfWinner: (t.matches.find((m) => m.bracket === 'grand') || {}).winner };
  });
}

test.describe('Bracket render — Dupla Eliminatória (navegador real)', () => {
  test('nomes de rodada, SEM "Linha", box escuro do pódio, classificação', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const info = await renderDupla14(page);
    expect(info.matches).toBe(28);           // 14 duplas → 28 jogos (mesma estrutura do headless)
    expect(info.gfWinner).toBeTruthy();       // grande final decidida

    const vc = page.locator('#view-container');

    // --- SEMÂNTICA visível no DOM real ---
    await expect(vc).toContainText('Chave Superior');
    await expect(vc).toContainText('Chave Inferior');
    await expect(vc).toContainText('Semifinais');
    await expect(vc).toContainText('Classificação geral');
    // NUNCA "Linha 1/2/3" (bug bracket 'grand' vs 'grandfinal')
    await expect(vc).not.toContainText(/Linha \d/);

    // --- VISUAL que o vm-sandbox NÃO pega: cor COMPUTADA do box do pódio ---
    const podium = await page.evaluate(() => {
      // acha o container do pódio (div com o título "Torneio Encerrado")
      const titles = Array.from(document.querySelectorAll('#view-container div'));
      const box = titles.find((d) => /Torneio Encerrado/.test(d.textContent || '') && /gradient/.test(d.getAttribute('style') || ''));
      if (!box) return null;
      const cs = getComputedStyle(box);
      const r = box.getBoundingClientRect();
      return { bgImage: cs.backgroundImage, visibleH: Math.round(r.height), visibleW: Math.round(r.width) };
    });
    expect(podium, 'box do pódio existe no DOM').not.toBeNull();
    // box ESCURO: o gradiente computado contém o slate escuro (15, 23, 42)
    expect(podium.bgImage).toContain('gradient');
    expect(podium.bgImage).toMatch(/15,\s*23,\s*42/);
    // box de fato VISÍVEL (não colapsado)
    expect(podium.visibleH).toBeGreaterThan(80);
    expect(podium.visibleW).toBeGreaterThan(150);

    // --- LAYOUT: as duas seções da chave existem e têm altura real ---
    const layout = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('#view-container h4'));
      const sup = heads.find((h) => /Chave Superior/.test(h.textContent || ''));
      const inf = heads.find((h) => /Chave Inferior/.test(h.textContent || ''));
      const secH = (h) => (h && h.parentElement) ? Math.round(h.parentElement.getBoundingClientRect().height) : 0;
      return { supH: secH(sup), infH: secH(inf) };
    });
    expect(layout.supH, 'seção Chave Superior tem altura').toBeGreaterThan(100);
    expect(layout.infH, 'seção Chave Inferior tem altura').toBeGreaterThan(100);

    // --- sem "Quartas" na chave INFERIOR de 14 (só na superior) ---
    const lowerHasQuartas = await page.evaluate(() => {
      const html = document.getElementById('view-container').innerHTML;
      const lower = html.split('Chave Inferior')[1] || '';
      return /Quartas/.test(lower);
    });
    expect(lowerHasQuartas).toBe(false);

    // --- VÃO PRETO / nome da rodada colado aos cards (só mensurável no browser real) ---
    // Bug reportado: ao centralizar os cards (flex:1), o TÍTULO da rodada ficava lá em cima e os
    // cards no meio → vão preto entre nome e cards nas colunas curtas. O fix (align-self:flex-start)
    // mantém nome+cards juntos no topo → o vão entre CADA título e seu 1º card é pequeno.
    const nameGap = await page.evaluate(() => {
      const heads = Array.from(document.querySelectorAll('#view-container h5'));
      let maxGap = 0, worst = '';
      heads.forEach((h) => {
        const card = h.parentElement && h.parentElement.querySelector('[id^="card-"]');
        if (!card) return;
        const gap = card.getBoundingClientRect().top - h.getBoundingClientRect().bottom;
        if (gap > maxGap) { maxGap = gap; worst = (h.textContent || '').trim(); }
      });
      return { maxGap: Math.round(maxGap), worst };
    });
    // com nome+cards no topo, o maior vão é ~1rem+margem (< 60px). Centralização antiga → centenas.
    expect(nameGap.maxGap, 'título de rodada colado ao 1º card (pior: "' + nameGap.worst + '")').toBeLessThan(60);
  });
});

// monta um torneio pelo MOTOR (sem generateDrawFunction → sem escrita no Firestore) e injeta o
// render. Reconstrói t.groups dos matches (o app faz isso no render de grupos/monarch).
async function renderViaEngine(page, format, extraCfg, n, renderFn) {
  return page.evaluate(({ format, extraCfg, n, renderFn }) => {
    const E = window._phasesEngine;
    const pool = []; for (let i = 0; i < n; i++) pool.push({ displayName: 'J' + i, categories: ['C'] });
    const cfg = Object.assign({ format, teamSize: 1, source: { type: 'enrollment' }, categories: ['C'] }, extraCfg);
    const t = { id: 'E2E', name: 'E2E ' + format, format, teamSize: 1, matches: [], currentPhaseIndex: 0, status: 'active' };
    const b = E.generatePhase(pool, cfg, { idPrefix: 'e', ordered: true, t, isVip: () => false, catOf: (e) => (e.categories || [])[0] });
    E.storePhase(t, 0, b);
    // simula todos os jogos jogáveis
    let g = 0;
    while (g++ < 5000) {
      const m = t.matches.find((x) => x && !x.winner && !x.isBye && x.p1 && x.p2 && x.p1 !== 'TBD' && x.p2 !== 'TBD' && x.p1 !== 'BYE' && x.p2 !== 'BYE' && !/aguard|derrotad|melhor|vencedor/i.test(String(x.p1) + String(x.p2)));
      if (!m) break;
      m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
      if (window._advanceWinner) window._advanceWinner(t, m);
    }
    // reconstrói t.groups (bracket 'group' 1v1 ou 'monarch' team1/team2)
    const byG = {};
    (t.matches || []).forEach((m) => {
      if (!m.isMonarch && m.bracket !== 'group') return;
      const gi = (m.groupIdx != null) ? m.groupIdx : (m.monarchGroup != null ? m.monarchGroup : 0);
      byG[gi] = byG[gi] || { name: m.groupName || ('Grupo ' + (gi + 1)), players: [], matches: [] };
      byG[gi].matches.push(m);
      const ps = m.isMonarch ? (m.team1 || []).concat(m.team2 || []) : [m.p1, m.p2];
      ps.forEach((p) => { if (p && p !== 'BYE' && p !== 'TBD' && byG[gi].players.indexOf(p) < 0) byG[gi].players.push(p); });
    });
    t.groups = Object.keys(byG).map(Number).sort((a, b) => a - b).map((k) => byG[k]);
    t.currentStage = 'groups';
    window.AppStore.tournaments = [t];
    window._currentBracketTournament = t;
    document.getElementById('view-container').innerHTML = window[renderFn](t, false, false, { suppressAutoAdvance: true });
    return { groups: t.groups.length, matches: t.matches.length };
  }, { format, extraCfg, n, renderFn });
}

test.describe('Layout mobile — sem vazamento horizontal (navegador real)', () => {
  test('pódio + classificação + chave não estouram a largura da tela', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await renderDupla14(page);
    const m = await page.evaluate(() => {
      const vw = window.innerWidth;
      // 1) a PÁGINA não pode rolar horizontalmente (bug clássico: card/campo mais largo que a tela)
      const pageOverflow = Math.max(0, document.documentElement.scrollWidth - vw);
      // 2) pódio e blocos de classificação devem CABER na tela (largura <= viewport)
      const wide = [];
      Array.from(document.querySelectorAll('#view-container .info-box, #view-container details, #view-container table')).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > vw + 1) wide.push({ w: Math.round(r.width), tag: el.tagName });
      });
      // 3) a chave rola por DENTRO (scroll container), não empurrando a página
      const scrollers = Array.from(document.querySelectorAll('#view-container .bracket-scroll-container'));
      const scrollerOverflow = scrollers.map((s) => Math.round(s.getBoundingClientRect().width - vw)).filter((d) => d > 1);
      return { vw, pageOverflow: Math.round(pageOverflow), wideCount: wide.length, wide: wide.slice(0, 3), scrollerOverflow };
    });
    // a página não rola na horizontal (tolerância mínima)
    expect(m.pageOverflow, 'overflow horizontal da página (vw=' + m.vw + ')').toBeLessThanOrEqual(2);
    // nenhum bloco de conteúdo mais largo que a tela
    expect(m.wideCount, 'blocos que estouram a largura: ' + JSON.stringify(m.wide)).toBe(0);
    // o container da chave está contido (o scroll é interno)
    expect(m.scrollerOverflow, 'scroll container da chave contido na tela').toEqual([]);
  });
});

test.describe('Rei/Rainha render (navegador real)', () => {
  test('grupos, standings individuais e COROA do invicto visíveis no DOM', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const info = await renderViaEngine(page, 'Rei/Rainha da Praia', { drawMode: 'rei_rainha' }, 8, '_renderMonarchStage');
    expect(info.groups).toBe(2);

    const vc = page.locator('#view-container');
    await expect(vc.locator('table').first()).toBeVisible();       // tabela de classificação renderiza
    // COROA do invicto = SVG com aria-label "Rei invicto"/"Rainha invicta"
    const crown = page.locator('#view-container svg[aria-label*="invict"]').first();
    await expect(crown).toBeVisible();                              // coroa VISÍVEL no browser real
    const box = await crown.boundingBox();
    expect(box && box.width, 'coroa tem tamanho real').toBeGreaterThan(5);
  });
});

test.describe('Fase de Grupos render (navegador real)', () => {
  test('4 tabelas de grupo visíveis no DOM', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const info = await renderViaEngine(page, 'Fase de Grupos + Eliminatórias', { formatCode: 'grupos_mata' }, 16, 'renderGroupStage');
    expect(info.groups).toBe(4);

    const vc = page.locator('#view-container');
    const tables = vc.locator('table');
    expect(await tables.count(), '4 grupos → >= 4 tabelas').toBeGreaterThanOrEqual(4);
    await expect(vc).toContainText('Grupo');
    await expect(tables.first()).toBeVisible();
  });
});

test.describe('Pontos Corridos (Liga) render (navegador real)', () => {
  test('classificação individual visível, ordenada por pontos', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    const info = await page.evaluate(() => {
      const parts = []; for (let i = 0; i < 8; i++) parts.push({ displayName: 'J' + i, name: 'J' + i, uid: 'u' + i });
      const t = { id: 'E2E', name: 'Liga E2E', format: 'Liga', teamSize: 1, participants: parts, rounds: [], matches: [], currentPhaseIndex: 0, status: 'active', ligaRoundFormat: 'padrao' };
      const isFolga = (s) => !s || /FOLGA|BYE/i.test(String(s));
      for (let rnd = 0; rnd < 3; rnd++) {
        window._generateNextRound(t);
        const r = t.rounds[t.rounds.length - 1];
        (r.matches || []).forEach((m, i) => { if (!isFolga(m.p1) && !isFolga(m.p2) && !m.winner) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i + rnd) % 4; } });
      }
      window.AppStore.tournaments = [t];
      window._currentBracketTournament = t;
      const st = window._computeStandings(t);
      document.getElementById('view-container').innerHTML = window.renderStandings(t, false, false, '', '');
      return { rounds: t.rounds.length, nStandings: st.length, leader: st[0] && st[0].name };
    });
    expect(info.rounds).toBe(3);
    expect(info.nStandings).toBe(8);       // classificação INDIVIDUAL: 8 jogadores (mesmo jogando em duplas)

    const vc = page.locator('#view-container');
    await expect(vc.locator('table').first()).toBeVisible();
    await expect(vc).toContainText(info.leader);  // líder aparece na tabela renderizada
  });
});
