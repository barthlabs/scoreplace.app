const { test, expect } = require('@playwright/test');
const path = require('path');

test('confirmar contas na importação mantém a rolagem do modal', async ({ page }) => {
  await page.setViewportSize({ width: 440, height: 640 });
  await page.setContent('<main>Prévia isolada</main>');
  await page.addStyleTag({ path: path.join(__dirname, '..', '..', 'css', 'components.css') });
  await page.evaluate(() => {
    Object.defineProperty(window.crypto, 'randomUUID', { value: () => '12345678-1234-4234-8234-123456789abc' });
    window.confirm = () => true;
    window._findTournamentById = () => ({ categoryDefinitions: [{ id: 'fem-light', label: 'Fem Light' }] });
    const slots = Array.from({ length: 8 }, (_, i) => ({ pairId: 'slot-' + i, categoryId: 'fem-light',
      members: [0, 1].map((side) => ({ registrationId: 'r-' + i + '-' + side,
        name: 'Jogador ' + String(i * 2 + side + 1).padStart(2, '0') })) }));
    const names = ['Ana', 'Bia', 'Cris', 'Dora', 'Eva', 'Fabi', 'Gabi', 'Helena',
      'Iara', 'Joana', 'Katia', 'Lia', 'Mara', 'Nina', 'Olga', 'Paula'];
    window._callCF = (name, data) => {
      if (name === 'previewTournamentImport') return Promise.resolve({ data: {
        count: 16, fingerprint: 'a'.repeat(64), photoImportEnabled: true,
        categories: [{ id: 'fem-light', label: 'Fem Light' }], slots } });
      if (name === 'extractTournamentImportImage') return Promise.resolve({ data: {
        text: 'LIGHT FEMININO\n' + Array.from({ length: 8 }, (_, i) =>
          (i + 1) + '. ' + names[i * 2] + ' Souza + ' + names[i * 2 + 1] + ' Lima').join('\n'),
      } });
      if (name === 'searchTournamentImportCandidates') return Promise.resolve({ data: {
        candidates: [{ uid: 'account-' + data.query, name: data.query }],
      } });
      throw new Error('Chamada inesperada: ' + name);
    };
  });
  for (const script of ['tournaments-import-parser.js', 'tournaments-import-allocation.js', 'tournaments-import.js']) {
    await page.addScriptTag({ path: path.join(__dirname, '..', '..', 'js', 'views', script) });
  }
  await page.evaluate(() => window._openTournamentImport('fixture'));
  await page.locator('#tournament-import-files').setInputFiles({
    name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]),
  });
  await expect(page.locator('.sp-import-pair')).toHaveCount(8);
  await expect(page.locator('.sp-import-candidate')).toHaveCount(16);
  const panel = page.locator('.sp-import-panel');
  const candidate = page.locator('.sp-import-pair').nth(5).locator('.sp-import-candidate').first();
  await candidate.scrollIntoViewIfNeeded();
  const before = await panel.evaluate((node) => node.scrollTop);
  expect(before).toBeGreaterThan(0);
  await candidate.click();
  const after = await panel.evaluate((node) => node.scrollTop);
  expect(Math.abs(after - before)).toBeLessThan(8);
  await expect(page.locator('.sp-import-pair').nth(5)).toContainText('Conta vinculada');
  await expect(page.locator('.sp-import-pair').nth(6)).toBeVisible();
});
