// scoreplace.app — Navigation & theme tests
//
// Foca em fluxos sem login: rotas públicas, theme toggle, presença de assets.
// Mantém isolado de smoke.spec.js (que cobre ferramentas como Help modal).

const { test, expect } = require('@playwright/test');

test.describe('Navegação pública (sem login)', () => {
  test('rota raiz renderiza topbar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#view-title')).toBeVisible();
    await expect(page.locator('#view-container')).toBeAttached();
  });

  test('rota #dashboard mostra hero box ou landing card', async ({ page }) => {
    await page.goto('/#dashboard');
    // Sem login, mostra a landing dentro do view-container.
    // Logado, mostra a hero box do dashboard.
    // Em qualquer cenário: view-container não fica vazio.
    await expect(page.locator('#view-container')).toBeVisible();
    // render é async (boot loader + auth resolve + router) — espera o conteúdo aterrissar
    // em vez de ler innerText no mesmo tick da navegação (evita flake por timing).
    await expect
      .poll(async () => (await page.locator('#view-container').innerText()).length, { timeout: 10000 })
      .toBeGreaterThan(20);
  });

  test('rota inválida #foo-bar não trava o app', async ({ page }) => {
    await page.goto('/#foo-bar-123');
    // App ainda funcional — view-container renderizado, sem JS error fatal
    await expect(page.locator('#view-container')).toBeVisible();
    // E voltar pra dashboard funciona
    await page.goto('/#dashboard');
    await expect(page.locator('#view-container')).toBeVisible();
  });

  test('robots.txt + sitemap.xml servidos', async ({ page }) => {
    const robots = await page.goto('/robots.txt');
    expect(robots.status()).toBe(200);
    const robotsBody = await robots.text();
    expect(robotsBody).toMatch(/sitemap/i);

    const sitemap = await page.goto('/sitemap.xml');
    expect(sitemap.status()).toBe(200);
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toContain('<urlset');
  });
});

test.describe('Theme system', () => {
  test('theme toggle cicla pelos 4 temas', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // Lê tema inicial via data-theme do <html>
    const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(['dark', 'light', 'sunset', 'ocean']).toContain(initialTheme);

    // Em mobile o botão fica dentro do hamburger menu — chamar a função diretamente.
    // Isso testa a lógica core sem depender do layout responsivo.
    await page.evaluate(() => window._toggleTheme && window._toggleTheme());
    const afterFirst = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(['dark', 'light', 'sunset', 'ocean']).toContain(afterFirst);
    expect(afterFirst).not.toBe(initialTheme);

    // localStorage deve persistir o novo tema
    const stored = await page.evaluate(() => localStorage.getItem('scoreplace_theme'));
    expect(stored).toBe(afterFirst);
  });
});

test.describe('Observability + version', () => {
  test('SCOREPLACE_VERSION exposta como global', async ({ page }) => {
    await page.goto('/');
    const version = await page.evaluate(() => window.SCOREPLACE_VERSION);
    expect(version).toMatch(/^\d+\.\d+\.\d+(-(alpha|beta|rc)(\.\d+)?)?$/);
  });

  test('logger wrapper expõe _log/_warn/_error/_debug e detecta modo prod', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    const fns = await page.evaluate(() => ({
      log: typeof window._log,
      warn: typeof window._warn,
      error: typeof window._error,
      debug: typeof window._debug,
      mode: window._loggerMode
    }));
    expect(fns.log).toBe('function');
    expect(fns.warn).toBe('function');
    expect(fns.error).toBe('function');
    expect(fns.debug).toBe('function');
    // Modo válido: 'dev' (localhost), 'prod-quiet' (default em prod), 'prod-debug'
    // (debug forçado via localStorage). Test passa em qualquer ambiente.
    expect(['dev', 'prod-quiet', 'prod-debug']).toContain(fns.mode);

    // Chamar wrappers não throwa
    const errMsg = await page.evaluate(() => {
      try {
        window._log('test log');
        window._warn('test warn');
        window._error('test error');
        window._debug('test debug');
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(errMsg).toBeNull();
  });

  test('sentry-init.js carregado mas Sentry NÃO ativo (DSN inativa)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('load');

    // _captureException existe como no-op (não throwa)
    const captureType = await page.evaluate(() => typeof window._captureException);
    expect(captureType).toBe('function');

    // Não throwa quando chamado sem DSN
    const errMsg = await page.evaluate(() => {
      try {
        window._captureException(new Error('test'));
        return null;
      } catch (e) {
        return String(e);
      }
    });
    expect(errMsg).toBeNull();

    // Sentry SDK NÃO carregado (window.Sentry undefined)
    const hasSentry = await page.evaluate(() => typeof window.Sentry !== 'undefined');
    expect(hasSentry).toBe(false);
  });
});

test.describe('Resilience', () => {
  test('reload preserva tema escolhido', async ({ page }) => {
    await page.goto('/');
    // v2.6.27: só 2 temas válidos (dark/light) — sunset/ocean removidos. Usa 'light'.
    await page.evaluate(() => {
      localStorage.setItem('scoreplace_theme', 'light');
    });
    await page.reload();
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');
  });

  test('versão deployada bate com release-notes.js', async ({ page }) => {
    await page.goto('/');
    const v = await page.evaluate(() => window.SCOREPLACE_VERSION);

    // Carrega release-notes.js explicitamente e verifica que tem entry pra essa versão
    await page.evaluate(() => window._loadReleaseNotes && window._loadReleaseNotes());
    await page.waitForFunction(() => window._releaseNotesLoaded === true, null, { timeout: 10000 });

    const html = await page.evaluate(() => window._RELEASE_NOTES_HTML || '');
    expect(html).toContain(v);
  });
});
