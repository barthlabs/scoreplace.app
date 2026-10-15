const { test, expect } = require('@playwright/test');
const path = require('path');

test('convite individual exige clique consciente e apaga token da URL', async ({ page }) => {
  const token = 'a'.repeat(64);
  await page.route('http://claim.local/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<main id="view-container"></main>' }));
  await page.goto('http://claim.local/#claim-registration/torneio/manual-1/' + token);
  await page.addStyleTag({ path: path.join(__dirname, '..', '..', 'css', 'components.css') });
  await page.evaluate(() => {
    window.AppStore = { currentUser: { uid: 'claimant' } };
    window._renderBackHeader = () => '<header>Voltar</header>';
    window._callCF = (name) => {
      window.calls = window.calls || []; window.calls.push(name);
      if (name === 'previewManualClaimInvite') return Promise.resolve({ data: {
        tournamentName: 'Torneio de teste', name: 'Pessoa Teste', categoryId: 'fem-light',
      } });
      if (name === 'acceptManualClaimInvite') return Promise.resolve({ data: { ok: true } });
      throw new Error('chamada inesperada');
    };
  });
  await page.addScriptTag({ path: path.join(__dirname, '..', '..', 'js', 'views', 'tournaments-claim.js') });
  await page.evaluate(() => window.renderClaimRegistrationPage(document.getElementById('view-container'), 'torneio', 'manual-1', 'a'.repeat(64)));
  await expect(page.locator('.sp-claim-person')).toContainText('Pessoa Teste');
  expect(page.url()).not.toContain(token);
  expect(await page.evaluate(() => window.calls)).toEqual(['previewManualClaimInvite']);
  await page.getByRole('button', { name: 'Sou esta pessoa — vincular minha conta' }).click();
  await expect(page.locator('[data-claim-status]')).toHaveText('Inscrição vinculada à sua conta.');
  expect(await page.evaluate(() => window.calls)).toEqual(['previewManualClaimInvite', 'acceptManualClaimInvite']);
  await page.evaluate(() => window.renderClaimRegistrationPage(document.getElementById('view-container'), 'torneio', '', ''));
  await expect(page.locator('[data-claim-status]')).toHaveText('Inscrição vinculada à sua conta.');
  await expect(page.getByRole('button', { name: 'Sou esta pessoa — vincular minha conta' })).toHaveCount(0);
});

test('convite mantém o link durante login e exige confirmação após autenticar', async ({ page }) => {
  const token = 'b'.repeat(64);
  await page.route('http://claim.local/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<main id="view-container"></main>' }));
  await page.goto('http://claim.local/#claim-registration/torneio/manual-2/' + token);
  await page.evaluate(() => {
    window.AppStore = { currentUser: null };
    window._renderBackHeader = () => '<header>Voltar</header>';
    window.openModal = (id) => { window.openedModal = id; };
    window._callCF = (name) => {
      window.calls = window.calls || []; window.calls.push(name);
      if (name === 'previewManualClaimInvite') return Promise.resolve({ data: {
        tournamentName: 'Torneio de teste', name: 'Pessoa Sem Conta', categoryId: 'fem-light',
      } });
      if (name === 'acceptManualClaimInvite') return Promise.resolve({ data: { ok: true } });
      throw new Error('chamada inesperada');
    };
  });
  await page.addScriptTag({ path: path.join(__dirname, '..', '..', 'js', 'views', 'tournaments-claim.js') });
  await page.evaluate(() => window.renderClaimRegistrationPage(document.getElementById('view-container'), 'torneio', 'manual-2', 'b'.repeat(64)));
  await page.getByRole('button', { name: 'Entrar ou criar conta' }).click();
  expect(await page.evaluate(() => window.openedModal)).toBe('modal-login');
  expect(page.url()).toContain(token);
  expect(await page.evaluate(() => window.calls)).toBeUndefined();
  await page.evaluate(() => {
    window.AppStore.currentUser = { uid: 'new-user' };
    window.renderClaimRegistrationPage(document.getElementById('view-container'), 'torneio', 'manual-2', 'b'.repeat(64));
  });
  await expect(page.locator('.sp-claim-person')).toContainText('Pessoa Sem Conta');
  expect(page.url()).not.toContain(token);
  expect(await page.evaluate(() => window.calls)).toEqual(['previewManualClaimInvite']);
  await page.getByRole('button', { name: 'Sou esta pessoa — vincular minha conta' }).click();
  await expect(page.locator('[data-claim-status]')).toHaveText('Inscrição vinculada à sua conta.');
});
