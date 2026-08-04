#!/usr/bin/env node
/* sync-ext-version.js — UMA FONTE: extension/manifest.json.
 *
 * POR QUE ISTO EXISTE (31/jul/2026): a extensão foi de 1.61 a 1.66 em cinco versões e o
 * app continuou exigindo — e OFERECENDO PRA BAIXAR — a 1.61. Como 1.66 >= 1.61 o gate
 * passava calado: quem já tinha a nova não era avisado, quem instalava pelo link pegava a
 * velha. Existia uma trava pra isso (check-ext-version.js), mas ela não rodava no
 * `npm test` — e mesmo rodando, ela só ACUSA; alguém ainda tem que corrigir à mão.
 *
 * Acusar não basta. Aqui a versão é DERIVADA: o manifest manda, e content.js, store.js e o
 * zip publicado seguem. Bumpar a extensão passa a ser mudar um número num lugar só.
 *
 * Uso:  node scripts/sync-ext-version.js
 * Roda sozinho no `npm run prerender` (todo deploy) — e o check-ext-version confere depois.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const p = (x) => path.join(root, x);
const ver = JSON.parse(fs.readFileSync(p('extension/manifest.json'), 'utf8')).version;
if (!/^\d+\.\d+$/.test(ver)) {
  console.error('✗ versão do manifest fora do padrão N.N: ' + ver);
  process.exit(1);
}

let mudou = [];

// content.js — o número que o APP LÊ (anunciado via extension-present)
const cPath = p('extension/content.js');
const cSrc = fs.readFileSync(cPath, 'utf8');
const cNovo = cSrc.replace(/(EXT_VERSION\s*=\s*')[^']+(')/, '$1' + ver + '$2');
if (cNovo !== cSrc) { fs.writeFileSync(cPath, cNovo); mudou.push('extension/content.js'); }

// store.js — o MÍNIMO exigido pelo app (gate) e a base do link do zip
const sPath = p('js/store.js');
const sSrc = fs.readFileSync(sPath, 'utf8');
const sNovo = sSrc.replace(/(window\.SP_EXT_VERSION\s*=\s*')[^']+(')/, '$1' + ver + '$2');
if (sNovo !== sSrc) { fs.writeFileSync(sPath, sNovo); mudou.push('js/store.js'); }

// ── E O CACHE-BUSTER DO store.js, SEMPRE JUNTO ────────────────────────────────────
// O gate mora no store.js (`SP_EXT_VERSION`). Trocar o número e NÃO trocar o
// cache-buster faz o navegador continuar servindo o store.js velho — e o app segue
// exigindo a versão anterior. Foi exatamente isso em 02/ago/2026: a extensão foi pra
// 1.91, o gate no repositório também, e o dono viu o app aceitar a 1.90 numa boa
// ("temos a 1.91 e ele aceita a 1.90. errado"). O valor certo entregue tarde é o mesmo
// que valor errado. Quem muda o arquivo é quem tem que furar o cache dele.
const iPath = p('index.html');
if (fs.existsSync(iPath)) {
  const iSrc = fs.readFileSync(iPath, 'utf8');
  const re = /(js\/store\.js\?v=)([^"']+)/;
  const m = iSrc.match(re);
  if (m) {
    const base = m[2].replace(/-x[\d.]+$/, '');
    const alvo = base + '-x' + ver;
    if (m[2] !== alvo) {
      fs.writeFileSync(iPath, iSrc.replace(re, '$1' + alvo));
      mudou.push('index.html (cache-buster do store.js → ' + alvo + ')');
    }
  }
}

// ── E O ARQUIVO QUE O APP CONSULTA AO VIVO ────────────────────────────────────────
// O gate embutido no store.js vira refém do cache do navegador: em 03/ago/2026 o site
// servia 1.95 e a aba do dono, com o store.js antigo, exigia 1.94 — e aceitava a 1.94.
// Este arquivo é lido a cada leitura com cache desligado, então mesmo um app em cache
// passa a exigir a versão atual.
fs.writeFileSync(p('ext-version.txt'), ver + '\n');
mudou.push('ext-version.txt');

// zip servido pelo site — tem que existir NA versão exigida, e as antigas saem
const zipNome = 'scoreplace-letzplay-ext-' + ver + '.zip';
fs.readdirSync(root)
  .filter((f) => /^scoreplace-letzplay-ext-.+\.zip$/.test(f) && f !== zipNome)
  .forEach((f) => { fs.unlinkSync(p(f)); mudou.push('removido ' + f); });
if (!fs.existsSync(p(zipNome))) {
  execFileSync('zip', ['-qr', p(zipNome), '.', '-x', '*.DS_Store'], { cwd: p('extension') });
  mudou.push(zipNome);
}

console.log('[ext] versão única = ' + ver + (mudou.length ? ' · atualizado: ' + mudou.join(', ') : ' · nada a fazer'));
