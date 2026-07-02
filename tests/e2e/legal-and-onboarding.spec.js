// scoreplace.app — Legal pages + onboarding regression tests
//
// Cenários PASSIVOS — só inspecionam DOM/recursos, sem login real ou
// modificação de estado. Cobrem itens críticos do beta-readiness:
//   - Páginas Privacy + Terms renderizam sem keys cruas
//   - Footer da landing tem links pra Privacy/Terms
//   - Modal de login tem disclaimer com links
//   - terms-acceptance.js exposto e configurado corretamente
//   - PWA icons full-bleed (sem rx — fix v0.17.73)
//   - Beach Tennis sport pill tem ícone com filter hue-rotate
//
// Caçariam regressões em:
//   - Privacy/Terms removidos do index.html (aconteceu entre v0.17.71 e v0.17.78)
//   - Modal terms-acceptance script faltando
//   - Disclaimer no login removido
//   - Ícones PWA voltando a ter cantos arredondados próprios

const { test, expect } = require('@playwright/test');

test.describe('Legal pages — Privacy', () => {
  test('rota #privacy renderiza com seções LGPD', async ({ page }) => {
    await page.goto('/#privacy', { waitUntil: 'load' });
    await page.waitForTimeout(800); // dá tempo do router renderizar

    const html = await page.evaluate(() => document.body.innerText);
    // Conteúdo placeholder estruturado por LGPD (v0.17.71)
    expect(html).toContain('Política de Privacidade');
    expect(html).toContain('Dados que coletamos');
    expect(html).toContain('Como usamos seus dados');
    expect(html).toContain('Visibilidade');
    expect(html).toContain('LGPD');
    expect(html).toContain('scoreplace.app@gmail.com');
  });

  test('rota #privacy não tem keys cruas', async ({ page }) => {
    await page.goto('/#privacy', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const html = await page.evaluate(() => {
      const m = document.getElementById('view-container');
      return m ? m.innerHTML : '';
    });
    // Nenhuma key i18n não-traduzida deve aparecer como texto visível
    const rawKeyMatch = html.match(/>privacy\.(title|section\d|contactTitle|contactBody)</);
    expect(rawKeyMatch).toBeNull();
  });
});

test.describe('Legal pages — Terms', () => {
  test('rota #terms renderiza com banner beta + seções', async ({ page }) => {
    await page.goto('/#terms', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    const text = await page.evaluate(() => document.body.innerText);
    expect(text).toContain('Termos de Uso');
    expect(text).toContain('Beta'); // banner disclaimer (app em fase Beta desde 2026-04-29)
    expect(text).toContain('Quem pode usar');
    expect(text).toContain('responsabilidade');
  });

  test('rota #terms não tem keys cruas', async ({ page }) => {
    await page.goto('/#terms', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    const html = await page.evaluate(() => {
      const m = document.getElementById('view-container');
      return m ? m.innerHTML : '';
    });
    const rawKeyMatch = html.match(/>terms\.(title|section\d|contactTitle|contactBody|alphaBannerTitle)</);
    expect(rawKeyMatch).toBeNull();
  });
});

test.describe('Footer + Login disclaimer', () => {
  test('landing footer tem links pra Privacy + Terms', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // O prerender pode ou não ter sido aplicado. De qualquer forma,
    // o footer renderizado deve ter os 2 links.
    const html = await page.evaluate(() => {
      const m = document.getElementById('view-container');
      return m ? m.innerHTML : '';
    });
    expect(html).toContain('href="#privacy"');
    expect(html).toContain('href="#terms"');
  });

  test('modal de login tem disclaimer com links pra Termos+Privacy', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(() => window.openModal && window.openModal('modal-login'));
    await page.waitForTimeout(500);

    const modal = page.locator('#modal-login');
    await expect(modal).toBeVisible();

    const html = await modal.evaluate((el) => el.innerHTML);
    expect(html).toContain('Ao continuar, você concorda');
    expect(html).toContain('href="#terms"');
    expect(html).toContain('href="#privacy"');
  });
});

test.describe('Terms acceptance modal infrastructure', () => {
  test('window._needsTermsAcceptance + window._showTermsAcceptanceModal expostos', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    const result = await page.evaluate(() => ({
      hasNeedsCheck: typeof window._needsTermsAcceptance === 'function',
      hasModalFn: typeof window._showTermsAcceptanceModal === 'function',
      currentVersion: window._CURRENT_TERMS_VERSION
    }));

    expect(result.hasNeedsCheck).toBe(true);
    expect(result.hasModalFn).toBe(true);
    expect(result.currentVersion).toBeTruthy();
    expect(typeof result.currentVersion).toBe('string');
  });

  test('_needsTermsAcceptance retorna true pra profile sem aceite', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    const checks = await page.evaluate(() => {
      const fn = window._needsTermsAcceptance;
      const v = window._CURRENT_TERMS_VERSION;
      return [
        { profile: null, expected: true, actual: fn(null) },
        { profile: undefined, expected: true, actual: fn(undefined) },
        { profile: {}, expected: true, actual: fn({}) },
        { profile: { acceptedTerms: false }, expected: true, actual: fn({ acceptedTerms: false }) },
        // Aceito mas versão desatualizada
        { profile: { acceptedTerms: true, acceptedTermsVersion: '0.5' }, expected: true, actual: fn({ acceptedTerms: true, acceptedTermsVersion: '0.5' }) },
        // Aceite válido
        { profile: { acceptedTerms: true, acceptedTermsVersion: v }, expected: false, actual: fn({ acceptedTerms: true, acceptedTermsVersion: v }) }
      ];
    });

    checks.forEach((c, i) => {
      expect(c.actual, `case ${i}: ${JSON.stringify(c.profile)}`).toBe(c.expected);
    });
  });

  test('modal de aceite renderiza checkbox + botões', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // Dispara o modal manualmente (sem login real). NÃO confirma —
    // apenas verifica que renderiza corretamente.
    await page.evaluate(() => {
      // Promise é descartada de propósito — só queremos o modal aberto pra inspeção
      window._showTermsAcceptanceModal();
    });
    await page.waitForTimeout(300);

    const modal = page.locator('#modal-terms-acceptance');
    await expect(modal).toBeVisible();
    await expect(modal.locator('#terms-accept-checkbox')).toBeAttached();
    await expect(modal.locator('#terms-accept-confirm')).toBeAttached();
    await expect(modal.locator('#terms-accept-cancel')).toBeAttached();

    // Confirmar começa disabled
    const initialDisabled = await modal.locator('#terms-accept-confirm').evaluate((el) => el.disabled);
    expect(initialDisabled).toBe(true);

    // Marcar checkbox habilita confirmar
    await modal.locator('#terms-accept-checkbox').check();
    const afterCheck = await modal.locator('#terms-accept-confirm').evaluate((el) => el.disabled);
    expect(afterCheck).toBe(false);

    // Limpa: clica cancelar pra fechar
    await modal.locator('#terms-accept-cancel').click();
    await expect(modal).toHaveCount(0);
  });
});

