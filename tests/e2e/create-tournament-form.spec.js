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

test('saldo principal, simples e nenhum desempate adicional podem coexistir sem salvar', async ({ page }) => {
  await openCreateModal(page);
  await page.evaluate(() => {
    window._f2MountInForm(document.getElementById('f2-config-mount'), 'Beach Tennis', null, null);
    window._f2ClassifAtiva(true);
  });
  await expect(page.locator('#tie-resolution-section')).toContainText('Simples de desempate');
  await page.locator('[data-ranking-primary="games_diff"]').click();
  expect(await selVal(page, 'ranking-primary')).toBe('games_diff');
  await expect(page.locator('#ranking-primary-buttons .ranking-primary-active')).toHaveCount(1);
  await expect(page.locator('[data-ranking-primary="games_diff"]')).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  await page.getByRole('button', { name: 'Simples de desempate' }).click();
  await expect(page.locator('#tie-resolution-section')).toContainText('Pontos para vencer');
  await page.getByRole('button', { name: 'Desativar todos' }).click();
  await expect(page.locator('#tiebreaker-list li')).toHaveCount(0);
  await expect(page.locator('#tiebreaker-list')).toHaveCSS('display', 'flex');
  const order = await page.evaluate(() => {
    const parent = document.getElementById('tiebreaker-section');
    return Array.from(parent.children).map(el => el.id || el.textContent.trim().slice(0, 24));
  });
  expect(order.indexOf('tie-resolution-section')).toBeLessThan(order.indexOf('tiebreaker-list'));
});

test('cor do título aparece na prévia da personalização', async ({ page }) => {
  await openCreateModal(page);
  await page.locator('#tv-personalization').evaluate(el => { el.open = true; });
  await page.locator('#tourn-title-color').fill('#ffe100');
  await expect(page.locator('#cover-title-preview')).toHaveCSS('color', 'rgb(255, 225, 0)');
});

test('recorte de logo mantém transparência PNG e fundo escolhido gera imagem opaca', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 24;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(8, 8, 8, 8);
    window._cropResults = [];
    window._openImageCropEditor(canvas.toDataURL('image/png'), { size: 48, radiusControl: true }, data => window._cropResults.push(data));
  });
  await expect(page.locator('#crop-canvas')).toBeVisible();
  await page.locator('#crop-confirm').click();
  const pngResult = await page.evaluate(async () => {
    const url = window._cropResults[0];
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 48;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return { type: url.split(',')[0], cornerAlpha: ctx.getImageData(1, 1, 1, 1).data[3], centerAlpha: ctx.getImageData(24, 24, 1, 1).data[3] };
  });
  expect(pngResult).toEqual({ type: 'data:image/png;base64', cornerAlpha: 0, centerAlpha: 255 });
  await page.evaluate(() => window._openImageCropEditor(window._cropResults[0], { size: 48 }, data => window._cropResults.push(data)));
  await page.locator('#crop-bg-1').click();
  await page.locator('#crop-confirm').click();
  expect(await page.evaluate(() => window._cropResults[1].startsWith('data:image/jpeg;base64,'))).toBe(true);
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
