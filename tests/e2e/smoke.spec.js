// scoreplace.app — Smoke test
//
// O cenário "primeiro paint" do app: carregamento, topbar, modal de Help.
// Mantenha rápido (<10s por test). Asserts focados em "página viva".
// Não logar — login com Google é testado em testes de fluxo separados.

const { test, expect } = require('@playwright/test');

test.describe('Smoke — landing/dashboard sem login', () => {
  test('home renderiza com topbar e botão Login', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Title é o nome da app
    await expect(page).toHaveTitle(/scoreplace/i);

    // Topbar visível
    await expect(page.locator('#view-title')).toContainText('scoreplace');

    // Botão Login presente no DOM (em mobile pode estar collapsed dentro do hamburger)
    await expect(page.locator('#btn-login')).toBeAttached();

    // App container renderizado
    await expect(page.locator('#view-container')).toBeAttached();

    // Versão exposta como global
    const version = await page.evaluate(() => window.SCOREPLACE_VERSION);
    expect(version).toMatch(/^\d+\.\d+\.\d+(-alpha|-beta)?$/);
  });

  test('Help modal abre, mostra "Sobre" e lazy-loads release notes', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Abre o modal direto via openModal() — evita race conditions com SW reload
    // e/ou intercept de pointer events da landing page
    await page.evaluate(() => window.openModal && window.openModal('modal-help'));

    // Modal aparece
    const helpModal = page.locator('#modal-help');
    await expect(helpModal).toBeVisible();
    await expect(helpModal.locator('h2:has-text("Central de Ajuda")')).toBeVisible();

    // Seção "Instalar o app" abre por default (v1.0.24 — main.js query 'instalar-app').
    const defaultOpen = helpModal.locator('.help-section[data-help-id="instalar-app"]');
    await expect(defaultOpen).toHaveClass(/open/);
    // "Sobre" existe e traz a identidade do app (não precisa estar aberta pra ter o texto).
    const aboutSection = helpModal.locator('.help-section[data-help-id="about"]');
    await expect(aboutSection).toContainText(/scoreplace\.app/i);

    // Notas de versões: placeholder existe (oculto pq .help-body fica display:none
    // até a seção ganhar .open)
    const notasSection = helpModal.locator('.help-section[data-help-id="notas-versoes"]');
    await expect(notasSection.locator('#release-notes-placeholder')).toBeAttached();
    await expect(notasSection).not.toHaveClass(/open/);

    // Pré-condição do lazy-load
    const preLoad = await page.evaluate(() => window._releaseNotesLoaded);
    expect(preLoad).toBeFalsy();

    // Dispara o lazy-load chamando o handler global direto — mais robusto
    // que click pq evita pointer-events intercepts da landing acidentalmente
    // por baixo do modal em viewport mobile.
    await page.evaluate(() => window._loadReleaseNotes && window._loadReleaseNotes());
    notasSection.evaluate((el) => el.classList.add('open'));

    // Aguarda DOM atualizado (placeholder removido). main.js v0.17.59 garante
    // que outerHTML rola ANTES de _releaseNotesLoaded virar true.
    await expect(notasSection.locator('#release-notes-placeholder')).toHaveCount(0, { timeout: 15000 });
    await expect(notasSection.locator('.help-body')).toContainText(/v0\.\d+\.\d+/i, { timeout: 5000 });
    expect(await page.evaluate(() => window._releaseNotesLoaded)).toBe(true);
  });

  test('PWA manifest e service worker disponíveis', async ({ page }) => {
    const manifestRes = await page.goto('/manifest.json');
    expect(manifestRes.status()).toBe(200);
    const manifest = await manifestRes.json();
    expect(manifest.name || manifest.short_name).toMatch(/scoreplace/i);

    const swRes = await page.goto('/sw.js');
    expect(swRes.status()).toBe(200);
    const swBody = await swRes.text();
    expect(swBody).toContain('CACHE_NAME');
    expect(swBody).toContain('STATIC_ASSETS');
  });
});
