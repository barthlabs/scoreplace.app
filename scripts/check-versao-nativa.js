/* check-versao-nativa.js — TRAVA: cada release nativa é consistente consigo mesma.
 *
 * [[regression_hosting_web_nao_mexe_em_versao_nativa]]
 * Web (Firebase Hosting), iOS e Android têm cortes independentes. Logo, este gate NÃO
 * compara a versão da loja a version.txt: ele roda somente antes de arquivar uma loja e
 * exige que todos os seus alvos tenham a mesma versão X.Y.Z válida. Assim um deploy web
 * não altera a loja e uma release iOS/Android não pode sair com alvos divergentes.
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
  const paths = [
    path.join(root, 'android', 'app', 'build.gradle'),
    path.join(root, 'android', 'wear', 'build.gradle')
  ];
  achadas = paths.flatMap((p) => {
    const src = fs.readFileSync(p, 'utf8');
    return [...src.matchAll(/versionName\s+["']([^"']+)["']/g)].map((m) => m[1].trim());
  });
}

if (!achadas.length) {
  console.error(`✗ não achei a versão nativa (${plat}) — o arquivo mudou de forma?`);
  process.exit(1);
}
const versions = [...new Set(achadas)];
const invalidas = versions.filter((v) => !/^\d+\.\d+\.\d+$/.test(v));
if (invalidas.length || versions.length !== 1) {
  console.error(`\n✗ A VERSÃO NATIVA ESTÁ INCONSISTENTE (${plat}): ${versions.join(', ')}`);
  console.error(`  Todos os alvos de ${plat} devem usar a mesma versão X.Y.Z.`);
  console.error('  Web/Hosting usa um corte independente e não entra nesta comparação.\n');
  process.exit(1);
}
console.log(`▶ versão nativa (${plat}) consistente = ${versions[0]}.`);
