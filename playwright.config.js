// scoreplace.app — Playwright config
// Run: npm run test:e2e (or playwright test)
// First time: npm run test:e2e:install (instala chromium + system deps)

const { defineConfig, devices } = require('@playwright/test');

// Default = servidor LOCAL (mesmo porto do .claude/launch.json). Sobe com
// `npx http-server -p 8899 -c-1` antes de rodar. Prod entra só por opt-in EXPLÍCITO
// (SCOREPLACE_URL=https://scoreplace.app).
//
// ⚠️ Até a 1.8.2 o default era `https://scoreplace-staging.web.app`. Esse ambiente foi
// DELETADO em 19/jul/2026 (projeto GCP em DELETE_REQUESTED, hosting devolvendo 404), então
// o default apontava pra um host morto e QUALQUER run sem SCOREPLACE_URL batia no vazio.
//
// 🔴 TODO spec aqui é de LEITURA, e isso é uma REGRA, não um acaso. Localhost NÃO é um
// Firestore isolado: desde a 1.8.2 o app aponta pro projeto de PRODUÇÃO em qualquer host
// (a config deixou de variar por hostname). Então um spec que escreve — criar torneio,
// sortear, lançar placar, check-in — escreve NO CONFRA, rodando em localhost ou onde for.
// Os 4 specs de escrita que existiam eram travados por `test.skip(!isStaging)` e foram
// APAGADOS na 1.8.3 junto com o ambiente (ver CLAUDE.md). Não reintroduzir spec de escrita
// sem um alvo descartável de verdade: emulador do Firestore ligado no app, ou torneio
// sandbox `(SB)`, que já roda em produção justamente pra isso.
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
