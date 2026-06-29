// scoreplace.app — CAMADA 2 (clique→valor) do formulário Criar Torneio
//
// Campanha de congelamento, camada 2: o FORMULÁRIO grava o campo certo ao CLICAR.
// A camada 1 (headless) prova que o MOTOR consome t.format/t.drawMode corretamente;
// aqui provamos o ELO que falta: o clique no botão real do DOM aterrissa o valor no
// sink certo (#select-formato / #draw-mode — as fontes únicas que o resto do form lê).
//
// Read-only: só abre o modal e clica toggles/botões; NUNCA salva (não cria torneio,
// não toca Firestore). Não precisa de login (o modal abre via openModal).
// Roda contra baseURL (PROD por default, ou SCOREPLACE_URL=staging).

const { test, expect } = require('@playwright/test');

async function openCreateModal(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(2500); // SPA boot (auth/SW resolvem)
  await page.evaluate(() => {
    try { window.setupCreateTournament && window.setupCreateTournament(); } catch (e) {}
    window.openModal && window.openModal('modal-create-tournament');
  });
  await expect(page.locator('#modal-create-tournament')).toBeVisible();
  await expect(page.locator('#select-formato')).toBeAttached();
}
const selVal = (page, id) => page.evaluate((i) => { var el = document.getElementById(i); return el ? el.value : null; }, id);

test.describe('Camada 2 — Criar Torneio: clique→valor (Formato)', () => {
  test('cada botão de Formato grava o valor interno certo em #select-formato', async ({ page }) => {
    await openCreateModal(page);

    await page.click('#formato-buttons .formato-btn[data-fmt="grupos"]');
    expect(await selVal(page, 'select-formato')).toBe('grupos_mata');
    await expect(page.locator('#formato-buttons .formato-btn[data-fmt="grupos"]')).toHaveClass(/formato-btn-active/);

    await page.click('#formato-buttons .formato-btn[data-fmt="pontos"]');
    expect(await selVal(page, 'select-formato')).toBe('liga'); // "Pontos Corridos" exibido, valor interno 'liga' (intocado)

    await page.click('#formato-buttons .formato-btn[data-fmt="elim"]');
    expect(await selVal(page, 'select-formato')).toBe('elim_simples');
    // só um botão ativo por vez
    expect(await page.locator('#formato-buttons .formato-btn-active').count()).toBe(1);
  });

  test('toggle Dupla Eliminatória alterna elim_simples ↔ elim_dupla', async ({ page }) => {
    await openCreateModal(page);
    await page.click('#formato-buttons .formato-btn[data-fmt="elim"]');
    expect(await selVal(page, 'select-formato')).toBe('elim_simples');

    const toggle = page.locator('#toggle-dupla-elim');
    if (await toggle.count()) {
      await page.evaluate(() => { var t = document.getElementById('toggle-dupla-elim'); t.checked = true; window._toggleDuplaElim(true); });
      expect(await selVal(page, 'select-formato')).toBe('elim_dupla');
      await page.evaluate(() => { var t = document.getElementById('toggle-dupla-elim'); t.checked = false; window._toggleDuplaElim(false); });
      expect(await selVal(page, 'select-formato')).toBe('elim_simples');
    }
  });
});

test.describe('Camada 2 — Criar Torneio: clique→valor (Modo de sorteio)', () => {
  test('cada botão de Modo de Sorteio grava data-value em #draw-mode', async ({ page }) => {
    await openCreateModal(page);

    await page.click('#draw-mode-buttons .draw-mode-btn[data-value="rei_rainha"]');
    expect(await selVal(page, 'draw-mode')).toBe('rei_rainha');
    await expect(page.locator('#draw-mode-buttons .draw-mode-btn[data-value="rei_rainha"]')).toHaveClass(/draw-mode-active/);

    await page.click('#draw-mode-buttons .draw-mode-btn[data-value="sorteio"]');
    expect(await selVal(page, 'draw-mode')).toBe('sorteio');
    expect(await page.locator('#draw-mode-buttons .draw-mode-active').count()).toBe(1);
  });
});
