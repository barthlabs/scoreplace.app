// COMPARATIVO REAL — card da chave, render do app, sem nada fabricado.
//
// Pedido do dono: "temos que ver exemplos reais porra".
// ⚠️ LIÇÃO DESTE ARQUIVO: a 1ª versão montava um painel com markup MEU (avatar
// falso, linha falsa). Parecia o app e não era — não prova nada. Aqui o HTML é
// o que `renderDoubleElimBracket` devolve, com os avatares e o CSS de verdade.
//
// A captura é do ELEMENTO (a coluna de cards, ~478px), não da página: o card é
// mais largo que a viewport do telefone e vive num scroll horizontal, então
// screenshot de página sai cortado — foi o que sujou a primeira entrega.
//
// Rodar: SCOREPLACE_URL=http://localhost:8097 npx playwright test \
//        tests/e2e/nome-comparativo.spec.js --project=mobile-chromium

const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const SAIDA = path.join(__dirname, '__saida__');
try { fs.mkdirSync(SAIDA, { recursive: true }); } catch (e) {}

// Nomes reais de padrão brasileiro, do mais curto ao pior caso.
const NOMES = [
  'Ana', 'Rodrigo Barth', 'Ana Paula dos Santos',
  'Maria Fernanda de Souza Albuquerque Lima',
  'João Vitor de Alcântara Rodrigues Nascimento Filho',
  'Bia', 'Caio', 'Duda'
];
const LARGURAS = [{ nome: 'SE-320', w: 320 }, { nome: 'Pixel-393', w: 393 }];
const ESCALAS = [0.8, 1.0, 1.3];

test('comparativo: card REAL da chave por largura e escala', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(() =>
    document.querySelectorAll('[id*="boot"],[class*="boot-loader"]').forEach(e => e.remove()));

  const tabela = [];
  for (const larg of LARGURAS) {
    await page.setViewportSize({ width: larg.w, height: 900 });
    for (const escala of ESCALAS) {
      await page.evaluate((s) => document.documentElement.style.setProperty('--ui-scale', s), escala);

      await page.evaluate((nomes) => {
        const E = window._phasesEngine;
        const pool = nomes.map((n, i) => ({ displayName: n, uid: 'u' + i, categories: ['_default_'] }));
        const cfg = { format: 'Dupla Eliminatória', formatCode: 'elim_dupla', teamSize: 1, bracketResolution: 'playin' };
        const t = { id: 'CMP', name: 'Cmp', format: 'Dupla Eliminatória', teamSize: 1,
                    matches: [], currentPhase: 0, phases: [], participants: pool };
        const b = E.generatePhase(pool, cfg, { idPrefix: 'c', ordered: true, t, isVip: () => false, catOf: () => '_default_' });
        E.storePhase(t, 0, b);
        window.AppStore.tournaments = [t];
        window._currentBracketTournament = t;
        document.getElementById('view-container').innerHTML = window.renderDoubleElimBracket(t, false, '');
        if (window._fitNames) window._fitNames(document, 0);
      }, NOMES);
      await page.waitForTimeout(600);

      tabela.push(...(await page.evaluate(() => {
        const o = [];
        document.querySelectorAll('.sp-name-fit').forEach((el) => {
          const b = el.parentElement;
          o.push({ nome: (el.textContent || '').trim(),
                   px: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
                   cortado: el.scrollWidth > b.clientWidth + 1 });
        });
        return o;
      })).map(m => Object.assign({ tela: larg.nome, escala }, m)));

      // A COLUNA de cards (pai do card) — cards reais, um sob o outro.
      const coluna = page.locator('#view-container [data-players]').first().locator('xpath=../..');
      const arq = path.join(SAIDA, 'real-' + larg.nome + '-esc-' + String(escala).replace('.', '_') + '.png');
      await coluna.screenshot({ path: arq });
      expect(await page.locator('#view-container [data-players]').count()).toBeGreaterThan(0);
    }
  }

  console.log('\n┌─ FONTE FINAL DO NOME (px) ───────────────────────────────');
  tabela.forEach(r => console.log('│ ' + r.tela.padEnd(10) + 'esc ' + String(r.escala).padEnd(4) +
    String(r.px).padStart(6) + 'px  ' + (r.cortado ? 'CORTADO' : 'inteiro') + '  ' + r.nome.slice(0, 44)));
  console.log('└──────────────────────────────────────────────────────────\n' + SAIDA);
});
