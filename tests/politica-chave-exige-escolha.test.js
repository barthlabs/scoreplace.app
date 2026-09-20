const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'js/views/tournaments-draw-prep.js'), 'utf8');
let fail = 0;
function ok(value, message) { if (!value) { fail++; console.error('✗ ' + message); } }
const start = src.indexOf('window._autoResolvesPow2 = function');
const end = src.indexOf('window.showPowerOf2Panel', start);
ok(/return false;/.test(src.slice(start, end)), 'o gate não pode escolher a política');
ok(!/window\._unifiedSel = bestKey/.test(src), 'recomendação não pode virar escolha automática');
ok(/if \(!option\).*selectStrategy/.test(src), 'confirmar sem escolha é recusado');
if (fail) process.exit(1);
console.log('✓ política de chave exige escolha explícita');
