/* Regressão Confra: placar parcial de melhor de 3 precisa expor Editar.
 * O jogo 122 tinha 6-4, 5-7 e aguardava o STB. Como não existe winner, o
 * botão antes só aparecia para jogos encerrados, escondendo a correção.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('  ✓ ' + m); else { fail++; console.error('  ✗ ' + m); } }

console.log('\n== Editar placar parcial ==');
const block = src.slice(src.indexOf('const _hasPartialSets'), src.indexOf('const matchLabel'));
ok(/const _hasPartialSets = !isDecided && Array\.isArray\(m\.sets\) && m\.sets\.length > 0;/.test(block),
  'reconhece partida com sets gravados e sem vencedor');
ok(/isDecided \|\| _hasPartialSets/.test(block),
  'Editar aparece também no placar parcial');
ok(/window\._editSetsInline\(/.test(block),
  'Editar parcial abre todos os sets no próprio card, preservando os anteriores');
console.log((fail ? '❌' : '✅') + ' editar-placar-parcial: ' + (3 - fail) + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
