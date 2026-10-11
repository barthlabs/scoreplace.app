'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'planejar-materializacao-inscricoes-canonicas.js'), 'utf8');
let failed = 0;
function ok(value, label) {
  console.log((value ? '✓ ' : '✗ ') + label);
  if (!value) failed++;
}

ok(source.includes('registration-batch-plan-core.js') && source.includes('batch.planBatch(inspected'),
  'planejador produz o manifesto pelo núcleo puro compartilhado');
ok(source.includes('materialization.decideMaterialization') && source.includes('registration.dryRunLegacyRoster'),
  'planejador reusa a mesma projeção e decisão da materialização individual');
ok(source.includes('for (let offset = 0; offset < tournaments.length; offset += 8)'),
  'planejador limita leituras concorrentes sem omitir torneios');
ok(!/method:\s*['\"](?:PATCH|POST|DELETE|PUT)['\"]/.test(source) &&
   !/\.set\(/.test(source) && !/\.update\(/.test(source) && !/\.delete\(/.test(source),
  'planejador permanece estritamente somente leitura');
ok(!source.includes('--apply') || source.includes('não aceita opções'),
  'planejador não tem caminho de escrita acidental');

process.exit(failed ? 1 : 0);
