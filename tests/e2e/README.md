# E2E Tests — Playwright

Tests de ponta-a-ponta rodam contra `http://localhost:8899` por padrão; use
`SCOREPLACE_URL` para outro alvo. O app local ainda aponta ao Firebase real,
então os specs usam stubs ou ações somente leitura. A fixture `safe-test.js`
bloqueia escritas no Firestore e chamadas POST de Functions.

## Setup (uma vez)

```bash
npm install
npm run test:e2e:install   # baixa Chromium + system deps (~200MB)
```

## Rodar

```bash
npm run test:e2e            # headless, ambos browsers (desktop + Pixel 5)
npm run test:e2e:headed     # vê o browser rodando
npm run test:e2e:ui         # UI interativa do Playwright

# Contra local server:
SCOREPLACE_URL=http://localhost:5173 npm run test:e2e
```

## Cenários atuais

### `smoke.spec.js`
- Home renderiza com topbar e botão Login
- Help modal abre, mostra "Sobre" e **lazy-loads release notes** (valida o fix da v0.17.56)
- PWA manifest + service worker servidos

## Convenções

- Cada `.spec.js` testa uma área específica do app.
- Manter testes <10s cada — slow-4G simulado em algumas runs.
- Usar `page.locator()` com seletor estável (id > class > text). Evitar XPath.
- Nada de login real — flows com Google Auth precisam de stub. Testes que
  precisem de estado autenticado vão usar fixtures (a fazer).

## Próximos cenários (roadmap)

1. **`tournament-create.spec.js`** — login mock + criar torneio + verificar dashboard
2. **`casual-match.spec.js`** — duas tabs sincronizando placar via Firestore
3. **`presence-flow.spec.js`** — check-in num venue + outro user vê
4. **`a11y.spec.js`** — Playwright + @axe-core/playwright pra validar acessibilidade

## CI (futuro)

Adicionar GitHub Action `.github/workflows/e2e.yml`:

```yaml
on: [pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm install
      - run: npm run test:e2e:install
      - run: npm run test:e2e
      - if: always()
        uses: actions/upload-artifact@v4
        with: { name: playwright-report, path: playwright-report }
```

A fazer quando merge em `main` for via PR (hoje deploy é direto).
