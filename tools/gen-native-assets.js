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

// SPLASH: fundo escuro sólido + pódio centralizado (menor, com respiro).
const podium =
  '<rect x="117" y="267" width="85" height="139" rx="13" fill="#CBD5E1"/>' +
  '<rect x="213" y="181" width="86" height="225" rx="13" fill="#F59E0B"/>' +
  '<rect x="310" y="315" width="85" height="91" rx="13" fill="#FB923C"/>' +
  '<path d="M 256 107 L 267 139 L 299 139 L 272 159 L 283 192 L 256 171 L 229 192 L 240 159 L 213 139 L 245 139 Z" fill="#F59E0B"/>';
const splashSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">' +
  '<rect width="2732" height="2732" fill="#0f0f23"/>' +
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
