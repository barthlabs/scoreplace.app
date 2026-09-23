#!/usr/bin/env node
/* ⛔ O BACKEND FOI PUBLICADO DEPOIS DA ÚLTIMA MUDANÇA NELE?
 *
 * ⛔ POR QUE ESTA TRAVA EXISTE. `deploy-hosting.sh` publica SÓ o Hosting. Quando a leva mexe em
 * `firestore.rules` ou no codebase do sorteio, publicar só a web põe no ar uma tela que conversa
 * com uma regra e um servidor VELHOS — e o defeito aparece como "funciona no meu, não no ar", sem
 * ninguém ligar ao deploy.
 *
 * ⛔ E POR QUE NÃO PUBLICAR O BACKEND DE DENTRO DO PUBLICADOR: isso derrubaria o ensaio do
 * preflight (`tests/preflight-antes-do-push.test.js`), que roda o script com um `firebase` falso
 * para provar que o push vem ANTES do upload. Essa garantia vale mais.
 *
 * ⭐ ENTÃO É CARIMBO, o mesmo idioma de `.rules-testadas`: quem publica escreve o SHA publicado em
 * `.backend-publicado`; esta trava compara com o último commit que TOCOU o backend. Carimbo velho
 * ⇒ aborta. ⚠️ Ela não prova que o deploy funcionou — prova que ele foi FEITO depois da mudança;
 * quem prova o resto é o próprio deploy, que aborta em erro.
 *
 * Uso:  node scripts/check-backend-publicado.js            (confere)
 *       node scripts/check-backend-publicado.js --carimbar (grava o SHA atual)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');
const CARIMBO = path.join(RAIZ, '.backend-publicado');
const CAMINHOS = ['firestore.rules', 'functions-autodraw', 'functions'];

const git = (args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();

let ultimoDoBackend = '';
try { ultimoDoBackend = git(['log', '-1', '--format=%H', '--'].concat(CAMINHOS)); } catch (e) {
  console.log('⚠️ sem git aqui — trava de backend pulada.');
  process.exit(0);
}
if (!ultimoDoBackend) { console.log('✓ backend nunca mudou neste repositório.'); process.exit(0); }

if (process.argv.indexOf('--carimbar') !== -1) {
  fs.writeFileSync(CARIMBO, ultimoDoBackend + '\n');
  console.log('✓ carimbado: backend publicado em ' + ultimoDoBackend.slice(0, 8));
  process.exit(0);
}

const carimbado = fs.existsSync(CARIMBO) ? fs.readFileSync(CARIMBO, 'utf8').trim() : '';
/* ⚠️ SEM CARIMBO NENHUM ela AVISA, não bloqueia — e isso é decisão, não frouxidão: árvore recém
 * clonada (ou o repositório de mentira do ensaio do preflight) nunca teve carimbo, e reprovar ali
 * seria a trava acusando ausência de histórico em vez de backend atrasado. A partir do primeiro
 * carimbo ela morde: carimbo VELHO aborta. */
if (!carimbado) {
  console.log('⚠️ sem carimbo de backend ainda — publique o backend e rode com --carimbar.');
  process.exit(0);
}
if (carimbado === ultimoDoBackend) {
  console.log('✓ backend publicado depois da última mudança nele (' + ultimoDoBackend.slice(0, 8) + ')');
  process.exit(0);
}

/* ⚠️ O carimbo pode estar em um ANCESTRAL: se o commit carimbado já contém a última mudança do
 * backend, está publicado. É o caso de quem publicou e depois só mexeu na web. */
let jaContem = false;
try {
  if (carimbado) { git(['merge-base', '--is-ancestor', ultimoDoBackend, carimbado]); jaContem = true; }
} catch (e) { jaContem = false; }
if (jaContem) {
  console.log('✓ backend publicado (carimbo ' + carimbado.slice(0, 8) + ' já contém a mudança)');
  process.exit(0);
}

console.error('\n✗ O BACKEND MUDOU E NÃO FOI PUBLICADO.\n');
console.error('  última mudança no backend: ' + ultimoDoBackend.slice(0, 8));
console.error('  carimbo:                   ' + (carimbado ? carimbado.slice(0, 8) : '(nenhum)'));
console.error('\n  Publique nesta ordem e carimbe:');
console.error('    firebase deploy --only firestore:rules --project scoreplace-app');
console.error('    scripts/deploy-functions.sh autodraw');
console.error('    node scripts/check-backend-publicado.js --carimbar\n');
process.exit(1);
