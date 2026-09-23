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
/* ⛔ UM CARIMBO POR ESCOPO. Um carimbo único era furado: qualquer execução do publicador de
 * Functions — inclusive `--dry-run` ou o codebase `main` — o gravava, e ele passava a "provar" que
 * as Rules e o sorteio foram publicados. Carimbo que prova o que não aconteceu é pior que nenhum.
 * Cada escopo tem o seu, e cada um só é gravado pelo deploy REAL daquele escopo. */
const ESCOPOS = {
  rules: { carimbo: '.backend-publicado-rules', caminhos: ['firestore.rules'] },
  autodraw: { carimbo: '.backend-publicado-autodraw', caminhos: ['functions-autodraw'] },
};

const git = (args) => execFileSync('git', args, { cwd: RAIZ, encoding: 'utf8' }).trim();

const iCarimbar = process.argv.indexOf('--carimbar');
const escopoPedido = iCarimbar !== -1 ? String(process.argv[iCarimbar + 1] || '') : '';
if (iCarimbar !== -1 && !ESCOPOS[escopoPedido]) {
  console.error('✗ --carimbar exige o ESCOPO: rules | autodraw');
  process.exit(1);
}

function ultimoDe(caminhos) {
  try { return git(['log', '-1', '--format=%H', '--'].concat(caminhos)); } catch (e) { return null; }
}

if (iCarimbar !== -1) {
  const e = ESCOPOS[escopoPedido];
  const sha = ultimoDe(e.caminhos);
  if (!sha) { console.log('⚠️ sem git/mudança aqui — nada a carimbar em ' + escopoPedido + '.'); process.exit(0); }
  fs.writeFileSync(path.join(RAIZ, e.carimbo), sha + '\n');
  console.log('✓ carimbado (' + escopoPedido + '): publicado em ' + sha.slice(0, 8));
  process.exit(0);
}

let falhou = false;
Object.keys(ESCOPOS).forEach((nome) => {
  const e = ESCOPOS[nome];
  const ultimo = ultimoDe(e.caminhos);
  if (ultimo === null) { console.log('⚠️ sem git aqui — ' + nome + ' não conferido.'); return; }
  if (!ultimo) { console.log('✓ ' + nome + ' nunca mudou neste repositório.'); return; }
  const arq = path.join(RAIZ, e.carimbo);
  const carimbado = fs.existsSync(arq) ? fs.readFileSync(arq, 'utf8').trim() : '';
  /* ⚠️ SEM CARIMBO NENHUM ela AVISA, não bloqueia: árvore recém clonada (ou o repositório de
   * mentira do ensaio do preflight) nunca teve carimbo, e reprovar ali seria acusar ausência de
   * histórico em vez de backend atrasado. A partir do primeiro carimbo ela morde. */
  if (!carimbado) { console.log('⚠️ ' + nome + ': sem carimbo ainda — publique e rode --carimbar ' + nome + '.'); return; }
  if (carimbado === ultimo) { console.log('✓ ' + nome + ' publicado (' + ultimo.slice(0, 8) + ')'); return; }
  /* O carimbo pode estar num DESCENDENTE: quem publicou e depois só mexeu na web. */
  let jaContem = false;
  try { git(['merge-base', '--is-ancestor', ultimo, carimbado]); jaContem = true; } catch (e2) { jaContem = false; }
  if (jaContem) { console.log('✓ ' + nome + ' publicado (carimbo ' + carimbado.slice(0, 8) + ' já contém)'); return; }
  console.error('\n✗ ' + nome.toUpperCase() + ' MUDOU E NÃO FOI PUBLICADO.');
  console.error('  última mudança: ' + ultimo.slice(0, 8) + '   ·   carimbo: ' + carimbado.slice(0, 8));
  falhou = true;
});
if (falhou) {
  console.error('\n  Publique nesta ordem e carimbe cada escopo:');
  console.error('    firebase deploy --only firestore:rules --project scoreplace-app');
  console.error('    node scripts/check-backend-publicado.js --carimbar rules');
  console.error('    scripts/deploy-functions.sh autodraw   (carimba autodraw sozinho)\n');
  process.exit(1);
}
process.exit(0);
