// scoreplace.app — CAMADA 2 (DOM real): o "🎾 Formato da Partida" é DE CADA FASE
//
// 🔴 O relato do dono (21/ago/2026): "na edicao e criacao de torneio o formato da partida
// esta unificado para todo o torneio". Os testes de fonte estavam TODOS verdes — o formato
// por fase existia no motor, nos handlers e no HTML. O que quebrava era a POSIÇÃO do nó na
// tela: #gsm-section tinha DUAS pontas mexendo nele (format2-ui punha dentro da fase;
// _f2MountInEditForm puxava pra fora e, com o mount já existente, saía sem recolocar).
// Como renderCreateTournamentPage monta no render E de novo no setTimeout, a 2ª chamada
// era a que valia → o bloco terminava solto acima das fases.
//
// Este spec mede o DOM depois do MESMO caminho da tela. Read-only: abre o form e não salva.
const { test, expect } = require('@playwright/test');

async function abrirFormDeTorneio(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    try { window.setupCreateTournament && window.setupCreateTournament(); } catch (e) {}
    // MESMA função que a rota #novo-torneio chama (monta o format2 duas vezes: render + setTimeout)
    window.renderCreateTournamentPage(document.getElementById('view-container'));
  });
  await page.waitForTimeout(1500);
  await expect(page.locator('#f2-config-mount')).toHaveCount(1);
}

test.describe('Formato da partida por FASE (create/edit)', () => {
  test('pontuação principal e desempate ficam juntos na classificatória', async ({ page }) => {
    await abrirFormDeTorneio(page);
    const slot = page.locator('#f2-classif-extra');
    await expect(slot.locator('#adv-scoring-section')).toHaveCount(1);
    await expect(slot.locator('#tiebreaker-section')).toHaveCount(1);
    const order = await page.evaluate(() => {
      const adv = document.getElementById('adv-scoring-section');
      const ranking = document.getElementById('ranking-primary-choice');
      const tie = document.getElementById('tie-resolution-section');
      const elim = [...document.querySelectorAll('#f2-config-mount *')]
        .find(el => el.textContent?.trim() === '3. 🏆 Fase Eliminatória');
      return !!(adv && ranking && tie && elim &&
        (adv.compareDocumentPosition(ranking) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        (ranking.compareDocumentPosition(tie) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        (tie.compareDocumentPosition(elim) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(order).toBe(true);
    await expect(page.locator('[data-ranking-primary="points"]')).toContainText('Pontos da classificação');
    await page.locator('[data-ranking-primary="points"]').click();
    await expect(page.locator('#ranking-primary-desc')).toContainText('3 pontos por vitória, 1 por empate');
    await expect(page.locator('#ranking-primary')).toHaveValue('points');
    await page.locator('label:has(#adv-scoring-enabled)').click();
    await expect(page.locator('[data-ranking-primary="points"]')).toContainText('Pontos avançados');
    await expect(page.locator('#ranking-primary-desc')).toContainText('Soma dos valores');
    await page.evaluate(() => window._f2TeamForm('super_eight'));
    await expect(slot.locator('#tiebreaker-section')).toHaveCount(1);
    await expect(page.locator('#ranking-primary')).toHaveValue('points');
    await expect(page.locator('[data-ranking-primary="points"]')).toContainText('Pontos avançados');
    await expect(page.locator('#f2-config-mount')).not.toContainText('Pontos de quem folga');
    await page.locator('label:has(#adv-scoring-enabled)').click();
    await expect(page.locator('[data-ranking-primary="points"]')).toContainText('Pontos da classificação');
  });

  test('o bloco do form vive DENTRO da fase inicial, não solto no torneio', async ({ page }) => {
    await abrirFormDeTorneio(page);
    // O slot #f2-classif-extra é o pedaço do box da Fase Classificatória que recebe as
    // seções do form (formato, datas, inscrições). Estar aqui = "é o formato DESTA fase".
    await expect(page.locator('#f2-classif-extra #gsm-section')).toHaveCount(1);
    const soltoNoForm = await page.evaluate(() => {
      const g = document.getElementById('gsm-section');
      return !!(g && g.parentElement && g.parentElement.id === 'form-create-tournament');
    });
    expect(soltoNoForm).toBe(false);
    await expect(page.locator('#f2-phase-dates-slot > #phase-dates-box')).toHaveCount(1);
    await expect(page.locator('#f2-hours-slot > #estimated-games-window-section')).toHaveCount(1);
    const order = await page.evaluate(() => {
      const ids = ['phase-dates-box', 'estimated-games-window-section'];
      const dates = document.getElementById(ids[0]);
      const hours = document.getElementById(ids[1]);
      const manual = Array.from(document.querySelectorAll('#f2-config-mount label'))
        .find(el => el.textContent.includes('Sortear manualmente'));
      return !!(dates && manual && hours &&
        (dates.compareDocumentPosition(manual) & Node.DOCUMENT_POSITION_FOLLOWING) &&
        (manual.compareDocumentPosition(hours) & Node.DOCUMENT_POSITION_FOLLOWING));
    });
    expect(order).toBe(true);
  });

  test('a fase eliminatória tem o SEU próprio bloco de formato — sem toggle', async ({ page }) => {
    await abrirFormDeTorneio(page);
    const mount = page.locator('#f2-config-mount');
    // v1.9.116: a grade é SEMPRE visível (espelho do bloco do form), sem porta de entrada.
    await expect(mount).not.toContainText('Formato próprio nesta fase');
    await expect(mount).toContainText('Formato da Partida');
    // Escolher "Melhor de 3" grava em cfg.eliminatoria.scoring — que vira phases[elim].scoring
    // e é o que _effectiveScoring lê na hora do jogo.
    const sc = await page.evaluate(() => {
      window._f2ElimScoringPreset('best3');
      return window._f2GetConfig().eliminatoria.scoring;
    });
    expect(sc).toBeTruthy();
    expect(sc.type).toBe('sets');       // sem `type` o motor IGNORA a fase, em silêncio
    expect(sc.setsToWin).toBe(2);

    // E voltar pro formato da fase inicial (1 set, default) volta a HERDAR: null, não cópia.
    const herda = await page.evaluate(() => {
      window._f2ElimScoringPreset('set1');
      return window._f2GetConfig().eliminatoria.scoring;
    });
    expect(herda).toBeNull();
  });
});
