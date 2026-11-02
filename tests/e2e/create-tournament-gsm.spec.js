// scoreplace.app — CAMADA 2 (clique→valor): configuração de pontuação GSM
//
// Prova que mexer nos controles reais do modal GSM e clicar "Aplicar" aterrissa os valores
// nos campos ocultos que o SAVE do torneio lê (#gsm-setsToWin / #gsm-gamesPerSet /
// #gsm-tiebreakEnabled / #gsm-type). A camada 1 já provou que o motor consome esse scoring
// (live-scoring-resolve + standings GSM); aqui fecha o elo do formulário. Read-only (nunca
// salva torneio). npm run test:e2e contra baseURL.
//
// Cobertos: setsToWin, gamesPerSet, tiebreakEnabled, type. NÃO cobertos de propósito:
//  • advantage → no Aplicar, `_gsmUpdateAdvantageUI` reseta `#gsm-advantageRule` pro default do
//    esporte (controle vive no form principal `#gsm-advantage-toggle`, não no modal) → flaky por design.
//  • super-tiebreak → a linha do modal fica oculta (condicional, ex.: setsToWin≥2) → não clicável aqui.
// A regra de empate usa botões Prorrogar/Tie-break; o checkbox é só espelho interno.

const { test, expect } = require('./safe-test');

async function openGsm(page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    try { window.setupCreateTournament && window.setupCreateTournament(); } catch (e) {}
    window.openModal && window.openModal('modal-create-tournament');
    window._openGSMConfig && window._openGSMConfig();
  });
  await expect(page.locator('#gsm-config-overlay')).toBeVisible();
  await expect(page.locator('#gsm-cfg-setsToWin')).toBeVisible();
}
const val = (page, id) => page.evaluate((i) => { var el = document.getElementById(i); return el ? el.value : null; }, id);
const checked = (page, id) => page.evaluate((i) => { var el = document.getElementById(i); return el ? el.checked : null; }, id);
async function setToggle(page, inputId, target) {
  if (await checked(page, inputId) !== target) await page.locator('#gsm-tierule-seg button').nth(target ? 1 : 0).click();
  expect(await checked(page, inputId)).toBe(target);
  await expect(page.locator('#gsm-tierule-seg')).toHaveAttribute('data-tierule', target ? 'tiebreak' : 'extend');
}
const aplicar = (page) => page.locator('#gsm-config-overlay button:has-text("Aplicar")').click();

test.describe('Camada 2 — GSM config (clique→valor)', () => {
  test('sets + games + Aplicar → campos ocultos #gsm-* que o save lê', async ({ page }) => {
    await openGsm(page);
    await page.locator('#gsm-cfg-setsToWin').selectOption('3');
    await page.locator('#gsm-cfg-gamesPerSet').fill('4');
    await aplicar(page);

    expect(await val(page, 'gsm-setsToWin')).toBe('3');
    expect(await val(page, 'gsm-gamesPerSet')).toBe('4');
    expect(await val(page, 'gsm-type')).toBe('sets'); // Aplicar sempre marca o torneio como GSM
  });

  test('toggle tiebreak → #gsm-tiebreakEnabled (true ↔ false)', async ({ page }) => {
    await openGsm(page);
    await setToggle(page, 'gsm-cfg-tiebreak', true);
    await aplicar(page);
    expect(await val(page, 'gsm-tiebreakEnabled')).toBe('true');

    await openGsm(page);
    await setToggle(page, 'gsm-cfg-tiebreak', false);
    await aplicar(page);
    expect(await val(page, 'gsm-tiebreakEnabled')).toBe('false');
  });
});
