// FANTASMA DE ARRASTE na lista de inscritos — navegador REAL (Chromium).
//
// Bug ao vivo (26/jul, v1.5.19): um card de participante ficava FLUTUANDO preso sobre a
// lista (borda âmbar) e só sumia fechando o app. Causa: o clone do arraste por toque vive
// no <body>, mas os listeners de touchend/touchcancel vivem no container da lista — se a
// lista RE-RENDERIZA no meio do gesto, o container velho sai do DOM com os listeners
// dentro e nada mais manda o clone morrer.
//
// Este spec REPRODUZ a falha (rodado contra a v1.5.19 em produção, o clone sobrevive) e
// trava o conserto: fantasma some após re-render, após touchcancel e ao mandar o app pro
// fundo — E o drop normal continua mesclando (a feature não foi quebrada pra matar o bug).
//
// Roda contra qualquer origem que sirva o app:
//   SCOREPLACE_URL=http://localhost:8899 npx playwright test tests/e2e/drag-ghost.spec.js
// Nada é escrito no Firestore: o teste monta a lista na mão e intercepta _executeMerge.

const { test, expect } = require('@playwright/test');

// Monta uma lista de inscritos sintética num host fixo (viewport real = hit-test funciona)
// e liga o arraste por toque de verdade (window._initMergeTouchDrag).
async function setup(page) {
  await page.evaluate(() => {
    document.querySelectorAll('#ghost-test-host').forEach((h) => h.remove());
    const host = document.createElement('div');
    host.id = 'ghost-test-host';
    host.style.cssText = 'position:fixed;left:0;top:0;width:340px;z-index:2147483000;background:#111;';
    document.body.appendChild(host);
    window.__buildList = () => {
      host.innerHTML = '<div data-merge-container="T1" class="sp-dnd-host">' +
        ['marcia andrade', 'joao silva', 'ana lima'].map((n) =>
          '<div class="participant-card" data-merge-name="' + n + '" data-participant-name="' + n +
          '" style="height:60px;border:1px solid #333;background:#222;color:#fff;">' + n + '</div>').join('') +
        '</div>';
      window._initMergeTouchDrag('T1');
    };
    window.__touch = (idx, type, dx, dy) => {
      const cards = host.querySelectorAll('.participant-card');
      const src = cards[idx];
      const at = cards[dy == null ? idx : dy];        // dy = índice do card sob o dedo
      const r = at.getBoundingClientRect();
      const t = new Touch({ identifier: 1, target: src, clientX: r.left + 20, clientY: r.top + 20 });
      const ending = (type === 'touchend' || type === 'touchcancel');
      src.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: ending ? [] : [t], targetTouches: [], changedTouches: [t]
      }));
    };
    // Conta QUALQUER clone flutuante no <body> — não depende do marcador novo, então
    // o mesmo teste acusa o bug no código antigo.
    window.__floating = () => Array.from(document.body.children).filter((e) =>
      e.classList && e.classList.contains('participant-card') && getComputedStyle(e).position === 'fixed').length;
  });
}

async function grab(page) {           // long-press: nasce o clone flutuante
  await page.evaluate(() => { window.__buildList(); window.__touch(0, 'touchstart'); });
  await page.waitForTimeout(650);     // long-press do arraste = 500ms
  expect(await page.evaluate(() => window.__floating())).toBe(1);
}

test.describe('Arraste da lista de inscritos — nenhum card fantasma sobrevive', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/', { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window._initMergeTouchDrag === 'function');
    await setup(page);
  });

  test('re-render no MEIO do arraste não deixa card preso na tela', async ({ page }) => {
    await grab(page);
    await page.evaluate(() => {
      window.__touch(0, 'touchmove', 0, 0);
      document.querySelector('[data-merge-container]').remove();   // a lista re-renderizou
    });
    // O vigia roda a cada 400ms; 1,5s é folga de sobra.
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__floating())).toBe(0);
  });

  test('gesto cancelado pelo SO (touchcancel) limpa clone e card de origem', async ({ page }) => {
    await grab(page);
    await page.evaluate(() => window.__touch(0, 'touchcancel'));
    await page.waitForTimeout(100);
    const st = await page.evaluate(() => ({
      flutuando: window.__floating(),
      esmaecido: document.querySelector('.participant-card').hasAttribute('data-drag-dimmed')
    }));
    expect(st.flutuando).toBe(0);
    expect(st.esmaecido).toBe(false);
  });

  test('app pro fundo no meio do arraste limpa o clone', async ({ page }) => {
    await grab(page);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__floating())).toBe(0);
  });

  test('drop normal AINDA mescla (o conserto não matou a feature)', async ({ page }) => {
    await page.evaluate(() => {
      window.__merged = null;
      window.__origMerge = window._executeMerge;
      window._executeMerge = (s, t) => { window.__merged = s + ' → ' + t; };
    });
    await grab(page);
    await page.evaluate(() => {
      window.__touch(0, 'touchmove', 0, 2);   // dedo sobre o 3º card
      window.__touch(0, 'touchend', 0, 2);
    });
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => {
      window._executeMerge = window.__origMerge;
      return { merged: window.__merged, flutuando: window.__floating() };
    });
    expect(st.merged).toBe('marcia andrade → ana lima');
    expect(st.flutuando).toBe(0);
  });
});
