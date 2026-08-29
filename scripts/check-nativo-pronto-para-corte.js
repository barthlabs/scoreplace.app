#!/usr/bin/env node
/* check-nativo-pronto-para-corte.js — TRAVA: as lojas estão prontas para a Etapa A?
 *
 * ⛔ POR QUE EXISTE (5ª auditoria externa, ponto 6). AUDITADO em 29/ago/2026:
 *   · `capacitor.config.json` tem `webDir: "www"` e NÃO tem `server.url` ⇒ o app nativo
 *     roda o JS EMBARCADO no binário. Publicar no Hosting NÃO atualiza o nativo.
 *   · iOS `MARKETING_VERSION` = 2.1.28 · Android `versionName` = 2.1.28.
 *   · NÃO existe force-update, minimum-version, nem qualquer comparação entre a versão do
 *     bundle e a do ar. Procurado em js/ e functions/: nada.
 *
 * ⇒ CONSEQUÊNCIA CONCRETA DA ETAPA A para quem está no app das lojas (2.1.28):
 *   as cinco operações de amizade escrevem `users.friends` direto (o código antigo, que só
 *   saiu do cliente na 2.1.48). A Etapa A torna esses campos privilegiados ⇒ o Firestore
 *   RECUSA. E a 2.1.28 não tem o rollback otimista (também da 2.1.48): a tela vai AFIRMAR
 *   que a amizade foi feita enquanto o servidor recusou. Falha silenciosa e mentirosa.
 *   O resto do app (torneios, placar, inscrição) segue funcionando.
 *
 * ESTRATÉGIA ESCOLHIDA — segurança vence compatibilidade, e não se reabre as Rules:
 *   a 2.1.48 nativa tem que estar DISPONÍVEL nas lojas antes da Etapa A. Esta trava
 *   confere o que dá pra conferir aqui: que o repositório já carimbou as versões nativas
 *   na versão do corte. Que a loja de fato APROVOU é fato externo — o cutover exige a
 *   confirmação manual, e este script imprime o lembrete.
 *
 * Uso:  node scripts/check-nativo-pronto-para-corte.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const alvo = fs.readFileSync(path.join(ROOT, 'version.txt'), 'utf8').trim();
const pbx = fs.readFileSync(path.join(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
const gradle = fs.readFileSync(path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');

const ios = (pbx.match(/MARKETING_VERSION = ([0-9][^;]*);/) || [])[1];
const android = (gradle.match(/versionName\s+"([^"]+)"/) || [])[1];

console.log('versão do corte (version.txt): ' + alvo);
console.log('iOS  MARKETING_VERSION:        ' + ios);
console.log('Android versionName:           ' + android);

const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
if (cap.server && cap.server.url) {
  console.log('\n⚠️  `server.url` presente: o nativo carrega remoto e esta trava não se aplica.');
  process.exit(0);
}
console.log('capacitor: webDir=' + cap.webDir + ', sem server.url ⇒ JS EMBARCADO no binário.');

const problemas = [];
if (ios !== alvo) problemas.push('iOS está em ' + ios + ', o corte é ' + alvo);
if (android !== alvo) problemas.push('Android está em ' + android + ', o corte é ' + alvo);

if (problemas.length) {
  console.error('\n✗ NATIVO NÃO ESTÁ PRONTO PARA A ETAPA A:\n');
  problemas.forEach((p) => console.error('  • ' + p));
  console.error('\n  O app das lojas roda o JS que veio no binário. Com a Etapa A no ar, a versão');
  console.error('  antiga tenta escrever `users.friends`, o Firestore recusa, e a tela dela AFIRMA');
  console.error('  que a amizade foi feita (o rollback só existe a partir da ' + alvo + ').');
  console.error('\n  Caminhos possíveis, e a escolha é do dono:');
  console.error('   1. publicar a ' + alvo + ' nas lojas ANTES da Etapa A (recomendado);');
  console.error('   2. seguir mesmo assim, aceitando que o app antigo perde amizade com');
  console.error('      falha silenciosa até a pessoa atualizar — decisão consciente, que');
  console.error('      precisa estar registrada no cutover.');
  console.error('\n  ⛔ O que NÃO é opção: reabrir as Rules para clientes antigos.\n');
  process.exit(1);
}
console.log('\n✓ versões nativas carimbadas em ' + alvo + '.');
console.log('⏳ LEMBRETE (não dá pra conferir daqui): confirmar que a ' + alvo + ' está APROVADA');
console.log('   e DISPONÍVEL na App Store e no Google Play antes de publicar a Etapa A.');
