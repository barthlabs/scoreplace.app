/* O diálogo não estoura a tela — node tests/dialog-fits-screen.test.js
 * "vejo lá embaixo um fantasma dos botões antigos. não estoure a tela como está
 * acontecendo. permita scrollar." O card do showConfirmDialog não tinha altura máxima:
 * crescia com o conteúdo (medidor + 3 barras + abas + lista) e o rodapé com os botões
 * saía do viewport, inalcançável.
 */
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'notifications.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const i = src.indexOf('function showConfirmDialog');
const card = src.slice(src.indexOf('dialog.innerHTML = `', i), src.indexOf('dialog.innerHTML = `', i) + 1800);

ok(/max-height: 92%/.test(card), 'o card tem altura máxima');
ok(!/max-height: \d+vh/.test(card), 'em PORCENTAGEM, não vh (cânone de escala por área)');
ok(/display: flex;\s*\n\s*flex-direction: column;/.test(card), 'e é coluna flex, pra dividir cabeçalho/corpo/rodapé');

// o CORPO é quem rola
const corpo = card.slice(card.indexOf('${message}') - 400, card.indexOf('${message}'));
ok(/overflow-y: auto/.test(corpo), 'o corpo rola');
ok(/flex: 1 1 auto/.test(corpo), 'e é ele que ocupa a sobra');
ok(/min-height: 0/.test(corpo), 'com min-height:0 — sem isso o flex não deixa encolher e o corpo estoura');

// cabeçalho e rodapé NÃO encolhem nem somem
ok(/gap: 12px; flex: 0 0 auto;/.test(card), 'o cabeçalho não encolhe');
ok(/justify-content: flex-end; flex: 0 0 auto;/.test(card), 'e o rodapé com os botões também não');
ok(/border-top: 1px solid var\(--border-color\)/.test(card), 'o rodapé ganha borda — fica claro que é a base fixa');

// largura continua configurável (a tela do letzplay usa 760px)
ok(/max-width: \$\{maxWidth\}/.test(card), 'a largura segue vindo do caller');

console.log((fail ? '✗' : '✓') + ' dialog-fits-screen: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
