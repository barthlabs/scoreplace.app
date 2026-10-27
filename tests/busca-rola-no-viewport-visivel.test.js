/* Busca na chave deve trazer o jogo pendente mais recente para a área que o usuário vê.
 * iOS mantém `innerHeight` no viewport de layout quando o teclado está aberto;
 * por isso a regra precisa usar `visualViewport.height` e `offsetTop`. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (!condition) { fail++; console.error('  ✗ ' + message); }
}
const start = src.indexOf('/* ⭐ O RESULTADO TEM QUE ESTAR NA TELA');
const end = src.indexOf('\n};', start);
const block = src.slice(start, end);
ok(start >= 0, 'bloco que revela o jogo escolhido existe');
ok(/window\.visualViewport/.test(block), 'usa Visual Viewport quando disponível');
ok(/_vv\.height/.test(block) && /_vv\.offsetTop/.test(block), 'considera teclado e offset do viewport visível');
ok(/_topoSeguro = _vpTopo \+ _ancora \+ 8/.test(block) &&
   /_rc\.top < _topoSeguro \|\| _rc\.bottom > _alturaVp - 8/.test(block),
   'rola se o card ficar fora da área realmente visível, com margem sob a barra fixa');
console.log((fail ? '❌' : '✅') + ' busca-rola-no-viewport-visivel: ' + (fail ? fail + ' falharam' : '4 ok'));
process.exit(fail ? 1 : 0);
