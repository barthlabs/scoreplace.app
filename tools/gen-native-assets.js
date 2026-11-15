#!/usr/bin/env node
// scoreplace.app — gera os assets-fonte do app NATIVO (assets/icon.png + splash) rasterizando
// o pódio (icons/icon-512.svg) via Chromium do Playwright. Depois `npx @capacitor/assets generate`
// produz todos os tamanhos pra ios/ e android/.
//
// Uso: node tools/gen-native-assets.js   →   npx @capacitor/assets generate

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(OUT, { recursive: true });

// ÍCONE: o pódio full-bleed sobre o gradiente escuro (o SO aplica a máscara/cantos).
const iconSvg = fs.readFileSync(path.join(ROOT, 'icons/icon-512.svg'), 'utf8');

// SPLASH: mesmo símbolo transparente oficial, centralizado sobre o azul do app.
const podium = [...fs.readFileSync(path.join(ROOT, 'icons/logo-podium.svg'), 'utf8')
  .matchAll(/<(?:rect|polygon)\b[^>]*\/>/g)].map((match) => match[0]).join('');
const splashSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">' +
  '<defs><linearGradient id="blue" x2="0" y2="1"><stop stop-color="#348dbb"/><stop offset="1" stop-color="#145584"/></linearGradient></defs>' +
  '<rect width="2732" height="2732" fill="url(#blue)"/>' +
  '<g transform="translate(1366,1366) scale(3.0) translate(-256,-256)">' + podium + '</g>' +
  '</svg>';

async function render(svg, size, outPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent('<!doctype html><meta charset="utf-8"><style>*{margin:0;padding:0}svg{display:block}</style>' + svg, { waitUntil: 'load' });
  await page.evaluate((s) => { const el = document.querySelector('svg'); el.setAttribute('width', s); el.setAttribute('height', s); }, size);
  await page.screenshot({ path: outPath });
  await browser.close();
  console.log('  ✓ ' + path.relative(ROOT, outPath) + ' (' + size + 'x' + size + ')');
}

(async () => {
  await render(iconSvg, 1024, path.join(OUT, 'icon.png'));       // ícone do app
  await render(splashSvg, 2732, path.join(OUT, 'splash.png'));   // splash claro/padrão
  await render(splashSvg, 2732, path.join(OUT, 'splash-dark.png')); // splash dark (mesmo fundo escuro)
  console.log('[gen-native-assets] pronto — rode: npx @capacitor/assets generate');
})();
