// scoreplace.app — Playwright config
// Run: npm run test:e2e (or playwright test)
// First time: npm run test:e2e:install (instala chromium + system deps)

const { defineConfig, devices } = require('@playwright/test');

// SEGURANÇA: o default é STAGING (Firestore isolado, descartável), NUNCA produção.
// Specs de escrita (tournament-flow) criam/sorteiam/apagam torneios de verdade — rodar
// isso contra prod tocaria os dados reais do Confra. Prod só entra por opt-in EXPLÍCITO
// (SCOREPLACE_URL=https://scoreplace.app), e ainda assim o tournament-flow tem trava
// própria que se recusa a escrever em prod. Ver docs/staging.md + playwright.config.
const STAGING_URL = 'https://scoreplace-staging.web.app';
const LOCAL_URL = process.env.SCOREPLACE_URL || STAGING_URL;

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  // Beta-readiness: erro se um describe ficar sem assertion (pega test bug)
  forbidOnly: !!process.env.CI,
  // 1 retry local pra absorver flakes ocasionais do SW auto-update reload
  // que pode disparar quando uma deploy nova chega no meio de uma run.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  timeout: 30000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: LOCAL_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // App é lento em mobile slow-4G; aumenta timeout dos clicks/waits
    actionTimeout: 15000,
    navigationTimeout: 30000
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] }
    }
  ]
});
