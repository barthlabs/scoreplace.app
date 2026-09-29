/* Regressão: a Análise tem um único card por dupla já formada.
 * Os dois integrantes não podem reaparecer como cards solos; o card da dupla
 * deve arrastar por identificador interno e atribuir a categoria aos dois UIDs.
 * node tests/analise-duplas-arrastaveis.test.js */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  if (condition) console.log('  ✓ ' + message);
  else { console.error('  ✗ ' + message); fail++; }
}

const panelStart = src.indexOf('function _erFormedPairsPanel');
const panelEnd = src.indexOf('window._erRenderFormedPairs', panelStart);
const panel = src.slice(panelStart, panelEnd);
const matrixStart = src.indexOf('function _matrixInner');
const matrixEnd = src.indexOf('window._erRenderMatrix', matrixStart);
const matrix = src.slice(matrixStart, matrixEnd);
const dropStart = src.indexOf('window._erMxPairDragStart');
const dropEnd = src.indexOf('// ── Frescor', dropStart);
const dragDrop = src.slice(dropStart, dropEnd);

ok(panelStart >= 0, 'painel de cards de dupla existe');
ok(panel.includes('draggable="true"'), 'card de dupla é arrastável');
ok(panel.includes('window._erMxPairDragStart'), 'card de dupla inicia o caminho próprio de drag');
ok(!panel.includes('<select'), 'dupla não usa seletor de categoria');
ok(!panel.includes('DUPLA FORMADA'), 'rótulo de dupla aparece só no cabeçalho do bloco');
ok(!panel.includes('arraste para mover'), 'instrução de arraste aparece só no cabeçalho do bloco');
ok(matrix.includes('pairedOrders') && matrix.includes('individualRows'), 'integrantes de dupla são retirados dos buckets individuais');
ok(matrix.includes('_erFormedPairsPanel(rows, t) + mistoStrip'), 'cards de dupla ficam imediatamente antes dos cards individuais');
ok(dragDrop.includes("application/x-scoreplace-pair"), 'drag da dupla transporta índice interno, não nome');
ok(dragDrop.includes('window._erStageCategory(pairRows[0].order, pairCategory)'), 'drop atribui categoria pelo integrante identificado e propaga à dupla');

console.log('\n' + (fail ? '❌' : '✅') + ' análise-duplas-arrastáveis: ' + (10 - fail) + ' asserts ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
