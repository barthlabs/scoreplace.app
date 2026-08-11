// scoreplace.app — Playwright config
// Run: npm run test:e2e (or playwright test)
// First time: npm run test:e2e:install (instala chromium + system deps)

const { defineConfig, devices } = require('@playwright/test');

// SEGURANÇA: o default NUNCA pode ser produção. Specs de escrita criam/sorteiam/apagam
// torneios de verdade — contra prod isso tocaria os dados reais do Confra.
//
// ⚠️ Até a 1.8.2 o default era `https://scoreplace-staging.web.app`. Esse ambiente foi
// DELETADO em 19/jul/2026 (projeto GCP em DELETE_REQUESTED, hosting devolvendo 404), então
// o default apontava pra um host morto e QUALQUER run sem SCOREPLACE_URL batia no vazio.
// Agora o default é o servidor local (o mesmo porto do .claude/launch.json) — sobe com
// `npx http-server -p 8899 -c-1` antes de rodar. Prod entra só por opt-in EXPLÍCITO
// (SCOREPLACE_URL=https://scoreplace.app) e serve só pros specs de LEITURA.
//
// ⚠️ Localhost NÃO é um Firestore isolado: o app aponta pro projeto de PRODUÇÃO em
// qualquer host (a config deixou de variar por hostname na 1.8.2). Então rodar aqui
// escreve em PROD — é por isso que os specs de escrita seguem travados e não podem ser
// soltos "porque é localhost". Ver o cabeçalho de tests/e2e/tournament-flow.spec.js.
const DEFAULT_URL = 'http://localhost:8899';
const LOCAL_URL = process.env.SCOREPLACE_URL || DEFAULT_URL;

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
