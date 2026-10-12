'use strict';
/* A ficha não pode renderizar "Invalid Date" quando um retrato legado traz
 * updatedAt malformado. A data é decorativa; nessa situação a linha some. */
const fs = require('fs');
const source = fs.readFileSync('js/views/tournaments.js', 'utf8');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
const start = source.indexOf('// v0.16.90: linha "Atualizado em..."');
const end = source.indexOf('// O toggle Liga NÃO vive aqui', start);
const block = source.slice(start, end);
ok(start >= 0 && end > start, 'bloco de atualização encontrado');
ok(/window\._spTsData/.test(block), 'usa o parser canônico de timestamp');
ok(/toMillis/.test(block) && /seconds/.test(block), 'aceita Timestamp antes da normalização');
ok(/Number\.isFinite\(_updatedAtMs\)\s*&&\s*_updatedAtMs\s*>\s*0/.test(block), 'só renderiza a linha com instante válido');
ok(!/new Date\(t\.updatedAt\)/.test(block), 'não formata diretamente o valor cru');
process.exit(failed ? 1 : 0);
