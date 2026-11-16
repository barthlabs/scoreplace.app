/* PWA Apple: detector real, pintura do splash e composição do cabeçalho/modal.
 * O navegador emulado não substitui a conferência no iPhone, mas impede que
 * Android, Safari comum ou app nativo recebam as regras exclusivas do PWA. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const components = fs.readFileSync(path.join(root, 'css/components.css'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'css/layout.css'), 'utf8');

const inline = html.match(/O PWA instalado no iOS[\s\S]*?<script>([\s\S]*?)<\/script>/);
const fresh = store.match(/window\._spMarkIosPwa = function\(\) \{[\s\S]*?\n\};/);
assert(inline && fresh, 'os dois detectores de PWA Apple devem existir');

const cases = [
  { name: 'iPhone instalado', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', touch: 5, standalone: true, expected: true },
  { name: 'iPad como MacIntel instalado', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', touch: 5, standalone: true, expected: true },
  { name: 'Android instalado', ua: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', touch: 5, standalone: true, expected: false },
  { name: 'iPhone no navegador', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', touch: 5, standalone: false, expected: false },
  { name: 'iPhone nativo', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', touch: 5, standalone: true, native: true, expected: false },
];

function detect(script, tc, callHelper) {
  const classes = new Set(tc.native ? ['sp-native'] : []);
  const context = {
    navigator: { userAgent: tc.ua, platform: tc.platform, maxTouchPoints: tc.touch, standalone: tc.standalone },
    document: { documentElement: { classList: {
      contains: (name) => classes.has(name),
      add: (name) => classes.add(name),
    } } },
    window: { matchMedia: () => ({ matches: tc.standalone }) },
  };
  vm.runInNewContext(script, context);
  if (callHelper) context.window._spMarkIosPwa();
  return classes.has('sp-ios-pwa');
}

for (const tc of cases) {
  assert.strictEqual(detect(inline[1], tc, false), tc.expected, `detector inline: ${tc.name}`);
  assert.strictEqual(detect(fresh[0], tc, true), tc.expected, `detector store.js: ${tc.name}`);
}

assert(html.includes("_bootDE.classList.contains('sp-ios-pwa') ? '#145584' : '#0f172a'"), 'pintura inline do splash segue o marcador');
assert(store.includes("document.documentElement.style.backgroundColor = '#145584'"), 'JS fresco corrige shell antigo em cache');
assert(store.includes("document.documentElement.style.backgroundColor = ''"), 'fallback restaura o fundo normal');
assert.strictEqual((html.match(/<script(?:\s|>)/g) || []).length, (html.match(/<\/script>/g) || []).length, 'tags de script balanceadas');

(async () => {
  const { chromium } = require(path.join(root, 'node_modules/playwright'));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.setContent(`<html class="sp-ios-pwa"><head><style>:root{--z-modal:100;--transition-normal:.3s ease}${components}${layout}</style></head><body><div class="modal-overlay" id="modal"></div><div class="sp-header-brand"></div><div class="sp-header-version"></div></body></html>`);
    let css = await page.evaluate(() => {
      const m = getComputedStyle(document.getElementById('modal'));
      return { visibility: m.visibility, blur: m.backdropFilter, property: m.transitionProperty, duration: m.transitionDuration, brandTransform: getComputedStyle(document.querySelector('.sp-header-brand')).transform, versionTransform: getComputedStyle(document.querySelector('.sp-header-version')).transform };
    });
    assert.strictEqual(css.visibility, 'hidden', 'modal inativo fica invisível');
    assert.strictEqual(css.blur, 'none', 'modal inativo não compõe blur');
    assert(css.property.includes('visibility') && css.property.includes('opacity'), 'transição cobre visibilidade e opacidade');
    assert(css.duration.includes('0.3s') && css.duration.includes('0s'), 'visibilidade espera o fade-out');
    assert.strictEqual(css.brandTransform, 'none', 'marca do PWA Apple sem camada 3D');
    assert.strictEqual(css.versionTransform, 'none', 'versão do PWA Apple sem camada 3D');

    await page.evaluate(() => document.getElementById('modal').classList.add('active'));
    css = await page.evaluate(() => {
      const m = getComputedStyle(document.getElementById('modal'));
      return { visibility: m.visibility, blur: m.backdropFilter, duration: m.transitionDuration };
    });
    assert.strictEqual(css.visibility, 'visible', 'modal aberto é visível imediatamente');
    assert.notStrictEqual(css.blur, 'none', 'modal aberto preserva blur');
    assert(css.duration.includes('0s'), 'modal abre sem atraso de visibilidade');

    await page.evaluate(() => document.getElementById('modal').classList.remove('active'));
    await page.waitForTimeout(350);
    css = await page.evaluate(() => {
      const m = getComputedStyle(document.getElementById('modal'));
      return { visibility: m.visibility, blur: m.backdropFilter };
    });
    assert.strictEqual(css.visibility, 'hidden', 'modal volta a ficar invisível após fade-out');
    assert.strictEqual(css.blur, 'none', 'blur some no início do fechamento');

    await page.evaluate(() => document.documentElement.classList.remove('sp-ios-pwa'));
    css = await page.evaluate(() => {
      const m = getComputedStyle(document.getElementById('modal'));
      return { visibility: m.visibility, blur: m.backdropFilter, brandTransform: getComputedStyle(document.querySelector('.sp-header-brand')).transform };
    });
    assert.strictEqual(css.visibility, 'visible', 'Android mantém estilo legado do modal');
    assert.notStrictEqual(css.blur, 'none', 'Android mantém blur legado');
    assert.notStrictEqual(css.brandTransform, 'none', 'Android mantém regra móvel de composição');
    await page.close();
  } finally {
    await browser.close();
  }
  console.log('✓ PWA Apple sem faixa escura nem blur persistente; demais plataformas preservadas');
})().catch((err) => { console.error(err); process.exitCode = 1; });
