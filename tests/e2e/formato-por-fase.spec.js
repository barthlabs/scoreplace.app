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
  });

  test('a fase eliminatória tem o SEU próprio bloco de formato', async ({ page }) => {
    await abrirFormDeTorneio(page);
    await expect(page.locator('#f2-config-mount')).toContainText('Formato próprio nesta fase');
    // Ligar o formato próprio + escolher "Melhor de 3" grava em cfg.eliminatoria.scoring —
    // que é o que vira phases[elim].scoring e o que _effectiveScoring lê na hora do jogo.
    const sc = await page.evaluate(() => {
      window._f2ElimScoringOwn(true);
      window._f2ElimScoringPreset('best3');
      return window._f2GetConfig().eliminatoria.scoring;
    });
    expect(sc).toBeTruthy();
    expect(sc.type).toBe('sets');       // sem `type` o motor IGNORA a fase, em silêncio
    expect(sc.setsToWin).toBe(2);
  });
});
