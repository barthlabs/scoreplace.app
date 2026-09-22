#!/usr/bin/env node
/* check-bundle-sem-link-magico.js — o PACOTE EMBARCADO não leva login por link.
 *
 * Chamado por `scripts/check-embedded-www.sh`, que por sua vez é chamado pelos dois
 * scripts de release DEPOIS do `cap sync`. É lá que ele tem de rodar: os diretórios
 * `ios/.../public` e `android/.../public` são IGNORADOS pelo Git e NÃO EXISTEM na cópia
 * limpa que o preflight do Hosting monta — pendurar isto no `npm test` faria a leitura de
 * diretório falhar DENTRO do deploy.
 *
 * ⛔ A lista de padrões NÃO mora aqui: vem de `scripts/magic-link-patterns.js`, a mesma que
 * `tests/no-magic-link-login.test.js` usa na fonte. Duas listas divergem.
 *
 * Uso:  node scripts/check-bundle-sem-link-magico.js <dir-public>
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { achar } = require('./magic-link-patterns');

const alvo = process.argv[2];
if (!alvo) { console.error('uso: check-bundle-sem-link-magico.js <dir-public>'); process.exit(2); }
if (!fs.existsSync(alvo)) {
  console.error('✖ pacote embarcado ausente: ' + alvo);
  console.error('  O www/ não foi montado. Rode `npm run cap:sync`.');
  process.exit(1);
}

const EXTS = new Set(['.js', '.html']);
const achados = [];
let arquivos = 0;

(function visitar(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) { visitar(full); continue; }
    if (!EXTS.has(path.extname(item.name))) continue;
    arquivos++;
    const padrao = achar(fs.readFileSync(full, 'utf8'));
    if (padrao) achados.push({ arquivo: path.relative(alvo, full), padrao });
  }
})(alvo);

if (achados.length) {
  console.error('\n✖ LOGIN POR LINK no pacote que vai para a LOJA:\n');
  achados.forEach((a) => console.error('  • ' + a.arquivo + '  →  ' + a.padrao));
  console.error('\n  A fonte pode estar limpa e o pacote não: ele é artefato, e um pacote');
  console.error('  velho volta com o fluxo inteiro. Rode `npm run cap:sync` e confira de novo.');
  process.exit(1);
}
console.log('▶ Pacote sem login por link (' + arquivos + ' arquivo(s) conferido(s)).');
