/* A DICA NÃO PODE ATRAPALHAR QUEM ESTÁ USANDO O APP (1.9.44).
 *
 * Os dois defeitos que o dono relatou com as dicas de volta no ar — e que ficaram
 * escondidos enquanto elas estavam quebradas (o `content-visibility` as apagava):
 *   • "trava scroll": o handler de rolagem chamava `_isElementVisible` (→
 *     getBoundingClientRect → FORÇA layout) a CADA evento; num DOM de ~6.000 nós isso
 *     engasga a rolagem inteira. Tem que ser uma medida por QUADRO.
 *   • "triplo clique": o balão é `position:fixed` por cima da tela e engolia o toque
 *     mirado no card embaixo. Só os botões dele podem receber toque.
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'hints.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== a dica não atrapalha ==');

const handler = (src.match(/addEventListener\('scroll',[\s\S]*?\{ passive: true \}\);/) || [''])[0];
ok(/requestAnimationFrame/.test(handler), 'o scroll agenda por QUADRO (não mede layout a cada evento)');
ok(/_scrollRAF/.test(handler), 'e tem trava de reentrância — um agendamento por vez');
const posIsVisible = handler.indexOf('_isElementVisible');
const posRAF = handler.indexOf('requestAnimationFrame');
ok(posIsVisible === -1 || posRAF < posIsVisible,
   'a medição de visibilidade acontece DENTRO do quadro, nunca antes dele');

ok(/balloon\.style\.pointerEvents\s*=\s*'none'/.test(src),
   'o balão é transparente ao toque (não engole o clique mirado no card)');
ok(/querySelectorAll\('button'\)[\s\S]{0,120}pointerEvents\s*=\s*'auto'/.test(src),
   'e os botões do próprio balão seguem clicáveis');

console.log((fail ? '❌' : '✅') + ' dica-nao-atrapalha: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);
