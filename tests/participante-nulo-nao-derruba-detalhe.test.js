/* Um snapshot parcial pode conter um slot nulo em participants. O card do torneio
 * deve ignorar o slot, mantendo o detalhe navegável. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
let fail = 0;
function ok(condition, message) { if (!condition) { fail++; console.error('  ✗ ' + message); } }
const start = src.indexOf('// Participantes já inscritos individualmente');
const end = src.indexOf('// Para duplas', start);
const block = src.slice(start, end);
ok(start >= 0, 'bloco de inscritos individuais existe');
ok(/if \(p == null\) return false;/.test(block), 'slot nulo é descartado antes de ler o perfil');
ok(/p\.displayName \|\| p\.name/.test(block), 'nome continua sendo resolvido para entradas válidas');
console.log((fail ? '❌' : '✅') + ' participante-nulo-nao-derruba-detalhe: ' + (fail ? fail + ' falharam' : '3 ok'));
process.exit(fail ? 1 : 0);
