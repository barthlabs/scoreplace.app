'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'auditar-inscricoes-canonicas.js'), 'utf8');
let failed = 0;
function ok(condition, label) {
  console.log((condition ? '✓ ' : '✗ ') + label);
  if (!condition) failed++;
}

ok(source.includes("registration-migration-core.js"),
  'censo usa o mesmo decisor puro da materialização canônica');
ok(/canonicalRegistrationsForTournament[\s\S]*?\/registrations/.test(source) &&
   /materialization\.decideMaterialization\(id, report, existing\)/.test(source),
  'censo compara a projeção com os documentos canônicos realmente existentes');
ok(/inscrições canônicas ainda a materializar/.test(source) &&
   /inscrições canônicas divergentes/.test(source) &&
   /torneios bloqueados para materialização/.test(source),
  'censo expõe pendência, divergência e bloqueio separadamente');
ok(!/method:\s*['\"]PATCH['\"]/.test(source) &&
   !/\.set\(/.test(source) && !/\.update\(/.test(source) && !/\.delete\(/.test(source),
  'censo permanece estritamente somente leitura');

process.exit(failed ? 1 : 0);