test.describe('PWA icons — full-bleed (sem cantos arredondados próprios)', () => {
  test('icon-192.svg e icon-512.svg sem rx no rect de fundo', async ({ page }) => {
    const r192 = await page.goto('/icons/icon-192.svg');
    expect(r192.status()).toBe(200);
    const svg192 = await r192.text();
    // Busca o primeiro <rect ...> que cobre toda a viewBox (width/height 192)
    const bg192 = svg192.match(/<rect[^>]*width="192"[^>]*height="192"[^>]*>/);
    expect(bg192, 'icon-192 não tem rect 192x192 de fundo').toBeTruthy();
    // Esse rect NÃO deve ter rx="N" com N > 0 (cantos arredondados quebram mask de OS)
    expect(bg192[0]).not.toMatch(/rx="[1-9]/);

    const r512 = await page.goto('/icons/icon-512.svg');
    expect(r512.status()).toBe(200);
    const svg512 = await r512.text();
    const bg512 = svg512.match(/<rect[^>]*width="512"[^>]*height="512"[^>]*>/);
    expect(bg512, 'icon-512 não tem rect 512x512 de fundo').toBeTruthy();
    expect(bg512[0]).not.toMatch(/rx="[1-9]/);
  });
});

test.describe('Sport icons — Beach Tennis hue-rotate', () => {
  test('Beach Tennis pill tem filter hue-rotate (ícone laranja)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    const html = await page.evaluate(() => {
      const m = document.getElementById('view-container');
      return m ? m.innerHTML : '';
    });
    // O ícone Beach Tennis usa <span style="filter:hue-rotate(...) saturate(...)">🎾</span>
    expect(html).toContain('hue-rotate');
    expect(html).toMatch(/aria-label="Beach Tennis"/);
  });
});

test.describe('Toggle "Fechadas" + "Novos Confrontos" mutuamente exclusivos', () => {
  test('window._syncLateEnrollment respeita source argument', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(800);

    // Abrir modal-create-tournament pra que os toggles existam
    await page.evaluate(() => window.openModal && window.openModal('modal-create-tournament'));
    await page.waitForTimeout(500);

    const modal = page.locator('#modal-create-tournament');
    await expect(modal).toBeVisible();

    // Estado inicial: closed=ON, expand=OFF
    const initial = await page.evaluate(() => ({
      closed: document.getElementById('late-toggle-closed').checked,
      expand: document.getElementById('late-toggle-expand').checked
    }));
    expect(initial.closed).toBe(true);
    expect(initial.expand).toBe(false);

    // Liga expand → closed deve ir pra OFF
    await page.evaluate(() => {
      document.getElementById('late-toggle-expand').checked = true;
      window._syncLateEnrollment('expand');
    });
    const afterExpand = await page.evaluate(() => ({
      closed: document.getElementById('late-toggle-closed').checked,
      expand: document.getElementById('late-toggle-expand').checked
    }));
    expect(afterExpand.closed).toBe(false);
    expect(afterExpand.expand).toBe(true);

    // Liga closed → expand deve ir pra OFF
    await page.evaluate(() => {
      document.getElementById('late-toggle-closed').checked = true;
      window._syncLateEnrollment('closed');
    });
    const afterClosed = await page.evaluate(() => ({
      closed: document.getElementById('late-toggle-closed').checked,
      expand: document.getElementById('late-toggle-expand').checked
    }));
    expect(afterClosed.closed).toBe(true);
    expect(afterClosed.expand).toBe(false);
  });
});

test.describe('SW + PWA manifest', () => {
  test('SW STATIC_ASSETS inclui privacy.js + terms.js + terms-acceptance.js', async ({ page }) => {
    const sw = await page.goto('/sw.js');
    expect(sw.status()).toBe(200);
    const swText = await sw.text();
    expect(swText).toContain('/js/views/privacy.js');
    expect(swText).toContain('/js/views/terms.js');
    expect(swText).toContain('/js/views/terms-acceptance.js');
  });

  test('manifest.json tem ícones com purpose any maskable', async ({ page }) => {
    const m = await page.goto('/manifest.json');
    expect(m.status()).toBe(200);
    const manifest = await m.json();
    expect(manifest.icons).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    manifest.icons.forEach((icon) => {
      expect(icon.purpose).toContain('maskable');
    });
  });
});
