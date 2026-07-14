#!/usr/bin/env node
/* check-ext-version.js — trava de deploy: a versão da extensão letzplay tem que ser
 * IDÊNTICA nos três lugares, e o zip que o usuário instala tem que existir nessa versão.
 *
 * POR QUE ISTO EXISTE (incidente de 14/jul/2026):
 * A extensão foi pra 1.36 (manifest + content.js), mas o gate da Análise de Inscritos
 * seguia exigindo '1.25' e o do onboarding '1.35'. Como 1.35 >= 1.25, a busca completa
 * rodou com a extensão 1.35 — que desiste na 4ª tentativa de rajada — tomou 403 do
 * Cloudflare e gravou ZERO jogos para os 4 inscritos, SEM erro visível (o resumo veio
 * normal porque usa navegação de aba, não fetch). Pior: nem existia zip 1.36 pra instalar.
 * O commit a12d811a já tinha unificado isto uma vez e a divergência voltou — disciplina
 * manual ("bumpar junto") não segura. Por isso é uma trava executável.
 *
 * Uso:  node scripts/check-ext-version.js
 * Sai com código 1 (e explica) se algo divergir.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fail = [];

// 1) manifest.json
const manifestVer = JSON.parse(read('extension/manifest.json')).version;

// 2) content.js — o número que o APP LÊ (anunciado via extension-present)
const contentMatch = read('extension/content.js').match(/EXT_VERSION\s*=\s*'([^']+)'/);
const contentVer = contentMatch && contentMatch[1];

// 3) store.js — a versão EXIGIDA pelo app (fonte única dos dois gates)
const storeMatch = read('js/store.js').match(/window\.SP_EXT_VERSION\s*=\s*'([^']+)'/);
const storeVer = storeMatch && storeMatch[1];

if (!contentVer) fail.push('extension/content.js: EXT_VERSION não encontrado');
if (!storeVer) fail.push('js/store.js: window.SP_EXT_VERSION não encontrado');

if (contentVer && storeVer && !(manifestVer === contentVer && contentVer === storeVer)) {
  fail.push(
    'Versões da extensão DIVERGEM:\n' +
    '    extension/manifest.json      = ' + manifestVer + '\n' +
    '    extension/content.js         = ' + contentVer + '\n' +
    '    js/store.js SP_EXT_VERSION   = ' + storeVer + '\n' +
    '  As três têm que ser iguais.'
  );
}

// 4) Nenhum mínimo solto pode voltar a existir fora do store.js.
for (const f of ['js/views/letzplay-onboarding.js', 'js/views/tournaments-enrollment-report.js']) {
  const src = read(f);
  const bad = src.match(/(?:MIN_EXT_VERSION|_LZ_MIN_EXT)\s*=\s*['"][\d.]+['"]/);
  if (bad) fail.push(f + ': mínimo hardcoded (' + bad[0] + ') — use window.SP_EXT_VERSION');
}

// 5) O zip que o usuário instala tem que existir NA versão exigida (não há
//    auto-update enquanto a extensão não está publicada na Chrome Web Store).
if (storeVer) {
  const zip = 'scoreplace-letzplay-ext-' + storeVer + '.zip';
  if (!fs.existsSync(path.join(root, zip))) {
    fail.push('Falta o zip ' + zip + ' — o gate vai exigir v' + storeVer +
      ' e o usuário não tem de onde instalar. Rode: npm run ext:zip');
  }
}

if (fail.length) {
  console.error('\n✗ check-ext-version FALHOU:\n');
  fail.forEach((f) => console.error('  • ' + f + '\n'));
  process.exit(1);
}
console.log('✓ extensão letzplay v' + storeVer + ' consistente (manifest = content.js = store.js, zip presente)');
