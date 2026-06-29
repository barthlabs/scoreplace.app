// scoreplace.app — CAMADA 2 (clique→valor): Categorias de Gênero + Habilidade
//
// Continua a camada 2 do congelamento. Prova que clicar nas pills reais aterrissa
// o valor no sink certo:
//   • Gênero: pills _toggleGenderCat → #tourn-gender-categories (CSV; misto_aleatorio ⟂ misto_obrigatorio)
//   • Skill:  pills _toggleSkillCat → #tourn-skill-categories (CSV em ordem canônica A,B,C,D,FUN)
// Read-only (nunca salva). Roda via npm run test:e2e contra baseURL (PROD default / SCOREPLACE_URL).
//
// Obs: o "Modo de Inscrição" (#select-inscricao) NÃO é testado por clique aqui — desde v2.7.83
// os toggles individual/time saíram da UI (ficam 0×0, ocultos): o valor passou a ser DERIVADO do
// tipo de jogo (Duplas). Testar o toggle oculto seria congelar UI morta.

const { test, expect } = require('@playwright/test');

async function openCreateModal(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    try { window.setupCreateTournament && window.setupCreateTournament(); } catch (e) {}
    window.openModal && window.openModal('modal-create-tournament');
  });
  await expect(page.locator('#modal-create-tournament')).toBeVisible();
  await expect(page.locator('#gender-cat-buttons')).toBeAttached();
}
const val = (page, id) => page.evaluate((i) => { var el = document.getElementById(i); return el ? el.value : null; }, id);

test.describe('Camada 2 — Categorias de Gênero (clique→valor)', () => {
  test('pills de gênero → CSV em #tourn-gender-categories; misto auto-excludente', async ({ page }) => {
    await openCreateModal(page);
    expect(await val(page, 'tourn-gender-categories')).toBe('');

    await page.locator('#gender-cat-buttons button:has-text("Feminino")').click();
    await page.locator('#gender-cat-buttons button:has-text("Masculino")').click();
    expect((await val(page, 'tourn-gender-categories')).split(',').sort().join(',')).toBe('fem,masc');

    // toggle off Feminino → some
    await page.locator('#gender-cat-buttons button:has-text("Feminino")').click();
    expect(await val(page, 'tourn-gender-categories')).toBe('masc');

    // Misto Aleatório e Obrigatório são auto-excludentes
    await page.locator('#gender-cat-buttons button:has-text("Misto Aleatório")').click();
    expect((await val(page, 'tourn-gender-categories')).split(',')).toContain('misto_aleatorio');
    await page.locator('#gender-cat-buttons button:has-text("Misto Obrigatório")').click();
    const after = (await val(page, 'tourn-gender-categories')).split(',');
    expect(after).toContain('misto_obrigatorio');
    expect(after).not.toContain('misto_aleatorio'); // o anterior foi removido
  });
});

test.describe('Camada 2 — Categorias de Habilidade (clique→valor)', () => {
  test('pills A/B/C/D/FUN → CSV em ordem canônica em #tourn-skill-categories', async ({ page }) => {
    await openCreateModal(page);
    expect(await val(page, 'tourn-skill-categories')).toBe('');

    // clica fora de ordem (C, depois A) → sink deve sair em ordem canônica "A, C"
    await page.locator('#skill-cat-buttons [data-skill="C"]').click();
    await page.locator('#skill-cat-buttons [data-skill="A"]').click();
    expect(await val(page, 'tourn-skill-categories')).toBe('A, C');
    await expect(page.locator('#skill-cat-buttons [data-skill="A"]')).toHaveAttribute('data-active', '1');

    // toggle off A → resta "C"
    await page.locator('#skill-cat-buttons [data-skill="A"]').click();
    expect(await val(page, 'tourn-skill-categories')).toBe('C');
  });
});
