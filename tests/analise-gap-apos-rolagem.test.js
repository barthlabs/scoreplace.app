'use strict';
const fs = require('fs');
const vm = require('vm');
const source = fs.readFileSync('js/store.js', 'utf8');
const start = source.indexOf('function _gapInicialDaAnalise(title, header)');
const end = source.indexOf('  var bhOffset =', start);
let failures = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failures++; }
ok(start >= 0 && end > start, 'medição canônica da Análise encontrada');
if (start >= 0 && end > start) {
  let scroll = 0;
  const context = { document:{ scrollingElement:{ get scrollTop() { return scroll; } } }, window:{ scrollY:0 } };
  vm.runInNewContext(source.slice(start, end), context);
  const header = { getBoundingClientRect:() => ({ bottom:120 }) };
  const title = { getBoundingClientRect:() => ({ top:140 - scroll }) };
  ok(context._gapInicialDaAnalise(title, header) === 20, 'lacuna medida antes da rolagem');
  scroll = 600;
  ok(context._gapInicialDaAnalise(title, header) === 20, 'rolagem não vira margem vazia de 600px');
}
process.exit(failures ? 1 : 0);
