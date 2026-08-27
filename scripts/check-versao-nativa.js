/* check-versao-nativa.js — TRAVA: a versão NATIVA é a mesma da web.
 *
 * ⛔ ORDEM DO DONO (27/ago/2026): _"altere esse padrao que é impossivel de alcancar. vc
 * sempre faz cagada na nativa e nunca fica x.y no final… adotemos o mesmo padrao da web
 * x.y.z"_.
 *
 * O QUE ERA: a loja usava MAJOR.MINOR (2.1) e a web MAJOR.MINOR.PATCH (2.1.22). Com dois
 * esquemas, "está alinhado?" virava julgamento — e a conta batia de um jeito diferente a
 * cada leva. Pior: a build 265 subiu como "2.1" carregando o código da 2.1.6, e ninguém
 * tinha como ver isso pelo número.
 *
 * O QUE É AGORA: `MARKETING_VERSION` (iOS) e `versionName` (Android) == `version.txt`.
 * Alinhamento deixa de ser julgamento e vira comparação de string — o número que o testador
 * lê é o mesmo que o `version.txt` do ar.
 *
 * ⚠️ POR QUE É UM GATE, e não uma linha no CLAUDE.md: o dono JÁ tinha dito "tudo tem que
 * andar junto" e o repo mesmo assim ficou 16 commits atrás. Neste projeto, o que não é
 * gate não acontece. Roda antes de arquivar: falhar aqui custa segundos, falhar depois
 * custa uma volta inteira na fila da Apple.
 *
 * ⛔ NÃO confere o BUILD (CURRENT_PROJECT_VERSION / versionCode): esse é da Apple/Google,
 * só precisa subir sempre, e não tem relação com a versão do produto.
 *
 * Uso:  node scripts/check-versao-nativa.js <ios|android>
 */
'use strict';
const fs = require('fs');
const path = require('path');

const plat = (process.argv[2] || '').toLowerCase();
const root = path.resolve(__dirname, '..');
const web = (fs.readFileSync(path.join(root, 'version.txt'), 'utf8') || '').trim();

if (!web) { console.error('✗ version.txt vazio ou ausente.'); process.exit(1); }
if (plat !== 'ios' && plat !== 'android') {
  console.error('uso: node scripts/check-versao-nativa.js <ios|android>');
  process.exit(2);
}

let achadas = [];
if (plat === 'ios') {
  const p = path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  const src = fs.readFileSync(p, 'utf8');
  achadas = [...src.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim());
} else {
  const p = path.join(root, 'android', 'app', 'build.gradle');
  const src = fs.readFileSync(p, 'utf8');
  achadas = [...src.matchAll(/versionName\s+["']([^"']+)["']/g)].map((m) => m[1].trim());
}

if (!achadas.length) {
  console.error(`✗ não achei a versão nativa (${plat}) — o arquivo mudou de forma?`);
  process.exit(1);
}
const erradas = [...new Set(achadas.filter((v) => v !== web))];
if (erradas.length) {
  console.error(`\n✗ A VERSÃO NATIVA NÃO É A DA WEB (${plat}):`);
  console.error(`    web (version.txt) : ${web}`);
  console.error(`    nativa            : ${[...new Set(achadas)].join(', ')}`);
  console.error(`\n  Desde 27/ago/2026 elas são a MESMA string — ordem do dono, porque com`);
  console.error(`  dois esquemas "alinhado" virava julgamento e a build 265 chegou a subir`);
  console.error(`  como "2.1" carregando o código da 2.1.6.`);
  console.error(`\n  CONSERTO: ponha ${web} em ${plat === 'ios' ? 'MARKETING_VERSION (todos os alvos do pbxproj)' : 'versionName (android/app/build.gradle)'}.`);
  console.error(`  (o número de BUILD é outra coisa e segue independente)\n`);
  process.exit(1);
}
console.log(`▶ versão nativa (${plat}) = web = ${web}.`);
