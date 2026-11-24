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

test.describe('Camada 2 — Criar Torneio: configurador de fases', () => {
  test('a fase classificatória pode ser desligada e ligada no configurador atual', async ({ page }) => {
    await openCreateModal(page);
    await page.evaluate(() => window._f2MountInEditForm());
    const classificatoria = page.locator('input[onchange="window._f2ClassifAtiva(this.checked)"]');
    await expect(classificatoria).toBeChecked();
    await classificatoria.locator('xpath=../..').click();
    await expect.poll(() => page.evaluate(() => window._f2GetConfig().classifAtiva)).toBe(false);
    await classificatoria.locator('xpath=../..').click();
    await expect.poll(() => page.evaluate(() => window._f2GetConfig().classifAtiva)).toBe(true);
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
  expect(await selVal(page, 'ranking-primary')).toBe('games_diff');
  expect(await page.locator('#ranking-primary-buttons [data-ranking-primary]').evaluateAll(items => items.map(item => item.dataset.rankingPrimary))).toEqual(['games_diff', 'wins', 'points']);
  await expect(page.locator('#ranking-primary-buttons .ranking-primary-active')).toHaveCount(1);
  await expect(page.locator('[data-ranking-primary="games_diff"]')).toHaveCSS('background-color', 'rgb(37, 99, 235)');
  await page.getByRole('button', { name: 'Simples de desempate' }).click();
  await expect(page.locator('#tie-resolution-section')).toContainText('Pontos para vencer');
  await expect(page.locator('#sp-tie-points')).toHaveValue('5');
  await expect(page.locator('#tiebreaker-criteria-section')).toBeHidden();
  await page.getByRole('button', { name: 'Critérios de desempate' }).click();
  await expect(page.locator('#tiebreaker-criteria-section')).toBeVisible();
});

test('todos os formatos usam os três tempos da ficha e ocultam prazos por rodada', async ({ page }) => {
  await openCreateModal(page);
  await page.evaluate(() => {
    document.getElementById('tourn-start-date').value = '2026-11-29';
    document.getElementById('tourn-end-date').value = '2026-11-29';
    window._estimatedGameHoursState.mode = 'organizer';
    window._renderEstimatedGameHours();
  });
  await expect(page.locator('#round-bounds-toggle-row')).toBeHidden();
  await expect(page.locator('#time-estimates-container')).toBeVisible();
  await expect(page.locator('#phase-grid-call-time, #phase-grid-warmup-time, #phase-grid-elimination-play')).toHaveCount(0);
  await page.locator('#tourn-call-time').fill('7');
  await page.locator('#tourn-warmup-time').fill('3');
  await page.locator('#tourn-game-duration').fill('25');
  expect(await selVal(page, 'tourn-call-time')).toBe('7');
  expect(await selVal(page, 'tourn-warmup-time')).toBe('3');
  expect(await selVal(page, 'tourn-game-duration')).toBe('25');
  await page.evaluate(() => {
    window._f2MountInForm(document.getElementById('f2-config-mount'), 'Beach Tennis', null, null);
    window._f2Disputa('dupla');
    window._f2TeamForm('super_eight');
  });
  await expect(page.locator('#time-estimates-container')).toBeVisible();
  await expect(page.locator('#tourn-game-duration')).toHaveValue('25');
  await expect(page.locator('#phase-grid-call-time, #phase-grid-warmup-time, #phase-grid-elimination-play')).toHaveCount(0);
  await page.evaluate(() => window._setEstimatedScheduleMode('participants'));
  await expect(page.locator('#round-bounds-toggle-row')).toBeVisible();
});

test('cor do título aparece na prévia da personalização', async ({ page }) => {
  await openCreateModal(page);
  await page.locator('#tv-personalization').evaluate(el => { el.open = true; });
  await page.locator('#tourn-name').fill('Camis no Beyond');
  await expect(page.locator('#cover-title-preview')).toHaveText('Camis no Beyond');
  await page.locator('#tourn-title-color').fill('#ffe100');
  await expect(page.locator('#cover-title-preview')).toHaveCSS('color', 'rgb(255, 225, 0)');
  await page.locator('#title-hue-wheel').click({ position: { x: 108, y: 58 } });
  await expect(page.locator('#cover-title-preview')).not.toHaveCSS('color', 'rgb(255, 225, 0)');
  expect(await page.locator('#tourn-title-color').inputValue()).toMatch(/^#[0-9a-f]{6}$/i);
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

test.describe('Camada 2 — Criar Torneio: formação dos confrontos', () => {
  test('as opções de parceiros atualizam a configuração da classificatória', async ({ page }) => {
    await openCreateModal(page);
    await page.evaluate(() => window._f2MountInEditForm());
    await page.getByRole('button', { name: 'Rainha da Praia' }).click();
    await expect.poll(() => page.evaluate(() => window._f2GetConfig().parceria)).toBe('rei_rainha');
    await page.getByRole('button', { name: 'Grupos', exact: true }).click();
    await page.getByRole('button', { name: 'Sortear parceiro a cada rodada', exact: false }).click();
    await expect.poll(() => page.evaluate(() => window._f2GetConfig().parceria)).toBe('rotation_groups_8');
  });
});
