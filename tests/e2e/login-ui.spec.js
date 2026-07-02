// scoreplace.app — CENÁRIO Fase 2: LOGIN (escopo reduzido — UI/validação).
//
// Os 3 caminhos de login dependem de serviços EXTERNOS que não são E2E-áveis de ponta a ponta:
//   • celular → SMS/WhatsApp (Evolution API) • Google → popup OAuth • e-mail → link mágico (Brevo).
// O que É testável de forma determinística e sem rede é a LÓGICA DE UI do modal, onde os bugs de
// login historicamente moraram (ver project_login_ux): o campo unificado (login-identifier) que
// detecta e-mail vs celular, a máscara BR do telefone, e o seletor de DDI que aparece só no modo
// telefone. Mais a presença dos 3 caminhos (identificador, e-mail+senha, Google).
//
// Read-only (nenhuma escrita, nenhuma chamada externa) — roda contra staging OU prod.

const { test, expect } = require('@playwright/test');

test.describe('LOGIN — UI do modal (validação, sem round-trip externo)', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'UI de login testada no desktop');
  });

  test('3 caminhos presentes + detecção email/celular + máscara BR + DDI condicional', async ({ page }) => {
    test.setTimeout(45000);
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // abre o modal de login (o mesmo caminho do botão "Entrar")
    await page.evaluate(() => window.openModal && window.openModal('modal-login'));
    await expect(page.locator('#modal-login')).toBeVisible();

    // os 3 caminhos existem no modal
    await expect(page.locator('#login-identifier')).toBeAttached();       // e-mail OU celular (link mágico/SMS)
    await expect(page.locator('#login-password')).toBeAttached();         // e-mail + senha
    await expect(page.locator('#login-google-btn')).toBeAttached();       // Google
    await expect(page.locator('#btn-entrar')).toBeAttached();             // ação principal

    // ── modo E-MAIL: seletor de DDI fica escondido ──
    const emailMode = await page.evaluate(() => {
      const el = document.getElementById('login-identifier');
      el.value = 'ana@example.com';
      window._onIdentifierInput();
      const country = document.getElementById('login-identifier-country');
      return {
        value: el.value,
        ddiHidden: !country || getComputedStyle(country).display === 'none'
      };
    });
    expect(emailMode.value, 'e-mail: não recebe máscara de telefone').toBe('ana@example.com');
    expect(emailMode.ddiHidden, 'e-mail: seletor de DDI escondido').toBe(true);

    // ── modo CELULAR: máscara BR progressiva + DDI visível ──
    const phoneMode = await page.evaluate(() => {
      const country = document.getElementById('login-identifier-country');
      if (country) country.value = '55'; // BR (aplica máscara)
      const el = document.getElementById('login-identifier');
      el.value = '11987654321';
      window._onIdentifierInput();
      return {
        masked: el.value,
        ddiVisible: !!(country && getComputedStyle(country).display !== 'none')
      };
    });
    expect(phoneMode.masked, 'celular: máscara BR (11) 98765-4321').toBe('(11) 98765-4321');
    expect(phoneMode.ddiVisible, 'celular: seletor de DDI aparece').toBe(true);

    // ── volta pra e-mail: DDI some de novo (toggle correto) ──
    const backToEmail = await page.evaluate(() => {
      const el = document.getElementById('login-identifier');
      el.value = 'bruno@example.com';
      window._onIdentifierInput();
      const country = document.getElementById('login-identifier-country');
      return { ddiHidden: !country || getComputedStyle(country).display === 'none' };
    });
    expect(backToEmail.ddiHidden, 'voltou pra e-mail: DDI escondido de novo').toBe(true);

    // o botão do Google está fiado no handler certo
    const googleWired = await page.evaluate(() => {
      const b = document.getElementById('login-google-btn');
      return !!(b && /handleGoogleLogin/.test(b.getAttribute('onclick') || ''));
    });
    expect(googleWired, 'botão Google chama handleGoogleLogin').toBe(true);
  });
});
