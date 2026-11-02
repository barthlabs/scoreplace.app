// Configurador único format2: cliques nos controles atuais gravam a configuração
// canônica da fase. Somente leitura do formulário; nenhum torneio é salvo.
// O padrão do Playwright é http://localhost:8899; SCOREPLACE_URL altera o alvo.
const { test, expect } = require('./safe-test');

async function openCreateModal(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => window.renderCreateTournamentPage(document.getElementById('view-container')));
  await expect(page.locator('#f2-config-mount')).toBeVisible();
  await expect(page.locator('#formato-buttons')).toHaveCount(0);
  await expect(page.locator('#draw-mode-buttons')).toHaveCount(0);
}
const cfg = (page) => page.evaluate(() => window._f2GetConfig());

test.describe('Criar Torneio — configurador canônico por clique', () => {
  test('classificatória e número de grupos gravam no format2', async ({ page }) => {
    await openCreateModal(page);
    const toggle = page.locator('#f2-config-mount input[onchange*="_f2ClassifAtiva"] + .toggle-slider');
    expect((await cfg(page)).classifAtiva).toBe(true);
    await toggle.click();
    expect((await cfg(page)).classifAtiva).toBe(false);
    expect((await cfg(page)).eliminatoria.ativa).toBe(true);
    await toggle.click();
    expect((await cfg(page)).classifAtiva).toBe(true);

    const groups = page.locator('#f2-config-mount input[onchange*="_f2Grupos"]');
    await groups.focus();
    await groups.press('ArrowRight');
    expect((await cfg(page)).grupos).toBe(2);
  });

  test('Dupla Eliminatória alterna a estrutura da fase eliminatória', async ({ page }) => {
    await openCreateModal(page);
    const toggle = page.locator('#f2-config-mount input[onchange*="_f2ElimDupla"] + .toggle-slider');
    expect((await cfg(page)).eliminatoria.dupla).toBe(false);
    await toggle.click();
    expect((await cfg(page)).eliminatoria.dupla).toBe(true);
    await toggle.click();
    expect((await cfg(page)).eliminatoria.dupla).toBe(false);
  });

  test('formação de equipes grava Rei/Rainha, montadas e sorteadas', async ({ page }) => {
    await openCreateModal(page);
    const buttons = page.locator('#f2-config-mount button[onclick*="_f2TeamForm"]');
    await buttons.filter({ hasText: 'Rei/Rainha' }).click();
    expect((await cfg(page)).parceria).toBe('rei_rainha');
    await buttons.filter({ hasText: 'Montadas' }).click();
    expect((await cfg(page)).parceria).toBe('fixa');
    expect((await cfg(page)).formacaoDupla).toBe('manual');
    await buttons.filter({ hasText: 'Sorteio' }).click();
    expect((await cfg(page)).parceria).toBe('sorteio_rodada');
  });
});
