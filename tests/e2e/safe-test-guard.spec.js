// Este spec usa o runner base para testar a própria fixture de segurança.
// O route é instalado antes de qualquer requisição. A escrita sintética é abortada
// no navegador; nenhum documento nem Function do projeto recebe a tentativa.
const { test, expect } = require('@playwright/test');
const { installWriteGuard } = require('./safe-test');

test('GET passa e escrita Firestore sintética é bloqueada antes da rede', async ({ page, context }) => {
  const violations = await installWriteGuard(context);
  await page.goto('/version.txt');
  const read = await page.evaluate(async () => (await fetch('/version.txt')).status);
  expect(read).toBe(200);

  await page.evaluate(async () => {
    try {
      await fetch('https://firestore.googleapis.com/google.firestore.v1.Firestore/Write/channel',
        { method: 'POST', mode: 'no-cors', body: 'fixture-sem-dados' });
    } catch (_) { /* route.abort() deve rejeitar a requisição */ }
  });
  expect(violations).toHaveLength(1);
  expect(violations[0]).toContain('Firestore RPC POST');
});
