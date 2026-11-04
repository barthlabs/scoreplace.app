// scoreplace.app — i18n regression tests
//
// Caça regressões onde IIFEs de modais constroem HTML ao boot usando _t()
// antes do dict de i18n carregar — bug deployado na v0.17.68 e revertido
// na v0.17.70. Sintoma: usuário vê literalmente "create.nameLabel",
// "btn.save", etc. em vez do texto traduzido. Persiste até refresh
// (HTML do modal fica cacheado com keys baked).
//
// Filosofia: testar o DOM "ao boot" — se algum modal/setup build HTML
// usando _t() e o dict não tá pronto, o teste falha imediato.

const { test, expect } = require('@playwright/test');

// Padrões de keys i18n cruas que aparecem como texto visível (entre tags
// ou em atributos visíveis). Se um desses padrões aparecer dentro de um
// modal renderizado, é regressão.
const RAW_KEY_PATTERNS = [
  // Comuns em modais
  /\bcreate\.[a-zA-Z][a-zA-Z0-9]*Label\b/,
  /\bcreate\.(nameLabel|sportLabel|publicLabel|drawMode|drawModeSorteio|loadTemplate|saveTemplate|genLogo|descLiga|logoSection)\b/,
  /\bbtn\.(back|save|discard|cancel)\b/,
  /\btournament\.(format|sport|venue|name)\b/,
  /\bformat\.(single|double|league|groupsShort|monarchShort)\b/,
  /\bprofile\.(labelName|labelSex|labelWhatsApp|notifAll|notifImportant)\b/,
  /\bhelp\.(about|primeirosPassos|dashboard|search)\b/
];

function findRawKeys(html) {
  if (!html) return [];
  const found = [];
  RAW_KEY_PATTERNS.forEach((re) => {
    const match = html.match(new RegExp(re.source, 'g'));
    if (match) found.push(...match);
  });
  return [...new Set(found)];
}

test.describe('i18n — modais não devem ter keys cruas no DOM ao boot', () => {
  test('modal-create-tournament renderiza com labels traduzidos', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // setupCreateTournamentModal é IIFE que roda ao boot — modal já existe no DOM
    await page.waitForFunction(
      () => document.getElementById('modal-create-tournament') !== null,
      null,
      { timeout: 10000 }
    );

    // Garante que i18n carregou antes da inspeção (evita falso positivo
    // em race entre teste e bootstrap)
    await page.waitForFunction(
      () => window._t && window._t('create.nameLabel') !== 'create.nameLabel',
      null,
      { timeout: 10000 }
    );

    const html = await page.evaluate(() => {
      const m = document.getElementById('modal-create-tournament');
      return m ? m.innerHTML : null;
    });

    expect(html).not.toBeNull();
    expect(html.length).toBeGreaterThan(1000);

    const rawKeys = findRawKeys(html);
    if (rawKeys.length > 0) {
      console.error('Modal Novo Torneio com keys cruas:', rawKeys);
    }
    expect(rawKeys).toEqual([]);
  });

  test('modal-help renderiza com seções traduzidas', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    await page.waitForFunction(
      () => document.getElementById('modal-help') !== null,
      null,
      { timeout: 10000 }
    );

    await page.waitForFunction(
      () => window._t && window._t('help.about') !== 'help.about',
      null,
      { timeout: 10000 }
    );

    const html = await page.evaluate(() => {
      const m = document.getElementById('modal-help');
      return m ? m.innerHTML : null;
    });

    expect(html).not.toBeNull();
    const rawKeys = findRawKeys(html);
    if (rawKeys.length > 0) {
      console.error('Modal Help com keys cruas:', rawKeys);
    }
    expect(rawKeys).toEqual([]);
  });

  test('modal-quick-create renderiza com botões traduzidos ao abrir', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });
    await page.evaluate(() => window.openModal('modal-quick-create'));

    await page.waitForFunction(
      () => document.getElementById('modal-quick-create') !== null,
      null,
      { timeout: 10000 }
    );

    const html = await page.evaluate(() => {
      const m = document.getElementById('modal-quick-create');
      return m ? m.innerHTML : null;
    });

    expect(html).not.toBeNull();
    const rawKeys = findRawKeys(html);
    if (rawKeys.length > 0) {
      console.error('Modal Quick-Create com keys cruas:', rawKeys);
    }
    expect(rawKeys).toEqual([]);
  });

  test('window._t() retorna traduções, não keys', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // Aguarda dict carregar
    await page.waitForFunction(
      () => window._translations && Object.keys(window._translations).length > 0,
      null,
      { timeout: 10000 }
    );

    const checks = await page.evaluate(() => {
      const samples = ['help.about', 'btn.save', 'create.nameLabel', 'profile.labelName'];
      return samples.map((k) => {
        const v = window._t(k);
        return { key: k, value: v, translated: v !== k };
      });
    });

    const untranslated = checks.filter((c) => !c.translated);
    if (untranslated.length > 0) {
      console.error('Keys não traduzidas:', untranslated.map((c) => c.key));
    }
    expect(untranslated).toEqual([]);
  });
});
